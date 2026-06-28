"""
Structured JSON logging for the Gaussian-splatting worker.

Conforms to docs/logging-and-observability.md (the envelope, the event vocabulary,
and the redaction rules). Self-contained: only stdlib + boto3 (already a worker
dependency). No CloudWatch agent and no extra pip packages required.

What it does
------------
- Emits one JSON envelope per log line to stdout (captured by journald, so SSM /
  `journalctl` still works for live debugging).
- Optionally ships the SAME lines to CloudWatch Logs via boto3, so logs survive
  Spot-instance termination. Enabled on EC2 by default; off for local runs.
- Binds attempt_id / scene_id per job via contextvars, so every line emitted
  during a job automatically carries them — no manual threading of IDs.
- Redacts secrets (worker token, auth headers, presigned URLs) before emit.

Public API
----------
    log = init_logging(ctx_provider=aws_config.get_instance_metadata)
    bind_job(attempt_id, scene_id)      # when a WorkItem starts
    clear_job()                         # when a job ends (finally:)
    log_event(log, "colmap.finished", data={"duration_s": 412})
    flush_logs()                        # force CloudWatch flush (spot interrupt, job end)

`init_logging` returns a standard logging.Logger, so existing `log.info(...)`
calls keep working — they just become envelopes with a `msg` and no `event`.
Use `log_event(...)` for the canonical, queryable events.
"""

from __future__ import annotations

import atexit
import contextvars
import json
import logging
import os
import re
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

SCHEMA_VERSION = 1
SERVICE = "worker"

# Per-job correlation IDs, bound in the poll loop and read by the formatter.
_attempt_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "attempt_id", default=None
)
_scene_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "scene_id", default=None
)

# Keys whose values must never be logged (see logging spec §8). Lower-cased.
_SECRET_KEYS = {
    "token",
    "api_auth_token",
    "apiauthtoken",
    "worker_token",
    "workertoken",
    "authorization",
    "password",
    "secret",
    "signature",
    "api_token",
    "bearer",
}

# Presigned S3 URLs and anything carrying an AWS signature.
_SIGNED_URL_RE = re.compile(
    r"https?://[^\s\"']+[?&](?:X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token)=[^\s\"'&]+",
    re.IGNORECASE,
)


def _now_iso() -> str:
    dt = datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: ("[REDACTED]" if str(k).lower() in _SECRET_KEYS else _redact(v))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_redact(v) for v in value]
    if isinstance(value, str):
        return _SIGNED_URL_RE.sub("[REDACTED_URL]", value)
    return value


class _EnvelopeFormatter(logging.Formatter):
    """Render a LogRecord as the shared JSON envelope."""

    def __init__(self, ctx_provider: Optional[Callable[[], Dict[str, str]]]):
        super().__init__()
        self._ctx_provider = ctx_provider

    def format(self, record: logging.LogRecord) -> str:
        envelope: Dict[str, Any] = {
            "schema_version": SCHEMA_VERSION,
            "ts": _now_iso(),
            "level": record.levelname.lower(),
            "service": SERVICE,
            "env": os.getenv("SPLATIAL_ENV", "dev"),
        }

        event = getattr(record, "event", None)
        if event:
            envelope["event"] = event

        attempt_id = _attempt_id_var.get()
        scene_id = _scene_id_var.get()
        if scene_id:
            envelope["scene_id"] = scene_id
        if attempt_id:
            envelope["attempt_id"] = attempt_id

        if self._ctx_provider is not None:
            try:
                ctx = self._ctx_provider()
                if ctx:
                    envelope["ctx"] = ctx
            except Exception:
                pass

        data = getattr(record, "data", None)
        if data:
            envelope["data"] = _redact(data)

        msg = record.getMessage()
        if msg:
            envelope["msg"] = _SIGNED_URL_RE.sub("[REDACTED_URL]", msg)

        if record.exc_info:
            exc_text = self.formatException(record.exc_info)
            existing = envelope.get("data") or {}
            envelope["data"] = {**existing, "exc": exc_text[-2000:]}

        return json.dumps(envelope, default=str, ensure_ascii=False)


