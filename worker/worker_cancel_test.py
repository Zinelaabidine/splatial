#!/usr/bin/env python3
"""
Cancellation behaviour tests for worker.py.

No test framework is configured for worker/ (matching backend/'s plain-Node
convention), so this runs directly:

    cd worker && python3 worker_cancel_test.py

Requires boto3 + requests importable and a resolvable AWS region, but makes no
network calls: the SQS client, the PATCH/heartbeat helpers and the workspace
setup are all replaced with fakes.

These are the regression tests for the bug fixed alongside them: cancellation
was never implemented in the worker at all. `grep -in cancel worker.py` used to
return a single log string. The backend's only guard returned HTTP 200, and
`ok = 200 <= status_code < 300` read that as success, so a cancelled scene ran
a full COLMAP + 3DGS job to completion.

The distinction under test is between three superficially similar outcomes:

    cancelled   -> PATCH CANCELLED,   DELETE message,  was_interrupted=False
    interrupted -> PATCH INTERRUPTED, RELEASE message, was_interrupted=True
    poison(404) -> no PATCH,          DELETE message,  delete_poison_message=True

Getting these confused has real consequences: reporting a cancel as an
interruption makes the ASG hold capacity for a replacement worker that then
has nothing to do, and releasing a cancelled message's visibility redelivers
work nobody wants until it DLQs.
"""

import json
import logging
import os
import sys
import tempfile
import threading
import time

os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

logging.disable(logging.CRITICAL)
sys.argv = ["worker.py"]

import worker  # noqa: E402  (import after env/argv setup)


# ── Fakes ─────────────────────────────────────────────────────────────────────

calls = {"patch": [], "deleted": [], "released": [], "sent": [], "setup_ws": 0}


def reset_calls():
    calls.update({"patch": [], "deleted": [], "released": [], "sent": [], "setup_ws": 0})


class FakeSqs:
    """Records visibility changes and sends instead of talking to SQS."""

    def __init__(self, send_fails=False):
        self.send_fails = send_fails

    def change_message_visibility(self, **kw):
        calls["released"].append(kw["VisibilityTimeout"])

    def send_message(self, **kw):
        if self.send_fails:
            raise RuntimeError("simulated SQS outage")
        calls["sent"].append(kw["MessageBody"])
        return {"MessageId": "m-1"}


def fake_delete_message(sqs_client, queue_url, receipt_handle, msg_id="unknown"):
    calls["deleted"].append(receipt_handle)
    return True


def fake_setup_workspace(attempt_id):
    calls["setup_ws"] += 1
    return tempfile.mkdtemp(prefix="worker-cancel-test-")


def patch_ok(attempt_id, token, body, api_base_url=None):
    calls["patch"].append(body.get("status"))
    return worker.ApiCallResult(ok=True, status_code=200, body_preview="")


def patch_409_cancelled(attempt_id, token, body, api_base_url=None):
    calls["patch"].append(body.get("status"))
    return worker.ApiCallResult(
        ok=False, status_code=409, body_preview="", cancel_requested=True
    )


def patch_404(attempt_id, token, body, api_base_url=None):
    calls["patch"].append(body.get("status"))
    return worker.ApiCallResult(
        ok=False, status_code=404, body_preview="", cancel_requested=False
    )


def heartbeat_quiet(*a, **k):
    return worker.ApiCallResult(ok=True, status_code=200, body_preview="")


def make_item():
    return worker.WorkItem(
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
        api_base_url="http://api.test",
    )


def install_fakes():
    """Redirect every external boundary simulate_processing touches."""
    worker.sqs = FakeSqs()
    worker.delete_message_with_retries = fake_delete_message
    worker.setup_workspace = fake_setup_workspace
    worker.post_heartbeat = heartbeat_quiet
    worker.patch_attempt = patch_ok
    worker.patch_attempt_start_running = patch_ok
    # Returning None for the extracted folder routes execution down the
    # simulation path, so no COLMAP binary or GPU is needed.
    worker.download_and_extract_zip_input = lambda **kw: None
    worker.upload_outputs = lambda *a, **k: True
    worker.SIM_TOTAL_SECONDS = 30
    worker.SIM_UPDATE_INTERVAL_SECONDS = 0.05
    worker.HEARTBEAT_INTERVAL_SECONDS = 0
    worker.SUCCESS_RATE = 1.0


