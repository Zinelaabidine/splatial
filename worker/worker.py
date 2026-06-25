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
- Downloads inputs from S3 (images, video, or ZIP datasets).
- Runs 3D Gaussian Splatting training for ZIP dataset inputs.
- Simulates processing for non-ZIP inputs (legacy mode).
- Uploads outputs to S3 (manifest.json + training artifacts).
- Responsive interruption handling (Spot, global stop, failure).
- One-message-per-instance: processes single message then terminates self.
- ASG-aware termination: uses AutoScaling API to decrement desired capacity.
- Idle termination: exits after IDLE_EXIT_SECONDS with no messages (scale-to-zero).
- Robust message deletion: retries with exponential backoff to prevent duplicate processing.

Training Mode:
When the SQS message references a ZIP file (inputPrefix/inputPrefixOrKey ends with .zip):
1. Downloads and safely extracts the ZIP dataset
2. Runs COLMAP via convert.py when the dataset is a raw image folder (no sparse/ yet)
3. Runs train.py with hardcoded parameters:
   --optimizer_type sparse_adam --disable_viewer
4. Streams training logs to worker logger in real-time
5. Uploads training outputs to S3 (point clouds, configs, etc.)

Usage:
    # Run with defaults (RUN_ENV=local, AWS_PROFILE=default, AWS_REGION=us-east-1)
    python3 worker.py
    
    # Run with custom environment variables
    RUN_ENV=ec2 AWS_REGION=eu-west-1 python3 worker.py
    
    # Or use a .env file (see .env.example for template)
    python3 worker.py

