#!/usr/bin/env python3
"""
Integrated SQS Worker
---------------------
Combines IMDS metadata discovery and SQS worker logic into a single self-sufficient script.

Features:
- Auto-discovers AWS Region and Instance ID via aws_config module (handles IMDSv2).
- Auto-resolves SQS Queue URLs from names.
- Configurable via Environment Variables with smart defaults.
- Handles Visibility Extension, Heartbeats, and Spot Interruption signals.
- Downloads inputs from S3 (images or video).
- Simulates processing for configurable duration with periodic progress updates.
- Uploads outputs to S3 (manifest.json + output.splat placeholder).
- Responsive interruption handling (Spot, global stop, failure).
- One-message-per-instance: processes single message then terminates self.
- ASG-aware termination: uses AutoScaling API to decrement desired capacity.
- Idle termination: exits after IDLE_EXIT_SECONDS with no messages (scale-to-zero).
- Robust message deletion: retries with exponential backoff to prevent duplicate processing.

Usage:
    python3 worker.py

Environment Variables:
    API_BASE_URL (default: https://api.zinelaabidine-nadir.com)
    QUEUE_NAME (default: splatial-dev-splat-processing-queue)
    DLQ_NAME (default: splatial-dev-splat-processing-dlq)
    AWS_REGION (auto-discovered from IMDSv2)
    WORKSPACE_ROOT (default: /tmp/streaming-splat)
    VISIBILITY_TIMEOUT_SECONDS (default: 30) - New timeout to set on each renewal
    VISIBILITY_EXTENSION_INTERVAL_SECONDS (default: 150) - How often to renew visibility
    SIM_TOTAL_SECONDS (default: 30) - Simulation duration
    SIM_UPDATE_INTERVAL_SECONDS (default: 5) - Progress update cadence
    FORCE_SPOT_INTERRUPT (default: false) - For testing interruption
    SUCCESS_RATE (default: 1.0) - Probability of success (0.0-1.0)
    IDLE_EXIT_SECONDS (default: 120) - Terminate after idle period with no messages
    DELETE_MESSAGE_MAX_RETRIES (default: 5) - Max retries for SQS DeleteMessage
    LOG_LEVEL (default: INFO)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import re
import signal
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ----------------------------
# 0. Load .env (if available)
# ----------------------------
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

# ----------------------------
# 1. Default Configuration
# ----------------------------
# These defaults mimic the behavior of imds_extract.py
DEFAULTS = {
    "API_BASE_URL": "https://api-dev.openspacenexus.store",
    "QUEUE_NAME": "splatial-dev-splat-processing-queue",
    "DLQ_NAME": "splatial-dev-splat-processing-dlq",
    "WORKER_POLL_INTERVAL_SECONDS": "20",
    "VISIBILITY_EXTENSION_INTERVAL_SECONDS": "150",  # How often to renew
    "VISIBILITY_TIMEOUT_SECONDS": "30",  # What timeout value to set on each renewal
    "HEARTBEAT_INTERVAL_SECONDS": "30",
    "DELETE_INVALID_MESSAGES": "true",
    "SUCCESS_RATE": "1.0",
    "SIM_TOTAL_SECONDS": "30",
    "SIM_UPDATE_INTERVAL_SECONDS": "5",
    "FORCE_SPOT_INTERRUPT": "false",
    "RUN_ONCE": "false",
    "IDLE_EXIT_SECONDS": "120",  # DEFAULT CHANGED: 120s for scale-to-zero
    "DELETE_MESSAGE_MAX_RETRIES": "5",  # Max retries for robust delete
}

for key, val in DEFAULTS.items():
    if key not in os.environ:
        os.environ[key] = val

# ----------------------------
# 2. Logging Setup
# ----------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("sqs-worker")

# ----------------------------
# 3. AWS Configuration (Import after logging setup)
# ----------------------------
import aws_config

# ----------------------------
# 4. HTTP Client for API Requests
# ----------------------------
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

def terminate_self(reason: str, decrement_desired: bool = True) -> None:
    """
    Terminate this instance via Auto Scaling API (preferred) or EC2 API (fallback).
    
    Args:
        reason: Human-readable termination reason for logging
        decrement_desired: Whether to decrement ASG desired capacity (default: True)
            - True: Normal completion/idle exit - enables scale-to-zero
            - False: Spot interruption - ASG launches replacement immediately
    
    Preferred: terminate_instance_in_auto_scaling_group() with configurable ShouldDecrementDesiredCapacity
    Fallback: ec2.terminate_instances() if not in ASG or ASG call fails
    
    IAM Requirements:
    - autoscaling:TerminateInstanceInAutoScalingGroup (for ASG method)
    - ec2:TerminateInstances (for fallback method)
    """
    meta = aws_config.get_instance_metadata()
    instance_id = meta["instance_id"]
    decrement_msg = "decrementing desired capacity" if decrement_desired else "preserving desired capacity for replacement"
    log.warning(
        "Self-termination requested (%s, %s); terminating instance %s",
        reason,
        decrement_msg,
        instance_id or "(unknown)"
    )
    
    if not instance_id or instance_id in ("local", "unknown"):
        log.error("Cannot terminate self: instance-id unavailable or not on EC2")
        return
    
    # Try ASG termination first (preferred for clean scale-down)
    try:
        asg = aws_session.client("autoscaling")
        asg.terminate_instance_in_auto_scaling_group(
            InstanceId=instance_id,
            ShouldDecrementDesiredCapacity=decrement_desired
        )
        log.warning(
            "AutoScaling TerminateInstanceInAutoScalingGroup invoked for %s (reason: %s, decrement: %s)",
            instance_id,
            reason,
            decrement_desired
        )
        return
    except asg.exceptions.ScalingActivityInProgressFault:
        log.warning("ASG scaling activity in progress; retrying termination")
        # Retry once after brief delay
        time.sleep(2)
        try:
            asg.terminate_instance_in_auto_scaling_group(
                InstanceId=instance_id,
                ShouldDecrementDesiredCapacity=decrement_desired
            )
            log.warning(
                "AutoScaling TerminateInstanceInAutoScalingGroup succeeded on retry for %s (decrement: %s)",
                instance_id,
                decrement_desired
            )
            return
        except Exception as e:
            log.warning("ASG termination retry failed: %s; falling back to EC2", e)
    except Exception as e:
        error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
        if error_code == 'ValidationError':
            log.info("Instance not in ASG (ValidationError); using EC2 termination")
        else:
            log.warning("ASG termination failed: %s; falling back to EC2", e)
    
    # Fallback to EC2 termination
    try:
        ec2 = aws_session.client("ec2")
        ec2.terminate_instances(InstanceIds=[instance_id])
        log.warning("EC2 TerminateInstances invoked for %s (reason: %s)", instance_id, reason)
    except Exception as e:
        log.error("Failed to terminate self via EC2: %s", e)


# ----------------------------
# 5. Configuration & AWS Initialization
# ----------------------------
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

# Initialize AWS Session and Clients
log.info("Initializing AWS session...")
aws_session = aws_config.get_session()
AWS_REGION = aws_session.region_name

# Initialize SQS Client
try:
    sqs = aws_session.client("sqs")
    log.info("SQS client initialized")
except Exception as e:
    log.error("Failed to create SQS client: %s", e)
    raise

# Initialize S3 Client
try:
    s3 = aws_session.client("s3")
    log.info("S3 client initialized")
except Exception as e:
    log.error("Failed to create S3 client: %s", e)
    raise

# Log startup information
log.info("EC2: %s", aws_config.is_ec2())
log.info("Region: %s", AWS_REGION)

# Get instance metadata once (cached)
instance_metadata = aws_config.get_instance_metadata()
instance_id = instance_metadata["instance_id"]
instance_lifecycle = instance_metadata["lifecycle"]

# Canonical cached identifiers for use throughout worker lifecycle
INSTANCE_ID = instance_id
INSTANCE_LIFECYCLE = instance_lifecycle

# Runtime Config Variables
API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
QUEUE_NAME = os.getenv("QUEUE_NAME", "splatial-dev-splat-processing-queue")
DLQ_NAME = os.getenv("DLQ_NAME", "splatial-dev-splat-processing-dlq")

POLL_WAIT_TIME = getenv_int("WORKER_POLL_INTERVAL_SECONDS", 20)
VISIBILITY_TIMEOUT_SECONDS = getenv_int("VISIBILITY_TIMEOUT_SECONDS", 30)
VISIBILITY_EXTENSION_INTERVAL_SECONDS = getenv_int("VISIBILITY_EXTENSION_INTERVAL_SECONDS", 150)
HEARTBEAT_INTERVAL_SECONDS = max(1, getenv_int("HEARTBEAT_INTERVAL_SECONDS", 30))
DELETE_INVALID_MESSAGES = getenv_bool("DELETE_INVALID_MESSAGES", True)
DELETE_MESSAGE_MAX_RETRIES = max(1, getenv_int("DELETE_MESSAGE_MAX_RETRIES", 5))
SUCCESS_RATE = float(os.getenv("SUCCESS_RATE", "1.0"))
SPOT_REQUEST_ID = os.getenv("SPOT_REQUEST_ID", "")
SIM_TOTAL_SECONDS = getenv_int("SIM_TOTAL_SECONDS", 30)
SIM_UPDATE_INTERVAL_SECONDS = getenv_int("SIM_UPDATE_INTERVAL_SECONDS", 5)
FORCE_SPOT_INTERRUPT = getenv_bool("FORCE_SPOT_INTERRUPT", False)
RUN_ONCE = getenv_bool("RUN_ONCE", False)
IDLE_EXIT_SECONDS = max(0, getenv_int("IDLE_EXIT_SECONDS", 0))
WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "/tmp/streaming-splat")

def _clamp_simulation_params() -> None:
    global SIM_TOTAL_SECONDS, SIM_UPDATE_INTERVAL_SECONDS

    original_total = SIM_TOTAL_SECONDS
    original_interval = SIM_UPDATE_INTERVAL_SECONDS

    if original_total < 1:
        log.warning(
            "SIM_TOTAL_SECONDS must be >=1 (was %s); clamping to 1",
            original_total,
        )
        SIM_TOTAL_SECONDS = 1

    if original_interval < 1:
        log.warning(
            "SIM_UPDATE_INTERVAL_SECONDS must be >=1 (was %s); clamping to 1",
            original_interval,
        )
        SIM_UPDATE_INTERVAL_SECONDS = 1


_clamp_simulation_params()

# ----------------------------
# 5. Queue Resolution Logic
# ----------------------------
def resolve_queue_urls() -> Tuple[str, str]:
    """
    Resolves SQS Queue URLs. 
    Prioritizes explicit Env Vars (QURL/DLQURL), otherwise looks up by name.
    Provides detailed error logging for troubleshooting.
    """
    qurl = os.getenv("QURL") or os.getenv("SQS_QUEUE_URL")
    dlqurl = os.getenv("DLQURL")

    if not qurl:
        try:
            log.info("Resolving Queue URL for name: %s in region: %s", QUEUE_NAME, AWS_REGION)
            resp = sqs.get_queue_url(QueueName=QUEUE_NAME)
            qurl = resp["QueueUrl"]
            log.info("Successfully resolved queue URL: %s", qurl)
            # Update Env for consistency
            os.environ["SQS_QUEUE_URL"] = qurl
        except Exception as e:
            log.error("Could not resolve main queue '%s' in region '%s': %s", QUEUE_NAME, AWS_REGION, e)
            log.error("Troubleshooting steps:")
            log.error("  1. Verify queue exists: aws sqs get-queue-url --queue-name %s --region %s", QUEUE_NAME, AWS_REGION)
            log.error("  2. Check IAM permissions: sqs:GetQueueUrl on queue ARN")
            log.error("  3. Verify AWS credentials: aws sts get-caller-identity")
            log.error("  4. Set SQS_QUEUE_URL directly to bypass auto-resolution")
            qurl = ""

    if not dlqurl:
        try:
            log.debug("Resolving DLQ URL for name: %s", DLQ_NAME)
            resp = sqs.get_queue_url(QueueName=DLQ_NAME)
            dlqurl = resp["QueueUrl"]
            log.info("Successfully resolved DLQ URL: %s", dlqurl)
            os.environ["DLQURL"] = dlqurl
        except Exception as e:
            log.debug("Could not resolve DLQ '%s': %s (DLQ is optional)", DLQ_NAME, e)
            
    return qurl or "", dlqurl or ""

# ----------------------------
# 7. Pretty Printing (Discovery)
# ----------------------------
def print_kv_block(title: str, rows: Dict[str, Any]) -> None:
    keys = list(rows.keys())
    if not keys: return
    k_w = max(len(k) for k in keys)
    v_w = max(len(str(v)) for v in rows.values())
    w = max(len(title), k_w + 3 + v_w)
    
    print("┌" + "─" * (w + 2) + "┐")
    print("│ " + title.ljust(w) + " │")
    print("├" + "─" * (w + 2) + "┤")
    for k, v in rows.items():
        print("│ " + k.ljust(k_w) + " : " + str(v).ljust(w - (k_w + 3)) + " │")
    print("└" + "─" * (w + 2) + "┘")

def print_runtime_discovery(qurl: str, dlqurl: str) -> None:
    rows = {
        "EC2": str(aws_config.is_ec2()),
        "InstanceId": instance_id,
        "InstanceLifecycle": instance_lifecycle,
        "Region": AWS_REGION,
        "API_BASE_URL": API_BASE_URL,
        "QURL": qurl,
        "DLQURL": dlqurl or "(none)",
        "POLL_WAIT_TIME": POLL_WAIT_TIME,
        "VISIBILITY_TIMEOUT": VISIBILITY_TIMEOUT_SECONDS,
        "VISIBILITY_EXTENSION_INTERVAL": VISIBILITY_EXTENSION_INTERVAL_SECONDS,
        "HEARTBEAT_INTERVAL": HEARTBEAT_INTERVAL_SECONDS,
    }
    print_kv_block("Worker Configuration", rows)

# ----------------------------
# 8. Spot Interruption Check
# ----------------------------
def spot_interruption_notice() -> bool:
    """Check for spot interruption notice."""
    if FORCE_SPOT_INTERRUPT:
        log.warning("FORCE_SPOT_INTERRUPT is enabled - simulating spot interruption")
        return True
    # TODO: Implement actual spot interruption check using IMDSv2
    # For now, only support FORCE_SPOT_INTERRUPT flag
    return False

# ----------------------------
# 9. Processing Logic
# ----------------------------

# API Phase Configuration
API_ALLOWED_PHASES = {
    "INIT",
    "COLMAP_FEATURE",
    "COLMAP_MATCH",
    "COLMAP_SPARSE",
    "COLMAP_UNDISTORT",
    "NERFSTUDIO_TRAIN",
    "EXPORT",
    "FINALIZE"
}

_phase_warning_logged = set()

def normalize_phase(phase: str) -> str:
    """
    Normalize phase names to match API expectations.
    Maps legacy/invalid phases to valid ones, logs warnings once per invalid phase.
    """
    if phase in API_ALLOWED_PHASES:
        return phase
    
    # Map common legacy phases
    if phase == "DOWNLOAD":
        return "INIT"
    
    # Default fallback
    if phase not in _phase_warning_logged:
        log.warning("Invalid progressPhase '%s' mapped to 'FINALIZE'", phase)
        _phase_warning_logged.add(phase)
    return "FINALIZE"

@dataclass
class ApiCallResult:
    """Result of an API call with status information."""
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
    input_file_type: str  # "images" or "video"
    input_file_count: int  # estimated, may be 0
    input_size_bytes: int  # estimated, may be 0
    output_bucket: str
    output_prefix: str
    api_auth_token: str
    api_base_url: Optional[str] = None  # Optional override

def parse_message_body(body: str) -> Optional[WorkItem]:
    """
    Parses SQS message body into a WorkItem.
    Handles nested JSON and validates required fields.
    Does NOT log sensitive data (tokens, full body).
    """
    try:
        data = json.loads(body)
        if isinstance(data, str):
            data = json.loads(data)
        if not isinstance(data, dict):
            log.warning("Message body is not a dict")
            return None

        # Exclude empty or purely whitespace strings
        def is_non_empty_string(s):
            return isinstance(s, str) and len(s.strip()) > 0

        # Extract required fields
        attempt_id = data.get("attemptId") or data.get("attempt_id")
        scene_id = data.get("sceneId") or data.get("scene_id")
        user_id = data.get("userId") or data.get("user_id")
        api_token = data.get("apiAuthToken") or data.get("api_auth_token")

        if not (attempt_id and api_token):
            log.warning(
                "Missing critical fields: attemptId=%s, token=%s",
                bool(attempt_id),
                bool(api_token),
            )
            return None

        # Extract optional/estimated fields
        attempt_number = int(data.get("attemptNumber") or data.get("attempt_number") or 1)
        input_bucket = data.get("inputBucket") or data.get("input_bucket") or ""
        input_prefix = data.get("inputPrefix") or data.get("input_prefix") or ""
        input_file_type = (
            data.get("inputFileType")
            or data.get("input_file_type")
            or ""
        ).lower()
        input_file_count = int(data.get("inputFileCount") or data.get("input_file_count") or 0)
        input_size_bytes = int(data.get("inputSizeBytes") or data.get("input_size_bytes") or 0)
        output_bucket = data.get("outputBucket") or data.get("output_bucket") or ""
        output_prefix = data.get("outputPrefix") or data.get("output_prefix") or ""
        api_base_url = data.get("apiBaseUrl") or data.get("api_base_url")

        # Infer input_file_type if missing or unknown
        if input_file_type not in ("images", "video"):
            if input_prefix.lower().endswith((".mp4", ".mov", ".mkv", ".avi")):
                input_file_type = "video"
            else:
                input_file_type = "images"

        return WorkItem(
            attempt_id=str(attempt_id),
            scene_id=str(scene_id) if scene_id else "",
            user_id=str(user_id) if user_id else "",
            attempt_number=attempt_number,
            input_bucket=input_bucket,
            input_prefix_or_key=input_prefix,
            input_file_type=input_file_type,
            input_file_count=input_file_count,
            input_size_bytes=input_size_bytes,
            output_bucket=output_bucket,
            output_prefix=output_prefix,
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

def patch_attempt(attempt_id: str, token: str, body: Dict[str, Any], api_base_url: Optional[str] = None) -> ApiCallResult:
    """
    PATCH /api/attempts/:attemptId.
    Uses per-message api_base_url when provided, otherwise falls back to global API_BASE_URL.
    Returns ApiCallResult with status information.
    """
    base = api_base_url or API_BASE_URL
    url = f"{base}/api/attempts/{attempt_id}"

    # Normalize phase if present
    if "progressPhase" in body:
        body = dict(body)  # Copy to avoid mutating caller's dict
        body["progressPhase"] = normalize_phase(body["progressPhase"])

    log.info("Patching attempt at %s with body: %s", url, body)
    
    try:
        r = session.patch(url, headers=_auth_headers(token), json=body, timeout=10)
        log.info("PATCH response: status=%d, body=%s", r.status_code, r.text[:200])
        ok = 200 <= r.status_code < 300
        if not ok:
            log.warning("PATCH failed: status=%d", r.status_code)
        return ApiCallResult(ok=ok, status_code=r.status_code, body_preview=r.text[:200])
    except Exception as e:
        log.error("PATCH request failed: %s", e, exc_info=True)
        return ApiCallResult(ok=False, status_code=None, body_preview=None)

def post_heartbeat(attempt_id: str, token: str, phase: str, percent: int, api_base_url: Optional[str] = None) -> ApiCallResult:
    """
    POST /api/attempts/:attemptId/heartbeat.
    Uses per-message api_base_url when provided, otherwise falls back to global API_BASE_URL.
    Returns ApiCallResult with status information.
    """
    base = api_base_url or API_BASE_URL
    url = f"{base}/api/attempts/{attempt_id}/heartbeat"
    
    # Normalize phase
    normalized_phase = normalize_phase(phase)
    payload = {"progressPhase": normalized_phase, "progressPercent": percent}
    
    log.info("Sending heartbeat to %s with payload: %s", url, payload)
    
    try:
        r = session.post(url, headers=_auth_headers(token), json=payload, timeout=10)
        log.info("Heartbeat response: status=%d, body=%s", r.status_code, r.text[:200])
        ok = 200 <= r.status_code < 300
        if not ok:
            log.warning("Heartbeat failed: status=%d", r.status_code)
        return ApiCallResult(ok=ok, status_code=r.status_code, body_preview=r.text[:200])
    except Exception as e:
        log.error("Heartbeat request failed: %s", e, exc_info=True)
        return ApiCallResult(ok=False, status_code=None, body_preview=None)

def extend_visibility_loop(queue_url: str, receipt_handle: str, stop_evt: threading.Event, visibility_timeout: int, renewal_interval: int) -> None:
    """
    Periodically extend message visibility timeout to prevent it from returning to the queue.
    
    Args:
        queue_url: SQS queue URL
        receipt_handle: Message receipt handle
        stop_evt: Event to signal loop should stop
        visibility_timeout: The new visibility timeout to set (in seconds, from now)
        renewal_interval: How often to renew the timeout (in seconds)
    
    Important: visibility_timeout is the "timeout from now" set on each renewal.
    renewal_interval determines how often we renew (must be < visibility_timeout).
    This ensures we never shorten the timeout inadvertently.
    """
    if not receipt_handle:
        log.warning("No ReceiptHandle provided; skipping visibility extension for %s", queue_url)
        return
    if visibility_timeout <= 0:
        log.warning("Visibility timeout must be positive; skipping for %s", queue_url)
        return
    
    # Safety guard: ensure interval is always less than timeout
    # Use at most half the timeout, with a minimum of 5 seconds
    safe_interval = max(5, min(renewal_interval, visibility_timeout // 2))
    
    if safe_interval != renewal_interval:
        log.info(
            "Adjusted renewal interval from %ds to %ds (must be < visibility_timeout=%ds)",
            renewal_interval,
            safe_interval,
            visibility_timeout
        )
    
    log.debug(
        "Starting visibility extension loop: timeout=%ds, interval=%ds",
        visibility_timeout,
        safe_interval
    )
    
    while not stop_evt.is_set():
        if stop_evt.wait(timeout=safe_interval):
            break
        try:
            sqs.change_message_visibility(
                QueueUrl=queue_url,
                ReceiptHandle=receipt_handle,
                VisibilityTimeout=visibility_timeout
            )
            log.debug("Extended visibility timeout to %ds from now", visibility_timeout)
        except Exception as e:
            log.warning("Failed to extend visibility: %s", e)

# Phase Configuration
DEFAULT_PHASES = ["INIT", "COLMAP_FEATURE", "COLMAP_MATCH", "COLMAP_SPARSE", "COLMAP_UNDISTORT", "NERFSTUDIO_TRAIN", "EXPORT", "FINALIZE"]
DEFAULT_PHASE_DURATIONS = {p: 15 for p in DEFAULT_PHASES} # Simplified default
PHASE_DURATIONS = dict(DEFAULT_PHASE_DURATIONS)

def _progress_fraction(elapsed: float, total_seconds: float) -> float:
    denom = max(float(total_seconds), 1.0)
    return min(max(elapsed / denom, 0.0), 1.0)

def _run_simulation_self_tests() -> None:
    assert _progress_fraction(0, 5) == 0.0
    assert abs(_progress_fraction(3, 5) - 0.6) < 1e-6
    assert _progress_fraction(5, 5) == 1.0
    assert _progress_fraction(-10, 5) == 0.0
    assert _progress_fraction(100, 5) == 1.0

# ----------------------------
# S3 Operations
# ----------------------------
def _workspace_name_from_attempt(attempt_id: str) -> str:
    clean_attempt = str(attempt_id or "unknown")
    sanitized = re.sub(r"[^a-zA-Z0-9_-]+", "-", clean_attempt).strip("-")
    if not sanitized:
        sanitized = "attempt"
    truncated = sanitized[:48]
    digest = hashlib.sha256(clean_attempt.encode("utf-8")).hexdigest()[:8]
    return f"{truncated}-{digest}"

def setup_workspace(attempt_id: str) -> str:
    """Create workspace directory structure. Returns workspace root."""
    workspace_root = os.path.abspath(WORKSPACE_ROOT)
    name = _workspace_name_from_attempt(attempt_id)
    ws = os.path.abspath(os.path.join(workspace_root, name))
    if os.path.commonpath([workspace_root, ws]) != workspace_root:
        raise ValueError("Workspace path resolved outside of WORKSPACE_ROOT")
    for subdir in ["inputs/images", "inputs/video", "outputs", "logs"]:
        os.makedirs(os.path.join(ws, subdir), exist_ok=True)
    log.info("Workspace created: %s", ws)
    return ws

def download_s3_objects(
    item: WorkItem,
    workspace: str,
    interrupt_event: threading.Event,
) -> Tuple[bool, str]:
    """
    Download S3 objects based on inputFileType.
    Returns (success, error_reason).
    """
    input_bucket = item.input_bucket
    input_key = item.input_prefix_or_key
    file_type = item.input_file_type

    if not input_bucket or not input_key:
        return False, "INVALID_INPUT"

    # Defensive: if key looks like a video file, treat as video regardless of file_type
    if input_key.lower().endswith((".mp4", ".mov", ".mkv", ".avi")) and not input_key.endswith("/"):
        log.info("Input key ends with video extension; treating as video: %s", input_key)
        file_type = "video"

    try:
        if file_type == "video":
            # Single object download
            local_path = os.path.join(workspace, "inputs/video/input.mp4")
            log.info("Downloading video from s3://%s/%s", input_bucket, input_key)
            s3.download_file(input_bucket, input_key, local_path)
            if not os.path.exists(local_path):
                return False, "INVALID_INPUT"
            log.info("Downloaded video: %s", local_path)
            return True, ""

        else:  # images
            # List and download objects under prefix
            local_dir = os.path.join(workspace, "inputs/images")
            log.info("Listing images from s3://%s/%s", input_bucket, input_key)
            os.makedirs(local_dir, exist_ok=True)
            normalized_prefix = input_key.rstrip("/")
            prefix_with_slash = f"{normalized_prefix}/" if normalized_prefix else ""

            paginator = s3.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=input_bucket, Prefix=input_key)

            count = 0
            for page in pages:
                if interrupt_event.is_set():
                    log.warning("Download interrupted")
                    return False, "INTERRUPTED"

                for obj in page.get("Contents", []):
                    if interrupt_event.is_set():
                        return False, "INTERRUPTED"

                    obj_key = obj["Key"]
                    # Skip the prefix itself if it's listed as a "directory"
                    if obj_key.endswith("/"):
                        continue

                    rel_key = obj_key
                    if prefix_with_slash and obj_key.startswith(prefix_with_slash):
                        rel_key = obj_key[len(prefix_with_slash):]
                    rel_key = rel_key.lstrip("/")
                    if not rel_key:
                        rel_key = os.path.basename(obj_key)
                    rel_key = rel_key.replace("/", os.sep)
                    rel_key = os.path.normpath(rel_key)
                    if os.path.isabs(rel_key) or rel_key.startswith(os.pardir + os.sep) or rel_key == os.pardir:
                        rel_key = os.path.basename(obj_key)

                    local_path = os.path.join(local_dir, rel_key)
                    dest_dir = os.path.dirname(local_path)
                    if dest_dir:
                        os.makedirs(dest_dir, exist_ok=True)

                    log.info("Downloading image: %s", rel_key)
                    s3.download_file(input_bucket, obj_key, local_path)
                    count += 1

            if count == 0:
                # Try fallback: treat as video key if it looks like one
                if input_key.lower().endswith((".mp4", ".mov", ".mkv", ".avi")):
                    log.info("No images found; trying video fallback: %s", input_key)
                    local_path = os.path.join(workspace, "inputs/video/input.mp4")
                    s3.download_file(input_bucket, input_key, local_path)
                    if os.path.exists(local_path):
                        return True, ""
                return False, "INVALID_INPUT"

            log.info("Downloaded %d image(s)", count)
            return True, ""

    except Exception as e:
        log.warning("S3 download failed: %s", e)
        return False, "WORKER_ERROR"

def upload_outputs(
    item: WorkItem,
    workspace: str,
) -> bool:
    """Upload outputs to S3. Returns success."""
    output_bucket = item.output_bucket
    output_prefix = item.output_prefix

    if not output_bucket or not output_prefix:
        log.warning("No output bucket/prefix; skipping upload")
        return True

    try:
        # Create and upload manifest
        manifest = {
            "attemptId": item.attempt_id,
            "sceneId": item.scene_id,
            "timestamp": time.time(),
            "status": "COMPLETED",
        }
        manifest_path = os.path.join(workspace, "outputs/manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        manifest_key = f"{output_prefix.rstrip('/')}/manifest.json"
        log.info("Uploading manifest to s3://%s/%s", output_bucket, manifest_key)
        s3.upload_file(manifest_path, output_bucket, manifest_key)

        # Create and upload placeholder output artifact
        output_file = os.path.join(workspace, "outputs/output.splat")
        with open(output_file, "wb") as f:
            f.write(b"SPLAT_PLACEHOLDER_v1\x00")

        output_key = f"{output_prefix.rstrip('/')}/output.splat"
        log.info("Uploading output to s3://%s/%s", output_bucket, output_key)
        s3.upload_file(output_file, output_bucket, output_key)

        log.info("Outputs uploaded successfully")
        return True

    except Exception as e:
        log.warning("Failed to upload outputs: %s", e)
        return False

# Simulation Logic
def simulate_processing(item: WorkItem, global_stop: threading.Event, receipt_handle: str = None, queue_url: str = None) -> Tuple[bool, bool]:
    """
    Complete processing workflow:
    1. Download inputs from S3
    2. Simulate work for ~30s with periodic progress updates
    3. Upload outputs to S3
    4. Report success/failure
    
    Handles spot interruption and global stop signal responsively.
    On interruption, sets message visibility to 0 for fast retry.
    
    Returns:
        Tuple[bool, bool]: (success, was_interrupted)
            - success: True only if backend accepted the final SUCCEEDED patch
            - was_interrupted: True if processing was interrupted by Spot/signal
    """
    attempt_id = item.attempt_id
    scene_id = item.scene_id
    token = item.api_auth_token
    api_url = item.api_base_url or API_BASE_URL
    current_instance_id = INSTANCE_ID

    # Create shared interruption event
    interrupt_event = threading.Event()

    # Start monitoring for spot interruptions
    def monitor_interruptions():
        log.debug("Starting spot interruption monitoring thread")
        check_count = 0
        while not interrupt_event.is_set() and not global_stop.is_set():
            check_count += 1
            if spot_interruption_notice():
                log.warning("Spot interruption detected after %d checks", check_count)
                interrupt_event.set()
                break
            # Log every 30 seconds to show the thread is working
            if check_count % 30 == 0:
                log.debug("Spot interruption monitor: %d checks completed, no interruption", check_count)
            time.sleep(1)

    monitor_thread = threading.Thread(target=monitor_interruptions, daemon=True)
    monitor_thread.start()

    last_heartbeat = 0.0

    def _send_heartbeat_if_due(phase: str, percent: int, *, force: bool = False) -> ApiCallResult:
        nonlocal last_heartbeat
        now = time.time()
        interval = HEARTBEAT_INTERVAL_SECONDS
        if force or now - last_heartbeat >= interval:
            result = post_heartbeat(attempt_id, token, phase, percent, api_base_url=api_url)
            last_heartbeat = time.time()
            return result
        else:
            next_in = max(0.0, interval - (now - last_heartbeat))
            log.debug("Heartbeat suppressed for %s (%d%%); next in %.1fs", phase, percent, next_in)
            return ApiCallResult(ok=True, status_code=None, body_preview=None)
    
    def _release_message_visibility():
        """Release message visibility immediately for fast retry (best effort)."""
        if receipt_handle and queue_url:
            try:
                sqs.change_message_visibility(
                    QueueUrl=queue_url,
                    ReceiptHandle=receipt_handle,
                    VisibilityTimeout=0,
                )
                log.warning("Released message visibility to 0 for immediate retry")
            except Exception as e:
                log.warning("Failed to release message visibility (best effort): %s", e)

    try:
        # Phase 0: Mark as RUNNING with INIT phase - fail fast if attempt doesn't exist
        log.info("Marking attempt as RUNNING for attemptId=%s, sceneId=%s", attempt_id, scene_id)
        workspace = setup_workspace(attempt_id)

        start_patch = {
            "status": "RUNNING",
            "progressPhase": "INIT",
            "progressPercent": 0,
        }
        if current_instance_id:
            start_patch["ec2InstanceId"] = current_instance_id
        if SPOT_REQUEST_ID:
            start_patch["spotRequestId"] = SPOT_REQUEST_ID
        
        start_result = patch_attempt(attempt_id, token, start_patch, api_base_url=api_url)
        if not start_result.ok:
            if start_result.status_code == 404:
                log.error("Attempt not found (404); aborting without processing so message can retry/DLQ")
            else:
                log.error("Initial RUNNING patch failed (status=%s); aborting", start_result.status_code)
            return False, False

        _send_heartbeat_if_due("INIT", 0, force=True)

        # Phase 1: Download
        log.info("Starting download phase for attemptId=%s, sceneId=%s", attempt_id, scene_id)
        
        # Download inputs
        dl_ok, dl_error = download_s3_objects(item, workspace, interrupt_event)
        if interrupt_event.is_set() or global_stop.is_set():
            log.warning("Interrupted during download")
            patch_attempt(attempt_id, token, {
                "status": "INTERRUPTED",
                "progressPhase": "INIT",
                "progressPercent": 0,
            }, api_base_url=api_url)
            _release_message_visibility()
            # Spot interruption: don't decrement desired capacity (ASG will launch replacement)
            return False, True

        if not dl_ok:
            log.error("Download failed: %s", dl_error)
            patch_attempt(attempt_id, token, {
                "status": "FAILED",
                "reason": dl_error or "WORKER_ERROR",
                "errorMessage": f"Failed to download inputs: {dl_error}",
                "progressPhase": "INIT",
            }, api_base_url=api_url)
            return False, False

        patch_attempt(attempt_id, token, {
            "progressPhase": "INIT",
            "progressPercent": 100,
        }, api_base_url=api_url)
        _send_heartbeat_if_due("INIT", 100, force=True)
        log.info("Download complete")

        # Phase 2: Simulate Work
        log.info("Starting simulation phase for %d seconds", SIM_TOTAL_SECONDS)
        start_time = time.time()
        progress_start = 10  # Start at 10% after download
        progress_end = 95    # Go to 95% at end of simulation

        sim_duration = float(max(SIM_TOTAL_SECONDS, 1))
        progress_range = progress_end - progress_start

        def _percent_for(elapsed_time: float) -> int:
            fraction = _progress_fraction(elapsed_time, sim_duration)
            return int(progress_start + progress_range * fraction)

        while True:
            elapsed = time.time() - start_time

            if global_stop.is_set():
                log.warning("Global stop signal received during simulation")
                patch_attempt(attempt_id, token, {
                    "status": "INTERRUPTED",
                    "progressPhase": "FINALIZE",
                    "progressPercent": _percent_for(elapsed),
                }, api_base_url=api_url)
                _release_message_visibility()
                # Spot interruption: don't decrement desired capacity (ASG will launch replacement)
                return False, True

            if interrupt_event.is_set():
                log.warning("Spot interruption during simulation")
                patch_attempt(attempt_id, token, {
                    "status": "INTERRUPTED",
                    "progressPhase": "FINALIZE",
                    "progressPercent": _percent_for(elapsed),
                }, api_base_url=api_url)
                _release_message_visibility()
                # Spot interruption: don't decrement desired capacity (ASG will launch replacement)
                return False, True

            if elapsed >= sim_duration:
                break

            # Update progress smoothly
            progress_percent = _percent_for(elapsed)
            patch_attempt(attempt_id, token, {
                "progressPhase": "FINALIZE",
                "progressPercent": progress_percent,
            }, api_base_url=api_url)
            _send_heartbeat_if_due("FINALIZE", progress_percent)

            # Sleep for update interval but check interruption frequently
            remaining = max(sim_duration - elapsed, 0.0)
            sleep_time = min(SIM_UPDATE_INTERVAL_SECONDS, remaining)
            if interrupt_event.wait(timeout=sleep_time):
                log.warning("Spot interruption detected during sleep")
                patch_attempt(attempt_id, token, {
                    "status": "INTERRUPTED",
                    "progressPhase": "FINALIZE",
                    "progressPercent": _percent_for(elapsed),
                }, api_base_url=api_url)
                _release_message_visibility()
                # Spot interruption: don't decrement desired capacity (ASG will launch replacement)
                return False, True

        log.info("Simulation complete")

        # Phase 3: Upload Outputs
        log.info("Starting output upload phase")
        patch_attempt(attempt_id, token, {
            "progressPhase": "FINALIZE",
            "progressPercent": 95,
        }, api_base_url=api_url)
        _send_heartbeat_if_due("FINALIZE", 95)

        upload_ok = upload_outputs(item, workspace)
        if not upload_ok:
            log.error("Output upload failed; marking as failed")
            patch_attempt(attempt_id, token, {
                "status": "FAILED",
                "reason": "WORKER_ERROR",
                "errorMessage": "Failed to upload outputs to S3",
                "progressPhase": "FINALIZE",
                "progressPercent": 95,
            }, api_base_url=api_url)
            return False, False

        # Phase 4: Success (or simulated failure based on SUCCESS_RATE)
        success = random.random() <= SUCCESS_RATE
        if success:
            log.info("Marking attempt as SUCCEEDED")
            final_result = patch_attempt(attempt_id, token, {
                "status": "SUCCEEDED",
                "progressPhase": "FINALIZE",
                "progressPercent": 100,
                "outputBucket": item.output_bucket,
                "outputPrefix": item.output_prefix,
            }, api_base_url=api_url)
            _send_heartbeat_if_due("FINALIZE", 100, force=True)
            
            # Only return True if backend accepted the final patch
            if not final_result.ok:
                log.error("Final SUCCEEDED patch failed (status=%s); returning False to prevent message deletion", final_result.status_code)
                return False, False
            return True, False
        else:
            log.info("Simulated failure (SUCCESS_RATE=%f)", SUCCESS_RATE)
            patch_attempt(attempt_id, token, {
                "status": "FAILED",
                "reason": "WORKER_ERROR",
                "errorMessage": "Simulated failure during processing",
                "progressPhase": "FINALIZE",
                "progressPercent": 100,
            }, api_base_url=api_url)
            return False, False

    except Exception as e:
        log.exception("Crash during processing: %s", e)
        patch_attempt(attempt_id, token, {
            "status": "FAILED",
            "reason": "WORKER_ERROR",
            "errorMessage": f"Worker crash: {type(e).__name__}",
        }, api_base_url=api_url)
        return False, False
    finally:
        interrupt_event.set()
        monitor_thread.join(timeout=2)

def delete_message_with_retries(sqs_client: Any, queue_url: str, receipt_handle: str, msg_id: str = "unknown") -> bool:
    """
    Delete SQS message with exponential backoff retries to prevent duplicate processing.
    
    Args:
        sqs_client: boto3 SQS client
        queue_url: SQS queue URL
        receipt_handle: Message receipt handle
        msg_id: Message ID for logging (optional)
    
    Returns:
        True if deletion succeeded, False if all retries exhausted
    
    On failure after all retries:
        - Attempts best-effort visibility timeout reset to 0 (for fast retry)
        - Logs clear error for monitoring/alerting
    """
    max_attempts = DELETE_MESSAGE_MAX_RETRIES
    base_delay = 0.5  # 500ms base delay
    
    for attempt in range(1, max_attempts + 1):
        try:
            sqs_client.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
            if attempt > 1:
                log.info("DeleteMessage succeeded on attempt %d/%d for message ID=%s", attempt, max_attempts, msg_id)
            else:
                log.info("DeleteMessage succeeded for message ID=%s", msg_id)
            return True
        
        except Exception as e:
            is_last_attempt = (attempt == max_attempts)
            
            if is_last_attempt:
                log.error(
                    "DeleteMessage failed after %d attempts for message ID=%s: %s",
                    max_attempts,
                    msg_id,
                    e
                )
                
                # Best-effort fallback: release visibility for fast retry
                try:
                    sqs_client.change_message_visibility(
                        QueueUrl=queue_url,
                        ReceiptHandle=receipt_handle,
                        VisibilityTimeout=0
                    )
                    log.warning(
                        "DeleteMessage failed after retries; message visibility released to 0 for retry (message ID=%s)",
                        msg_id
                    )
                except Exception as vis_err:
                    log.error(
                        "CRITICAL: Both DeleteMessage and visibility release failed for message ID=%s; message may be delayed: %s",
                        msg_id,
                        vis_err
                    )
                
                return False
            
            # Exponential backoff with jitter
            delay = base_delay * (2 ** (attempt - 1))
            jitter = random.uniform(0, delay * 0.1)  # 10% jitter
            total_delay = delay + jitter
            
            log.warning(
                "DeleteMessage attempt %d/%d failed for message ID=%s: %s; retrying in %.2fs",
                attempt,
                max_attempts,
                msg_id,
                e,
                total_delay
            )
            
            time.sleep(total_delay)
    
    return False

# ----------------------------
# 10. Main Loop
# ----------------------------
stop_event = threading.Event()

def _handle_signal(signum: int, _frame: Any) -> None:
    log.info("Received signal %s, stopping...", signum)
    stop_event.set()

def main() -> None:
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # 1. Resolve Configuration
    qurl, dlqurl = resolve_queue_urls()
    print_runtime_discovery(qurl, dlqurl)

    if not qurl:
        log.error("No Queue URL found. Check QUEUE_NAME or AWS_REGION.")
        log.error("Current AWS_REGION: %s", AWS_REGION)
        log.error("Current QUEUE_NAME: %s", QUEUE_NAME)
        log.error("Try setting SQS_QUEUE_URL or QURL environment variable directly")
        log.error("Example: export SQS_QUEUE_URL='https://sqs.us-east-1.amazonaws.com/123456789/queue-name'")
        return

    # Start global Spot interruption monitor
    def _monitor_spot_instance_events() -> None:
        # Detect Spot interruption notice and request graceful shutdown
        while not stop_event.is_set():
            if spot_interruption_notice():
                log.warning("Spot interruption notice detected; stopping worker to allow replacement.")
                stop_event.set()
                break
            time.sleep(1)

    spot_evt_thread = threading.Thread(target=_monitor_spot_instance_events, daemon=True)
    spot_evt_thread.start()

    log.info("Worker started. Polling %s...", qurl)
    log.info("Poll wait time: %ds, Visibility timeout: %ds", POLL_WAIT_TIME, VISIBILITY_TIMEOUT_SECONDS)
    log.info("RUN_ONCE: %s, IDLE_EXIT_SECONDS: %d", RUN_ONCE, IDLE_EXIT_SECONDS)
    log.info("DELETE_MESSAGE_MAX_RETRIES: %d", DELETE_MESSAGE_MAX_RETRIES)

    last_received_time = time.time()
    poll_count = 0
    consecutive_empty_polls = 0
    message_processed = False  # Track if we've processed a message (for one-per-instance)

    while not stop_event.is_set():
        poll_count += 1
        
        # Check idle timeout for scale-to-zero
        if IDLE_EXIT_SECONDS > 0:
            idle_elapsed = time.time() - last_received_time
            if idle_elapsed >= IDLE_EXIT_SECONDS:
                log.info(
                    "IDLE_EXIT_SECONDS (%d) exceeded without receiving messages; terminating self for scale-to-zero.",
                    IDLE_EXIT_SECONDS,
                )
                terminate_self("idle_timeout", decrement_desired=True)
                return

        try:
            log.debug("Poll #%d: Waiting up to %ds for messages...", poll_count, min(POLL_WAIT_TIME, 20))
            resp = sqs.receive_message(
                QueueUrl=qurl,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=min(POLL_WAIT_TIME, 20),
                VisibilityTimeout=VISIBILITY_TIMEOUT_SECONDS,
                AttributeNames=["ApproximateReceiveCount"],
            )
        except Exception as e:
            log.warning("SQS receive error (poll #%d): %s", poll_count, e)
            log.warning("This may indicate IAM permission issues or KMS encryption problems")
            log.warning("Check CloudTrail for AccessDenied events")
            time.sleep(5)
            continue

        msgs = resp.get("Messages", [])
        if not msgs:
            consecutive_empty_polls += 1
            log.debug("Poll #%d: No messages received (consecutive empty: %d)", poll_count, consecutive_empty_polls)
            # Log at INFO level every 10 empty polls to show worker is alive
            if consecutive_empty_polls % 10 == 0:
                log.info("Worker polling active: %d consecutive empty polls, queue appears empty", consecutive_empty_polls)
            continue

        # Reset counters when message received
        consecutive_empty_polls = 0
        last_received_time = time.time()
        message_processed = True  # Mark that we've processed a message

        msg = msgs[0]
        msg_id = msg.get("MessageId", "unknown")
        receipt = msg.get("ReceiptHandle")
        
        item = parse_message_body(msg.get("Body", ""))
        log.info("Poll #%d: Received message ID=%s", poll_count, msg_id)

        if not item:
            log.warning("Failed to parse message ID=%s", msg_id)
            if DELETE_INVALID_MESSAGES and receipt:
                delete_ok = delete_message_with_retries(sqs, qurl, receipt, msg_id)
                if delete_ok:
                    log.info("Deleted invalid message ID=%s", msg_id)
                else:
                    log.error("Failed to delete invalid message ID=%s after retries", msg_id)
            
            # ONE MESSAGE PER INSTANCE: Terminate even on invalid message
            log.info("Invalid message processed; terminating self (one-message-per-instance policy)")
            terminate_self("invalid_message_processed", decrement_desired=True)
            return

        # Start visibility extension thread when we have a receipt handle
        vis_stop: Optional[threading.Event] = None
        extender: Optional[threading.Thread] = None
        if receipt:
            vis_stop = threading.Event()
            extender = threading.Thread(
                target=extend_visibility_loop,
                args=(qurl, receipt, vis_stop, VISIBILITY_TIMEOUT_SECONDS, VISIBILITY_EXTENSION_INTERVAL_SECONDS),
                daemon=True,
            )
            extender.start()
        else:
            log.warning("Message ID=%s has no receipt handle; skipping visibility extension", msg_id)

        try:
            log.info("Processing attemptId=%s, sceneId=%s", item.attempt_id, item.scene_id)
            ok, was_interrupted = simulate_processing(item, stop_event, receipt_handle=receipt, queue_url=qurl)
        except Exception as e:
            log.exception("Crash processing attemptId=%s: %s", item.attempt_id, e)
            ok, was_interrupted = False, False
        finally:
            if vis_stop:
                vis_stop.set()
            if extender:
                extender.join(timeout=2)

        # Delete message only on success, using robust retry mechanism
        if ok and receipt:
            delete_ok = delete_message_with_retries(sqs, qurl, receipt, msg_id)
            if not delete_ok:
                log.error(
                    "CRITICAL: Message processing succeeded but deletion failed after retries for attemptId=%s, message ID=%s",
                    item.attempt_id,
                    msg_id
                )
                # Still terminate instance to maintain one-message-per-instance
                # Message will retry but outputs are already uploaded (idempotent)
        elif not ok:
            log.info("Processing failed for attemptId=%s; message will retry", item.attempt_id)
        
        # ONE MESSAGE PER INSTANCE: Always terminate after processing
        # If interruption: preserve ASG desired capacity for immediate replacement (decrement_desired=False)
        # If success/normal failure: scale down ASG desired capacity (decrement_desired=True)
        
        if ok:
            log.info("Message processed successfully; terminating self (one-message-per-instance policy)")
            terminate_self("job_success", decrement_desired=True)
        elif was_interrupted:
            log.info("Message processing interrupted (Spot/signal); terminating self without decrementing ASG desired capacity")
            terminate_self("spot_interruption", decrement_desired=False)
        else:
            log.info("Message processing failed; terminating self (one-message-per-instance policy)")
            terminate_self("job_failure", decrement_desired=True)
        return

    log.info("Worker stopped after %d polls.", poll_count)
    
    # If we're stopping due to signal but never processed a message, terminate for clean ASG state
    if not message_processed:
        log.info("Worker stopping without processing any messages; terminating self")
        terminate_self("no_message_processed", decrement_desired=True)

if __name__ == "__main__":
    _run_simulation_self_tests()
    main()
