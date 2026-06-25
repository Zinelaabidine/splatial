#!/usr/bin/env python3
"""
Progress-test SQS worker (CPU-only)
---------------------------------
Lightweight worker for testing live progress updates without running 3DGS training.

**No GPU required.** This script only sleeps and sends HTTP PATCH/heartbeat requests.
It does not import PyTorch, CUDA, COLMAP, train.py, or the GPU worker AMI stack.
Runs on any machine with Python 3 + boto3 + requests (e.g. t3.micro, your laptop).

Polls the same SQS queue as worker.py, walks the full 7-phase progress pipeline
(INIT → PREPARATION → COLMAP → TRAINING → POST_PROCESSING → EXPORT → FINALIZE),
and PATCHes / heartbeats the backend on a fixed cadence. No S3 download, COLMAP,
or train.py — total simulated runtime defaults to 2 minutes.

Minimal install (CPU instance or laptop):
    pip install -r requirements-progress-test.txt

Usage (local or CPU EC2):
    cd worker
    RUN_ONCE=true python3 worker_progress_test.py

    # On a manual CPU test box — do not terminate the instance after the job
    SELF_TERMINATE=false RUN_ONCE=true python3 worker_progress_test.py

Environment variables:
    API_BASE_URL, QUEUE_NAME, SQS_QUEUE_URL / QURL
    SIM_TOTAL_SECONDS (default: 120)
    SIM_UPDATE_INTERVAL_SECONDS (default: 5)
    HEARTBEAT_INTERVAL_SECONDS (default: 30)
    RUN_ONCE (default: true) — exit poll loop after one message
    SELF_TERMINATE (default: false) — terminate EC2 after job (ASG one-shot mode)
    UPLOAD_PLACEHOLDER (default: false) — upload manifest.json + output.splat stub
    SUCCESS_RATE (default: 1.0)
    AWS_REGION (default: us-east-1, auto-detected on EC2 via IMDSv2)
    VISIBILITY_TIMEOUT_SECONDS, VISIBILITY_EXTENSION_INTERVAL_SECONDS
    IDLE_EXIT_SECONDS (default: 0)
    LOG_LEVEL
"""

from __future__ import annotations

import json
import logging
import os
import random
import re
import signal
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

os.environ.setdefault("RUN_ENV", "local")
os.environ.setdefault("AWS_PROFILE", "default")
os.environ.setdefault("AWS_REGION", "us-east-1")

DEFAULTS = {
    "API_BASE_URL": "https://api-dev.openspacenexus.store",
    "QUEUE_NAME": "splatial-dev-splat-processing-queue",
    "DLQ_NAME": "splatial-dev-splat-processing-dlq",
    "WORKER_POLL_INTERVAL_SECONDS": "20",
    "VISIBILITY_EXTENSION_INTERVAL_SECONDS": "150",
    "VISIBILITY_TIMEOUT_SECONDS": "300",
    "HEARTBEAT_INTERVAL_SECONDS": "30",
    "DELETE_INVALID_MESSAGES": "true",
    "SUCCESS_RATE": "1.0",
    "SIM_TOTAL_SECONDS": "120",
    "SIM_UPDATE_INTERVAL_SECONDS": "5",
    "RUN_ONCE": "true",
    "SELF_TERMINATE": "false",
    "UPLOAD_PLACEHOLDER": "false",
    "IDLE_EXIT_SECONDS": "0",
    "DELETE_MESSAGE_MAX_RETRIES": "5",
}

for key, val in DEFAULTS.items():
    os.environ.setdefault(key, val)

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("progress-test-worker")

