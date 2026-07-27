# Scene Lifecycle Remediation Plan

> Planning document only — no code changes made. Produced from graph-first exploration
> of `graphify-out/graph.json` + targeted reads of the implicated files.
> Date: 2026-07-27

---

## 1. Summary of the current architecture

### Actual request flow (as built, not as documented)

```
Browser (Next.js)
  └─ services/jobsService.ts  → POST /jobs/submit
                              → POST /jobs/{sceneId}/cancel
       │  Cognito JWT
       ▼
API Gateway → Lambda (backend/upload.js router)
       │
       ├─ handlers/submit-job.js   : validate → conditional UpdateItem on scene
       │                             → PutItem attempt row → SendMessage to SQS
       ├─ handlers/cancel-job.js   : conditional UpdateItem scene + last attempt
       ├─ handlers/attempt-patch.js: worker-token auth, attempt status + cascade to scene
       └─ handlers/attempt-heartbeat.js : worker-token auth, progress + cascade to scene
       │
       ▼
SQS standard queue  ×2  (splat-processing-queue, splat-processing-queue-priority)
   visibility 2700s · maxReceiveCount 3 · DLQ 14d retention · no redrive-back
       │
       ▼  CloudWatch alarm on ApproximateNumberOfMessagesVisible
          → aws_autoscaling_policy step scale-out
       ▼
EC2 ASG (min 0 / desired 0) → worker/worker.py
       └─ main(): receive 1 message → simulate_processing() → terminate_self()
       ▼
S3 output bucket → CloudFront → viewer
```

### Corrections to `CLAUDE.md` discovered during this pass

| `CLAUDE.md` claim | Reality |
|---|---|
| §1 "SQS FIFO queue (`splat-processing-queue.fifo`)" | Both queues are **standard**, not FIFO (`infra/modules/static-site/sqs.tf`). No `MessageGroupId` anywhere. |
| §3 "Lambda increments desired on job submission" | `submit-job.js` never touches AutoScaling. Scale-out is **CloudWatch-alarm-driven step scaling** (`compute.tf:229-265`). Only `admin-asg-*.js` handlers call the AutoScaling API. |
| §8 "on `SIGTERM` it checkpoints state to S3 and re-queues the job to SQS" | There is **no S3 checkpointing and no re-queue**. The worker PATCHes `INTERRUPTED` and calls `change_message_visibility(0)` to force immediate redelivery. All work is discarded. (`checkpoint_iterations` at `worker.py:965` is only a passthrough 3DGS train arg — nothing saves or restores a checkpoint to/from S3.) |
| §1 "`g5g.xlarge` per `variables.tf` is correct" | Not re-verified in this pass; out of scope. |

These are worth fixing in `CLAUDE.md` as part of the final task.

### Data model (single DynamoDB table, `scene_id` as PK)

Two record shapes share the table:

- **Scene row** — `scene_id` = the scene UUID, no `record_type` attribute (readers default it to `"scene"`).
  Holds `status`, `s3_key`, `input_type`, `attempt_count`, `last_attempt_id`, `worker_token`,
  and **a single output slot**: `ply_key`, `output_bucket`, `output_prefix`, `output_size_bytes`.
- **Attempt row** — `scene_id` = the *attempt* UUID (`submit-job.js:182`), `record_type = "attempt"`,
  `parent_scene_id`, `attempt_number`, `status`, `worker_token`, `train_config`, `colmap_config`,
  `tier`, `is_manual_retry`.

GSIs present: `user_id-status-index` (KEYS_ONLY), `visibility-created_at-index`,
`public_owner-created_at-index`, `raw_retention_status-raw_expires_at-index`.
**There is no GSI on `parent_scene_id` and none on `record_type`** — `scene-delete.js:147`
resolves a scene's attempts with a full table `Scan` + `FilterExpression`, and
`admin-attempts-list.js:82` carries a `TODO` about exactly this.

---

## 2. Current state model and transitions

### Scene statuses (`frontend/types/api.ts:324`)

`PENDING_UPLOAD` → `UPLOADED` → `QUEUED` → `PROCESSING` → `READY` | `FAILED` | `CANCELLED`

### Worker statuses (`attempt-patch.js:38`, mapped onto the scene)

```js
RUNNING     → PROCESSING
SUCCEEDED   → READY
FAILED      → FAILED
INTERRUPTED → QUEUED
```

### The submit gate (`submit-job.js:25`)

```js
const SUBMITTABLE = new Set(["READY", "FAILED", "UPLOADED"]);
```

…enforced twice: once as a pre-read check (line 113, produces the user-visible 409 message)
and once as the `ConditionExpression` on the atomic update (line 152, `#s IN (:r1,:r2,:r3)`).

### The critical structural observation

`scene.status` is **overloaded**. It simultaneously encodes:

1. the scene's own lifecycle (do we have an input file? do we have an output?), and
2. the execution status of the single most recent attempt.

Every transition problem below is a consequence of that conflation. The attempt row —
which already exists and is already the right home for execution state — is treated as a
subordinate mirror of the scene rather than the authority.

---

## 3. Root causes

### RC-1 — `CANCELLED` is missing from `SUBMITTABLE` (issue 3, the reported 409)

`submit-job.js:25` omits `"CANCELLED"`, and so does the `ConditionExpression` at line 152.
A cancelled scene is therefore permanently unsubmittable.

The frontend disagrees **explicitly**. `DashboardSceneCard.tsx:39-45`:

```ts
function canSubmitScene(scene: DashboardScene): boolean {
  return (
    scene.apiStatus === "UPLOADED" ||
    scene.apiStatus === "FAILED" ||
    scene.apiStatus === "CANCELLED"   // ← backend rejects this
  );
}
```

So the two allowlists differ on two states in opposite directions: the frontend offers
Submit for `CANCELLED` (which the backend 409s), and the backend allows `READY` (which the
frontend does not offer). Reinforcing it, `useScenesDashboardGrid.ts:178` sets the cancel
success toast to **"Processing cancelled. You can submit again or delete the scene."**, and
`SceneCard.tsx:261-271` (the other dashboard implementation) renders a **Submit** button for
`state === "cancelled"`. The UI promises an action the API rejects.

This is a two-line fix but it is a *symptom* — see RC-2, which is why it must not be fixed
in isolation.

