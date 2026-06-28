# Splatial — Logging & Observability Spec

**Version:** 0.1 (draft) · **Status:** for review · **Owner:** architecture
**Applies to:** `backend` (Lambda), `worker` (Python on Spot), `terraform` (infra), `frontend` (Next.js)

This is the contract every service builds against. If you are about to add a log
line, a log sink, or the admin page, this document defines the shape, the names,
the rules, and the boundaries. Change it here first, then change the code.

---

## 1. Goals & non-goals

**Goals**
- Every service emits the **same structured envelope**, so one job can be traced
  end-to-end on a single key.
- Worker logs **survive Spot instance death** (today they live in journald and
  vanish with the instance).
- An **admin** can see job status and drill into the logs for any one attempt.
- Secrets and PII **never** reach a log line.

**Non-goals (deferred — see §13)**
- GPU/VRAM/timing telemetry and the ML "run-record" data product.
- Per-iteration training metrics as queryable data.
- Anything requiring variable instance types.

---

## 2. Correlation keys

Two IDs join everything. Both already exist in the data model.

| Key | Meaning | Source |
|---|---|---|
| `scene_id` | The user-facing scene (the parent). | `scenes` table; `parent_scene_id` on attempt rows. |
| `attempt_id` | One training run of a scene. **Primary join key for logs.** | Partition key of the attempt row (`scene_id` field == `attemptId`); `WorkItem.attempt_id` in the worker. |

**Rule:** every log line emitted inside a job context MUST carry `attempt_id`.
`scene_id` is included whenever known. The admin log drill-down filters on
`attempt_id`.

---

## 3. The log envelope

One JSON object per log line. Same shape in all services.

```json
{
  "schema_version": 1,
  "ts": "2026-06-28T16:40:00.123Z",
  "level": "info",
  "service": "worker",
  "env": "dev",
  "event": "colmap.finished",
  "scene_id": "scn_9f2a...",
  "attempt_id": "att_4c81...",
  "ctx": {
    "instance_id": "i-0abc123",
    "lifecycle": "spot",
    "region": "us-east-1"
  },
  "data": {
    "duration_s": 412,
    "image_count": 187,
    "matcher": "exhaustive"
  },
  "msg": "COLMAP finished"
}
```

### 3.1 Field definitions

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | int | yes | This spec's major version. Currently `1`. |
| `ts` | string | yes | ISO-8601 UTC, millisecond precision, `Z` suffix. |
| `level` | string | yes | One of `debug`, `info`, `warning`, `error`. Lowercase. |
| `service` | string | yes | One of `frontend`, `backend`, `worker`. |
| `env` | string | yes | One of `dev`, `staging`, `prod`. |
| `event` | string | yes | A name from the catalog in §4. `snake_case` segments, `.`-separated. |
| `scene_id` | string | no | Present when known. |
| `attempt_id` | string | conditional | Required inside a job context. |
| `ctx` | object | no | Stable context for this emitter. See §3.2. |
| `data` | object | no | Event-specific fields. See §4. **Must already be redacted (§8).** |
| `msg` | string | no | Short human sentence. Never the place for structured data. |

**Rules**
- `event` is a **closed vocabulary** (§4). Do not invent events ad hoc; add them
  to this doc first.
- Structured facts go in `data`, not interpolated into `msg`. (`msg` is for the
  human skimming; `data` is what you query.)
- `ctx` is set once per emitter and attached to every line automatically (see the
  per-service helpers in §10) — never hand-copied per call.

### 3.2 `ctx` by service

| Service | `ctx` fields |
|---|---|
| `worker` | `instance_id`, `lifecycle` (`spot`/`on-demand`/`local`), `region` |
| `backend` | `request_id` (API Gateway), `handler` (e.g. `submit-job`) |
| `frontend` | `session_id` (anonymous), `route` |

Worker `ctx` comes from `aws_config.get_instance_metadata()` (already
implemented). Backend `request_id` comes from
`event.requestContext.requestId`.

---

## 4. Event catalog

`data` columns list the fields each event carries. All `data` fields are optional
unless marked **req**. Add fields freely over time; **renaming or removing** a
field is a breaking change (§14).

### 4.1 Frontend (`service: "frontend"`)