# ── Test harness ──────────────────────────────────────────────────────────────

_passed = 0


def test(name, fn):
    global _passed
    reset_calls()
    install_fakes()
    fn()
    _passed += 1
    print(f"  ok  {name}")


def section(title):
    print(f"\n{title}")


# ── _response_signals_cancel ──────────────────────────────────────────────────


class FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("not JSON")
        return self._payload


def test_response_signals_cancel():
    f = worker._response_signals_cancel

    # PATCH /api/attempts/:id rejecting a cancelled attempt
    assert f(FakeResponse(409, {"reason": "CANCELLED", "cancelRequested": True})) is True
    assert f(FakeResponse(409, {"reason": "CANCELLED"})) is True
    # Heartbeat carrying the stop signal in a 200 body
    assert f(FakeResponse(200, {"received": True, "cancelRequested": True})) is True
    assert f(FakeResponse(200, {"received": True, "cancelRequested": False})) is False
    # Other failures must NOT be mistaken for cancellation
    assert f(FakeResponse(404, {"error": "Attempt not found"})) is False
    assert f(FakeResponse(403, {"error": "Invalid worker token"})) is False
    assert f(FakeResponse(200, {"attemptId": "x", "updated": True})) is False
    assert f(FakeResponse(500, None, text="upstream boom")) is False
    # Degraded payloads still resolve safely
    assert f(FakeResponse(409, None, text='{"reason":"CANCELLED"}')) is True
    assert f(FakeResponse(409, "not-a-dict")) is True


def test_new_fields_default_false():
    # Back-compat: an old SQS message and an old backend response must both
    # deserialise to "not cancelled" rather than raising or defaulting true.
    assert worker.ApiCallResult(ok=True, status_code=200, body_preview="").cancel_requested is False
    item = make_item()
    assert item.cancelled is False
    assert item.delete_poison_message is False


# ── End-to-end cancellation paths ─────────────────────────────────────────────


def test_cancelled_while_queued():
    worker.patch_attempt = patch_409_cancelled
    worker.patch_attempt_start_running = patch_409_cancelled

    item = make_item()
    ok, was_interrupted = worker.simulate_processing(
        item, threading.Event(), receipt_handle="rh-1", queue_url="q"
    )

    assert ok is False, f"ok={ok}"
    assert was_interrupted is False, "a cancel must not preserve ASG capacity"
    assert item.cancelled is True
    assert item.delete_poison_message is False, "a cancel is not a poison message"
    assert calls["deleted"] == ["rh-1"], calls["deleted"]
    assert calls["setup_ws"] == 0, "must not allocate a workspace for a cancelled attempt"
    assert calls["released"] == [], "must not redeliver a cancelled message"


def test_cancelled_mid_flight_via_heartbeat():
    seen = {"n": 0}

    def heartbeat_cancels_on_third_call(
        attempt_id, token, phase, percent, api_base_url=None, sub_phase=None, eta_seconds=None
    ):
        seen["n"] += 1
        return worker.ApiCallResult(
            ok=True, status_code=200, body_preview="", cancel_requested=seen["n"] >= 3
        )

    worker.post_heartbeat = heartbeat_cancels_on_third_call

    item = make_item()
    started = time.time()
    ok, was_interrupted = worker.simulate_processing(
        item, threading.Event(), receipt_handle="rh-2", queue_url="q"
    )
    elapsed = time.time() - started

    assert ok is False and was_interrupted is False, f"ok={ok} interrupted={was_interrupted}"
    assert item.cancelled is True
    assert "CANCELLED" in calls["patch"], calls["patch"]
    assert "INTERRUPTED" not in calls["patch"], "a cancel is not an interruption"
    assert "SUCCEEDED" not in calls["patch"], "must not finish a cancelled job"
    assert calls["deleted"] == ["rh-2"], calls["deleted"]
    assert calls["released"] == [], "must not redeliver a cancelled message"
    assert elapsed < 25, f"must stop early, not run the full 30s job (took {elapsed:.1f}s)"