**Note — there are two live dashboard implementations**, and both call the real
submit/cancel services. Every frontend change below must be applied to both or the bug
persists in one:
- `splatworks/ScenesDashboardView.tsx` → `splatworks/DashboardSceneCard.tsx`, fed by `useScenesDashboardGrid`
- `features/scenes/DashboardGridView.tsx` → `dashboard/SceneCard.tsx` (typed `MockScene`), fed via `ScenesLibraryContainer` → `useDashboardScenes`

**Answer to "Is CANCELLED incorrectly treated as a terminal scene state instead of a
terminal processing-attempt state?" — Yes, exactly.** Cancelling one training run is being
recorded as a terminal fact about the scene itself.

### RC-2 — cancellation is advisory; the worker does not honour it (issues 1, 2)

`cancel-job.js:13-16` documents: *"The SQS worker checks DynamoDB status before processing —
a CANCELLED message is deleted from the queue without running the training job."*
**This is not implemented.** `grep -in cancel worker/worker.py` returns exactly one hit —
a log string at line 4112. The worker has no notion of cancellation.

The only guard is `attempt-patch.js:85-92`:

```js
if (Item.status?.S === "CANCELLED" && status === "RUNNING") {
  return response(200, { attemptId, updated: false, skipped: true, reason: "CANCELLED" });
}
```

It returns **HTTP 200**. The worker computes `ok = 200 <= r.status_code < 300`
(`worker.py:1104`) and therefore reads this as success, ignores `skipped: true`, and proceeds
to run a full COLMAP + 3DGS job on a cancelled scene. Consequences:

- **Orphaned queue message.** Nothing deletes or invalidates the SQS message on cancel.
  It sits at up to 2700s visibility and is processed in full.
- **Cancellation does not stick.** The parent-scene cascade at `attempt-patch.js:231-291`
  writes `mappedStatus` to the scene with **no `ConditionExpression`**. The still-running
  worker's next `RUNNING`/`SUCCEEDED`/`FAILED` PATCH silently overwrites `CANCELLED` →
  `PROCESSING`/`READY`/`FAILED`. `attempt-heartbeat.js:76-90` likewise cascades progress to
  the parent with no status guard.
- **Wasted GPU spend** for the full duration of a cancelled job.

Cancel-while-processing has no delivery channel at all. `attempt-heartbeat.js:92` returns
`{ attemptId, received: true }` — the worker calls it every `HEARTBEAT_INTERVAL_SECONDS`
and it is the natural place to hand back a stop signal, but it currently returns nothing
actionable.

### RC-3 — the worker is hard-wired to one message per instance (issue 6)

`main()` unconditionally calls `terminate_self(...)` and `return`s on **every** exit path
(`worker.py:4127-4139`), plus on invalid messages (4054). The `while not stop_event.is_set()`
loop can never reach a second iteration once a message is received.

`RUN_ONCE` is read at `worker.py:418` and **only ever used in a log line** (3982). It is
dead configuration — the intended knob exists but was never wired to the control flow.
So the documented behaviour ("continue if more work exists") is not reachable even by config.

Net effect: N queued jobs require N instance launches, each paying full boot + AMI-pull
latency, and each racing the CloudWatch scale-out alarm.

### RC-4 — interrupted work is discarded, and retries are capped at 3 (issue 7)

- No checkpointing exists despite §8 of `CLAUDE.md`. On interruption the worker PATCHes
  `INTERRUPTED` and calls `change_message_visibility(0)` (`worker.py:3241-3252`). All COLMAP
  and training progress is lost; the replacement starts from zero.
- `change_message_visibility(0)` forces **immediate** redelivery, which increments
  `ApproximateReceiveCount` on every interruption. With `maxReceiveCount = 3`
  (`sqs.tf:24`), **three Spot interruptions send the job to the DLQ**. There is no
  redrive-back configured, so the message is gone.
- `INTERRUPTED → QUEUED` (`attempt-patch.js:42`) means the scene is left claiming `QUEUED`
  with no message in the queue: a permanently stuck scene, exactly the failure mode
  §E asks to avoid.
- **Hard crash / Spot hardware kill / OOM** produces no `INTERRUPTED` PATCH at all. The
  scene stays `PROCESSING` until the message reappears after the 2700s visibility timeout.
  If that recurs it also lands in the DLQ, leaving `PROCESSING` forever.
- `last_heartbeat_at` is written by `attempt-heartbeat.js` but **nothing ever reads it**.
  The liveness signal needed to detect a dead worker is being recorded and discarded.
  There is no reaper: the only scheduled rules are `retention_sweep` and
  `asg_manual_mode_check`.

### RC-5 — there is no quality model at all (issues 4, 5)

`grep -rn "quality" backend/ frontend/types/ frontend/services/` returns **zero** product
hits — only two incidental comments in `worker.py`. Quality is implicit and unnamed, buried
in `trainConfig` (`iterations`, `resolution`, `sh_degree`) and `colmapConfig`
(`max_image_size`, `max_num_features`).

Three concrete blockers to multiple qualities per scene:

1. **The scene has one output slot.** `ply_key`, `output_bucket`, `output_prefix`,
   `output_size_bytes` are scalars on the scene row. A second successful attempt overwrites
   the first. `attempt-patch.js:252-281` even computes a storage *delta* against the previous
   value, which is precisely "one output per scene" logic.
2. **The scene has one status.** Two concurrent qualities cannot both be represented;
   whichever attempt PATCHes last wins the cascade.
3. **`worker_token` is a scalar on the scene row.** `submit-job.js:151` overwrites
   `scene.worker_token` on every submit, so a second concurrent submit invalidates nothing
   on the attempt rows (they carry their own copy) but does make the scene-level token
   meaningless. Also `last_attempt_id` becomes ambiguous — and `cancel-job.js:38` relies on
   it as *the* attempt to cancel, so with concurrent qualities cancel would hit only one.

The good news: **the attempt row is already a per-run job record with its own config,
status, token and output prefix** (`outputPrefix` = `${s3_key}/output/attempt-${attemptId}/`).
Multi-quality needs a label and an aggregation layer, not a new execution model.
And because the queues are **standard, not FIFO**, nothing serializes same-scene messages —
parallel qualities work at the queue layer today with no infrastructure change.

---

## 4. Proposed target behaviour

