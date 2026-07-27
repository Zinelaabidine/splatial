#!/usr/bin/env python3
"""
Queue-draining behaviour tests for worker.py.

No test framework is configured for worker/ (matching backend/'s plain-Node
convention), so this runs directly:

    cd worker && python3 worker_drain_test.py

Requires boto3 + requests importable and a resolvable AWS region, but makes no
network calls and terminates nothing.

## What changed, and why these tests exist

main() used to call terminate_self() on *every* exit path, so N queued jobs
required N instance launches — each paying a full boot plus AMI pull, and each
racing the CloudWatch scale-out alarm. RUN_ONCE existed to express exactly that
behaviour but was read only in a log line: the knob was never wired to the
control flow, so the documented "continue if more work exists" was unreachable
even by configuration.

Two invariants are worth pinning hard, because getting either wrong is expensive
and silent:

  1. decrement_desired. False means "ASG, replace this instance". Correct only
     when the instance is going away with work left to do. Backwards, it either
     strands capacity at zero with a full queue, or leaves an idle GPU billing.

  2. The disk floor. Nothing ever deleted a workspace before, because instances
     died after one job. Draining makes an uncleaned workspace a slow disk leak
     that eventually fails a job mid-training — after paying for the GPU time.
"""

import json
import logging
import os
import shutil
import sys
import tempfile

os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

logging.disable(logging.CRITICAL)
sys.argv = ["worker.py"]

import worker  # noqa: E402  (import after env/argv setup)


def make_item(**overrides):
    item = worker.WorkItem(
        attempt_id="att-1",
        scene_id="sc-1",
        user_id="u-1",
        attempt_number=1,
        input_bucket="in-bucket",
        input_prefix_or_key="uploads/u-1/scene.zip",
        input_file_type="zip",
        input_file_count=1,
        input_size_bytes=1024,
        output_bucket="out-bucket",
        output_prefix="uploads/u-1/scene.zip/output/attempt-att-1/",
        api_auth_token="worker-token",
    )
    for k, v in overrides.items():
        setattr(item, k, v)
    return item


_passed = 0


def test(name, fn):
    global _passed
    fn()
    _passed += 1
    print(f"  ok  {name}")


def section(title):
    print(f"\n{title}")


# ── classify_job_outcome ──────────────────────────────────────────────────────


def test_outcome_success():
    reason, decrement = worker.classify_job_outcome(
        make_item(), ok=True, was_interrupted=False, poison_deleted=False
    )
    assert reason == "job_success", reason
    assert decrement is True, "a finished job gives up capacity"


def test_outcome_plain_failure():
    reason, decrement = worker.classify_job_outcome(
        make_item(), ok=False, was_interrupted=False, poison_deleted=False
    )
    assert reason == "job_failure", reason
    assert decrement is True


def test_outcome_cancelled():
    reason, decrement = worker.classify_job_outcome(
        make_item(cancelled=True), ok=False, was_interrupted=False, poison_deleted=False
    )
    assert reason == "job_cancelled", reason
    assert decrement is True, "a cancel must not hold capacity for a replacement"


def test_outcome_lease_lost():
    reason, decrement = worker.classify_job_outcome(
        make_item(lease_lost=True), ok=False, was_interrupted=False, poison_deleted=False
    )
    assert reason == "lease_lost", reason
    assert decrement is True


def test_outcome_requeued_preserves_capacity():
    # The instance is being reclaimed with work still queued, so the ASG must
    # stand up a replacement rather than scaling down.
    reason, decrement = worker.classify_job_outcome(
        make_item(requeued=True), ok=False, was_interrupted=True, poison_deleted=False
    )
    assert reason == "spot_interruption_requeued", reason
    assert decrement is False, "must preserve capacity for a replacement"


def test_outcome_interrupted_preserves_capacity():
    reason, decrement = worker.classify_job_outcome(
        make_item(), ok=False, was_interrupted=True, poison_deleted=False
    )
    assert reason == "spot_interruption", reason
    assert decrement is False


def test_outcome_poison():
    reason, decrement = worker.classify_job_outcome(
        make_item(delete_poison_message=True),
        ok=False,
        was_interrupted=False,
        poison_deleted=True,
    )
    assert reason == "orphan_attempt", reason
    assert decrement is True


def test_outcome_precedence_cancel_beats_interrupt():
    # A cancel that unwinds through the interrupt path must still resolve as a
    # cancel, or the ASG holds capacity for work nobody wants.
    reason, decrement = worker.classify_job_outcome(
        make_item(cancelled=True), ok=False, was_interrupted=True, poison_deleted=False
    )
    assert reason == "job_cancelled", reason
    assert decrement is True


# ── should_keep_draining ──────────────────────────────────────────────────────