# HTTP session (also used for IMDSv2 on EC2)
session = requests.Session()
retry_strategy = Retry(
    total=3,
    backoff_factor=0.4,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET", "POST", "PATCH", "PUT"]),
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("http://", adapter)
session.mount("https://", adapter)


def _imds_token() -> Optional[str]:
    try:
        r = session.put(
            "http://169.254.169.254/latest/api/token",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
            timeout=2,
        )
        r.raise_for_status()
        return r.text
    except Exception:
        return None


def is_ec2() -> bool:
    return _imds_token() is not None


def get_instance_metadata() -> Dict[str, str]:
    token = _imds_token()
    if not token:
        return {"instance_id": "local", "region": os.getenv("AWS_REGION", "us-east-1")}

    headers = {"X-aws-ec2-metadata-token": token}
    instance_id = "unknown"
    region = os.getenv("AWS_REGION", "us-east-1")
    try:
        r = session.get(
            "http://169.254.169.254/latest/meta-data/instance-id",
            headers=headers,
            timeout=2,
        )
        if r.status_code == 200:
            instance_id = r.text.strip()
    except Exception:
        pass
    try:
        r = session.get(
            "http://169.254.169.254/latest/dynamic/instance-identity/document",
            headers=headers,
            timeout=2,
        )
        if r.status_code == 200:
            region = r.json().get("region") or region
    except Exception:
        pass
    return {"instance_id": instance_id, "region": region}


def get_boto3_session():
    import boto3

    meta = get_instance_metadata()
    region = meta["region"] or os.getenv("AWS_REGION", "us-east-1")
    return boto3.Session(region_name=region)


def getenv_int(name: str, default: int) -> int:
    v = os.getenv(name)
    if not v:
        return default
    try:
        return int(v)
    except ValueError:
        return default


def getenv_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if not v:
        return default
    return v.strip().lower() in ("1", "true", "yes", "y", "on")


aws_session = get_boto3_session()
AWS_REGION = aws_session.region_name or os.getenv("AWS_REGION", "us-east-1")
sqs = aws_session.client("sqs")

instance_metadata = get_instance_metadata()
INSTANCE_ID = instance_metadata["instance_id"]
IS_EC2 = is_ec2()

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
QUEUE_NAME = os.getenv("QUEUE_NAME", "splatial-dev-splat-processing-queue")
DLQ_NAME = os.getenv("DLQ_NAME", "splatial-dev-splat-processing-dlq")
POLL_WAIT_TIME = getenv_int("WORKER_POLL_INTERVAL_SECONDS", 20)
VISIBILITY_TIMEOUT_SECONDS = getenv_int("VISIBILITY_TIMEOUT_SECONDS", 300)
VISIBILITY_EXTENSION_INTERVAL_SECONDS = getenv_int("VISIBILITY_EXTENSION_INTERVAL_SECONDS", 150)
HEARTBEAT_INTERVAL_SECONDS = max(1, getenv_int("HEARTBEAT_INTERVAL_SECONDS", 30))
DELETE_INVALID_MESSAGES = getenv_bool("DELETE_INVALID_MESSAGES", True)
DELETE_MESSAGE_MAX_RETRIES = max(1, getenv_int("DELETE_MESSAGE_MAX_RETRIES", 5))
SUCCESS_RATE = float(os.getenv("SUCCESS_RATE", "1.0"))
SIM_TOTAL_SECONDS = max(1, getenv_int("SIM_TOTAL_SECONDS", 120))
SIM_UPDATE_INTERVAL_SECONDS = max(1, getenv_int("SIM_UPDATE_INTERVAL_SECONDS", 5))
RUN_ONCE = getenv_bool("RUN_ONCE", True)
SELF_TERMINATE = getenv_bool("SELF_TERMINATE", False)
UPLOAD_PLACEHOLDER = getenv_bool("UPLOAD_PLACEHOLDER", False)
IDLE_EXIT_SECONDS = max(0, getenv_int("IDLE_EXIT_SECONDS", 0))
WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "/tmp/streaming-splat-progress-test")
SPOT_REQUEST_ID = os.getenv("SPOT_REQUEST_ID", "")

PHASE_ORDER: List[str] = [
    "INIT",
    "PREPARATION",
    "COLMAP",
    "TRAINING",
    "POST_PROCESSING",
    "EXPORT",
    "FINALIZE",
]

PHASE_RANGES = {
    "INIT": (0, 10),
    "PREPARATION": (10, 20),
    "COLMAP": (20, 40),
    "TRAINING": (40, 88),
    "POST_PROCESSING": (88, 92),
    "EXPORT": (92, 98),
    "FINALIZE": (98, 100),
}


