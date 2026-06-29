# Changelog

All notable changes to Splatial are documented here. Entries are grouped by date
(newest first) and reference the logging spec in [`logging-spec.md`](./logging-spec.md)
where applicable.

Format: each release note lists **what changed**, **why**, **where to look**, and
**how to verify**.

---

## 2026-06-29 — Social & Interaction Layer (Features 1–15)

**Commits:** `acd09bc` … `05130a8` (range on `dev`)
**Status:** Deployed to dev via GitHub Actions.

### Summary

Shipped a full social platform layer on top of the core upload→train→view
pipeline, delivered as 15 independent, deployable increments. Each feature was
split into an **Infra+Backend** unit (data model + API) and a **Frontend** unit,
each verified locally (backend syntax/router load, `npm run lint && build`,
`terraform fmt/validate/plan`) before a single push.

**What changed**

- **Identity:** user profiles + globally unique usernames (forced at onboarding),
  public profiles at `/u/<username>`.
- **Graph & discovery:** follow/unfollow, personalized feed (fan-out on read),
  global Explore, scene tags & categories.
- **Engagement:** multi-type reactions, comments, resolved `@mentions`, and a
  notifications center (follow/reaction/comment/mention) with an unread badge.
- **Curation & camera:** scene visibility (public/private), bookmarks, saved
  viewpoints ("Shots") with shareable deep-links, guided fly-through tours, and
  remix/fork with server-side artifact copy + lineage.

**Why**

Turn a private rendering tool into a shareable platform without adding a new
compute tier — every feature is routes on the existing single Lambda router plus a
domain-owned DynamoDB table.

**Where to look**

- As-built reference: [`SOCIAL_FEATURES_REFERENCE.md`](./SOCIAL_FEATURES_REFERENCE.md)
  (data model, every endpoint, per-feature invariants, upgrade paths).
- Tables: `infra/modules/static-site/dynamodb-*.tf`; routes:
  `infra/modules/static-site/network.tf`; handlers: `backend/handlers/`.
- CI: `.github/workflows/deploy.yml` was made path-filtered so each push runs only
  the relevant half (apply on infra/backend, build+sync on frontend).

**How to verify**

- Sign in, claim a username, follow another user, react/comment on a public scene,
  and confirm the feed, notifications bell, and `/u/<username>` page all update.
- API: the social routes under `/api/v1/profiles`, `/api/v1/feed`,
  `/api/v1/explore`, `/api/v1/scenes/{id}/{reaction|comments|shots|tours|fork}`,
  and `/api/v1/notifications` return as documented.

---

## 2026-06-28 — Phase 3: Admin log drill-down