def _with_config(fn, **overrides):
    """Temporarily patch module-level config, restoring it afterwards."""
    saved = {k: getattr(worker, k) for k in overrides}
    for k, v in overrides.items():
        setattr(worker, k, v)
    try:
        return fn()
    finally:
        for k, v in saved.items():
            setattr(worker, k, v)


def test_drains_after_success():
    def check():
        keep, why = worker.should_keep_draining("job_success", jobs_completed=1)
        assert keep is True, why
        assert why == ""
    _with_config(check, RUN_ONCE=False, MAX_JOBS_PER_INSTANCE=0, MIN_FREE_DISK_BYTES=0)


def test_drains_after_recoverable_outcomes():
    def check():
        for reason in ("job_success", "job_failure", "job_cancelled", "lease_lost",
                       "orphan_attempt"):
            keep, _ = worker.should_keep_draining(reason, jobs_completed=1)
            assert keep is True, f"{reason} should keep draining"
    _with_config(check, RUN_ONCE=False, MAX_JOBS_PER_INSTANCE=0, MIN_FREE_DISK_BYTES=0)


def test_stops_on_spot_outcomes():
    def check():
        for reason in ("spot_interruption", "spot_interruption_requeued"):
            keep, why = worker.should_keep_draining(reason, jobs_completed=1)
            assert keep is False, f"{reason} must stop — the instance is going away"
            assert why == reason
    _with_config(check, RUN_ONCE=False, MAX_JOBS_PER_INSTANCE=0, MIN_FREE_DISK_BYTES=0)


def test_run_once_restores_old_behaviour():
    # The zero-redeploy rollback for draining. Previously dead configuration.
    def check():
        keep, why = worker.should_keep_draining("job_success", jobs_completed=1)
        assert keep is False, "RUN_ONCE must stop after one job"
        assert why == "run_once"
    _with_config(check, RUN_ONCE=True, MAX_JOBS_PER_INSTANCE=0, MIN_FREE_DISK_BYTES=0)


def test_job_cap_retires_instance():
    def check():
        keep, why = worker.should_keep_draining("job_success", jobs_completed=3)
        assert keep is False
        assert why == "max_jobs_per_instance"
        # One below the cap still drains.
        keep2, _ = worker.should_keep_draining("job_success", jobs_completed=2)
        assert keep2 is True
    _with_config(check, RUN_ONCE=False, MAX_JOBS_PER_INSTANCE=3, MIN_FREE_DISK_BYTES=0)


def test_job_cap_zero_means_unlimited():
    def check():
        keep, _ = worker.should_keep_draining("job_success", jobs_completed=9999)
        assert keep is True, "0 must mean unlimited, not 'stop immediately'"
    _with_config(check, RUN_ONCE=False, MAX_JOBS_PER_INSTANCE=0, MIN_FREE_DISK_BYTES=0)


def test_disk_floor_stops_draining():
    def check():
        keep, why = worker.should_keep_draining("job_success", jobs_completed=1)
        assert keep is False, "must not start a job that would fail mid-training"
        assert why == "disk_exhausted"
    # An absurd floor guarantees the check trips regardless of the host.
    _with_config(
        check,
        RUN_ONCE=False,
        MAX_JOBS_PER_INSTANCE=0,
        MIN_FREE_DISK_BYTES=1 << 62,
    )


# ── free_disk_bytes ───────────────────────────────────────────────────────────


def test_free_disk_reports_positive():
    assert worker.free_disk_bytes(tempfile.gettempdir()) > 0


def test_free_disk_fails_open():
    # A stat error must degrade to "assume there is room" rather than wedging
    # the worker into refusing every job forever.
    saved = shutil.disk_usage

    def boom(_path):
        raise OSError("simulated stat failure")

    shutil.disk_usage = boom
    try:
        assert worker.free_disk_bytes("/nonexistent-path-xyz") == sys.maxsize
    finally:
        shutil.disk_usage = saved


# ── cleanup_job_paths ─────────────────────────────────────────────────────────


def test_cleanup_removes_workspace_and_reports_bytes():
    root = tempfile.mkdtemp(prefix="drain-test-root-")
    saved_root = worker.WORKSPACE_ROOT
    worker.WORKSPACE_ROOT = root
    try:
        ws = os.path.join(root, "attempt-abc")
        os.makedirs(os.path.join(ws, "inputs/images"), exist_ok=True)
        with open(os.path.join(ws, "inputs/images", "a.png"), "wb") as fh:
            fh.write(b"x" * 4096)

        reclaimed = worker.cleanup_job_paths([ws])

        assert not os.path.exists(ws), "workspace must be removed"
        assert reclaimed >= 4096, f"reclaimed={reclaimed}"
    finally:
        worker.WORKSPACE_ROOT = saved_root
        shutil.rmtree(root, ignore_errors=True)