def overall_percent(phase: str, local_percent: float) -> int:
    if phase not in PHASE_RANGES:
        return int(max(0, min(100, local_percent)))
    start, end = PHASE_RANGES[phase]
    local_clamped = max(0.0, min(100.0, float(local_percent)))
    global_val = start + (end - start) * (local_clamped / 100.0)
    return int(max(0, min(100, global_val)))


def _progress_fraction(elapsed: float, total_seconds: float) -> float:
    denom = max(float(total_seconds), 1.0)
    return min(max(elapsed / denom, 0.0), 1.0)


def _phase_duration_seconds(phase: str, total_seconds: int) -> int:
    start, end = PHASE_RANGES[phase]
    span = end - start
    return max(1, int(total_seconds * span / 100))


def terminate_self(reason: str, decrement_desired: bool = True) -> None:
    if not SELF_TERMINATE:
        log.info("SELF_TERMINATE=false; keeping instance running (%s)", reason)
        return
    if not IS_EC2:
        log.info("Not on EC2; skipping self-termination (%s)", reason)
        return

    instance_id = get_instance_metadata()["instance_id"]
    log.warning(
        "Self-termination requested (%s); terminating instance %s",
        reason,
        instance_id or "(unknown)",
    )
    if not instance_id or instance_id in ("local", "unknown"):
        return

    try:
        asg = aws_session.client("autoscaling")
        asg.terminate_instance_in_auto_scaling_group(
            InstanceId=instance_id,
            ShouldDecrementDesiredCapacity=decrement_desired,
        )
        return
    except Exception as e:
        log.warning("ASG termination failed: %s; falling back to EC2", e)

    try:
        ec2 = aws_session.client("ec2")
        ec2.terminate_instances(InstanceIds=[instance_id])
    except Exception as e:
        log.error("Failed to terminate self via EC2: %s", e)


def resolve_queue_urls() -> Tuple[str, str]:
    qurl = os.getenv("QURL") or os.getenv("SQS_QUEUE_URL")
    dlqurl = os.getenv("DLQURL")

    if not qurl:
        try:
            resp = sqs.get_queue_url(QueueName=QUEUE_NAME)
            qurl = resp["QueueUrl"]
            os.environ["SQS_QUEUE_URL"] = qurl
        except Exception as e:
            log.error("Could not resolve queue '%s': %s", QUEUE_NAME, e)
            qurl = ""

    if not dlqurl:
        try:
            resp = sqs.get_queue_url(QueueName=DLQ_NAME)
            dlqurl = resp["QueueUrl"]
        except Exception:
            pass

    return qurl or "", dlqurl or ""


@dataclass
class ApiCallResult:
    ok: bool
    status_code: Optional[int]
    body_preview: Optional[str]


@dataclass
class WorkItem:
    attempt_id: str
    scene_id: str
    user_id: str
    attempt_number: int
    input_bucket: str
    input_prefix_or_key: str
    input_file_type: str
    input_file_count: int
    input_size_bytes: int
    output_bucket: str
    output_prefix: str
    api_auth_token: str
    api_base_url: Optional[str] = None