**Commit:** `104e8f2`  
**Depends on:** Phase 2 structured worker logs in `/splatial/<env>/worker`  
**Status:** Deployed to dev via GitHub Actions ([run #28334090322](https://github.com/Zinelaabidine/splatial/actions/runs/28334090322)).

### Summary

Phase 3 replaces the “logs appear here in Phase 3” placeholder in the admin
attempts table with a **live Worker logs panel**. Expanding an attempt row now
fetches that attempt’s CloudWatch lines from the worker log group, filtered on
`attempt_id`, with level filtering, expandable `data` payloads, and pagination.

This is read-only over logs Phase 2 already produces — **no worker change and no
instance roll** required.

---

### New files

| File | Purpose |
|---|---|
| `backend/handlers/admin-attempts-logs.js` | Admin-only `GET /admin/attempts/{attemptId}/logs`. Runs `FilterLogEvents` on the worker log group with a JSON filter pattern `{ $.attempt_id = "<id>" }`. Returns parsed envelope fields plus pagination. |
| `frontend/types/adminLogs.ts` | TypeScript types for `AttemptLogLine` and `AttemptLogsResponse`. |
| `frontend/services/adminLogsService.ts` | Authenticated client for the logs endpoint (`getAttemptLogs`). |
| `frontend/components/admin/AttemptLogPanel.tsx` | UI panel: level filter, refresh, scrollable log list, expandable JSON `data`, “Load more” pagination. |
| `infra/modules/static-site/admin-logs.tf` | IAM policy (`logs:FilterLogEvents`, `GetLogEvents`, `DescribeLogStreams`) scoped to `local.worker_log_group`, plus API Gateway route. |

---

### Backend changes

#### Dependency (`backend/package.json`)

- Added `@aws-sdk/client-cloudwatch-logs` (alphabetically with other `@aws-sdk/*`
  packages). Terraform’s `null_resource.upload_lambda_deps` re-runs `npm install`
  when `package.json` changes.

#### Route registration (`backend/upload.js`)

- Required `./handlers/admin-attempts-logs`.
- Added dispatcher case:
  ```js
  case "GET /admin/attempts/{attemptId}/logs":
    return await adminAttemptsLogs.handler(event);
  ```

#### Handler behaviour (`admin-attempts-logs.js`)

- **Auth:** Cognito JWT at the gateway + server-side `isAdmin(event)` check
  (non-admins get `403`).
- **Log group:** reads `process.env.WORKER_LOG_GROUP` (e.g. `/splatial/dev/worker`).
- **Filter:** CloudWatch JSON pattern on `attempt_id`; optional `level` filter.
  `attemptId` is sanitized (quotes/backslashes stripped) before interpolation.
- **Time window:** query params `from` / `to` (epoch-ms or ISO); default last 14
  days; hard cap 31 days (≈ retention). Frontend scopes to attempt lifetime
  (`createdAt − 1h` … `updatedAt + 1h`) for cheap, precise scans.
- **Pagination:** `limit` (1–500, default 200) and `nextToken`.
- **Empty group:** `ResourceNotFoundException` → `200` with `{ lines: [], note: "log group not found yet" }` (not an error).
- **Response shape:** each line includes `timestamp`, `logStreamName`, and parsed
  fields (`ts`, `level`, `event`, `msg`, `data`) when the message is valid JSON;
  otherwise `{ raw }`.

---

### Frontend changes

#### `AdminAttemptsTable.tsx`

- Imported `AttemptLogPanel`.
- Replaced the dashed Phase 3 placeholder in `DetailPanel` with:
  ```tsx
  <AttemptLogPanel attempt={attempt} />
  ```
- Field grid and error block unchanged.

#### `AttemptLogPanel.tsx`

- Loads logs when the row expands (scoped time window from attempt timestamps).
- **Level filter:** All / Info / Warning / Error.
- **Expandable rows:** lines with a `data` object expand to pretty-printed JSON.
- **Pagination:** “Load more” when `nextToken` is present.
- **Empty state:** “No log lines found for this attempt in the retained window.”

---

### Infrastructure changes

#### `lambda-upload.tf`

- Added Lambda environment variable:
  ```hcl
  WORKER_LOG_GROUP = local.worker_log_group
  ```
  Uses `local.worker_log_group` (`/${project}/${env}/worker`) — **not**
  `aws_cloudwatch_log_group.worker`, because Phase 2 creates the group at runtime
  on the worker side (see Phase 2 changelog).

#### `admin-logs.tf`

- **`aws_iam_role_policy.admin_lambda_logs_read`** — grants the upload Lambda
  read access to the worker log group ARN (constructed from
  `local.worker_log_group`).
- **`aws_apigatewayv2_route.admin_attempt_logs`** — `GET /admin/attempts/{attemptId}/logs`
  with Cognito JWT authorizer; reuses the existing upload Lambda integration.

---

### Where to verify

| Surface | What to check |
|---|---|
| **Admin UI** | https://splatial-dev.openspacenexus.store/admin — expand an attempt that ran; **Worker logs** panel shows `job.received → colmap.* → train.* → job.completed` (or `job.failed` with phase/reason). |
| **API** | `GET /admin/attempts/{attemptId}/logs?from=…&to=…` — admin JWT required; returns `{ lines, nextToken? }`. |
| **CloudWatch** | Source data still in `/splatial/dev/worker`; panel reads the same group Phase 2 writes. |

---

### Design notes

- **Bounded queries** — frontend narrows to attempt lifetime; backend caps any
  window at ~31 days. No open-ended all-time scans.
- **Same join key** — filters on `attempt_id`, the key Phase 2 stamps on every
  worker line. Backend/frontend log groups can be added later without changing
  the join.
- **Secrets** — worker tokens never appear in worker logs (redacted at source in
  Phase 2); the admin endpoint never logs or returns them.
- **Forward seam** — Logs Insights aggregations (e.g. per-phase durations) can
  be added later; route and IAM already exist.

---

### Files touched (complete list)

```
backend/handlers/admin-attempts-logs.js          (new)
backend/package.json                             (modified)
backend/package-lock.json                        (modified)
backend/upload.js                                (modified)
frontend/types/adminLogs.ts                      (new)
frontend/services/adminLogsService.ts            (new)
frontend/components/admin/AttemptLogPanel.tsx    (new)
frontend/components/admin/AdminAttemptsTable.tsx (modified)
infra/modules/static-site/admin-logs.tf          (new)
infra/modules/static-site/lambda-upload.tf       (modified)
```

---

## 2026-06-28 — Phase 2: Structured logs + worker → CloudWatch

**Commits:** `6f0b957`, `350ba08`, `3b21f23`  
**Spec:** [`docs/logging-spec.md`](./logging-spec.md) (envelope, correlation keys, event vocabulary)  
**Status:** Implemented; requires `terraform apply` + worker instance roll to take full effect.

### Summary

Phase 2 replaces ad-hoc plain-text logging with a **shared JSON envelope** across
the backend Lambda and the GPU worker. Every canonical event carries `attempt_id`
(and `scene_id` when known) so a single training run can be traced end-to-end.
Worker logs are shipped **directly to CloudWatch via boto3** (no CloudWatch agent
on the AMI), so they **survive Spot instance termination**.

Before this change, worker output lived mainly in journald on the EC2 box and was
lost when Spot reclaimed the instance. Admin failures often showed only “Failed at
INIT” with no underlying reason. After this change, structured `job.failed` and
`attempt.failed` events carry `phase`, `reason`, and `error_message`.

---

### New files

| File | Purpose |
|---|---|
| `worker/log_envelope.py` | Structured JSON logging for the worker. Stdlib + boto3 only. Emits one JSON line per log/event to stdout (journald) and optionally to CloudWatch. Binds `attempt_id` / `scene_id` per job via `contextvars`. Redacts secrets and presigned URLs. |
| `backend/lib/logger.js` | Structured JSON logging for Lambda handlers. No SDK dependencies. Emits one JSON line per call to stdout (Lambda → CloudWatch). |
| `infra/modules/static-site/logging-worker.tf` | Documents the worker log group **name contract** (group is created at runtime by the worker — see Infra notes below). |

---

### Worker (`worker/worker.py`)

#### Logging initialization

- Removed `logging.basicConfig(...)` and the `sqs-worker` logger name.
- After `import aws_config`, the worker now calls:
  ```python
  log = log_envelope.init_logging(ctx_provider=aws_config.get_instance_metadata)
  ```
- Added `_event(name, level=logging.INFO, **data)` shorthand wrapping
  `log_envelope.log_event(...)`.
- Existing `log.info(...)` / `log.warning(...)` / `log.error(...)` calls are
  unchanged; they become envelopes with a `msg` field and no `event` field.

#### Per-job correlation (main poll loop)

- After a `WorkItem` is successfully parsed from SQS:
  - `log_envelope.bind_job(item.attempt_id, item.scene_id)`
  - `_event("job.received", ...)` with `attempt_number`, `input_type`,
    `input_file_count`, `input_size_bytes`, `train_config`
- In a `finally` block after each message is processed:
  - `log_envelope.clear_job()` — prevents ID leakage between jobs
  - `log_envelope.flush_logs()` — pushes buffered CloudWatch events at job boundary

#### Worker lifecycle events

| Event | When |
|---|---|
| `worker.started` | Once at startup after queue URL is resolved (`queue`, `poll_interval_s`) |
| `worker.idle_exit` | Idle scale-to-zero timeout (`idle_seconds` = actual elapsed idle time) |
| `spot.interrupted` | Spot preemption detected during a job, or on `terminate_self("spot_interruption")` |
| `job.completed` | Successful job finish (`total_duration_s`, `output_prefix`) |
| `job.failed` | Any terminal failure (`phase`, `reason`, `error_message`) |

Job progress is tracked through phases (`INIT`, `PREPARATION`, `COLMAP`, `TRAINING`,
`POST_PROCESSING`, `EXPORT`, `FINALIZE`) so interruption and failure events include
the current phase and percent.

#### Pipeline seam events

| Event | Location | Fields |
|---|---|---|
| `input.downloaded` | `download_and_extract_zip_input`, `download_s3_objects` | `duration_s`, `bytes`, `image_count` (when known) |
| `colmap.started` | Start of `run_colmap_subprocess` | `matcher`, `image_count` |
| `colmap.finished` | End of COLMAP subprocess | `duration_s`, `matcher`, `ok` |
| `train.started` | Start of `run_training_subprocess` | `iterations`, `resolution`, `sh_degree` |
| `train.progress` | While streaming `train.py` stdout | `phase`, `percent`, `iter`, `eta_seconds` — **at most once per `HEARTBEAT_INTERVAL_SECONDS`** (default 30s), not per iteration |
| `train.finished` | Training subprocess exit | `duration_s`, `final_iter`, `ok` |
| `output.uploaded` | `upload_training_outputs`, `upload_outputs` | `duration_s`, `bytes`, `ply_key` |

Raw subprocess output is still passed through with `print(line, flush=True)` for
live `journalctl` debugging; structured events are additive.

#### Spot interruption and flush

- When Spot interruption is detected inside `simulate_processing`, the worker emits
  `spot.interrupted` with the current phase/percent and calls `log_envelope.flush_logs()`
  **before** the instance terminates.
- Same flush behavior on idle exit and at each job boundary in the main loop.

#### Secrets

- No `api_auth_token`, `worker_token`, Authorization headers, or presigned URLs are
  passed into `_event(...)` data. `log_envelope` also redacts known secret keys
  defensively.

#### Local development

- CloudWatch shipping is **auto-disabled** when instance metadata reports
  `lifecycle == "local"` or `instance_id` is `local`/`unknown`.
- Local runs still emit JSON envelopes to stdout only.

---

### Backend Lambda (`backend/`)

#### New helper: `backend/lib/logger.js`

Usage pattern in handlers:

```javascript
const logger = require("../lib/logger");

exports.handler = async (event) => {
  const log = logger.forEvent(event, "<handler-name>");
  log.event("job.submitted", { sceneId, attemptId, data: { ... } });
};
```

Envelope fields: `schema_version`, `ts`, `level`, `service` (`backend`), `env`
(from `SPLATIAL_ENV` or `ENVIRONMENT`, default `dev`), `event`, optional
`scene_id` / `attempt_id`, `ctx.handler`, `ctx.request_id`, and redacted `data`.

#### Handlers wired (canonical events only; no logic/response changes)

| Handler | Events added |
|---|---|
| `submit-job.js` | `attempt.created` (after attempt `PutItem`), `job.queued` + `job.submitted` (after SQS `SendMessage`) |
| `attempt-patch.js` | `attempt.status_changed` (when status maps), `attempt.completed` (`SUCCEEDED`), `attempt.failed` (`FAILED`) |
| `attempt-heartbeat.js` | `attempt.heartbeat` (`phase`, `percent`, `eta_seconds` from request body) |
| `cancel-job.js` | `job.cancelled` (includes `attempt_id` when available) |

All structured backend logs appear in the **upload Lambda** CloudWatch log group
(single router Lambda for these routes).

---

### Infrastructure (`infra/`)

#### Worker environment variables (`compute.tf` user_data → `/etc/splatial-worker.env`)

Three lines added to the launch template heredoc:

```
SPLATIAL_ENV=${var.environment}
WORKER_LOG_GROUP=${local.worker_log_group}
LOG_TO_CLOUDWATCH=true
```

The existing systemd drop-in already loads this file; no service unit changes.

#### Log group name (`locals.tf`)

```
local.worker_log_group = "/${var.project_name}/${var.environment}/worker"
```

Examples:

| Environment | Log group |
|---|---|
| dev | `/splatial/dev/worker` |
| staging | `/splatial/staging/worker` |
| prod | `/splatial/prod/worker` |

Log streams: `{instance_id}/{YYYY-MM-DD}` (e.g. `i-0abc123/2026-06-28`).

#### Runtime log group creation (follow-up commits `350ba08`, `3b21f23`)

**Original plan:** Terraform resource `aws_cloudwatch_log_group.worker`.

**What we learned:** Terraform apply under the GitHub OIDC deploy role could not
reliably create log groups whose names contain `/` (path-like names), even when
the IAM policy simulator showed permission.

**Resolution:**

1. **`logging-worker.tf`** — reduced to documentation only; no Terraform resource.
2. **`worker/log_envelope.py`** — worker creates the log group and stream on first
   write via `_ensure_group_and_stream()`, and sets retention (30 days dev/staging,
   90 days prod).
3. **`iam-worker.tf`** — explicit `CloudWatchWorkerLogs` policy scoped to
   `local.worker_log_group` (`CreateLogGroup`, `CreateLogStream`, `PutLogEvents`,
   `PutRetentionPolicy`, `DescribeLogStreams`).
4. **`iam-github-oidc.tf`** — deploy role granted log-group permissions for CI
   scenarios that still need them.

No AMI change and no new pip/npm dependencies. Worker IAM already had
`CloudWatchAgentServerPolicy`; the explicit policy tightens scope to the worker
log group ARN.

---

### Where to check in CloudWatch (region: `us-east-1`)

| What | Log group |
|---|---|
| Backend structured events | `/aws/lambda/splatial-<env>-upload-lambda` |
| Worker structured events | `/splatial/<env>/worker` |
| HTTP access logs (not job envelope) | `/aws/apigateway/splatial-<env>-gateway-api` |

**Logs Insights example (worker, one attempt):**

```sql
fields @timestamp, event, attempt_id, level, data
| filter service = "worker"
| filter attempt_id = "YOUR-ATTEMPT-UUID"
| sort @timestamp asc
```

---

### Deploy and verification checklist

1. **`terraform apply`** in the target environment — injects worker env vars;
   redeploys Lambda zip including `backend/lib/logger.js`.
2. **Roll worker instances** — terminate running workers or trigger an ASG instance
   refresh so new boxes pick up `/etc/splatial-worker.env`. Worker **code** must
   also be on the AMI (or deployed to the instance) — `log_envelope.py` + updated
   `worker.py`.
3. **Submit a test job** and confirm:
   - Lambda log group: JSON lines with `"event": "job.submitted"`, `"attempt.created"`.
   - Worker log group appears (created on first write): streams named `i-…/date`.
   - Same `attempt_id` in both groups.
   - Failure path: `job.failed` / `attempt.failed` include `phase`, `reason`,
     `error_message`.
   - Secrets: grep worker stream for `worker_token` — must not appear (or show
     `[REDACTED]`).
4. **Spot (optional):** `FORCE_SPOT_INTERRUPT=true` → `spot.interrupted` visible in
   CloudWatch before instance exit.

---

### Not in scope (Phase 2)

Deferred per [`logging-spec.md`](./logging-spec.md) §13:

- GPU/VRAM/timing metrics
- Per-iteration training metrics as queryable data
- Admin UI log drill-down panel (Phase 3 — will query `/splatial/<env>/worker`
  filtered by `attempt_id`; correlation keys are already on every line)

---

### Files touched (complete list)

```
backend/lib/logger.js                          (new)
backend/handlers/submit-job.js                 (modified)
backend/handlers/attempt-patch.js              (modified)
backend/handlers/attempt-heartbeat.js          (modified)
backend/handlers/cancel-job.js                 (modified)
worker/log_envelope.py                         (new)
worker/worker.py                               (modified)
infra/modules/static-site/compute.tf           (modified)
infra/modules/static-site/locals.tf            (modified)
infra/modules/static-site/logging-worker.tf    (new → docs-only after follow-up)
infra/modules/static-site/iam-worker.tf        (modified)
infra/modules/static-site/iam-github-oidc.tf   (modified)
```