Environment Variables:
    RUN_ENV (default: local) - Execution environment: 'local' or 'ec2'
    AWS_PROFILE (default: default) - AWS credentials profile to use
    AWS_REGION (default: us-east-1) - AWS region for SQS and S3 operations
    API_BASE_URL (default: https://api.zinelaabidine-nadir.com)
    QUEUE_NAME (default: splatial-dev-splat-processing-queue)
    DLQ_NAME (default: splatial-dev-splat-processing-dlq)
    AWS_REGION (auto-discovered from IMDSv2)
    WORKSPACE_ROOT (default: /tmp/streaming-splat)
    VISIBILITY_TIMEOUT_SECONDS (default: 300) - New timeout to set on each renewal
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
import subprocess
import sys
import threading
import time
import zipfile
from collections import deque
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests
from botocore.exceptions import ClientError
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
# 1. AWS Environment Variables (Critical - Set Before AWS SDK Init)
# ----------------------------
# These must be set before importing boto3/aws_config to ensure proper AWS configuration.
# They will NOT override existing environment variables (respects explicit user settings).
os.environ.setdefault("RUN_ENV", "local")
os.environ.setdefault("AWS_PROFILE", "default")
os.environ.setdefault("AWS_REGION", "us-east-1")

# ----------------------------
# 2. Application Configuration Defaults
# ----------------------------
# These defaults mimic the behavior of imds_extract.py
DEFAULTS = {
    "API_BASE_URL": "https://api-dev.openspacenexus.store",
    "QUEUE_NAME": "splatial-dev-splat-processing-queue",
    "DLQ_NAME": "splatial-dev-splat-processing-dlq",
    "WORKER_POLL_INTERVAL_SECONDS": "20",
    "VISIBILITY_EXTENSION_INTERVAL_SECONDS": "150",  # How often to renew
    "VISIBILITY_TIMEOUT_SECONDS": "300",  # What timeout value to set on each renewal
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
VISIBILITY_TIMEOUT_SECONDS = getenv_int("VISIBILITY_TIMEOUT_SECONDS", 300)
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

# ----------------------------
# Training Configuration
# ----------------------------
# Hardcoded training parameters as specified
# TRAINING_PARAMS = [
#     # "--data_device", "cpu",   <-- REMOVED: Data will now load to GPU VRAM
#     "--sh_degree", "3",               # High fidelity colors (requires more VRAM)
#     "--iterations", "30000",          # Full training duration
#     "--densify_until_iter", "15000",  # Fine detail generation
#     "--densify_grad_threshold", "0.0002", # Capture subtle structures
#     "--test_iterations", "-1",
#     "--save_iterations", "30000",
#     "--checkpoint_iterations", "30000"
# ]

TRAINING_PARAMS = [
    "--optimizer_type", "sparse_adam",
    "--disable_viewer",  # headless workers; avoids port 6009 bind conflicts
]

# Default training quality/speed preset; SQS trainConfig keys override these.
DEFAULT_TRAIN_CONFIG: Dict[str, Any] = {
    "iterations": 15000,
    "densify_until_iter": 7000,
    "resolution": 2,
    "sh_degree": 2,
}


def merge_train_config(overrides: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Merge message trainConfig over DEFAULT_TRAIN_CONFIG (None values ignored)."""
    merged = dict(DEFAULT_TRAIN_CONFIG)
    if overrides:
        for key, value in overrides.items():
            if value is not None:
                merged[key] = value
    return merged
# How many recent log lines to capture for error reporting
TRAINING_LOG_TAIL_LINES = 50
COLMAP_LOG_TAIL_LINES = 50
COLMAP_EXECUTABLE = os.getenv("COLMAP_EXECUTABLE", "").strip()
COLMAP_NO_GPU = getenv_bool("COLMAP_NO_GPU", False)


def _gaussian_splatting_root() -> str:
    """Directory containing train.py / convert.py (co-located with worker.py on AMI)."""
    return os.path.dirname(os.path.abspath(__file__))

def sanitize_output_path(s: str) -> str:
    """
    Sanitize output path by removing trailing timestamp patterns.
    
    The training logger appends timestamps like " [03/01 23:58:57]" to stdout lines.
    This function strips such patterns to extract the clean filesystem path.
    
    Args:
        s: Raw path string potentially containing trailing timestamp
    
    Returns:
        Cleaned path string with timestamp removed
    
    Examples:
        "./output/c3941b61-7 [03/01 23:58:57]" -> "./output/c3941b61-7"
        "./output/xyz   [12/31 01:02:03]   " -> "./output/xyz"
        "/tmp/out/abc" -> "/tmp/out/abc"
        "./output/no_timestamp" -> "./output/no_timestamp"
    """
    if not s:
        return ""
    
    # Strip leading/trailing whitespace
    s = s.strip()
    
    # Remove trailing timestamp pattern: " [MM/DD HH:MM:SS]"
    # Pattern matches: optional spaces, [, 2 digits, /, 2 digits, space(s), time, ], optional spaces
    s = re.sub(r"\s+\[\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2}\]\s*$", "", s)
    
    # Final trim
    return s.strip()

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
    "PREPARATION",
    "COLMAP",
    "TRAINING",
    "POST_PROCESSING",
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
    
    # Map common legacy phases for backwards compatibility
    if phase == "DOWNLOAD":
        return "INIT"
    if phase in ("COLMAP_FEATURE", "COLMAP_MATCH", "COLMAP_SPARSE", "COLMAP_UNDISTORT"):
        return "COLMAP"
    if phase == "NERFSTUDIO_TRAIN":
        return "TRAINING"
    
    # Default fallback for unknown phases
    if phase not in _phase_warning_logged:
        log.warning("Invalid progressPhase '%s' mapped to 'FINALIZE'", phase)
        _phase_warning_logged.add(phase)
    return "FINALIZE"

# Phase Ranges for 7-step progress pipeline
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
    """
    Convert local phase progress (0-100) to global progress (0-100).
    
    Args:
        phase: Current phase name (must be in PHASE_RANGES)
        local_percent: Progress within the phase (0-100)
    
    Returns:
        Global progress percentage (0-100)
    
    Examples:
        overall_percent("INIT", 0) -> 0
        overall_percent("INIT", 100) -> 10
        overall_percent("TRAINING", 50) -> 65  # halfway through 40-90 range
    """
    if phase not in PHASE_RANGES:
        log.warning("Phase '%s' not in PHASE_RANGES; using 0-100 as fallback", phase)
        return int(max(0, min(100, local_percent)))
    
    start, end = PHASE_RANGES[phase]
    # Clamp local_percent to [0, 100]
    local_clamped = max(0.0, min(100.0, float(local_percent)))
    # Map to global range
    global_val = start + (end - start) * (local_clamped / 100.0)
    return int(max(0, min(100, global_val)))

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
    input_file_type: str  # "images" | "video" | "zip"
    input_file_count: int  # estimated, may be 0
    input_size_bytes: int  # estimated, may be 0
    output_bucket: str
    output_prefix: str
    api_auth_token: str
    api_base_url: Optional[str] = None  # Optional override
    train_config: Optional[Dict[str, Any]] = None  # Optional training parameters

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
        
        # Extract trainConfig if present
        train_config = data.get("trainConfig") or data.get("train_config")
        if train_config is not None and not isinstance(train_config, dict):
            log.warning("trainConfig is present but not a dict; ignoring it")
            train_config = None

        # Infer input_file_type if missing or unknown
        if input_file_type not in ("images", "video", "zip"):
            if re.search(r"\.(zip)$", input_prefix, re.IGNORECASE):
                input_file_type = "zip"
            elif input_prefix.lower().endswith((".mp4", ".mov", ".mkv", ".avi")):
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
            train_config=train_config,
        )
    except Exception as e:
        log.warning("Error parsing message body: %s", e)
        return None

def train_config_to_args(train_cfg: Dict[str, Any]) -> List[str]:
    """
    Convert trainConfig dict into a flat argv list of strings.
    
    Args:
        train_cfg: Training configuration dictionary
    
    Returns:
        List of CLI arguments as strings
    
    Rules:
    - Keys become flags: "sh_degree" -> "--sh_degree"
    - int/float/str values become the next argv item as string
    - bool True: include flag only (no value)
    - bool False: omit flag entirely
    - None values: omit entirely
    - Unknown keys: log warning and ignore
    
    Examples:
        {"iterations": 30000} -> ["--iterations", "30000"]
        {"eval": True} -> ["--eval"]
        {"eval": False} -> []
        {"lambda_dssim": 0.2} -> ["--lambda_dssim", "0.2"]
    """
    if not train_cfg:
        return []
    
    # Allowlist of accepted training parameters
    ALLOWED_KEYS = [
        "data_device",
        "resolution",
        "sh_degree",
        "iterations",
        "densify_from_iter",
        "densify_until_iter",
        "densify_grad_threshold",
        "lambda_dssim",
        "eval",
        "white_background",
        "test_iterations",
        "save_iterations",
        "checkpoint_iterations",
        "opacity_reset_interval",
        "densification_interval",
        "percent_dense",
        "position_lr_init",
        "position_lr_final",
        "position_lr_delay_mult",
        "position_lr_max_steps",
        "feature_lr",
        "opacity_lr",
        "scaling_lr",
        "rotation_lr",
    ]
    
    # Preferred order for deterministic output
    PREFERRED_ORDER = [
        "data_device",
        "resolution",
        "sh_degree",
        "iterations",
        "densify_from_iter",
        "densify_until_iter",
        "densify_grad_threshold",
        "lambda_dssim",
        "eval",
        "white_background",
    ]
    
    args = []
    
    # Process keys in preferred order first
    for key in PREFERRED_ORDER:
        if key not in train_cfg:
            continue
        
        value = train_cfg[key]
        
        # Skip None values
        if value is None:
            continue
        
        # Check allowlist
        if key not in ALLOWED_KEYS:
            log.warning("trainConfig key '%s' not in allowlist; ignoring", key)
            continue
        
        flag = f"--{key}"
        
        # Handle boolean values
        if isinstance(value, bool):
            if value:  # True: add flag only
                args.append(flag)
            # False: omit entirely
            continue
        
        # Handle other types (int, float, str)
        args.extend([flag, str(value)])
    
    # Process remaining keys (not in preferred order) alphabetically
    remaining_keys = sorted(set(train_cfg.keys()) - set(PREFERRED_ORDER))
    for key in remaining_keys:
        value = train_cfg[key]
        
        # Skip None values
        if value is None:
            continue
        
        # Check allowlist
        if key not in ALLOWED_KEYS:
            log.warning("trainConfig key '%s' not in allowlist; ignoring", key)
            continue
        
        flag = f"--{key}"
        
        # Handle boolean values
        if isinstance(value, bool):
            if value:  # True: add flag only
                args.append(flag)
            # False: omit entirely
            continue
        
        # Handle other types (int, float, str)
        args.extend([flag, str(value)])
    
    return args

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

def _test_train_config_to_args() -> None:
    """Self-tests for train_config_to_args conversion."""
    # Test 1: Basic int/float/str conversion
    cfg1 = {
        "iterations": 30000,
        "resolution": 2,
        "lambda_dssim": 0.2,
        "data_device": "cuda",
    }
    args1 = train_config_to_args(cfg1)
    assert "--data_device" in args1
    assert args1[args1.index("--data_device") + 1] == "cuda"
    assert "--iterations" in args1
    assert args1[args1.index("--iterations") + 1] == "30000"
    assert "--resolution" in args1
    assert args1[args1.index("--resolution") + 1] == "2"
    assert "--lambda_dssim" in args1
    assert args1[args1.index("--lambda_dssim") + 1] == "0.2"
    
    # Test 2: Boolean True (flag only, no value)
    cfg2 = {"eval": True}
    args2 = train_config_to_args(cfg2)
    assert args2 == ["--eval"], f"Expected ['--eval'], got {args2}"
    
    # Test 3: Boolean False (omit entirely)
    cfg3 = {"eval": False, "white_background": False}
    args3 = train_config_to_args(cfg3)
    assert "--eval" not in args3
    assert "--white_background" not in args3
    assert len(args3) == 0
    
    # Test 4: Mixed booleans
    cfg4 = {"eval": True, "white_background": False}
    args4 = train_config_to_args(cfg4)
    assert "--eval" in args4
    assert "--white_background" not in args4
    
    # Test 5: None values (omit)
    cfg5 = {"iterations": 30000, "sh_degree": None}
    args5 = train_config_to_args(cfg5)
    assert "--iterations" in args5
    assert "--sh_degree" not in args5
    
    # Test 6: Empty config
    args6 = train_config_to_args({})
    assert args6 == []
    args7 = train_config_to_args(None)
    assert args7 == []
    
    # Test 7: All values are strings
    cfg8 = {"iterations": 30000, "lambda_dssim": 0.2}
    args8 = train_config_to_args(cfg8)
    for arg in args8:
        assert isinstance(arg, str), f"All args must be strings, got {type(arg)}: {arg}"
    
    log.info("train_config_to_args self-tests passed")

    assert merge_train_config(None) == DEFAULT_TRAIN_CONFIG
    assert merge_train_config({}) == DEFAULT_TRAIN_CONFIG
    assert merge_train_config({"iterations": 30000})["iterations"] == 30000
    assert merge_train_config({"iterations": 30000})["resolution"] == 2
    log.info("merge_train_config self-tests passed")

_test_train_config_to_args()

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

def _safe_extract_zip(zip_path: str, dest_dir: str) -> None:
    """Safely extract a zip to dest_dir (prevents path traversal / Zip Slip)."""
    abs_dest = os.path.abspath(dest_dir)
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            # Normalize member path and reject absolute/parent traversal
            member_name = member.filename.replace("\\", "/")
            norm = os.path.normpath(member_name)
            if norm.startswith("..") or os.path.isabs(norm):
                raise ValueError(f"Unsafe zip member path: {member.filename!r}")
            target = os.path.abspath(os.path.join(abs_dest, norm))
            if os.path.commonpath([abs_dest, target]) != abs_dest:
                raise ValueError(f"Unsafe zip member path: {member.filename!r}")
        zf.extractall(abs_dest)

IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"})


def _count_images_in_directory(dir_path: str) -> int:
    """Count image files directly inside a directory (non-recursive)."""
    try:
        return sum(
            1
            for entry in os.listdir(dir_path)
            if os.path.isfile(os.path.join(dir_path, entry))
            and os.path.splitext(entry)[1].lower() in IMAGE_EXTENSIONS
        )
    except OSError:
        return 0


def _find_scene_directory(extracted_dir: str) -> str:
    """
    Find the actual scene directory containing either:
    - sparse/ folder (COLMAP data)
    - transforms_train.json file (Blender/NeRF data)
    - a folder of raw images (e.g. Google Drive photo ZIPs)
    
    This handles cases where the ZIP contains a nested folder structure.
    For example, if the ZIP contains "bicycle/sparse/..." the actual scene
    directory is "bicycle/", not the extraction root.
    
    Args:
        extracted_dir: Root directory where ZIP was extracted
    
    Returns:
        Path to the scene directory
    
    Raises:
        ValueError: If no valid scene directory is found
    """
    # First check if extracted_dir itself is a valid scene directory
    if os.path.exists(os.path.join(extracted_dir, "sparse")):
        return extracted_dir
    if os.path.exists(os.path.join(extracted_dir, "transforms_train.json")):
        return extracted_dir
    
    # Check immediate subdirectories (one level deep)
    try:
        entries = os.listdir(extracted_dir)
    except OSError as e:
        raise ValueError(f"Cannot list extracted directory: {e}")
    
    # Filter to directories only
    subdirs = [
        os.path.join(extracted_dir, entry)
        for entry in entries
        if os.path.isdir(os.path.join(extracted_dir, entry))
    ]
    
    # Look for valid scene directories in subdirectories
    valid_dirs = []
    for subdir in subdirs:
        if os.path.exists(os.path.join(subdir, "sparse")):
            valid_dirs.append(subdir)
        elif os.path.exists(os.path.join(subdir, "transforms_train.json")):
            valid_dirs.append(subdir)
    
    if len(valid_dirs) == 0:
        # Raw image folders (common for Google Drive photo ZIPs)
        root_image_count = _count_images_in_directory(extracted_dir)
        if root_image_count > 0:
            log.info(
                "Using extraction root as image dataset (%d image(s) at top level)",
                root_image_count,
            )
            return extracted_dir

        image_dirs = [
            (subdir, _count_images_in_directory(subdir))
            for subdir in subdirs
        ]
        image_dirs = [(path, count) for path, count in image_dirs if count > 0]
        if len(image_dirs) == 1:
            chosen_path, image_count = image_dirs[0]
            log.info(
                "Using image folder %s (%d image(s))",
                os.path.basename(chosen_path),
                image_count,
            )
            return chosen_path
        if len(image_dirs) > 1:
            chosen_path, image_count = max(image_dirs, key=lambda item: item[1])
            log.warning(
                "Found multiple image folders %s; using %s (%d image(s))",
                [os.path.basename(path) for path, _ in image_dirs],
                os.path.basename(chosen_path),
                image_count,
            )
            return chosen_path

        raise ValueError(
            f"Could not find valid scene directory in {extracted_dir}. "
            f"Expected 'sparse/' (COLMAP), 'transforms_train.json' (Blender/NeRF), "
            f"or a folder of images. "
            f"Found {len(subdirs)} subdirectories: {[os.path.basename(d) for d in subdirs[:5]]}"
        )
    
    if len(valid_dirs) > 1:
        log.warning(
            "Found multiple valid scene directories: %s. Using first one: %s",
            [os.path.basename(d) for d in valid_dirs],
            valid_dirs[0]
        )
    
    return valid_dirs[0]


def _scene_has_colmap_output(scene_dir: str) -> bool:
    """Return True when scene_dir already contains a usable COLMAP sparse reconstruction."""
    sparse_dir = os.path.join(scene_dir, "sparse")
    if not os.path.isdir(sparse_dir):
        return False
    sparse0 = os.path.join(sparse_dir, "0")
    if os.path.isdir(sparse0):
        return True
    try:
        return any(
            name.startswith(("cameras", "images", "points3D"))
            for name in os.listdir(sparse_dir)
        )
    except OSError:
        return False


def _scene_is_blender_dataset(scene_dir: str) -> bool:
    return os.path.isfile(os.path.join(scene_dir, "transforms_train.json"))


def _scene_needs_colmap(scene_dir: str) -> bool:
    """Raw image folders need COLMAP; pre-built COLMAP and Blender datasets do not."""
    if _scene_is_blender_dataset(scene_dir):
        return False
    return not _scene_has_colmap_output(scene_dir)


def _prepare_colmap_input_dir(scene_dir: str) -> None:
    """
    Ensure convert.py's expected layout: scene_dir/input/ contains the source images.

    When images live directly in scene_dir (typical Google Drive photo ZIPs), symlinks
    them into input/ to avoid duplicating large datasets.
    """
    input_dir = os.path.join(scene_dir, "input")
    if os.path.isdir(input_dir) and _count_images_in_directory(input_dir) > 0:
        log.info("COLMAP input directory already populated: %s", input_dir)
        return

    os.makedirs(input_dir, exist_ok=True)
    linked = 0
    for entry in os.listdir(scene_dir):
        src = os.path.join(scene_dir, entry)
        if not os.path.isfile(src):
            continue
        if os.path.splitext(entry)[1].lower() not in IMAGE_EXTENSIONS:
            continue
        dst = os.path.join(input_dir, entry)
        if os.path.lexists(dst):
            continue
        os.symlink(os.path.abspath(src), dst)
        linked += 1

    if linked == 0:
        raise ValueError(f"No images found to prepare COLMAP input in {scene_dir}")

    log.info("Prepared COLMAP input directory with %d image(s): %s", linked, input_dir)


def download_and_extract_zip_input(
    item: WorkItem,
    workspace: str,
    interrupt_event: Optional[threading.Event] = None,
) -> str:
    """
    Download the ZIP file referenced by the SQS event (WorkItem.input_bucket + input_prefix_or_key),
    unzip it to the workspace, and return the extracted folder path.

    Layout:
      <workspace>/inputs/input.zip
      <workspace>/inputs/extracted/...
    """
    if not item.input_bucket or not item.input_prefix_or_key:
        raise ValueError("Missing inputBucket/inputPrefixOrKey for zip download")

    inputs_dir = os.path.join(workspace, "inputs")
    os.makedirs(inputs_dir, exist_ok=True)

    zip_local_path = os.path.join(inputs_dir, "input.zip")
    extracted_dir = os.path.join(inputs_dir, "extracted")

    if interrupt_event and interrupt_event.is_set():
        raise RuntimeError("Interrupted before download")

    s3_uri = f"s3://{item.input_bucket}/{item.input_prefix_or_key}"
    log.info("Downloading zip input: %s -> %s", s3_uri, zip_local_path)
    try:
        s3.download_file(item.input_bucket, item.input_prefix_or_key, zip_local_path)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "NoSuchKey", "NotFound"):
            raise ValueError(
                f"Input file not found in S3: {s3_uri}. "
                "The upload may not have completed, or this scene references a key that was never written. "
                "Each scene has its own S3 key even when importing the same Google Drive file."
            ) from e
        raise

    if interrupt_event and interrupt_event.is_set():
        raise RuntimeError("Interrupted before unzip")

    # Clean extract dir if present (optional: keep if you want incremental retries)
    if os.path.isdir(extracted_dir):
        # safest behavior is to remove stale contents so you don't mix retries
        for root, dirs, files in os.walk(extracted_dir, topdown=False):
            for f in files:
                try:
                    os.remove(os.path.join(root, f))
                except OSError:
                    pass
            for d in dirs:
                try:
                    os.rmdir(os.path.join(root, d))
                except OSError:
                    pass
    os.makedirs(extracted_dir, exist_ok=True)

    log.info("Unzipping %s -> %s", zip_local_path, extracted_dir)
    _safe_extract_zip(zip_local_path, extracted_dir)

    # Find the actual scene directory (handles nested directories in ZIP)
    scene_dir = _find_scene_directory(extracted_dir)
    log.info("Scene directory resolved to: %s", scene_dir)
    
    return scene_dir

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


# ----------------------------
# Training Functions
# ----------------------------
def run_training_subprocess(
    extracted_folder: str,
    interrupt_event: threading.Event,
    heartbeat_callback: Optional[callable] = None,
    train_config: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Optional[str], List[str]]:
    """
    Run train.py as a subprocess with hardcoded parameters plus optional trainConfig overrides.
    
    Args:
        extracted_folder: Path to the extracted dataset (passed as -s argument)
        interrupt_event: Event to signal interruption
        heartbeat_callback: Optional callback to send heartbeats periodically
        train_config: Optional training configuration dict from SQS message
    
    Returns:
        Tuple[bool, Optional[str], List[str]]:
            - success: True if exit code == 0
            - output_folder: Path to the output folder (parsed from "Output folder:" log line)
            - log_tail: Last N lines of training logs for error reporting
    """
    # Build command with sys.executable to use same Python interpreter
    train_script = os.path.join(_gaussian_splatting_root(), "train.py")
    
    effective_config = merge_train_config(train_config)
    extra_args = train_config_to_args(effective_config)
    if train_config:
        log.info("Training trainConfig overrides: %s", train_config)
    log.info("Effective training config: %s", effective_config)
    if extra_args:
        log.info("Training config args: %s", extra_args)

    # Build final command: base params + merged trainConfig
    cmd = [
        sys.executable,
        train_script,
        "-s", extracted_folder,
    ] + TRAINING_PARAMS + extra_args
    
    # Log training command in readable format
    log.info("=" * 60)
    log.info("Starting Gaussian Splatting Training")
    log.info("=" * 60)
    log.info("Python: %s", sys.executable)
    log.info("Script: %s", os.path.basename(train_script))
    log.info("Source: %s", extracted_folder)
    if TRAINING_PARAMS:
        log.info("Base params: %s", " ".join(TRAINING_PARAMS))
    if extra_args:
        log.info("Config params: %s", " ".join(extra_args))
    log.info("Full command: %s", " ".join(cmd))
    log.info("=" * 60)
    
    # Environment with unbuffered output
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    
    # Track output folder and log tail
    output_folder: Optional[str] = None
    log_tail: deque = deque(maxlen=TRAINING_LOG_TAIL_LINES)
    
    # Get training working directory for path resolution
    train_cwd = os.path.dirname(train_script)
    
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
            cwd=train_cwd,
        )
    except Exception as e:
        log.error("Failed to start training subprocess: %s", e)
        return False, None, [f"Failed to start training: {e}"]
    
    last_heartbeat_time = time.time()
    heartbeat_interval = HEARTBEAT_INTERVAL_SECONDS
    
    try:
        # Read output line by line and stream to logger
        while True:
            # Check for interruption
            if interrupt_event.is_set():
                log.warning("Interruption detected; terminating training subprocess")
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    log.warning("Training subprocess did not terminate gracefully; killing")
                    proc.kill()
                    proc.wait(timeout=5)
                return False, output_folder, list(log_tail)
            
            # Non-blocking read with timeout
            # Use select-like behavior by checking if process is still running
            line = proc.stdout.readline()
            
            if line:
                line = line.rstrip()
                log_tail.append(line)
                # Print directly to preserve train.py's original output format (tqdm progress bars, etc.)
                print(line, flush=True)
                
                # Parse output folder from train.py logs
                # train.py prints: "Output folder: <path>" followed by timestamp like " [03/01 23:58:57]"
                if line.startswith("Output folder:"):
                    # Extract raw path (includes timestamp)
                    raw_path = line.split(":", 1)[1].strip()
                    log.info("Raw output folder line from training: %r", line)
                    
                    # Sanitize to remove trailing timestamp
                    cleaned_path = sanitize_output_path(raw_path)
                    log.info("Cleaned output folder path: %s", cleaned_path)
                    
                    # Resolve to absolute path relative to training script directory
                    if os.path.isabs(cleaned_path):
                        output_folder = cleaned_path
                    else:
                        output_folder = os.path.abspath(os.path.join(train_cwd, cleaned_path))
                    
                    log.info("Resolved absolute output folder: %s", output_folder)
            
            # Check if process has ended
            if proc.poll() is not None and not line:
                break
            
            # Send periodic heartbeats during training
            now = time.time()
            if heartbeat_callback and (now - last_heartbeat_time) >= heartbeat_interval:
                heartbeat_callback()
                last_heartbeat_time = now
        
        # Get exit code
        exit_code = proc.returncode
        log.info("Training subprocess exited with code %d", exit_code)
        
        # output_folder is parsed from "Output folder: ..." log line
        # If not found, training likely failed early
        if output_folder is None:
            log.warning("Could not parse output folder from training logs")
        
        return exit_code == 0, output_folder, list(log_tail)
        
    except Exception as e:
        log.exception("Error during training subprocess execution: %s", e)
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        return False, output_folder, list(log_tail) + [f"Exception: {e}"]


def run_colmap_subprocess(
    scene_dir: str,
    interrupt_event: threading.Event,
    heartbeat_callback: Optional[callable] = None,
) -> Tuple[bool, List[str]]:
    """
    Run gaussian-splatting convert.py to produce COLMAP sparse reconstruction in scene_dir.

    Returns:
        Tuple[bool, List[str]]: (success, log_tail)
    """
    gs_root = _gaussian_splatting_root()
    convert_script = os.path.join(gs_root, "convert.py")
    if not os.path.isfile(convert_script):
        msg = f"convert.py not found at {convert_script}"
        log.error(msg)
        return False, [msg]

    cmd = [sys.executable, convert_script, "-s", scene_dir]
    if COLMAP_EXECUTABLE:
        cmd.extend(["--colmap_executable", COLMAP_EXECUTABLE])
    if COLMAP_NO_GPU:
        cmd.append("--no_gpu")

    log.info("=" * 60)
    log.info("Starting COLMAP Conversion")
    log.info("=" * 60)
    log.info("Python: %s", sys.executable)
    log.info("Script: %s", os.path.basename(convert_script))
    log.info("Source: %s", scene_dir)
    log.info("Full command: %s", " ".join(cmd))
    log.info("=" * 60)

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    log_tail: deque = deque(maxlen=COLMAP_LOG_TAIL_LINES)

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
            cwd=gs_root,
        )
    except Exception as e:
        log.error("Failed to start COLMAP subprocess: %s", e)
        return False, [f"Failed to start COLMAP: {e}"]

    last_heartbeat_time = time.time()
    heartbeat_interval = HEARTBEAT_INTERVAL_SECONDS

    try:
        while True:
            if interrupt_event.is_set():
                log.warning("Interruption detected; terminating COLMAP subprocess")
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    log.warning("COLMAP subprocess did not terminate gracefully; killing")
                    proc.kill()
                    proc.wait(timeout=5)
                return False, list(log_tail)

            line = proc.stdout.readline()
            if line:
                line = line.rstrip()
                log_tail.append(line)
                print(line, flush=True)

            if proc.poll() is not None and not line:
                break

            now = time.time()
            if heartbeat_callback and (now - last_heartbeat_time) >= heartbeat_interval:
                heartbeat_callback()
                last_heartbeat_time = now

        exit_code = proc.returncode
        log.info("COLMAP subprocess exited with code %d", exit_code)
        if exit_code != 0:
            return False, list(log_tail)

        if not _scene_has_colmap_output(scene_dir):
            msg = f"COLMAP finished but sparse reconstruction missing in {scene_dir}"
            log.error(msg)
            return False, list(log_tail) + [msg]

        return True, list(log_tail)

    except Exception as e:
        log.exception("Error during COLMAP subprocess execution: %s", e)
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        return False, list(log_tail) + [f"Exception: {e}"]


def upload_training_outputs(
    item: WorkItem,
    output_folder: str,
    workspace: str,
) -> bool:
    """
    Upload training outputs to S3.
    
    Uploads:
    - manifest.json with metadata
    - All files from output_folder (point clouds, configs, etc.)
    
    Args:
        item: WorkItem with S3 output configuration
        output_folder: Path to training output folder
        workspace: Workspace root path
    
    Returns:
        True if upload succeeded
    """
    output_bucket = item.output_bucket
    output_prefix = item.output_prefix
    
    if not output_bucket or not output_prefix:
        log.warning("No output bucket/prefix; skipping upload")
        return True
    
    if not output_folder:
        log.error("Training output folder is None or empty")
        return False
    
    # Defensive sanitization: clean trailing timestamps again
    sanitized_folder = sanitize_output_path(output_folder)
    if sanitized_folder != output_folder:
        log.warning(
            "Output folder contained trailing timestamp; sanitized from %r to %r",
            output_folder,
            sanitized_folder
        )
        output_folder = sanitized_folder
    
    # Check if folder exists
    if os.path.isdir(output_folder):
        log.info("Training output folder verified: %s", output_folder)
    else:
        # Heuristic fallback: try alternative resolutions
        log.warning("Training output folder not found: %s", output_folder)
        log.info("Attempting fallback resolution strategies...")
        
        attempted_paths = [output_folder]
        
        # Fallback 1: If contains " [", strip everything after it
        if " [" in output_folder:
            fallback1 = output_folder.split(" [")[0].strip()
            attempted_paths.append(fallback1)
            if os.path.isdir(fallback1):
                log.info("Fallback 1 succeeded: stripped bracket content -> %s", fallback1)
                output_folder = fallback1
            else:
                log.debug("Fallback 1 failed: %s does not exist", fallback1)
        
        # Fallback 2: If relative, try resolving from current working directory
        if not os.path.isdir(output_folder) and not os.path.isabs(output_folder):
            fallback2 = os.path.abspath(output_folder)
            attempted_paths.append(fallback2)
            if os.path.isdir(fallback2):
                log.info("Fallback 2 succeeded: resolved from cwd -> %s", fallback2)
                output_folder = fallback2
            else:
                log.debug("Fallback 2 failed: %s does not exist", fallback2)
        
        # Fallback 3: Try resolving relative to workspace
        if not os.path.isdir(output_folder):
            basename = os.path.basename(output_folder)
            fallback3 = os.path.join(workspace, basename)
            attempted_paths.append(fallback3)
            if os.path.isdir(fallback3):
                log.info("Fallback 3 succeeded: resolved from workspace -> %s", fallback3)
                output_folder = fallback3
            else:
                log.debug("Fallback 3 failed: %s does not exist", fallback3)
        
        # Final check
        if not os.path.isdir(output_folder):
            log.error(
                "Training output folder not found after all fallback attempts. Tried paths: %s",
                attempted_paths
            )
            return False
        
        log.info("Fallback resolution succeeded; using folder: %s", output_folder)
    
    try:
        # Create and upload manifest
        manifest = {
            "attemptId": item.attempt_id,
            "sceneId": item.scene_id,
            "timestamp": time.time(),
            "status": "COMPLETED",
            "outputFolder": os.path.basename(output_folder),
            "type": "gaussian_splatting",
        }
        
        # List files in output folder for manifest
        output_files = []
        for root, dirs, files in os.walk(output_folder):
            for f in files:
                rel_path = os.path.relpath(os.path.join(root, f), output_folder)
                output_files.append(rel_path)
        manifest["files"] = output_files
        
        manifest_path = os.path.join(workspace, "outputs/manifest.json")
        os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        
        manifest_key = f"{output_prefix.rstrip('/')}/manifest.json"
        log.info("Uploading manifest to s3://%s/%s", output_bucket, manifest_key)
        s3.upload_file(manifest_path, output_bucket, manifest_key)
        
        # Upload all files from output folder
        uploaded_count = 0
        for root, dirs, files in os.walk(output_folder):
            for filename in files:
                local_path = os.path.join(root, filename)
                rel_path = os.path.relpath(local_path, output_folder)
                s3_key = f"{output_prefix.rstrip('/')}/{rel_path}"
                
                log.info("Uploading %s to s3://%s/%s", rel_path, output_bucket, s3_key)
                s3.upload_file(local_path, output_bucket, s3_key)
                uploaded_count += 1
        
        log.info("Uploaded %d training output files to S3", uploaded_count)
        return True
        
    except Exception as e:
        log.exception("Failed to upload training outputs: %s", e)
        return False


def find_point_cloud_ply_dirs(output_folder: str) -> List[str]:
    """
    Recursively find all directories containing point_cloud.ply files.
    
    Args:
        output_folder: Root folder to search
    
    Returns:
        Sorted list of directory paths containing point_cloud.ply
    """
    ply_dirs = []
    for root, dirs, files in os.walk(output_folder):
        if "point_cloud.ply" in files:
            ply_dirs.append(root)
    
    # Sort for deterministic behavior
    ply_dirs.sort()
    return ply_dirs


def run_subprocess_with_interrupt(
    cmd: List[str],
    cwd: str,
    interrupt_event: threading.Event,
    global_stop: threading.Event,
    log_tail_limit: int = 200,
) -> Tuple[bool, Optional[str]]:
    """
    Run a subprocess with interruption support.
    
    Args:
        cmd: Command to run (as list)
        cwd: Working directory
        interrupt_event: Event to signal interruption
        global_stop: Global stop event
        log_tail_limit: Number of lines to keep in tail for error reporting
    
    Returns:
        Tuple[bool, Optional[str]]: (success, error_detail)
            - success: True if exit code == 0
            - error_detail: Error message if failed, None if successful
    """
    log.info("Running command in %s: %s", cwd, " ".join(cmd))
    
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    
    log_tail: deque = deque(maxlen=log_tail_limit)
    
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
            cwd=cwd,
        )
    except Exception as e:
        error_msg = f"Failed to start subprocess: {e}"
        log.error("%s", error_msg)
        return False, error_msg
    
    try:
        # Use communicate with timeout polling for responsive interruption
        # Accumulated output for final processing
        accumulated_output = []
        
        while True:
            # Check for interruption before each poll
            if interrupt_event.is_set() or global_stop.is_set():
                log.warning("Interruption detected; terminating subprocess")
                proc.terminate()
                try:
                    # Wait briefly for graceful termination
                    remaining_out, _ = proc.communicate(timeout=2)
                    if remaining_out:
                        accumulated_output.append(remaining_out)
                except subprocess.TimeoutExpired:
                    log.warning("Subprocess did not terminate gracefully; killing")
                    proc.kill()
                    try:
                        remaining_out, _ = proc.communicate(timeout=1)
                        if remaining_out:
                            accumulated_output.append(remaining_out)
                    except subprocess.TimeoutExpired:
                        pass
                return False, "Interrupted during subprocess execution"
            
            # Poll with timeout to allow frequent interruption checks
            try:
                stdout, _ = proc.communicate(timeout=0.5)
                # Process completed successfully
                if stdout:
                    accumulated_output.append(stdout)
                break
            except subprocess.TimeoutExpired:
                # Subprocess still running, continue polling
                continue
        
        # Process all collected output and populate log_tail
        full_output = "".join(accumulated_output)
        for line in full_output.splitlines():
            log_tail.append(line)
            log.debug("subprocess: %s", line)
        
        # Get exit code
        exit_code = proc.returncode
        log.info("Subprocess exited with code %d", exit_code)
        
        if exit_code != 0:
            tail_str = "\n".join(list(log_tail)[-20:])
            error_msg = f"Subprocess failed with exit code {exit_code}\n\nLast output lines:\n{tail_str}"
            return False, error_msg[:2000]  # Truncate to 2000 chars
        
        return True, None
        
    except Exception as e:
        log.exception("Error during subprocess execution: %s", e)
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        return False, f"Exception during subprocess: {e}"


def run_post_processing_batch(
    dirs: List[str],
    interrupt_event: threading.Event,
    global_stop: threading.Event,
    log_tail_limit: int = 200,
    heartbeat_callback: Optional[callable] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Execute post-processing commands for all directories containing point_cloud.ply.
    
    Commands:
    1. splat-transform point_cloud.ply --filter-nan --filter-harmonics 0 point_cloud_clean.ply
    2. python convert_splat.py point_cloud_clean.ply --output point_cloud.splat
    
    Args:
        dirs: List of directories containing point_cloud.ply
        interrupt_event: Event to signal interruption
        global_stop: Global stop event
        log_tail_limit: Number of lines to keep in tail for error reporting
        heartbeat_callback: Optional callback to send heartbeat between batches
    
    Returns:
        Tuple[bool, Optional[str]]: (success, error_detail)
            - success: True if all commands succeeded
            - error_detail: Detailed error message if any command failed
    """
    if not dirs:
        log.info("No point_cloud.ply files found; skipping post-processing commands")
        return True, None
    
    # Get absolute path to convert_splat.py
    convert_py = os.path.join(os.path.dirname(os.path.abspath(__file__)), "convert_splat.py")
    
    # Command 1: Clean PLY files (batch for all directories)
    log.info("Post-processing batch 1/2: Cleaning PLY files in %d directories", len(dirs))
    for dir_path in dirs:
        # Check for interruption before each directory
        if interrupt_event.is_set() or global_stop.is_set():
            log.warning("Interrupted during post-processing batch 1")
            return False, "Interrupted during PLY cleaning"
        
        cmd1 = [
            "splat-transform",
            "point_cloud.ply",
            "--filter-nan",
            "--filter-harmonics", "0",
            "point_cloud_clean.ply",
        ]
        
        success, error = run_subprocess_with_interrupt(
            cmd1, dir_path, interrupt_event, global_stop, log_tail_limit
        )
        
        if not success:
            error_detail = f"Failed in directory: {dir_path}\nCommand: {' '.join(cmd1)}\n{error}"
            return False, error_detail[:2000]
    
    log.info("Post-processing batch 1/2 complete")
    
    # Call heartbeat callback between command batches (50% progress)
    if heartbeat_callback:
        heartbeat_callback()
    
    # Command 2: Convert to .splat format (batch for all directories)
    log.info("Post-processing batch 2/2: Converting to .splat format in %d directories", len(dirs))
    for dir_path in dirs:
        # Check for interruption before each directory
        if interrupt_event.is_set() or global_stop.is_set():
            log.warning("Interrupted during post-processing batch 2")
            return False, "Interrupted during .splat conversion"
        
        cmd2 = [
            sys.executable,
            convert_py,
            "point_cloud_clean.ply",
            "--output", "point_cloud.splat",
        ]
        
        success, error = run_subprocess_with_interrupt(
            cmd2, dir_path, interrupt_event, global_stop, log_tail_limit
        )
        
        if not success:
            error_detail = f"Failed in directory: {dir_path}\nCommand: {' '.join(cmd2)}\n{error}"
            return False, error_detail[:2000]
    
    log.info("Post-processing batch 2/2 complete")
    return True, None


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
        
        # Variable to hold extracted folder path for ZIP inputs
        # This will be set if the input is a ZIP file and used for training
        extracted_folder: Optional[str] = None
        dl_ok, dl_error = True, ""
        
        if item.input_file_type == "zip" or re.search(r"\.(zip)$", item.input_prefix_or_key, re.IGNORECASE):
            try:
                extracted_folder = download_and_extract_zip_input(
                    item=item,
                    workspace=workspace,
                    interrupt_event=interrupt_event,
                )
                # Keep this variable for the next refactor step(s)
                # extracted_folder is your unzipped input folder
                log.info("Extracted input folder: %s", extracted_folder)
            except zipfile.BadZipFile as e:
                log.error("Invalid ZIP file: %s", e)
                dl_ok, dl_error = False, "INVALID_INPUT"
            except ValueError as e:
                log.error("Invalid ZIP input: %s", e)
                dl_ok, dl_error = False, "INVALID_INPUT"
            except RuntimeError as e:
                # Raised for interruption
                if "Interrupted" in str(e):
                    log.warning("Interrupted during ZIP download/extract")
                    # Let the interruption handler below deal with it
                    pass
                else:
                    log.error("ZIP download/extract error: %s", e)
                    dl_ok, dl_error = False, "WORKER_ERROR"
            except Exception as e:
                log.error("Failed to download/extract ZIP: %s", e)
                dl_ok, dl_error = False, "WORKER_ERROR"
        else:
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
            "progressPercent": overall_percent("INIT", 100),
        }, api_base_url=api_url)
        _send_heartbeat_if_due("INIT", overall_percent("INIT", 100), force=True)
        log.info("Download complete")

        # Phase 1.5: PREPARATION — lay out images for COLMAP when needed
        needs_colmap = bool(extracted_folder and _scene_needs_colmap(extracted_folder))
        if needs_colmap:
            log.info("Starting PREPARATION phase: preparing COLMAP input layout")
        elif extracted_folder:
            log.info("Scene already has COLMAP/Blender structure; skipping PREPARATION")
        else:
            log.info("Starting PREPARATION phase (no dataset path; placeholder)")

        patch_attempt(attempt_id, token, {
            "progressPhase": "PREPARATION",
            "progressPercent": overall_percent("PREPARATION", 0),
        }, api_base_url=api_url)
        _send_heartbeat_if_due("PREPARATION", overall_percent("PREPARATION", 0))

        if needs_colmap:
            try:
                _prepare_colmap_input_dir(extracted_folder)
            except ValueError as e:
                log.error("PREPARATION failed: %s", e)
                patch_attempt(attempt_id, token, {
                    "status": "FAILED",
                    "reason": "INVALID_INPUT",
                    "errorMessage": str(e),
                    "progressPhase": "PREPARATION",
                }, api_base_url=api_url)
                return False, False

        patch_attempt(attempt_id, token, {
            "progressPhase": "PREPARATION",
            "progressPercent": overall_percent("PREPARATION", 100),
        }, api_base_url=api_url)
        _send_heartbeat_if_due("PREPARATION", overall_percent("PREPARATION", 100))
        log.info("PREPARATION phase complete")

        # Phase 1.75: COLMAP — run convert.py for raw image datasets
        if needs_colmap:
            log.info("Starting COLMAP phase for scene: %s", extracted_folder)
        elif extracted_folder:
            log.info("Skipping COLMAP phase; scene already has reconstruction data")
        else:
            log.info("Starting COLMAP phase (no dataset path; placeholder)")

        patch_attempt(attempt_id, token, {
            "progressPhase": "COLMAP",
            "progressPercent": overall_percent("COLMAP", 0),
        }, api_base_url=api_url)
        _send_heartbeat_if_due("COLMAP", overall_percent("COLMAP", 0))

        if needs_colmap:
            def colmap_heartbeat():
                _send_heartbeat_if_due("COLMAP", overall_percent("COLMAP", 50))

            colmap_ok, colmap_log_tail = run_colmap_subprocess(
                scene_dir=extracted_folder,
                interrupt_event=interrupt_event,
                heartbeat_callback=colmap_heartbeat,
            )

            if interrupt_event.is_set() or global_stop.is_set():
                log.warning("COLMAP was interrupted")
                patch_attempt(attempt_id, token, {
                    "status": "INTERRUPTED",
                    "progressPhase": "COLMAP",
                    "progressPercent": overall_percent("COLMAP", 50),
                }, api_base_url=api_url)
                _release_message_visibility()
                return False, True

            if not colmap_ok:
                log.error("COLMAP failed")
                error_detail = "COLMAP subprocess failed"
                if colmap_log_tail:
                    error_detail += "\n\nLast log lines:\n" + "\n".join(colmap_log_tail[-20:])
                patch_attempt(attempt_id, token, {
                    "status": "FAILED",
                    "reason": "WORKER_ERROR",
                    "errorMessage": error_detail[:2000],
                    "progressPhase": "COLMAP",
                    "progressPercent": overall_percent("COLMAP", 50),
                }, api_base_url=api_url)
                return False, False

        patch_attempt(attempt_id, token, {
            "progressPhase": "COLMAP",
            "progressPercent": overall_percent("COLMAP", 100),
        }, api_base_url=api_url)
        _send_heartbeat_if_due("COLMAP", overall_percent("COLMAP", 100))
        log.info("COLMAP phase complete")

        # Phase 2: Training or Simulation
        # If we have an extracted_folder from a ZIP input, run actual training
        # Otherwise fall back to simulation (for backwards compatibility)
        
        training_output_folder: Optional[str] = None
        training_log_tail: List[str] = []
        
        if extracted_folder:
            # ----------------------------
            # ACTUAL TRAINING PATH
            # ----------------------------
            log.info("Starting Gaussian Splatting training on extracted folder: %s", extracted_folder)
            
            # Update status to RUNNING with TRAINING phase
            patch_attempt(attempt_id, token, {
                "status": "RUNNING",
                "progressPhase": "TRAINING",
                "progressPercent": overall_percent("TRAINING", 0),
            }, api_base_url=api_url)
            _send_heartbeat_if_due("TRAINING", overall_percent("TRAINING", 0), force=True)
            
            # Create a heartbeat callback for the training subprocess
            def training_heartbeat():
                # Use 50% as placeholder during training (mid-point)
                _send_heartbeat_if_due("TRAINING", overall_percent("TRAINING", 50))
            
            # Combine interrupt_event and global_stop into a single event for training
            combined_interrupt = threading.Event()
            
            def _monitor_combined_interrupts():
                while not combined_interrupt.is_set():
                    if interrupt_event.is_set() or global_stop.is_set():
                        combined_interrupt.set()
                        break
                    time.sleep(0.5)
            
            interrupt_monitor = threading.Thread(target=_monitor_combined_interrupts, daemon=True)
            interrupt_monitor.start()
            
            # Run training (output folder is auto-generated by train.py and parsed from logs)
            training_success, training_output_folder, training_log_tail = run_training_subprocess(
                extracted_folder=extracted_folder,
                interrupt_event=combined_interrupt,
                heartbeat_callback=training_heartbeat,
                train_config=item.train_config,
            )
            
            combined_interrupt.set()  # Stop the monitor thread
            interrupt_monitor.join(timeout=1)
            
            # Check for interruption
            if interrupt_event.is_set() or global_stop.is_set():
                log.warning("Training was interrupted")
                patch_attempt(attempt_id, token, {
                    "status": "INTERRUPTED",
                    "progressPhase": "TRAINING",
                    "progressPercent": overall_percent("TRAINING", 50),
                }, api_base_url=api_url)
                _release_message_visibility()
                return False, True
            
            if not training_success:
                log.error("Training failed")
                # Include last N log lines in error detail
                error_detail = "Training subprocess failed"
                if training_log_tail:
                    error_detail += "\n\nLast log lines:\n" + "\n".join(training_log_tail[-20:])
                patch_attempt(attempt_id, token, {
                    "status": "FAILED",
                    "reason": "WORKER_ERROR",
                    "errorMessage": error_detail[:2000],  # Truncate if too long
                    "progressPhase": "TRAINING",
                    "progressPercent": overall_percent("TRAINING", 50),
                }, api_base_url=api_url)
                return False, False
            
            log.info("Training completed successfully; output folder: %s", training_output_folder)
            
            # Guard: Ensure training_output_folder is valid before post-processing
            if not training_output_folder:
                log.error("Training succeeded but output folder could not be determined from logs")
                patch_attempt(attempt_id, token, {
                    "status": "FAILED",
                    "reason": "WORKER_ERROR",
                    "errorMessage": "Training succeeded but output folder could not be determined from logs.",
                    "progressPhase": "TRAINING",
                    "progressPercent": overall_percent("TRAINING", 100),
                }, api_base_url=api_url)
                return False, False
            
            # Phase 2.5: Post-Processing (clean and convert point clouds)
            log.info("Starting post-processing phase")
            
            # Helper for consistent POST_PROCESSING marks (always emit 0%, 50%, 100%)
            def _pp_mark(local_pct: int):
                patch_attempt(attempt_id, token, {
                    "progressPhase": "POST_PROCESSING",
                    "progressPercent": overall_percent("POST_PROCESSING", local_pct),
                }, api_base_url=api_url)
                _send_heartbeat_if_due("POST_PROCESSING", overall_percent("POST_PROCESSING", local_pct), force=True)
            
            # Emit 0% heartbeat
            _pp_mark(0)
            
            # Find all directories containing point_cloud.ply
            ply_dirs = find_point_cloud_ply_dirs(training_output_folder)
            log.info("Found %d directories containing point_cloud.ply", len(ply_dirs))
            
            if ply_dirs:
                for ply_dir in ply_dirs:
                    log.info("  - %s", ply_dir)
                
                # Create heartbeat callback for 50% progress (between command batches)
                def post_processing_heartbeat():
                    _pp_mark(50)
                
                # Run post-processing batch (command 1 for all, then command 2 for all)
                post_ok, post_error = run_post_processing_batch(
                    ply_dirs,
                    interrupt_event,
                    global_stop,
                    heartbeat_callback=post_processing_heartbeat,
                )
                
                # Check for interruption
                if interrupt_event.is_set() or global_stop.is_set():
                    log.warning("Interrupted during post-processing")
                    patch_attempt(attempt_id, token, {
                        "status": "INTERRUPTED",
                        "progressPhase": "POST_PROCESSING",
                        "progressPercent": overall_percent("POST_PROCESSING", 50),
                    }, api_base_url=api_url)
                    _release_message_visibility()
                    return False, True
                
                if not post_ok:
                    log.error("Post-processing failed: %s", post_error)
                    # Cap errorMessage at 2000 chars
                    error_msg = f"Post-processing failed: {post_error or 'Unknown error'}"
                    patch_attempt(attempt_id, token, {
                        "status": "FAILED",
                        "reason": "WORKER_ERROR",
                        "errorMessage": error_msg[:2000],
                        "progressPhase": "POST_PROCESSING",
                        "progressPercent": overall_percent("POST_PROCESSING", 50),
                    }, api_base_url=api_url)
                    return False, False
                
                log.info("Post-processing completed successfully")
            else:
                log.info("No point_cloud.ply files found; skipping post-processing commands")
                # Still emit 50% heartbeat for consistency
                _pp_mark(50)
            
            # Complete POST_PROCESSING phase (always emit 100%)
            _pp_mark(100)
            
            # Phase 3: Upload Training Outputs
            log.info("Starting training output upload phase")
            patch_attempt(attempt_id, token, {
                "progressPhase": "EXPORT",
                "progressPercent": overall_percent("EXPORT", 0),
            }, api_base_url=api_url)
            _send_heartbeat_if_due("EXPORT", overall_percent("EXPORT", 0), force=True)
            
            upload_ok = upload_training_outputs(item, training_output_folder, workspace)
            if not upload_ok:
                log.error("Training output upload failed; marking as failed")
                patch_attempt(attempt_id, token, {
                    "status": "FAILED",
                    "reason": "WORKER_ERROR",
                    "errorMessage": "Failed to upload training outputs to S3",
                    "progressPhase": "EXPORT",
                    "progressPercent": overall_percent("EXPORT", 50),
                }, api_base_url=api_url)
                return False, False
            
        else:
            # ----------------------------
            # SIMULATION PATH (legacy/fallback)
            # ----------------------------
            log.info("Starting simulation phase for %d seconds", SIM_TOTAL_SECONDS)
            start_time = time.time()

            sim_duration = float(max(SIM_TOTAL_SECONDS, 1))

            def _local_percent_for(elapsed_time: float) -> float:
                """Calculate local progress within TRAINING phase (0-100)"""
                fraction = _progress_fraction(elapsed_time, sim_duration)
                return fraction * 100.0

            while True:
                elapsed = time.time() - start_time

                if global_stop.is_set():
                    log.warning("Global stop signal received during simulation")
                    local_pct = _local_percent_for(elapsed)
                    patch_attempt(attempt_id, token, {
                        "status": "INTERRUPTED",
                        "progressPhase": "TRAINING",
                        "progressPercent": overall_percent("TRAINING", local_pct),
                    }, api_base_url=api_url)
                    _release_message_visibility()
                    return False, True

                if interrupt_event.is_set():
                    log.warning("Spot interruption during simulation")
                    local_pct = _local_percent_for(elapsed)
                    patch_attempt(attempt_id, token, {
                        "status": "INTERRUPTED",
                        "progressPhase": "TRAINING",
                        "progressPercent": overall_percent("TRAINING", local_pct),
                    }, api_base_url=api_url)
                    _release_message_visibility()
                    return False, True

                if elapsed >= sim_duration:
                    break

                # Update progress smoothly using TRAINING phase
                local_pct = _local_percent_for(elapsed)
                global_pct = overall_percent("TRAINING", local_pct)
                patch_attempt(attempt_id, token, {
                    "progressPhase": "TRAINING",
                    "progressPercent": global_pct,
                }, api_base_url=api_url)
                _send_heartbeat_if_due("TRAINING", global_pct)

                # Sleep for update interval but check interruption frequently
                remaining = max(sim_duration - elapsed, 0.0)
                sleep_time = min(SIM_UPDATE_INTERVAL_SECONDS, remaining)
                if interrupt_event.wait(timeout=sleep_time):
                    log.warning("Spot interruption detected during sleep")
                    local_pct = _local_percent_for(elapsed)
                    patch_attempt(attempt_id, token, {
                        "status": "INTERRUPTED",
                        "progressPhase": "TRAINING",
                        "progressPercent": overall_percent("TRAINING", local_pct),
                    }, api_base_url=api_url)
                    _release_message_visibility()
                    return False, True

            log.info("Simulation complete")

            # Phase 3: Upload Outputs (simulation path)
            log.info("Starting output upload phase")
            patch_attempt(attempt_id, token, {
                "progressPhase": "EXPORT",
                "progressPercent": overall_percent("EXPORT", 0),
            }, api_base_url=api_url)
            _send_heartbeat_if_due("EXPORT", overall_percent("EXPORT", 0))

            upload_ok = upload_outputs(item, workspace)
            if not upload_ok:
                log.error("Output upload failed; marking as failed")
                patch_attempt(attempt_id, token, {
                    "status": "FAILED",
                    "reason": "WORKER_ERROR",
                    "errorMessage": "Failed to upload outputs to S3",
                    "progressPhase": "EXPORT",
                    "progressPercent": overall_percent("EXPORT", 50),
                }, api_base_url=api_url)
                return False, False

        # Phase 4: Success (or simulated failure based on SUCCESS_RATE)
        success = random.random() <= SUCCESS_RATE
        if success:
            log.info("Marking attempt as SUCCEEDED")
            final_result = patch_attempt(attempt_id, token, {
                "status": "SUCCEEDED",
                "progressPhase": "FINALIZE",
                "progressPercent": overall_percent("FINALIZE", 100),
                "outputBucket": item.output_bucket,
                "outputPrefix": item.output_prefix,
            }, api_base_url=api_url)
            _send_heartbeat_if_due("FINALIZE", overall_percent("FINALIZE", 100), force=True)
            
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
                "progressPercent": overall_percent("FINALIZE", 100),
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

def _test_sanitize_output_path() -> None:
    """
    Test sanitize_output_path function with various inputs.
    Raises AssertionError if any test fails.
    """
    test_cases = [
        # (input, expected_output, description)
        ("./output/c3941b61-7 [03/01 23:58:57]", "./output/c3941b61-7", "timestamp at end"),
        ("/tmp/out/abc", "/tmp/out/abc", "no timestamp"),
        ("./output/xyz   [12/31 01:02:03]   ", "./output/xyz", "timestamp with extra whitespace"),
        ("./output/no_timestamp", "./output/no_timestamp", "no timestamp or brackets"),
        ("  ./output/spaces  ", "./output/spaces", "leading and trailing spaces"),
        ("./output/test [01/01 00:00:00]", "./output/test", "timestamp with minimal values"),
        ("./output/test [99/99 99:99:99]", "./output/test", "timestamp with max-like values"),
        ("./output/multiple [11/22 11:22:33] words", "./output/multiple [11/22 11:22:33] words", "timestamp not at end"),
        ("", "", "empty string"),
        ("   ", "", "only whitespace"),
    ]
    
    log.info("Running sanitize_output_path tests...")
    passed = 0
    failed = 0
    
    for input_str, expected, description in test_cases:
        result = sanitize_output_path(input_str)
        if result == expected:
            log.debug("PASS: %s | input=%r -> output=%r", description, input_str, result)
            passed += 1
        else:
            log.error(
                "FAIL: %s | input=%r -> expected=%r, got=%r",
                description,
                input_str,
                expected,
                result
            )
            failed += 1
    
    log.info(
        "sanitize_output_path tests complete: %d passed, %d failed",
        passed,
        failed
    )
    
    if failed > 0:
        raise AssertionError(f"sanitize_output_path tests failed: {failed} test(s) did not pass")


def _test_colmap_helpers() -> None:
    """Self-tests for COLMAP scene detection and input preparation."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        raw_scene = os.path.join(tmp, "photos")
        os.makedirs(raw_scene)
        for name in ("a.jpg", "b.png"):
            with open(os.path.join(raw_scene, name), "wb") as f:
                f.write(b"x")

        assert _scene_needs_colmap(raw_scene) is True
        assert _scene_has_colmap_output(raw_scene) is False

        _prepare_colmap_input_dir(raw_scene)
        input_dir = os.path.join(raw_scene, "input")
        assert os.path.isdir(input_dir)
        assert _count_images_in_directory(input_dir) == 2
        assert _prepare_colmap_input_dir(raw_scene) is None  # idempotent

        sparse0 = os.path.join(raw_scene, "sparse", "0")
        os.makedirs(sparse0)
        with open(os.path.join(sparse0, "cameras.bin"), "wb") as f:
            f.write(b"")
        assert _scene_has_colmap_output(raw_scene) is True
        assert _scene_needs_colmap(raw_scene) is False

        blender_scene = os.path.join(tmp, "blender")
        os.makedirs(blender_scene)
        with open(os.path.join(blender_scene, "transforms_train.json"), "w") as f:
            f.write("{}")
        assert _scene_is_blender_dataset(blender_scene) is True
        assert _scene_needs_colmap(blender_scene) is False

    log.info("colmap helper self-tests passed")


if __name__ == "__main__":
    _run_simulation_self_tests()
    _test_sanitize_output_path()
    _test_colmap_helpers()
    main()