| `event` | When | `data` |
|---|---|---|
| `ui.upload_started` | User begins an upload. | `input_type`, `size_bytes` |
| `ui.upload_completed` | Upload to S3 finished. | `input_type`, `size_bytes`, `duration_ms` |
| `ui.job_submitted` | User submits a scene for training. | `scene_id`, `train_config` |
| `ui.error` | Client-side error / failed request. | `kind`, `http_status`, `path` |

### 4.2 Backend (`service: "backend"`)

| `event` | Handler | `data` |
|---|---|---|
| `upload.presigned` | `presign`, `scene-thumbnail-presign` | `input_type`, `key` (path only, no query) |
| `gdrive.import_started` | `gdrive-import`, `upload-from-gdrive` | `file_id` |
| `gdrive.import_finished` | same | `size_bytes`, `duration_ms`, `ok` |
| `job.submitted` | `submit-job` | **req** `scene_id`, `attempt_id`, `attempt_number`, `train_config` |
| `job.queued` | `submit-job` (after SQS send) | **req** `attempt_id`, `queue` |
| `attempt.created` | `submit-job` / `scene-create` | **req** `attempt_id`, `scene_id` |
| `attempt.status_changed` | `attempt-patch` | **req** `from`, `to` (worker status), `mapped_status` |
| `attempt.heartbeat` | `attempt-heartbeat` | `phase`, `percent`, `eta_seconds` |
| `attempt.completed` | `attempt-patch` / `complete` | `output_bucket`, `output_prefix`, `ply_key` |
| `attempt.failed` | `attempt-patch` | `reason`, `error_message` (redacted) |
| `job.cancelled` | `cancel-job` | **req** `attempt_id`, `scene_id` |

### 4.3 Worker (`service: "worker"`)

| `event` | When | `data` |
|---|---|---|
| `worker.started` | Process boot, after config. | `queue`, `poll_interval_s` |
| `job.received` | SQS message parsed into a `WorkItem`. | **req** `attempt_id`, `scene_id`, `attempt_number`, `input_type`, `input_file_count`, `input_size_bytes`, `train_config` |
| `input.downloaded` | Input zip/objects fetched & extracted. | `duration_s`, `image_count`, `bytes` |
| `colmap.started` | COLMAP begins. | `matcher`, `image_count` |
| `colmap.finished` | COLMAP done. | `duration_s`, `image_count`, `matcher`, `ok` |
| `train.started` | 3DGS training subprocess starts. | `iterations`, `resolution`, `sh_degree` |
| `train.progress` | Sampled progress (see §7 — **sampled, not every iter**). | `phase`, `percent`, `iter`, `eta_seconds` |
| `train.finished` | Training subprocess exits. | `duration_s`, `final_iter`, `ok` |
| `output.uploaded` | Outputs pushed to S3. | `duration_s`, `bytes`, `ply_key` |
| `job.completed` | Attempt fully succeeded. | `total_duration_s`, `output_prefix` |
| `job.failed` | Attempt failed. | `phase`, `reason`, `error_message` (redacted) |
| `spot.interrupted` | Spot termination/stop notice seen. | `phase`, `percent` |
| `worker.idle_exit` | Idle timeout → self-terminate. | `idle_seconds` |

> The worker `data` fields above are intentionally light in Phase 2. The Phase 5
> telemetry (durations everywhere, peak VRAM, GPU model, etc.) **extends these
> same events' `data`** — no new events, no schema break (§13).

---

## 5. Phase & status vocabularies (from current code)

These already exist in `worker.py` / `attempt-patch.js`. Logs reuse them exactly
so `data.phase` joins to DynamoDB `progress_phase`.

**Phases** (`PHASE_RANGES`): `INIT`, `PREPARATION`, `COLMAP`, `TRAINING`,
`POST_PROCESSING`, `EXPORT`, `FINALIZE`.

**Worker statuses → scene statuses** (`STATUS_MAP`):

| Worker reports | Scene/attempt becomes |
|---|---|
| `RUNNING` | `PROCESSING` |
| `SUCCEEDED` | `READY` |
| `FAILED` | `FAILED` |
| `INTERRUPTED` | `QUEUED` (message redelivered) |