def test_spot_interrupt_requeues_instead_of_releasing():
    """
    The headline fix. Releasing visibility redelivers the SAME message, which
    increments ApproximateReceiveCount — so with maxReceiveCount = 3 three Spot
    interruptions were enough to lose a good job to a DLQ with no redrive-back.
    """
    item = make_item()
    global_stop = threading.Event()
    global_stop.set()

    ok, was_interrupted = worker.simulate_processing(
        item, global_stop, receipt_handle="rh-3", queue_url="q"
    )

    assert ok is False
    assert was_interrupted is True, "ASG must keep capacity for a replacement worker"
    assert item.cancelled is False, "an interruption is not a cancellation"
    assert "INTERRUPTED" in calls["patch"], calls["patch"]
    assert "CANCELLED" not in calls["patch"], calls["patch"]

    assert len(calls["sent"]) == 1, "a fresh message must be enqueued"
    assert item.requeued is True
    assert calls["deleted"] == ["rh-3"], "and the original deleted, so no duplicate"
    assert calls["released"] == [], (
        "must NOT release visibility — that is what burned the receive count"
    )

    body = json.loads(calls["sent"][0])
    assert body["attemptId"] == "att-1"
    assert body["apiAuthToken"] == "worker-token", "token carried forward"
    assert body["requeueCount"] == 1, "interruption tally increments on the message"
    assert body["outputPrefix"] == item.output_prefix
    # A message this worker writes must survive its own parser, or the requeued
    # job DLQs after three receives having never run.
    reparsed = worker.parse_message_body(calls["sent"][0])
    assert reparsed is not None, "requeued message must be parseable"
    assert reparsed.attempt_id == "att-1"
    assert reparsed.requeue_count == 1


def test_requeue_cap_falls_back_to_release():
    # At the cap, stop re-enqueueing and let the message retry normally so it
    # can reach the DLQ for inspection rather than looping forever.
    item = make_item()
    item.requeue_count = 5
    item.max_requeues = 5
    global_stop = threading.Event()
    global_stop.set()

    ok, was_interrupted = worker.simulate_processing(
        item, global_stop, receipt_handle="rh-6", queue_url="q"
    )

    assert ok is False and was_interrupted is True
    assert calls["sent"] == [], "must not requeue past the cap"
    assert item.requeued is False
    assert calls["released"] == [0], "falls back to the old release behaviour"
    assert calls["deleted"] == [], "message kept so it can retry and DLQ"


def test_requeue_send_failure_falls_back_to_release():
    # Losing the message outright is worse than an extra receive-count
    # increment, so a failed send must not also delete the original.
    worker.sqs = FakeSqs(send_fails=True)
    item = make_item()
    global_stop = threading.Event()
    global_stop.set()

    ok, was_interrupted = worker.simulate_processing(
        item, global_stop, receipt_handle="rh-7", queue_url="q"
    )

    assert ok is False and was_interrupted is True
    assert calls["sent"] == []
    assert item.requeued is False
    assert calls["released"] == [0], "fell back to releasing visibility"
    assert calls["deleted"] == [], "original must survive a failed requeue"


def test_lease_lost_stands_down_without_writing():
    """
    The reaper decided this worker was dead and gave the attempt to someone
    else. Marking it CANCELLED or FAILED here would destroy the replacement's
    run, so the correct behaviour is to write nothing and drop the message.
    """
    seen = {"n": 0}

    def heartbeat_loses_lease(
        attempt_id, token, phase, percent, api_base_url=None, sub_phase=None, eta_seconds=None
    ):
        seen["n"] += 1
        return worker.ApiCallResult(
            ok=seen["n"] < 3,
            status_code=200 if seen["n"] < 3 else 409,
            body_preview="",
            lease_lost=seen["n"] >= 3,
        )

    worker.post_heartbeat = heartbeat_loses_lease

    item = make_item()
    started = time.time()
    ok, was_interrupted = worker.simulate_processing(
        item, threading.Event(), receipt_handle="rh-8", queue_url="q"
    )
    elapsed = time.time() - started

    assert ok is False
    assert was_interrupted is False, "must not preserve ASG capacity for itself"
    assert item.lease_lost is True
    assert item.cancelled is False, "lease loss is not cancellation"
    assert "CANCELLED" not in calls["patch"], (
        "must not mark terminal an attempt another worker now owns"
    )
    assert "INTERRUPTED" not in calls["patch"], calls["patch"]
    assert calls["sent"] == [], "must not requeue — the reaper already did"
    assert calls["deleted"] == ["rh-8"], "drops its superseded message"
    assert elapsed < 25, f"must stop promptly (took {elapsed:.1f}s)"