| # | Behaviour |
|---|---|
| A1 | Cancelling a `QUEUED` attempt invalidates it; the SQS message is dropped on consume without running training. |
| A2 | Cancelling a `PROCESSING` attempt stops the worker at its next cancellation checkpoint (≤ one heartbeat interval), which then deletes the message and marks the attempt `CANCELLED`. |
| A3 | Cancellation is a fact about the **attempt**, never a terminal fact about the scene. No worker PATCH can resurrect a cancelled attempt. |
| B1 | A scene whose last attempt was cancelled is immediately resubmittable. |
| B2 | Resubmission always creates a **fresh attempt row**; prior attempts (including cancelled ones) are preserved as history. |
| B3 | The UI never dead-ends on a 409 for an action it offered. |
| C1 | A scene supports N named qualities; each is an independent attempt with its own config, status, output prefix and token. |
| C2 | Qualities process concurrently, subject to tier and ASG caps. |
| C3 | Scene status is **derived** from its live attempts, not authoritatively written by whichever worker PATCHed last. |
| D1 | A worker drains the queue: on finishing one item it polls for the next, and only terminates on idle timeout, Spot notice, or `RUN_ONCE=true`. |
| E1 | Interrupted or crashed work returns to `QUEUED` with a message actually in the queue, and does not consume a `maxReceiveCount` slot for infrastructure-caused interruptions. |
| E2 | A scheduled reaper detects attempts `PROCESSING` past a heartbeat deadline and requeues or fails them. No permanent `PROCESSING`. |

---

## 5. Recommended architecture changes

### Design decision 1 — where does execution state live?

| Option | Assessment |
|---|---|
| **A. Keep scene.status authoritative; add `CANCELLED` to `SUBMITTABLE`** | ~2 lines. Fixes the 409 only. Leaves RC-2 (worker ignores cancel), RC-4 and RC-5 entirely. Actively harmful: makes the broken cancel path reachable more often, and the unguarded cascade will resurrect cancelled scenes. |
| **B. ✅ Attempt row becomes the authority for execution state; scene status becomes derived** | Reuses the attempt model that already exists. No new table, no new PK scheme. Unblocks cancel, resubmit, multi-quality and recovery with one coherent change. |
| **C. Split attempts into their own table with a proper `parent_scene_id` PK** | Cleanest long-term, correct GSI shape by construction. But requires migrating live rows and touching every reader (`scene-delete.js`, `admin-attempts-list.js`, `scene-view-key.js`, dashboard mappers). Too large for this pass. |

**Recommendation: B.** It is the smallest change that solves all seven issues, and it is
what the codebase was already trending toward — `submit-job.js`'s comment at line 175
("Write the attempt record BEFORE enqueueing…") shows attempts were introduced precisely to
own execution state. Option C stays available later; B does not foreclose it, and adding
the `parent_scene_id` GSI in Task 5 is a step in its direction.

Concretely under B:

- `scene.status` keeps `PENDING_UPLOAD` / `UPLOADED` / `READY` / `FAILED` as *scene lifecycle*,
  and gains a derived read model. `QUEUED` / `PROCESSING` / `CANCELLED` on the scene row
  become a **denormalized cache of the live-attempt rollup**, never a gate on submission.
- Submission is gated on `s3_key` presence + tier/quota + "no live attempt for this quality",
  **not** on `scene.status`.
- Every parent-scene cascade write gets a `ConditionExpression` so a stale worker cannot
  overwrite a newer decision.

### Design decision 2 — how are qualities modelled?

| Option | Assessment |
|---|---|
| **A. ✅ One attempt row per (scene, quality)** | Attempt rows already carry `train_config`/`colmap_config`/`status`/`worker_token`/output prefix. Add a `quality` attribute + a per-quality output map on the scene. One SQS message per quality — standard queues already parallelize. |
| B. One attempt with N subtasks | Requires a subtask state machine inside the attempt row and either a multi-quality worker or subtask fan-out messages. More moving parts, no benefit. |
| C. Separate queue per quality | Multiplies infrastructure (queue + ASG + alarms per quality) for no isolation benefit — tier already owns that axis. |

**Recommendation: A.** Quality becomes a first-class attribute on the existing attempt.

Schema additions (all additive, all sparse — no backfill strictly required):

```
attempt row:  quality           S   "draft" | "standard" | "high"   (default "standard")
              cancel_requested  BOOL
              lease_expires_at  S   ISO8601 — reaper deadline
              heartbeat_count   N

scene row:    outputs           M   { "<quality>": { ply_key, output_prefix,
                                        output_bucket, output_size_bytes,
                                        attempt_id, completed_at } }
              live_attempts     M   { "<quality>": "<attemptId>" }  — live only
```

`scene.ply_key` / `output_prefix` / `output_bucket` / `output_size_bytes` are **retained**
and kept pointing at the highest-quality successful output, so every existing reader
(viewer, dashboard, `scene-view-key.js`, `scene-download-output.js`) keeps working unchanged.
This is what makes the change backward compatible.

Quality presets are defined **once** in `backend/lib/job-config.js` as named
`trainConfig`/`colmapConfig` bundles, with `worker.py`'s allowlists unchanged — the existing
defence-in-depth validation still applies to the resolved config.

### Design decision 3 — cancel delivery to a running worker

**Recommendation: piggyback on the existing heartbeat.** `attempt-heartbeat.js` is already
called every interval by every running worker and already authenticates via `worker_token`.
Change its response to `{ attemptId, received: true, cancelRequested: bool }` and have the
worker treat `cancelRequested` like a Spot interruption — except it deletes the message
instead of releasing it.

Rejected alternatives: a dedicated poll endpoint (a second call doing what the heartbeat
already does), SSM Run Command / instance signalling (new IAM surface, new failure modes).

**Also required, per the user's question "delete, soft-invalidate, or ignore on consume?":
all three, layered.** Cancel is fundamentally a soft-invalidate because SQS provides no
way to delete a specific unreceived message:

1. **Soft-invalidate at cancel time** — set attempt `status = CANCELLED` + `cancel_requested = true`.
   This is the durable source of truth.
2. **Ignore-and-delete on consume** — the worker checks attempt status *before* starting work
   and deletes the message if cancelled. This is the fix for RC-2.
3. **Stop-and-delete mid-flight** — via the heartbeat signal.

### Design decision 4 — interruption and recovery