def parse_message_body(body: str) -> Optional[WorkItem]:
    try:
        data = json.loads(body)
        if isinstance(data, str):
            data = json.loads(data)
        if not isinstance(data, dict):
            return None

        attempt_id = data.get("attemptId") or data.get("attempt_id")
        scene_id = data.get("sceneId") or data.get("scene_id")
        user_id = data.get("userId") or data.get("user_id")
        api_token = data.get("apiAuthToken") or data.get("api_auth_token")

        if not (attempt_id and api_token):
            log.warning("Missing attemptId or apiAuthToken")
            return None

        input_prefix = data.get("inputPrefix") or data.get("input_prefix") or ""
        input_file_type = (
            data.get("inputFileType") or data.get("input_file_type") or ""
        ).lower()
        if input_file_type not in ("images", "video", "zip"):
            if re.search(r"\.(zip)$", input_prefix, re.IGNORECASE):
                input_file_type = "zip"
            elif input_prefix.lower().endswith((".mp4", ".mov", ".mkv", ".avi")):
                input_file_type = "video"
            else:
                input_file_type = "images"

        api_base_url = data.get("apiBaseUrl") or data.get("api_base_url")

        return WorkItem(
            attempt_id=str(attempt_id),
            scene_id=str(scene_id) if scene_id else "",
            user_id=str(user_id) if user_id else "",
            attempt_number=int(data.get("attemptNumber") or data.get("attempt_number") or 1),
            input_bucket=data.get("inputBucket") or data.get("input_bucket") or "",
            input_prefix_or_key=input_prefix,
            input_file_type=input_file_type,
            input_file_count=int(data.get("inputFileCount") or data.get("input_file_count") or 0),
            input_size_bytes=int(data.get("inputSizeBytes") or data.get("input_size_bytes") or 0),
            output_bucket=data.get("outputBucket") or data.get("output_bucket") or "",
            output_prefix=data.get("outputPrefix") or data.get("output_prefix") or "",
            api_auth_token=str(api_token),
            api_base_url=api_base_url.rstrip("/") if api_base_url else None,
        )
    except Exception as e:
        log.warning("Error parsing message body: %s", e)
        return None


def _auth_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def patch_attempt(
    attempt_id: str,
    token: str,
    body: Dict[str, Any],
    api_base_url: Optional[str] = None,
) -> ApiCallResult:
    base = api_base_url or API_BASE_URL
    url = f"{base}/api/attempts/{attempt_id}"
    log.info("PATCH %s body=%s", url, body)
    try:
        r = session.patch(url, headers=_auth_headers(token), json=body, timeout=10)
        ok = 200 <= r.status_code < 300
        log.info("PATCH response status=%d body=%s", r.status_code, r.text[:200])
        if not ok:
            log.warning("PATCH failed: status=%d", r.status_code)
        return ApiCallResult(ok=ok, status_code=r.status_code, body_preview=r.text[:200])
    except Exception as e:
        log.error("PATCH request failed: %s", e, exc_info=True)
        return ApiCallResult(ok=False, status_code=None, body_preview=None)


def post_heartbeat(
    attempt_id: str,
    token: str,
    phase: str,
    percent: int,
    api_base_url: Optional[str] = None,
) -> ApiCallResult:
    base = api_base_url or API_BASE_URL
    url = f"{base}/api/attempts/{attempt_id}/heartbeat"
    payload = {"progressPhase": phase, "progressPercent": percent}
    log.info("Heartbeat POST %s payload=%s", url, payload)
    try:
        r = session.post(url, headers=_auth_headers(token), json=payload, timeout=10)
        ok = 200 <= r.status_code < 300
        log.info("Heartbeat response status=%d", r.status_code)
        return ApiCallResult(ok=ok, status_code=r.status_code, body_preview=r.text[:200])
    except Exception as e:
        log.error("Heartbeat failed: %s", e, exc_info=True)
        return ApiCallResult(ok=False, status_code=None, body_preview=None)