def test_cleanup_refuses_paths_outside_known_roots():
    # cleanup_job_paths deletes a directory discovered by parsing train.py's
    # stdout, so a path outside the known roots must be refused rather than
    # rmtree'd.
    outside = tempfile.mkdtemp(prefix="drain-test-outside-")
    root = tempfile.mkdtemp(prefix="drain-test-root-")
    saved_root = worker.WORKSPACE_ROOT
    worker.WORKSPACE_ROOT = root
    try:
        with open(os.path.join(outside, "precious.txt"), "w") as fh:
            fh.write("do not delete")

        worker.cleanup_job_paths([outside, "/", "/etc"])

        assert os.path.exists(os.path.join(outside, "precious.txt")), (
            "must refuse to delete outside WORKSPACE_ROOT / gaussian-splatting root"
        )
        assert os.path.isdir("/etc"), "must never touch system directories"
    finally:
        worker.WORKSPACE_ROOT = saved_root
        shutil.rmtree(outside, ignore_errors=True)
        shutil.rmtree(root, ignore_errors=True)


def test_cleanup_refuses_the_root_itself():
    root = tempfile.mkdtemp(prefix="drain-test-root-")
    saved_root = worker.WORKSPACE_ROOT
    worker.WORKSPACE_ROOT = root
    try:
        worker.cleanup_job_paths([root])
        assert os.path.isdir(root), "the workspace root itself must survive"
    finally:
        worker.WORKSPACE_ROOT = saved_root
        shutil.rmtree(root, ignore_errors=True)


def test_cleanup_tolerates_missing_and_empty_paths():
    # Early returns can register a path that was never created.
    worker.cleanup_job_paths([None, "", "/tmp/definitely-not-here-xyz"])


# ── config wiring ─────────────────────────────────────────────────────────────


def test_run_once_is_actually_wired():
    # Regression: RUN_ONCE was read at import and then used only in a log line,
    # so the flag existed but changed nothing.
    src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "worker.py")
    with open(src_path, encoding="utf-8-sig") as fh:
        src = fh.read()
    assert "if RUN_ONCE:" in src, "RUN_ONCE must gate control flow, not just logging"


def test_drain_defaults_are_safe():
    assert worker.CLEANUP_WORKSPACE_AFTER_JOB is True, "cleanup must default on"
    assert worker.MIN_FREE_DISK_BYTES > 0, "there must be a disk floor by default"
    assert worker.MAX_JOBS_PER_INSTANCE == 0, "unlimited by default"


def main():
    section("worker.py — job outcome classification")
    test("success gives up capacity", test_outcome_success)
    test("plain failure gives up capacity", test_outcome_plain_failure)
    test("cancel gives up capacity", test_outcome_cancelled)
    test("lease loss gives up capacity", test_outcome_lease_lost)
    test("requeued interruption preserves capacity", test_outcome_requeued_preserves_capacity)
    test("interruption preserves capacity", test_outcome_interrupted_preserves_capacity)
    test("poison message gives up capacity", test_outcome_poison)
    test("cancel takes precedence over interruption", test_outcome_precedence_cancel_beats_interrupt)

    section("worker.py — drain vs retire")
    test("keeps draining after a successful job", test_drains_after_success)
    test("keeps draining after every recoverable outcome", test_drains_after_recoverable_outcomes)
    test("retires on Spot interruption", test_stops_on_spot_outcomes)
    test("RUN_ONCE restores one-message-per-instance", test_run_once_restores_old_behaviour)
    test("retires at MAX_JOBS_PER_INSTANCE", test_job_cap_retires_instance)
    test("MAX_JOBS_PER_INSTANCE=0 means unlimited", test_job_cap_zero_means_unlimited)
    test("retires below the free-disk floor", test_disk_floor_stops_draining)

    section("worker.py — disk accounting")
    test("free_disk_bytes reports a positive figure", test_free_disk_reports_positive)
    test("free_disk_bytes fails open on stat errors", test_free_disk_fails_open)

    section("worker.py — workspace cleanup")
    test("removes the workspace and reports bytes reclaimed", test_cleanup_removes_workspace_and_reports_bytes)
    test("refuses paths outside the known roots", test_cleanup_refuses_paths_outside_known_roots)
    test("refuses the workspace root itself", test_cleanup_refuses_the_root_itself)
    test("tolerates missing and empty paths", test_cleanup_tolerates_missing_and_empty_paths)

    section("worker.py — config wiring")
    test("RUN_ONCE gates control flow, not just logging", test_run_once_is_actually_wired)
    test("drain defaults are safe", test_drain_defaults_are_safe)

    print(f"\n{_passed} tests passed\n")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as err:
        print(f"\nFAILED: {err}", file=sys.stderr)
        sys.exit(1)