- `INTERRUPTED` maps to a new attempt status `REQUEUED`, and the worker **re-sends a fresh
  SQS message** rather than relying on `change_message_visibility(0)`, then deletes the
  original. This resets `ApproximateReceiveCount`, so Spot interruptions no longer burn
  `maxReceiveCount` slots (fixes the "3 interruptions → DLQ" defect) while genuine poison
  messages still DLQ after 3 real failures.
- Guard with an `interrupt_count` on the attempt and a hard cap (suggest 5) so an
  interruption loop cannot requeue forever.
- Add a **reaper Lambda** on an EventBridge schedule (every 5 min) that reads
  `lease_expires_at` — the field the existing-but-unread `last_heartbeat_at` should have
  been — and requeues or fails attempts whose lease has expired. This is the only mechanism
  that can recover from a hard crash, since a dead worker sends no PATCH.
- Checkpointing to S3 (true resume of COLMAP/training) is explicitly **out of scope** here.
  It is a large, independent piece of work; `CLAUDE.md` §8 should stop claiming it exists
  until it does.

---

## 6. Task breakdown, in the safest order

Each task is independently deployable and independently revertable. Ordering is chosen so
that no task makes an existing bug more reachable before its fix lands — which is why the
one-line `SUBMITTABLE` fix is **not** first.

| # | Task | Layers touched |
|---|---|---|
| 1 | Make cancellation authoritative and stop the cascade from resurrecting it | backend |
| 2 | Honour cancellation in the worker (pre-flight check + heartbeat stop signal) | backend, worker |
| 3 | Allow resubmission after cancel; gate on live attempts, not `scene.status` | backend, frontend |
| 4 | Worker drains the queue instead of one-message-per-instance | worker |
| 5 | Lease-based recovery: reaper + requeue-on-interrupt + `parent_scene_id` GSI | backend, worker, infra, schema |
| 6 | Quality as a first-class attempt attribute | backend, schema, frontend |
| 7 | Concurrent multi-quality submission and derived scene status | backend, frontend |
| 8 | Reconcile `CLAUDE.md` with reality | docs |

### Task 1 — Make cancellation authoritative

**Purpose:** RC-2's "cancellation does not stick". Prerequisite for everything else — until
a cancel is durable, no downstream consumer can trust it.

**Changes**
- `attempt-patch.js`: treat `CANCELLED` as terminal on the attempt. Add
  `ConditionExpression: "#s <> :cancelled"` to the attempt update, and reject **all**
  status transitions from `CANCELLED` (currently only `RUNNING` is guarded, line 85).
- `attempt-patch.js`: change the `CANCELLED` short-circuit from `200` to **`409`** so
  `worker.py:1104`'s `ok` computation reads it as a failure. This is the single highest-value
  line in the plan.
- `attempt-patch.js`: add `ConditionExpression` to the parent-scene cascade (line 283) so a
  stale worker cannot overwrite a newer scene status.
- `attempt-heartbeat.js`: add the same guard to its parent cascade (line 82), and skip the
  progress cascade entirely when the attempt is cancelled.

**Files:** `backend/handlers/attempt-patch.js`, `backend/handlers/attempt-heartbeat.js`

**Risks**
- Returning 409 where the worker previously saw 200 changes worker behaviour *before* Task 2
  teaches the worker what to do with it. Pre-Task-2, a cancelled job's `RUNNING` patch fails
  → `simulate_processing` returns `(False, False)` → message retries → DLQ after 3.
  Acceptable and strictly better than today (training a cancelled scene), but it is why
  Task 2 should follow closely.
- Conditional writes introduce a new `ConditionalCheckFailedException` path. Must be caught
  and logged, never surfaced as a 500.

**Validation**
- Unit: `attempt-patch` returns 409 for every status transition out of `CANCELLED`.
- Unit: parent cascade is skipped when the scene is `CANCELLED`.
- Integration: cancel a `PROCESSING` scene, then replay a worker `SUCCEEDED` PATCH → scene
  stays `CANCELLED`, no email sent, no storage delta applied.
- `cd backend && node -e "require('./upload')"`

**Rollback:** revert the two handlers. No schema change, no data written that the old code
cannot read.

---

### Task 2 — Honour cancellation in the worker

**Purpose:** RC-2's "worker ignores cancel" — issues 1 and 2. Closes the window Task 1 opens.

**Changes**
- `attempt-heartbeat.js`: return `cancelRequested` in the response body, read from the
  attempt's `status`/`cancel_requested`.
- `cancel-job.js`: set `cancel_requested = true` on the attempt alongside `CANCELLED`, and
  transition the **scene** to a non-terminal resting state rather than `CANCELLED`
  (see Task 3 for the full treatment; here, just stop writing a terminal scene status).
- `worker.py`: add a pre-flight cancellation check in `simulate_processing` **before**
  `setup_workspace` (i.e. before line 3257) — if the start PATCH returns 409/`CANCELLED`,
  set `delete_poison_message = True` and return immediately. This is the "ignore on consume"
  behaviour that `cancel-job.js:13-16` has always claimed.
- `worker.py`: have `_send_heartbeat_if_due` parse `cancelRequested` and set a new
  `cancel_event`; thread it into every existing `interrupt_event.is_set() or global_stop.is_set()`
  check site (there are ~14, at lines 2992, 3089, 3119, 3331, 3462, 3529-3534, 3561, 3645,
  3724, 3737, 3766 — a single combined predicate helper is cleaner than editing each).
  On cancel: PATCH `CANCELLED`, delete the message, return `(False, False)` with a distinct
  `was_cancelled` flag so `main()` does not treat it as a retryable failure.
- `worker.py`: `simulate_processing` returns a 3-tuple or a small result object.
  `main()` (4083, 4127-4139) updates accordingly.

**Files:** `worker/worker.py`, `backend/handlers/attempt-heartbeat.js`,
`backend/handlers/cancel-job.js`. Mirror into `worker/worker_simulation.py`
(which duplicates `patch_attempt` at 519 and `_workspace_name_from_attempt` at 644).

**Risks**
- ⚠️ **Requires a new AMI bake.** Per `CLAUDE.md` §2, `worker.py` ships in
  `ami-0512a845e4b778621`; `locals.worker_ami_id` in `compute.tf` must be updated after a
  tested build. There are `admin-worker-ami-register`/`activate`/`boot` handlers, so use that
  path. **Old-AMI instances remain in flight during rollout** — the backend must tolerate
  workers that do not understand `cancelRequested` (it is additive, so they simply ignore it).