`attempt.status_changed.data.to` uses the **worker** value; `mapped_status` uses
the scene value.

---

## 6. Log levels

| Level | Use for |
|---|---|
| `debug` | Verbose internals; off in `prod` by default (`LOG_LEVEL`). |
| `info` | Lifecycle events (the catalog above). The default. |
| `warning` | Recoverable problems: retries, 404/403 PATCH races, poison messages, invalid phase mapping. |
| `error` | Job-failing problems, unhandled exceptions, API calls that exhausted retries. |

`error` and `warning` lines SHOULD include `event: "*.failed"` or a `data.reason`
so they are queryable, not just readable.

---

## 7. Volume control

The training subprocess emits a line per iteration (thousands per job). Do **not**
ship every line to CloudWatch.

- Emit `train.progress` **at most every 5 s or every N iterations**, whichever is
  sparser. (Reuse the existing heartbeat cadence — `HEARTBEAT_INTERVAL_SECONDS`.)
- The full raw training stdout stays useful but stays cheap: **upload the complete
  training log as a file to S3** next to the outputs (proposed key:
  `<output_prefix>/logs/train.log`). That is the deep-debug artifact; CloudWatch
  holds the sampled, structured trail.
- COLMAP progress: same rule — sample, don't stream every solver line.

---

## 8. Redaction (mandatory)

The admin page exposes **everyone's** logs to whoever holds the admin role.
Therefore secrets and PII must never enter a log line in the first place.

### 8.1 Never log

- **`apiAuthToken` / `api_auth_token` / `worker_token`** — the per-job bearer
  token. (`parse_message_body` already avoids logging the token and full body —
  keep that.)
- **`Authorization` / `Bearer …` headers.**
- **Presigned S3 URLs** and any URL carrying `X-Amz-Signature`, `X-Amz-Credential`,
  `X-Amz-Security-Token`. Log the **object key only**, never the signed URL.
- **Cognito tokens** (id/access/refresh) and raw JWTs.
- **User PII**: email, name, IP. Use `user_id` (the Cognito `sub`) instead.
- **Full SQS message bodies** (they contain the token).

### 8.2 How

- Redaction is centralised in each service's logger helper (§10), not left to the
  caller. The helper:
  - drops a denylist of keys (`token`, `api_auth_token`, `worker_token`,
    `authorization`, `password`, `secret`, `signature`) at any depth in `data`;
  - replaces signed URLs with their path component;
  - truncates `error_message` to a bounded length and strips anything matching the
    token/URL patterns above.
- When in doubt, log an **ID or a key**, not the value.

---

## 9. Sinks, log groups & retention

CloudWatch-centric. Backend Lambdas and API Gateway already log there; the worker
role already has `CloudWatchAgentServerPolicy`.

| Source | Destination | Stream |
|---|---|---|
| Backend Lambdas | existing per-function groups `/aws/lambda/…` | per Lambda |
| API Gateway | existing `api_gateway` group | — |
| **Worker** | **new** group `splatial/<env>/worker` | one stream per `instance_id` |
| **Frontend** | **new** group `splatial/<env>/frontend` (via ingest, §11) | per day |

**Retention (proposed):** `dev` 30 days, `staging` 30 days, `prod` 90 days. Set on
every group — unbounded retention is a silent cost leak.

**Worker shipping:** the CloudWatch agent tails journald (the service already does
`StandardOutput=journal`) → `splatial/<env>/worker`. Configure the agent in the
launch-template `user_data`. No new IAM (policy already attached). Flush interval
≤ 5 s so logs land before a Spot instance dies.

---

## 10. Per-service implementation contract

### 10.1 Backend (Node Lambda)

- Add `lib/logger.js`: a function that emits the envelope as a single JSON line to
  `stdout` (Lambda forwards stdout to CloudWatch). It:
  - stamps `service:"backend"`, `env` (from `process.env`), `ts`,
    `ctx.request_id`, `ctx.handler`;
  - exposes `log.event(name, { level, scene_id, attempt_id, data, msg })`;
  - runs `data` through redaction (§8).
- Each handler in §4.2 emits its events. Most already do the underlying work
  (`submit-job` already creates the attempt and sends to SQS) — this is adding the
  structured line, not new logic.

