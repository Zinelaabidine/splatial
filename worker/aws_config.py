"""
AWS session and EC2 instance metadata helpers for worker.py.

Uses IMDSv2 when running on EC2; falls back to AWS_PROFILE + AWS_REGION locally.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, Dict, Optional

import boto3
import requests

_IMDS_BASE = "http://169.254.169.254/latest"
_IMDS_TIMEOUT = 2

_http = requests.Session()


def _imds_token() -> Optional[str]:
    try:
        resp = _http.put(
            f"{_IMDS_BASE}/api/token",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
            timeout=_IMDS_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.text
    except Exception:
        return None


def is_ec2() -> bool:
    return _imds_token() is not None


def _imds_get(path: str, token: str) -> Optional[str]:
    try:
        resp = _http.get(
            f"{_IMDS_BASE}/{path.lstrip('/')}",
            headers={"X-aws-ec2-metadata-token": token},
            timeout=_IMDS_TIMEOUT,
        )
        if resp.status_code == 200:
            return resp.text.strip()
    except Exception:
        pass
    return None


def spot_interruption_notice() -> bool:
    """
    Return True when EC2 Spot has posted a termination/stop notice via IMDSv2.

    Polls GET /latest/meta-data/spot/instance-action (404 when no notice pending).
    Safe to call frequently from worker monitor threads; not cached.
    """
    token = _imds_token()
    if not token:
        return False

    try:
        resp = _http.get(
            f"{_IMDS_BASE}/meta-data/spot/instance-action",
            headers={"X-aws-ec2-metadata-token": token},
            timeout=_IMDS_TIMEOUT,
        )
    except Exception:
        return False

    if resp.status_code == 404:
        return False
    if resp.status_code == 200:
        action = resp.text.strip().lower()
        return action in ("terminate", "stop")
    return False


@lru_cache(maxsize=1)
def get_instance_metadata() -> Dict[str, str]:
    default_region = os.getenv("AWS_REGION", "us-east-1")
    token = _imds_token()
    if not token:
        return {
            "instance_id": "local",
            "region": default_region,
            "lifecycle": "local",
        }

    instance_id = _imds_get("meta-data/instance-id", token) or "unknown"
    region = default_region
    lifecycle = "on-demand"

    identity_raw = _imds_get("dynamic/instance-identity/document", token)
    if identity_raw:
        try:
            region = json.loads(identity_raw).get("region") or region
        except Exception:
            pass

    spot_lifecycle = _imds_get("meta-data/instance-life-cycle", token)
    if spot_lifecycle:
        lifecycle = spot_lifecycle

    return {
        "instance_id": instance_id,
        "region": region,
        "lifecycle": lifecycle,
    }


def _configure_ec2_boto_env() -> None:
    """
    EC2 workers use the instance IAM role. worker.py sets AWS_PROFILE=default for
    local dev, but botocore reads that (and ~/.aws/config) on every client call.
    """
    for key in ("AWS_PROFILE", "AWS_DEFAULT_PROFILE"):
        os.environ.pop(key, None)
    os.environ["AWS_SDK_LOAD_CONFIG"] = "0"


def get_session() -> Any:
    meta = get_instance_metadata()
    region = meta["region"] or os.getenv("AWS_REGION", "us-east-1")

    os.environ.setdefault("AWS_REGION", region)
    os.environ.setdefault("AWS_DEFAULT_REGION", region)

    run_env = os.getenv("RUN_ENV", "local").strip().lower()
    if is_ec2() or run_env == "ec2":
        _configure_ec2_boto_env()
        return boto3.Session(region_name=region)

    profile = os.getenv("AWS_PROFILE", "default")
    return boto3.Session(profile_name=profile, region_name=region)