- Cancellation latency is bounded by `HEARTBEAT_INTERVAL_SECONDS`. Worth confirming that
  value is acceptable as a worst-case GPU-spend window.
- The heartbeat becomes load-bearing for correctness. A heartbeat outage now delays cancels.
  Keep the pre-flight check as the independent second line of defence.

**Validation**
- Unit: `worker_progress_test.py` — a mocked heartbeat returning `cancelRequested: true`
  sets `cancel_event` and exits the training loop.
- Unit: a 409 on the start PATCH sets `delete_poison_message` and skips `setup_workspace`.
- Integration (dev): submit → cancel while `PROCESSING` → assert worker exits within one
  heartbeat interval, message deleted, attempt `CANCELLED`, no output written.
- Integration (dev): cancel while `QUEUED`, then let a worker pick the message up → asserts
  it is dropped without training.

**Rollback:** re-point `locals.worker_ami_id` at the previous AMI and revert the handlers.
Keep the Task 1 backend changes — they are safe standalone.

---

### Task 3 — Allow resubmission after cancel

**Purpose:** The reported 409 (issue 3) and target behaviour B. Now safe, because cancel is
durable (Task 1) and observed (Task 2).

**Changes**
- `submit-job.js`: replace the `SUBMITTABLE` status gate with a **live-attempt** gate —
  reject only if an attempt for this scene+quality is currently `QUEUED`/`PROCESSING`.
  Keep requiring `s3_key` (the existing 422 at line 125 is the right check and stays).
  Drop `#s IN (:r1,:r2,:r3)` from the `ConditionExpression`; keep the conditional update for
  atomicity, conditioned on `attribute_exists(scene_id)` and on the absence of a live
  attempt for that quality.
- `submit-job.js`: preserve history — never mutate prior attempt rows. `attempt_count`
  already increments via `ADD`, so attempt numbering is intact.
- `cancel-job.js`: on cancel, set the scene's resting status from its own facts —
  `READY` if a successful output exists, else `UPLOADED` (it has an `s3_key` by definition
  if it was ever submitted). Record `last_cancelled_at` for UI copy.
- Frontend: `useScenesDashboardGrid.ts` / `useDashboardScenes.ts` — surface 409 as a
  specific, actionable message instead of the generic
  `"Failed to submit scene. Please try again."` (line 159); add an `isConflictError`
  helper next to the existing `isQuotaExceededError`.
- Frontend: `sceneMappers.ts` (46-47, 95, 114) — a cancelled-then-resting scene must map to
  a submittable card state.
- Frontend: reconcile `DashboardSceneCard.tsx:39-45`'s `canSubmitScene` with the backend's
  rule (it should also offer `READY` as a re-run, which it currently does not), and apply the
  same to `SceneCard.tsx:261-271`. **Both dashboards must be updated.**

**Files:** `backend/handlers/submit-job.js`, `backend/handlers/cancel-job.js`,
`frontend/hooks/scenes/useScenesDashboardGrid.ts`,
`frontend/hooks/scenes/useDashboardScenes.ts`, `frontend/lib/scenes/sceneMappers.ts`,
`frontend/services/jobsService.ts`,
`frontend/components/splatworks/DashboardSceneCard.tsx`,
`frontend/components/dashboard/SceneCard.tsx`

**Risks**
- **Quota.** `isManualRetry = currentStatus !== "UPLOADED"` (line 122) charges a
  `MANUAL_RETRY` immediately. Resubmitting after cancel would now charge quota — including
  for a cancel the user made two seconds after submitting. **Product decision needed:**
  does cancel-then-resubmit consume quota? Recommend *not* charging when the cancelled
  attempt never reached `PROCESSING`, tracked via a `billable` flag on the attempt.
- Without a `parent_scene_id` GSI (Task 5), the live-attempt lookup would need a `Scan`.
  **Mitigation:** read the scene's `live_attempts` map (Task 6) or, in this task, its
  `last_attempt_id` + a single `GetItem`. Do **not** add a `Scan` to the submit hot path.
- Removing the status gate weakens a safety net. The live-attempt check must be genuinely
  atomic or a double-click double-submits.

**Validation**
- Unit: submit from `CANCELLED`, `FAILED`, `READY`, `UPLOADED` → 202; from
  `PENDING_UPLOAD` → 422; with a live attempt → 409.
- Unit: idempotency — two concurrent submits for the same scene+quality yield exactly one
  attempt and one SQS message.
- Integration: the full reported repro — submit → cancel → submit → **202**, new
  `attemptId`, prior attempt row still present with `status = CANCELLED`.
- Frontend: cancel toast → Submit → no error banner. `cd frontend && npm run build`.

**Rollback:** revert. Attempt rows written under the new rules are readable by the old code
(the old code would just refuse to submit again — the current behaviour).

---

### Task 4 — Worker drains the queue

**Purpose:** Issue 6 / target D. Independent of Tasks 1-3; sequenced here because it rides
the same AMI bake cadence and is easier to validate once cancel is correct.

**Changes**
- `worker.py:main()`: replace the unconditional `terminate_self(...) + return` block
  (4127-4139) with a decision function. `continue` the poll loop on success, on non-poison
  failure, and after a cancelled item. `terminate_self` only on: `RUN_ONCE=true`, Spot
  notice (`decrement_desired=False`), idle timeout, or the interrupt cap from Task 5.
- **Wire up `RUN_ONCE`** (currently dead at line 418) so the old one-per-instance behaviour
  remains available as a config rollback with no code change.
- Reset per-job state between iterations: `log_envelope.clear_job()` /
  `bind_job()` are already per-iteration, but confirm `last_heartbeat`, workspace dirs
  (`setup_workspace` is per-attempt, good) and the visibility-extension thread are all
  torn down cleanly. Add explicit workspace cleanup to avoid filling the instance disk
  across many jobs.
- Re-check the Spot monitor thread's lifetime — it currently spans the whole process, which
  is correct for a draining loop, but verify `stop_event` semantics with multiple jobs.

**Files:** `worker/worker.py` (mirror in `worker/worker_simulation.py`)

**Risks**
- ⚠️ New AMI bake.
- **Disk exhaustion** is the main new failure mode: N jobs of extracted images + COLMAP
  output on one instance. Explicit per-job cleanup is mandatory, not optional.