def extend_visibility_loop(
    queue_url: str,
    receipt_handle: str,
    stop_evt: threading.Event,
    visibility_timeout: int,
    renewal_interval: int,
) -> None:
    if not receipt_handle or visibility_timeout <= 0:
        return
    safe_interval = max(5, min(renewal_interval, visibility_timeout // 2))
    while not stop_evt.is_set():
        if stop_evt.wait(timeout=safe_interval):
            break
        try:
            sqs.change_message_visibility(
                QueueUrl=queue_url,
                ReceiptHandle=receipt_handle,
                VisibilityTimeout=visibility_timeout,
            )
        except Exception as e:
            log.warning("Failed to extend visibility: %s", e)


def upload_placeholder_outputs(item: WorkItem, workspace: str) -> bool:
    if not item.output_bucket or not item.output_prefix:
        log.info("No output bucket/prefix; skipping placeholder upload")
        return True
    try:
        s3 = aws_session.client("s3")
        os.makedirs(os.path.join(workspace, "outputs"), exist_ok=True)
        manifest_path = os.path.join(workspace, "outputs/manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "attemptId": item.attempt_id,
                    "sceneId": item.scene_id,
                    "timestamp": time.time(),
                    "status": "COMPLETED",
                    "simulated": True,
                },
                f,
                indent=2,
            )
        prefix = item.output_prefix.rstrip("/")
        s3.upload_file(
            manifest_path,
            item.output_bucket,
            f"{prefix}/manifest.json",
        )
        output_path = os.path.join(workspace, "outputs/output.splat")
        with open(output_path, "wb") as f:
            f.write(b"SPLAT_PROGRESS_TEST_PLACEHOLDER\x00")
        s3.upload_file(
            output_path,
            item.output_bucket,
            f"{prefix}/output.splat",
        )
        log.info("Placeholder outputs uploaded")
        return True
    except Exception as e:
        log.warning("Placeholder upload failed: %s", e)
        return False


def simulate_progress_pipeline(
    item: WorkItem,
    global_stop: threading.Event,
    receipt_handle: Optional[str] = None,
    queue_url: Optional[str] = None,
) -> Tuple[bool, bool]:
    """
    Walk all progress phases without real training. Returns (success, was_interrupted).
    """
    attempt_id = item.attempt_id
    token = item.api_auth_token
    api_url = item.api_base_url or API_BASE_URL
    interrupt_event = threading.Event()
    last_heartbeat = 0.0

    def _send_heartbeat_if_due(phase: str, percent: int, *, force: bool = False) -> None:
        nonlocal last_heartbeat
        now = time.time()
        if force or now - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
            post_heartbeat(attempt_id, token, phase, percent, api_base_url=api_url)
            last_heartbeat = time.time()

    def _release_message_visibility() -> None:
        if receipt_handle and queue_url:
            try:
                sqs.change_message_visibility(
                    QueueUrl=queue_url,
                    ReceiptHandle=receipt_handle,
                    VisibilityTimeout=0,
                )
            except Exception as e:
                log.warning("Failed to release message visibility: %s", e)

    def _interrupted() -> bool:
        return global_stop.is_set() or interrupt_event.is_set()

    def _report_interrupted(phase: str, local_pct: float) -> Tuple[bool, bool]:
        patch_attempt(
            attempt_id,
            token,
            {
                "status": "INTERRUPTED",
                "progressPhase": phase,
                "progressPercent": overall_percent(phase, local_pct),
            },
            api_base_url=api_url,
        )
        _release_message_visibility()
        return False, True

    def _sleep_with_checks(seconds: float) -> bool:
        """Returns True if interrupted during sleep."""
        end = time.time() + seconds
        while time.time() < end:
            if _interrupted():
                return True
            time.sleep(min(1.0, end - time.time()))
        return False

    def _run_phase(phase: str, duration: int) -> Tuple[bool, bool]:
        log.info("Simulating phase %s for %ds", phase, duration)
        start = time.time()
        patch_attempt(
            attempt_id,
            token,
            {
                "progressPhase": phase,
                "progressPercent": overall_percent(phase, 0),
            },
            api_base_url=api_url,
        )
        _send_heartbeat_if_due(phase, overall_percent(phase, 0), force=True)

        while True:
            if _interrupted():
                elapsed = time.time() - start
                local_pct = _progress_fraction(elapsed, duration) * 100.0
                return _report_interrupted(phase, local_pct)

            elapsed = time.time() - start
            if elapsed >= duration:
                break

            local_pct = _progress_fraction(elapsed, duration) * 100.0
            global_pct = overall_percent(phase, local_pct)
            patch_attempt(
                attempt_id,
                token,
                {"progressPhase": phase, "progressPercent": global_pct},
                api_base_url=api_url,
            )
            _send_heartbeat_if_due(phase, global_pct)

            remaining = max(duration - elapsed, 0.0)
            sleep_for = min(SIM_UPDATE_INTERVAL_SECONDS, remaining)
            if _sleep_with_checks(sleep_for):
                local_pct = _progress_fraction(time.time() - start, duration) * 100.0
                return _report_interrupted(phase, local_pct)

        patch_attempt(
            attempt_id,
            token,
            {
                "progressPhase": phase,
                "progressPercent": overall_percent(phase, 100),
            },
            api_base_url=api_url,
        )
        _send_heartbeat_if_due(phase, overall_percent(phase, 100))
        return True, False

    workspace = os.path.join(WORKSPACE_ROOT, attempt_id)
    os.makedirs(workspace, exist_ok=True)

    start_patch: Dict[str, Any] = {
        "status": "RUNNING",
        "progressPhase": "INIT",
        "progressPercent": 0,
    }
    if INSTANCE_ID and INSTANCE_ID not in ("local", "unknown"):
        start_patch["ec2InstanceId"] = INSTANCE_ID
    if SPOT_REQUEST_ID:
        start_patch["spotRequestId"] = SPOT_REQUEST_ID

    start_result = patch_attempt(attempt_id, token, start_patch, api_base_url=api_url)
    if not start_result.ok:
        log.error("Initial RUNNING patch failed (status=%s)", start_result.status_code)
        return False, False

    _send_heartbeat_if_due("INIT", 0, force=True)
    log.info(
        "Progress test started for attemptId=%s sceneId=%s (total ~%ds, update every %ds)",
        attempt_id,
        item.scene_id,
        SIM_TOTAL_SECONDS,
        SIM_UPDATE_INTERVAL_SECONDS,
    )

    try:
        for phase in PHASE_ORDER:
            duration = _phase_duration_seconds(phase, SIM_TOTAL_SECONDS)
            ok, interrupted = _run_phase(phase, duration)
            if interrupted:
                return False, True
            if not ok:
                return False, False

        if UPLOAD_PLACEHOLDER:
            if not upload_placeholder_outputs(item, workspace):
                patch_attempt(
                    attempt_id,
                    token,
                    {
                        "status": "FAILED",
                        "reason": "WORKER_ERROR",
                        "errorMessage": "Failed to upload placeholder outputs",
                        "progressPhase": "EXPORT",
                        "progressPercent": overall_percent("EXPORT", 50),
                    },
                    api_base_url=api_url,
                )
                return False, False

        if random.random() > SUCCESS_RATE:
            patch_attempt(
                attempt_id,
                token,
                {
                    "status": "FAILED",
                    "reason": "WORKER_ERROR",
                    "errorMessage": "Simulated failure (SUCCESS_RATE)",
                    "progressPhase": "FINALIZE",
                    "progressPercent": 100,
                },
                api_base_url=api_url,
            )
            return False, False

        final_body: Dict[str, Any] = {
            "status": "SUCCEEDED",
            "progressPhase": "FINALIZE",
            "progressPercent": 100,
        }
        if item.output_bucket and item.output_prefix:
            final_body["outputBucket"] = item.output_bucket
            final_body["outputPrefix"] = item.output_prefix

        final_result = patch_attempt(attempt_id, token, final_body, api_base_url=api_url)
        _send_heartbeat_if_due("FINALIZE", 100, force=True)
        if not final_result.ok:
            log.error("Final SUCCEEDED patch failed")
            return False, False

        log.info("Progress test completed successfully for attemptId=%s", attempt_id)
        return True, False

    except Exception as e:
        log.exception("Crash during progress test: %s", e)
        patch_attempt(
            attempt_id,
            token,
            {
                "status": "FAILED",
                "reason": "WORKER_ERROR",
                "errorMessage": f"Worker crash: {type(e).__name__}",
            },
            api_base_url=api_url,
        )
        return False, False
    finally:
        interrupt_event.set()


def delete_message_with_retries(
    sqs_client: Any,
    queue_url: str,
    receipt_handle: str,
    msg_id: str = "unknown",
) -> bool:
    base_delay = 0.5
    for attempt in range(1, DELETE_MESSAGE_MAX_RETRIES + 1):
        try:
            sqs_client.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
            return True
        except Exception as e:
            if attempt == DELETE_MESSAGE_MAX_RETRIES:
                log.error("DeleteMessage failed after retries: %s", e)
                try:
                    sqs_client.change_message_visibility(
                        QueueUrl=queue_url,
                        ReceiptHandle=receipt_handle,
                        VisibilityTimeout=0,
                    )
                except Exception:
                    pass
                return False
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.05)
            time.sleep(delay)
    return False