class _CloudWatchHandler(logging.Handler):
    """
    Minimal buffered CloudWatch Logs handler.

    - Uses boto3; no sequence token required (PutLogEvents accepts events without
      one on modern AWS).
    - Buffers and flushes on a background daemon thread, on batch size, and on
      explicit flush() — the last is what we call before Spot termination.
    - Never raises into the application; logging must not crash the worker.
    """

    def __init__(
        self,
        log_group: str,
        log_stream: str,
        session: Any,
        flush_interval: float = 3.0,
        max_batch: int = 100,
    ):
        super().__init__()
        self._group = log_group
        self._stream = log_stream
        self._buf: list[dict] = []
        self._lock = threading.Lock()
        self._flush_interval = flush_interval
        self._max_batch = max_batch
        self._client = None
        self._ready = False

        try:
            self._client = session.client("logs")
            self._ensure_group_and_stream()
            self._ready = True
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"[log_envelope] CloudWatch init failed: {e}\n")

        if self._ready:
            threading.Thread(
                target=self._loop, name="cw-log-flusher", daemon=True
            ).start()

    def _ensure_group_and_stream(self) -> None:
        # Terraform owns the group (for retention); create defensively anyway.
        try:
            self._client.create_log_group(logGroupName=self._group)
        except Exception:
            pass
        try:
            self._client.create_log_stream(
                logGroupName=self._group, logStreamName=self._stream
            )
        except Exception:
            pass

    def emit(self, record: logging.LogRecord) -> None:
        if not self._ready:
            return
        try:
            message = self.format(record)
            event = {"timestamp": int(time.time() * 1000), "message": message}
            with self._lock:
                self._buf.append(event)
                if len(self._buf) >= self._max_batch:
                    self._flush_locked()
        except Exception:
            pass

    def _loop(self) -> None:
        while True:
            time.sleep(self._flush_interval)
            self.flush()

    def flush(self) -> None:
        with self._lock:
            self._flush_locked()

    def _flush_locked(self) -> None:
        if not self._buf or not self._client:
            return
        batch = self._buf
        self._buf = []
        # CloudWatch requires events in chronological order.
        batch.sort(key=lambda e: e["timestamp"])
        try:
            self._client.put_log_events(
                logGroupName=self._group,
                logStreamName=self._stream,
                logEvents=batch[:10000],
            )
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"[log_envelope] put_log_events failed: {e}\n")


# ── Module state ──────────────────────────────────────────────────────────────

_logger: Optional[logging.Logger] = None
_cw_handler: Optional[_CloudWatchHandler] = None


def _cloudwatch_enabled(ctx_provider: Optional[Callable[[], Dict[str, str]]]) -> bool:
    if os.getenv("LOG_TO_CLOUDWATCH", "true").strip().lower() not in (
        "1",
        "true",
        "yes",
    ):
        return False
    meta = {}
    if ctx_provider is not None:
        try:
            meta = ctx_provider() or {}
        except Exception:
            meta = {}
    if meta.get("lifecycle") == "local" or meta.get("instance_id") in (None, "local"):
        return False
    return True


def init_logging(
    ctx_provider: Optional[Callable[[], Dict[str, str]]] = None,
) -> logging.Logger:
    """
    Configure the worker logger once. Idempotent — returns the existing logger
    on subsequent calls. `ctx_provider` should be aws_config.get_instance_metadata.
    """
    global _logger, _cw_handler
    if _logger is not None:
        return _logger

    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    formatter = _EnvelopeFormatter(ctx_provider)

    logger = logging.getLogger("worker")
    logger.setLevel(level)
    logger.handlers.clear()
    logger.propagate = False

    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(formatter)
    logger.addHandler(stream)

    if _cloudwatch_enabled(ctx_provider):
        try:
            import aws_config  # local module; provides get_session()

            session = aws_config.get_session()
            meta = ctx_provider() if ctx_provider else {}
            instance_id = meta.get("instance_id", "unknown")
            env = os.getenv("SPLATIAL_ENV", "dev")
            group = os.getenv("WORKER_LOG_GROUP", f"/splatial/{env}/worker")
            day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            stream_name = f"{instance_id}/{day}"

            _cw_handler = _CloudWatchHandler(group, stream_name, session)
            _cw_handler.setFormatter(formatter)
            logger.addHandler(_cw_handler)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"[log_envelope] CloudWatch handler not attached: {e}\n")

    atexit.register(flush_logs)
    _logger = logger
    return logger


def bind_job(attempt_id: Optional[str], scene_id: Optional[str] = None) -> None:
    """Bind correlation IDs for the current job. Call when a WorkItem starts."""
    _attempt_id_var.set(attempt_id)
    _scene_id_var.set(scene_id)


def clear_job() -> None:
    """Clear correlation IDs. Call in a finally: when a job finishes."""
    _attempt_id_var.set(None)
    _scene_id_var.set(None)


def log_event(
    logger: logging.Logger,
    event: str,
    *,
    level: int = logging.INFO,
    data: Optional[Dict[str, Any]] = None,
    msg: str = "",
) -> None:
    """Emit a canonical envelope event from the spec's vocabulary."""
    logger.log(level, msg or event, extra={"event": event, "data": data or {}})


def flush_logs() -> None:
    """Force the CloudWatch buffer to flush. Call on spot interrupt and job end."""
    if _cw_handler is not None:
        try:
            _cw_handler.flush()
        except Exception:
            pass