- **Scale-in interaction.** `sqs_step_scale_in` (`compute.tf:281`) keys on
  `ApproximateNumberOfMessagesVisible` + `NotVisible`. A draining worker changes the
  queue-depth-to-instance relationship; the step policy may now over-scale-in. Review the
  alarm thresholds and `IDLE_EXIT_SECONDS` (default 120) together — with draining, idle
  exit becomes the primary scale-to-zero mechanism.
- Long-lived processes surface leaks that one-shot execution hid (memory, CUDA context,
  file handles). Worth a soak test of ≥5 sequential jobs.

**Validation**
- Unit: the terminate/continue decision function across every outcome × `RUN_ONCE` value.
- Integration (dev): enqueue 3 jobs, scale ASG to 1, assert all 3 complete on one instance,
  then the instance idle-exits and desired capacity returns to 0.
- Soak: 5 sequential jobs — assert flat disk and memory between jobs.

**Rollback:** set `RUN_ONCE=true` in `/etc/splatial-worker.env` via `user_data` — restores
one-message-per-instance with no redeploy. (This is the reason to wire the flag rather than
delete it.)

---

### Task 5 — Lease-based recovery

**Purpose:** Issue 7 / target E. Eliminates stuck `PROCESSING` and stuck `QUEUED`.

**Changes**
- Schema (additive): `lease_expires_at`, `interrupt_count` on attempt rows.
- Infra: new GSI `record_type-lease_expires_at-index` (KEYS_ONLY) so the reaper queries
  instead of scanning. Also add the `parent_scene_id-created_at-index` GSI that
  `admin-attempts-list.js:82` already flags and `scene-delete.js:147` needs — it removes an
  existing full-table `Scan` and unblocks Tasks 3, 6 and 7.
- `attempt-heartbeat.js` / `attempt-patch.js`: extend `lease_expires_at` on every write
  (`now + LEASE_SECONDS`, suggest 3× the heartbeat interval). This finally gives
  `last_heartbeat_at` a consumer.
- New `backend/handlers/attempts-reap.js` + EventBridge rule (5 min), following the existing
  `retention.tf` pattern. For each expired lease: increment `interrupt_count`; under the cap,
  send a fresh SQS message and set the attempt back to `QUEUED`; at the cap, mark `FAILED`
  with `reason = "LEASE_EXPIRED"`. Must be **idempotent** and must respect `CANCELLED`.
- `worker.py`: on interruption, **send a fresh SQS message and delete the original** instead
  of `change_message_visibility(0)` (`_release_message_visibility`, 3241-3252). Preserves
  `attempt_count`/`interrupt_count` while resetting `ApproximateReceiveCount`.
- `attempt-patch.js`: `INTERRUPTED` → `QUEUED` only when a message was actually
  re-enqueued; otherwise a state the reaper will pick up. Never `QUEUED`-with-no-message.
- New Terraform file `infra/modules/static-site/reaper.tf` (per §7 file-per-concern),
  with the four required tags and a least-privilege IAM policy (`sid` = e.g.
  `ScenesReapQuery`, `ProcessingQueueRequeue`).

**Files:** `backend/handlers/attempts-reap.js` (new), `backend/upload.js` (if routed) or a
standalone Lambda, `backend/handlers/attempt-patch.js`,
`backend/handlers/attempt-heartbeat.js`, `worker/worker.py`,
`infra/modules/static-site/reaper.tf` (new), `dynamodb.tf`, `lambdas.tf`, `iam-*.tf`,
`variables.tf`, `outputs.tf`

**Risks**
- **Double-processing is the headline risk.** If the reaper requeues an attempt whose worker
  is merely slow (network partition, not dead), two workers run the same attempt. Mitigations:
  set the lease generously (≥3× heartbeat); make the worker verify it still owns the attempt
  via a fencing token before writing outputs; make output writes idempotent (they already
  are — the output prefix is attempt-scoped).
- **GSI backfill.** Adding two GSIs to a live table triggers a backfill. On `prod` this is
  online but consumes capacity and takes time proportional to table size. Plan the window;
  apply to `dev` → `staging` → `prod`.
- A reaper bug could mass-requeue. Ship it with a dry-run env flag that logs intended
  actions without writing, and run that way for one cycle in each environment first.
- Hot-partition risk on a low-cardinality `record_type` hash key. Volume here is low, but
  if it matters, shard the key (`attempt#<0-9>`).

**Validation**
- Unit: reaper picks up only expired, non-terminal, non-cancelled attempts.
- Unit: `interrupt_count` cap → `FAILED` with `LEASE_EXPIRED`, not an infinite requeue.
- Integration: `kill -9` a worker mid-job → within one reaper cycle the attempt is `QUEUED`
  with a live message; another worker completes it.
- Integration: 4 consecutive `FORCE_SPOT_INTERRUPT` cycles (the flag already exists at
  line 417) → the job does **not** DLQ, contra today's 3-strike behaviour.
- `terraform plan` — assert no `destroy` on the scenes table, per §9.

**Rollback:** disable the EventBridge rule (one Terraform toggle) — recovery stops, nothing
corrupts. Revert the worker requeue change via AMI rollback. **Leave the GSIs in place**;
dropping them is slow and they are harmless.

---

### Task 6 — Quality as a first-class attempt attribute

**Purpose:** Issue 4 / target C1. Schema and API foundation; no concurrency yet.

**Changes**
- `job-config.js`: add named `QUALITY_PRESETS` (e.g. `draft` / `standard` / `high`) resolving
  to `trainConfig` + `colmapConfig` bundles. Keep explicit per-field overrides working and
  still validated by the existing allowlist — presets resolve *into* the current validator,
  they do not bypass it. `worker.py`'s `ALLOWED_KEYS` stay untouched (defence in depth).
- `submit-job.js`: accept `quality` (default `"standard"`, validated against a `Set` per §5
  rule 6); write it to the attempt row; include it in the SQS body and in `outputPrefix`
  (`.../output/<quality>/attempt-<id>/`) so outputs never collide.
- `attempt-patch.js`: on `SUCCEEDED`, write into the scene's `outputs.<quality>` map. Keep
  the legacy scalar `ply_key`/`output_prefix`/`output_bucket`/`output_size_bytes` pointing at
  the highest successful quality → **all existing readers keep working**.