stop_event = threading.Event()


def _handle_signal(signum: int, _frame: Any) -> None:
    log.info("Received signal %s, stopping...", signum)
    stop_event.set()


def main() -> None:
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    qurl, _dlqurl = resolve_queue_urls()
    if not qurl:
        log.error("No queue URL; set SQS_QUEUE_URL or QUEUE_NAME")
        return

    log.info("Progress-test worker started (CPU-only, no GPU dependencies)")
    log.info("  queue=%s", qurl)
    log.info("  SIM_TOTAL_SECONDS=%d SIM_UPDATE_INTERVAL_SECONDS=%d", SIM_TOTAL_SECONDS, SIM_UPDATE_INTERVAL_SECONDS)
    log.info(
        "  RUN_ONCE=%s SELF_TERMINATE=%s IS_EC2=%s UPLOAD_PLACEHOLDER=%s",
        RUN_ONCE,
        SELF_TERMINATE,
        IS_EC2,
        UPLOAD_PLACEHOLDER,
    )

    last_received_time = time.time()
    poll_count = 0

    while not stop_event.is_set():
        poll_count += 1

        if IDLE_EXIT_SECONDS > 0 and time.time() - last_received_time >= IDLE_EXIT_SECONDS:
            log.info("Idle timeout; exiting")
            terminate_self("idle_timeout", decrement_desired=True)
            return

        try:
            resp = sqs.receive_message(
                QueueUrl=qurl,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=min(POLL_WAIT_TIME, 20),
                VisibilityTimeout=VISIBILITY_TIMEOUT_SECONDS,
            )
        except Exception as e:
            log.warning("SQS receive error: %s", e)
            time.sleep(5)
            continue

        msgs = resp.get("Messages", [])
        if not msgs:
            if RUN_ONCE and poll_count > 1:
                log.info("No messages; exiting (RUN_ONCE)")
                return
            continue

        last_received_time = time.time()
        msg = msgs[0]
        msg_id = msg.get("MessageId", "unknown")
        receipt = msg.get("ReceiptHandle")
        item = parse_message_body(msg.get("Body", ""))

        if not item:
            log.warning("Invalid message %s", msg_id)
            if DELETE_INVALID_MESSAGES and receipt:
                delete_message_with_retries(sqs, qurl, receipt, msg_id)
            if IS_EC2 and SELF_TERMINATE:
                terminate_self("invalid_message_processed", decrement_desired=True)
            return

        vis_stop: Optional[threading.Event] = None
        extender: Optional[threading.Thread] = None
        if receipt:
            vis_stop = threading.Event()
            extender = threading.Thread(
                target=extend_visibility_loop,
                args=(
                    qurl,
                    receipt,
                    vis_stop,
                    VISIBILITY_TIMEOUT_SECONDS,
                    VISIBILITY_EXTENSION_INTERVAL_SECONDS,
                ),
                daemon=True,
            )
            extender.start()

        try:
            ok, was_interrupted = simulate_progress_pipeline(
                item, stop_event, receipt_handle=receipt, queue_url=qurl
            )
        except Exception as e:
            log.exception("Processing crash: %s", e)
            ok, was_interrupted = False, False
        finally:
            if vis_stop:
                vis_stop.set()
            if extender:
                extender.join(timeout=2)

        if ok and receipt:
            delete_message_with_retries(sqs, qurl, receipt, msg_id)
        elif not ok and not was_interrupted:
            log.info("Processing failed; message will retry")

        if IS_EC2 and SELF_TERMINATE:
            if ok:
                terminate_self("job_success", decrement_desired=True)
            elif was_interrupted:
                terminate_self("spot_interruption", decrement_desired=False)
            else:
                terminate_self("job_failure", decrement_desired=True)
        else:
            log.info("Job finished (success=%s interrupted=%s); instance kept running", ok, was_interrupted)

        if RUN_ONCE:
            return


if __name__ == "__main__":
    main()