def test_response_signals_lease_lost():
    f = worker._response_signals_lease_lost

    assert f(FakeResponse(409, {"reason": "LEASE_LOST", "leaseLost": True})) is True
    assert f(FakeResponse(409, {"leaseLost": True})) is True
    assert f(FakeResponse(409, {"reason": "LEASE_LOST"})) is True
    # Must not be confused with cancellation, which resolves differently
    assert f(FakeResponse(409, {"reason": "CANCELLED", "cancelRequested": True})) is False
    assert f(FakeResponse(200, {"received": True, "leaseLost": False})) is False
    assert f(FakeResponse(403, {"error": "Invalid worker token"})) is False
    assert f(FakeResponse(500, None, text="boom")) is False


def test_requeue_fields_default_for_old_messages():
    # A message enqueued before the reaper existed carries no requeueCount /
    # maxRequeues. It must still parse rather than being rejected as invalid.
    body = json.dumps({
        "attemptId": "att-old",
        "sceneId": "sc-old",
        "apiAuthToken": "tok",
        "inputPrefix": "uploads/u/scene.zip",
    })
    parsed = worker.parse_message_body(body)
    assert parsed is not None, "old messages must remain valid after deploy"
    assert parsed.requeue_count == 0
    assert parsed.max_requeues == worker.DEFAULT_MAX_REQUEUES
    assert parsed.requeued is False
    assert parsed.lease_lost is False


def test_happy_path_unaffected():
    item = make_item()
    ok, was_interrupted = worker.simulate_processing(
        item, threading.Event(), receipt_handle="rh-4", queue_url="q"
    )

    assert ok is True and was_interrupted is False, f"ok={ok} interrupted={was_interrupted}"
    assert item.cancelled is False
    assert "SUCCEEDED" in calls["patch"], calls["patch"]
    assert calls["deleted"] == [], "main() owns message deletion on success"


def test_deleted_attempt_404_stays_distinct():
    worker.patch_attempt_start_running = patch_404

    item = make_item()
    ok, was_interrupted = worker.simulate_processing(
        item, threading.Event(), receipt_handle="rh-5", queue_url="q"
    )

    assert ok is False and was_interrupted is False
    assert item.delete_poison_message is True, "404 marks the message poison"
    assert item.cancelled is False, "404 must not be classified as a cancellation"


def main():
    section("worker.py — existing self-tests (regression)")
    worker._run_simulation_self_tests()
    worker._test_sanitize_output_path()
    worker._test_colmap_helpers()
    print("  ok  simulation, output-path and colmap helper self-tests")

    section("worker.py — cancel signal parsing")
    test("_response_signals_cancel across 10 response shapes", test_response_signals_cancel)
    test("new fields default to False (old messages stay valid)", test_new_fields_default_false)

    section("worker.py — cancellation outcomes")
    test("cancelled while QUEUED: no workspace, no training, message deleted", test_cancelled_while_queued)
    test("cancelled mid-flight: stops within a heartbeat, message deleted", test_cancelled_mid_flight_via_heartbeat)
    test("uncancelled job still succeeds", test_happy_path_unaffected)
    test("deleted-attempt 404 stays distinct from a cancel", test_deleted_attempt_404_stays_distinct)

    section("worker.py — interruption requeue (stops burning maxReceiveCount)")
    test("Spot interrupt re-enqueues a fresh message and deletes the old", test_spot_interrupt_requeues_instead_of_releasing)
    test("at the requeue cap, falls back to releasing visibility", test_requeue_cap_falls_back_to_release)
    test("a failed requeue send falls back rather than losing the message", test_requeue_send_failure_falls_back_to_release)
    test("old messages without requeue fields still parse", test_requeue_fields_default_for_old_messages)

    section("worker.py — lease loss (reaper handed the attempt away)")
    test("_response_signals_lease_lost across 7 response shapes", test_response_signals_lease_lost)
    test("stands down without writing or requeueing", test_lease_lost_stands_down_without_writing)

    print(f"\n{_passed} tests passed\n")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as err:
        print(f"\nFAILED: {err}", file=sys.stderr)
        sys.exit(1)