- Storage accounting: `attempt-patch.js:252-281` currently deltas one scalar. Make the delta
  per-quality (`outputs.<quality>.output_size_bytes`) so N qualities are billed as N outputs.
- Frontend: add `quality` to `types/api.ts` and `SubmitJobOptions` in `jobsService.ts`;
  add a quality selector to the submit UI; render `outputs` when present, falling back to the
  legacy scalars.

**Files:** `backend/lib/job-config.js`, `backend/handlers/submit-job.js`,
`backend/handlers/attempt-patch.js`, `backend/handlers/scene-delete.js` (delete all
per-quality prefixes), `backend/lib/scene-view-key.js` (`listAttemptPrefixes` at line 74),
`backend/lib/storage-quota.js`, `frontend/types/api.ts`,
`frontend/services/jobsService.ts`, viewer/dashboard components

**Migration / backfill**
- **None required.** `quality` is absent on existing attempts → readers default to
  `"standard"`. `outputs` is absent on existing scenes → readers fall back to the scalars.
- **Optional** one-off backfill writing `outputs.standard` from the existing scalars, purely
  to simplify frontend code later. Recommend deferring; the fallback is cheap.
- ⚠️ `outputPrefix` shape changes for **new** attempts only. Existing prefixes
  (`${s3_key}/output/attempt-${id}/`) must remain readable — `scene-view-key.js` and
  `scene-download-output.js` need to handle both layouts. **This is the highest-risk detail
  in the task**: get the prefix-compatibility test in before shipping.

**API contract changes** (all backward compatible)
- `POST /jobs/submit` — accepts optional `quality`. Omitting it reproduces today's behaviour.
- `GET /scenes/{sceneId}` — gains an optional `outputs` object. Existing fields unchanged.
- `GET /admin/attempts` — each attempt gains `quality`.

**Risks**
- Storage quota drift if the per-quality delta logic is wrong. Reconcile against S3 in a
  dry run before enabling.
- `scene-delete.js` must delete **all** quality prefixes or orphan S3 objects accumulate and
  billed storage never decreases.
- Quality presets must not let a user smuggle an out-of-range value in via a preset name.

**Validation**
- Unit: preset resolution + rejection of unknown quality values.
- Unit: legacy scalars still point at the highest successful quality after a `high` success
  following a `standard` success.
- Unit: `scene-view-key.js` resolves both old and new prefix layouts.
- Integration: submit `standard`, then `high` → two attempt rows, two S3 prefixes, both
  present in `outputs`, storage total = sum of both.
- Integration: delete a multi-quality scene → zero objects left under the scene prefix.
- `npm run build`, `node -e "require('./upload')"`

**Rollback:** revert handlers; the `outputs` map is additive and simply goes unread. Any
outputs already written under the new prefix layout must stay reachable — so keep the
`scene-view-key.js` dual-layout support even on rollback, or the affected scenes break.
Ship that piece separately and first, if you want a clean revert boundary.

---

### Task 7 — Concurrent multi-quality processing

**Purpose:** Issue 5 / target C2, C3. Depends on 3, 5 and 6.

**Changes**
- `submit-job.js`: accept `qualities: string[]` — create one attempt row + one SQS message
  per quality. Charge quota per quality. Enforce a per-scene concurrency cap and check the
  tier cap **once** for the whole batch.
- Retire the scene-scalar `worker_token` (`submit-job.js:151`) as an auth source; each
  attempt already carries its own. Confirm nothing else reads `scene.worker_token`.
- Replace `last_attempt_id` as *the* cancel target: maintain `live_attempts` (quality →
  attemptId). `cancel-job.js` gains an optional `quality` — cancel one or all.
  Keep `last_attempt_id` written for backward compatibility.
- **Derived scene status** — add `backend/lib/scene-status.js` computing the rollup from
  live attempts (any `PROCESSING` → `PROCESSING`; else any `QUEUED` → `QUEUED`; else any
  success → `READY`; else all failed → `FAILED`; else resting). Both `attempt-patch.js` and
  `attempt-heartbeat.js` cascade through it instead of writing `mappedStatus` directly.
- Frontend: per-quality status rows on the scene card; per-quality cancel; multi-select
  submit. Progress display must pick one quality or aggregate deliberately — today the two
  cascade paths would fight over the scene's single progress field.

**Files:** `backend/handlers/submit-job.js`, `backend/handlers/cancel-job.js`,
`backend/handlers/attempt-patch.js`, `backend/handlers/attempt-heartbeat.js`,
`backend/lib/scene-status.js` (new), `frontend/components/splatworks/ScenesDashboardView.tsx`,
`frontend/lib/scenes/sceneMappers.ts`, `frontend/hooks/scenes/*`, `frontend/types/api.ts`

**Risks**
- ⚠️ **The central race.** N workers PATCH the same scene row concurrently. Last-write-wins
  on the scene's `status` and progress fields is exactly RC-5's blocker #2. The derived-status
  helper must recompute from live attempts under a conditional write, and even then two
  simultaneous rollups can interleave. Options: optimistic concurrency with a `version`
  attribute and bounded retry (recommended), or serialize via a DynamoDB Streams consumer
  (more machinery, stronger guarantee). Decide before implementing.
- Quota multiplication — submitting 3 qualities charges 3×. Must be explicit in the UI or
  users will be surprised.
- Cost multiplication — N qualities = N GPU instances. The ASG `max_size` cap
  (admin-managed) is the backstop; verify it is set appropriately before enabling.
- Progress semantics genuinely change for the dashboard. Needs a product decision, not just
  an implementation choice.

**Validation**
- Unit: derived status across every combination of live-attempt states.
- Unit: concurrent-PATCH simulation — final scene status is correct regardless of arrival order.
- Integration: submit 2 qualities → 2 instances, both complete, scene `READY` with both
  outputs, storage = sum.
- Integration: cancel one of two in-flight qualities → the other completes untouched, scene
  ends `READY`.
- Integration: cancel all → scene rests submittable, no orphan messages.

**Rollback:** cap `qualities` at length 1 server-side — restores single-quality behaviour
while keeping all schema and derived-status work in place. Cheapest rollback of any task.

---

### Task 8 — Reconcile `CLAUDE.md`