### 10.2 Worker (Python)

- Replace `logging.basicConfig(format="%(asctime)s %(levelname)s %(message)s")`
  with a **JSON formatter** producing the envelope.
- A `get_logger()` / bound adapter stamps `service:"worker"`, `env`, and `ctx`
  from `aws_config.get_instance_metadata()`. `attempt_id`/`scene_id` are bound once
  per `WorkItem` (e.g. a `contextvar` set in the poll loop) so every line in that
  job carries them automatically.
- Replace the 7 raw `print()` calls with logger calls (keep the human banner via
  `msg` if you like, but it must be a real log line).
- Emit the catalog events in §4.3 at the existing seams (`parse_message_body` →
  `job.received`; COLMAP tracker → `colmap.*`; `run_training_subprocess` →
  `train.*`; `upload_outputs` → `output.uploaded`; `terminate_self` /
  `spot_interruption_notice` → `spot.interrupted` / `worker.idle_exit`).
- **On Spot interruption**: emit `spot.interrupted` and `logger`-flush **before**
  self-terminating — this is the data you most want and most easily lose.
- **No GPU/VRAM/timing collection in this phase** (that's §13).

### 10.3 Infra (Terraform)

- Create log groups `splatial/<env>/worker` and `splatial/<env>/frontend` with
  retention (§9).
- Add CloudWatch agent config to the worker `user_data` (tail journald → worker
  group). No new IAM for shipping.
- **Cognito `admin` group** (§11).
- **Admin Lambda IAM** (new): `logs:FilterLogEvents` now;
  `logs:StartQuery` + `logs:GetQueryResults` + `logs:GetLogEvents` later — scoped
  to the worker/backend/frontend log group ARNs only. Plus DynamoDB read on the
  `scenes` table for the overview.
- Route the new `/admin/*` and `/client-logs` paths (API Gateway).

### 10.4 Frontend (Next.js)

- A small client logger that batches `ui.*` events and client errors and
  `POST`s them to `/client-logs` (envelope-shaped, redacted client-side too).
  Rate-limit and drop on failure — logging must never break the app.

---

## 11. Admin API contract

User-facing admin endpoints. **Authorization is server-side**, on a Cognito group.

### 11.1 Authorization

- Add Cognito group `admin`. The JWT then carries `cognito:groups`.
- Every `/admin/*` handler checks
  `event.requestContext.authorizer.jwt.claims["cognito:groups"]` includes
  `admin`, else `403`. The frontend route gate is **UX only** — never the
  security boundary.
- The browser never calls CloudWatch or DynamoDB directly; only the admin Lambda
  does.

### 11.2 Endpoints

**`GET /admin/attempts`** — overview list (DynamoDB, cheap, available today).

- Query: `?status=&limit=&cursor=`
- Returns: `{ items: [{ attempt_id, scene_id, user_id, status, progress_phase,
  progress_percent, ec2_instance_id, spot_request_id, failure_reason,
  updated_at }], cursor }`
- Source: `scenes` table (optionally the `user_id-status-index` GSI). No CloudWatch.

**`GET /admin/attempts/{attemptId}/logs`** — log drill-down (CloudWatch, on demand).

- Query: `?from=&to=&level=&limit=&nextToken=` (`from`/`to` default to a bounded
  window, e.g. last 24 h; a hard max window is enforced).
- Behaviour: `FilterLogEvents` on the relevant group(s) with a filter pattern on
  `attemptId` (and optional `level`), paginated.
- Returns: `{ lines: [<envelope>...], nextToken }`
- **Guardrails:** `attemptId` is **required**; the time window is **bounded and
  capped**; results are **paginated**. No open-ended, all-time, full-text scans.

### 11.3 Optional later

- Near-live tail: while an attempt is `PROCESSING`, the page polls the logs
  endpoint every few seconds.
- Logs Insights queries (`StartQuery`/`GetQueryResults`) for cross-instance
  aggregations once logs are JSON (e.g. "all `*.failed` today", per-phase durations).

---

## 12. CloudWatch query patterns (reference)

- **By attempt (drill-down):** `FilterLogEvents` with filter pattern matching the
  `attempt_id` string, bounded `startTime`/`endTime`. Synchronous, simple.
- **Structured (later):** Logs Insights, e.g. filter `attempt_id`, parse JSON,
  sort by `ts`. Async (start → poll). Use for aggregations, not the hot path.
- **Cost:** CloudWatch bills per GB scanned. Always bound by time + key. This is
  why the admin endpoint refuses an unbounded query.

---

## 13. Reserved fields (Phase 5 — ML, forward-compatible)

Reserve these `data` keys **now** so adding them later is additive, never a rename.
They extend the existing worker events in §4.3.

| Reserved `data` key | On event(s) | Meaning |
|---|---|---|
| `instance_type` | `worker.started`, `job.completed` | EC2 type (e.g. `g5.xlarge`). |
| `gpu_name` | `worker.started` | GPU model. |
| `gpu_vram_total_mb` | `worker.started` | Total VRAM. |
| `vcpus`, `ram_mb` | `worker.started` | Host CPU/RAM. |
| `peak_vram_mb`, `peak_gpu_util` | `train.finished`, `job.completed` | Sampled peaks. |
| `oom` | `job.failed` | Out-of-memory occurred. |
| `megapixels`, `image_count`, `input_size_bytes` | `job.received` | Scene size features. |
| `duration_s` (per phase) | each `*.finished` | Already partly present; complete it. |
| `total_duration_s` | `job.completed` | Wall clock. |

These plus the existing fields are exactly one training row per attempt. The
sink for that row (Firehose → S3) is added in Phase 5; it is **not** CloudWatch.

---

## 14. Versioning & change process

- `schema_version` is the major version of this envelope. Bump only on a
  **breaking** change (removing/renaming a field, changing a type, redefining an
  event). Adding a new `event` or a new `data` field is **non-breaking** and does
  not bump it.
- To change the contract: edit this document (and the catalog), get sign-off, then
  change code. The doc is the source of truth, not any one service.

---

## 15. Phasing summary

| Phase | What | Owners | Depends on |
|---|---|---|---|
| 0 | This spec | architecture | — |
| 1 | Admin overview (DynamoDB only) | infra, backend, frontend | §11.2 list, `admin` group |
| 2 | Structured logs + worker→CloudWatch | backend, worker, infra | §3–§10 |
| 3 | Admin log drill-down | infra, backend, frontend | Phase 2, §11.2 logs, logs IAM |
| 4 | Frontend logging ingest | frontend, backend, infra | §3, §10.4 |
| 5 | Worker telemetry + ML run-records | worker, infra | §13 |

**Gating to remember:** in Phases 2 and 3 the **infra change must land before the
code that uses it** — the worker log group before the agent ships to it; the
`logs:FilterLogEvents` permission before the drill-down endpoint runs.

---

## Appendix A — A single attempt, end to end

A successful job, as it appears in the logs (abbreviated, redacted):

```
backend  job.submitted        attempt_id=att_4c81 scene_id=scn_9f2a train_config={iterations:15000,...}
backend  job.queued           attempt_id=att_4c81 queue=splatial-dev-splat-processing-queue
worker   worker.started       ctx.instance_id=i-0abc lifecycle=spot
worker   job.received         attempt_id=att_4c81 input_type=zip input_file_count=187
backend  attempt.status_changed from=- to=RUNNING mapped_status=PROCESSING
worker   input.downloaded     duration_s=22 image_count=187 bytes=812000000
worker   colmap.started       matcher=exhaustive image_count=187
worker   colmap.finished      duration_s=412 ok=true
worker   train.started        iterations=15000 resolution=2 sh_degree=2
worker   train.progress       phase=TRAINING percent=65 iter=9700        (sampled)
worker   train.finished       duration_s=1840 final_iter=15000 ok=true
worker   output.uploaded      bytes=240000000 ply_key=scn_9f2a/point_cloud.ply
worker   job.completed        total_duration_s=2310 output_prefix=scn_9f2a/
backend  attempt.completed    ply_key=scn_9f2a/point_cloud.ply
backend  attempt.status_changed from=SUCCEEDED to=READY mapped_status=READY
worker   worker.idle_exit     idle_seconds=120
```

Every line carries `attempt_id=att_4c81`. That is the admin drill-down: one filter,
the whole story — across all three services.