Fix the four documentation defects in §1 of this plan (FIFO vs standard, Lambda-vs-alarm
scale-out, non-existent S3 checkpointing, one-message-per-instance), and document the new
state model, the quality model, and the reaper. Documentation that describes behaviour the
code does not have caused RC-2 to go unnoticed — the `cancel-job.js` docstring asserted a
worker check that was never written.

---

## 7. Cross-cutting concerns

### Migrations and backfills

| Change | Backfill? |
|---|---|
| `quality` on attempts | No — absent reads as `"standard"` |
| `outputs` map on scenes | No — falls back to legacy scalars. Optional cosmetic backfill later |
| `lease_expires_at`, `interrupt_count` | No — absent means "no lease"; reaper must skip, not reap |
| `cancel_requested` | No — absent is falsy |
| `live_attempts` map | No — derive from `last_attempt_id` on first write |
| GSI `parent_scene_id-created_at-index` | Online backfill, no data migration |
| GSI `record_type-lease_expires_at-index` | Online backfill, no data migration |
| Output prefix layout | **No rewrite of existing objects.** Readers must support both layouts — the one genuinely risky compatibility surface |

### API contract changes (all additive)

| Endpoint | Change | Breaking? |
|---|---|---|
| `POST /jobs/submit` | + `quality`, + `qualities[]` | No |
| `POST /jobs/submit` | `CANCELLED` no longer 409s | No — strictly more permissive |
| `POST /jobs/{sceneId}/cancel` | + optional `quality` | No |
| `POST /api/attempts/{id}/heartbeat` | + `cancelRequested` in response | No |
| `PATCH /api/attempts/{id}` | `CANCELLED` short-circuit returns **409 not 200** | **Yes, for workers** — old AMIs treat it as failure→retry→DLQ rather than silently training a cancelled job. Strictly better, but it is a real behaviour change during AMI rollout |
| `GET /scenes/{sceneId}` | + `outputs` | No |
| `GET /admin/attempts` | + `quality` | No |

### Races and edge cases to design against

1. **Cancel vs. start** — cancel lands between `PutItem` and the worker's start PATCH.
   Covered by the pre-flight check + 409 (Tasks 1-2).
2. **Cancel vs. success** — worker finishes just as the user cancels. The conditional
   cascade decides deterministically; product must accept that a cancel can lose to a
   completion. Surface honestly in the UI.
3. **Reaper vs. slow worker** — double-processing. Generous lease + fencing token + idempotent
   attempt-scoped output writes.
4. **Concurrent submits (double-click)** — atomic live-attempt check (Task 3).
5. **Concurrent quality PATCHes** — the Task 7 headline risk; needs optimistic concurrency.
6. **Old and new AMIs in flight** — every backend change must tolerate both. The 409 change
   is the one with real teeth.
7. **Interrupt loop** — capped by `interrupt_count`.
8. **DLQ'd messages** — nothing redrives them today. Consider an admin redrive action;
   at minimum, the reaper should not resurrect an attempt whose message is in the DLQ
   without also clearing it, or you get duplicates.
9. **Cancel of an already-DLQ'd attempt** — attempt is `QUEUED`, no live message. The reaper
   must reconcile rather than requeue forever.
10. **Scene deletion mid-processing** — already partly handled via `delete_poison_message`;
    re-verify with N concurrent qualities.

---

## 8. Direct answers to the questions posed

**Why does a cancelled scene become non-resubmittable?**
`submit-job.js:25`'s `SUBMITTABLE` set omits `CANCELLED`, and the same three states are
hardcoded into the `ConditionExpression` at line 152.

**Is `CANCELLED` incorrectly treated as a terminal scene state instead of a terminal
processing-attempt state?**
Yes. `cancel-job.js` writes `CANCELLED` to the scene row, and the submit gate reads scene
status. Cancelling one training run is recorded as a permanent fact about the scene. The
attempt row is the correct home and already exists.

**Should queue entries be deleted, soft-invalidated, or ignored on consume?**
All three, layered — SQS cannot delete a specific unreceived message, so soft-invalidate in
DynamoDB is the durable truth; ignore-and-delete on consume handles queued cancels;
heartbeat-delivered stop handles in-flight cancels.

**Should resubmission create a new processing attempt record?**
Yes — it already does (`submit-job.js:178`). Preserve history; never mutate prior attempts.

**Best model for multiple qualities?**
One attempt row per (scene, quality) — option A in §5. Attempt rows already carry per-run
config, status, token and an isolated output prefix. Add a `quality` attribute plus a
per-quality `outputs` map on the scene, and derive scene status from live attempts. Standard
(non-FIFO) queues already permit same-scene parallelism with no infra change.

**How should the worker discover and continue pending work?**
Keep long-polling the same queue in the existing `while not stop_event.is_set()` loop —
remove the unconditional `terminate_self` at 4127-4139 and wire the already-present but
dead `RUN_ONCE` flag. `IDLE_EXIT_SECONDS` becomes the primary scale-to-zero trigger.

**How should interrupted jobs become retryable safely?**
Re-enqueue a fresh SQS message rather than zeroing visibility (so Spot interruptions stop
consuming `maxReceiveCount` slots), cap `interrupt_count`, and add a lease-based reaper for
hard crashes that send no PATCH at all — the only failure mode a worker-side fix cannot cover.

---

## 9. Suggested commit messages

```
fix(backend): make attempt cancellation terminal and guard scene cascade
feat(worker): honour cancellation via pre-flight check and heartbeat signal
fix(backend): allow resubmission after cancel; gate on live attempts
feat(worker): drain queue instead of one message per instance
feat(backend): lease-based attempt recovery with scheduled reaper
feat(backend): add quality dimension to training attempts
feat(backend): concurrent multi-quality submission with derived scene status
chore: reconcile CLAUDE.md with actual queue, scaling and worker behaviour
```

---

## 10. Recommended first step

**Task 1.** It is backend-only, needs no AMI bake, is trivially revertable, and makes
cancellation durable — the precondition for every other task. Tasks 1-3 together resolve the
reported 409 and the cancel/resubmit lifecycle; 4-5 cover worker continuation and recovery;
6-7 deliver multi-quality.

Two decisions are needed before Task 3 and Task 7 respectively:

1. **Does cancel-then-resubmit consume quota?** (recommend: not if the cancelled attempt
   never reached `PROCESSING`)
2. **Concurrency control for the scene-status rollup** — optimistic `version` attribute
   (recommend) or a DynamoDB Streams consumer.
