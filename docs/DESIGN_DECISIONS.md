# Splatial — Design Decisions & Trade-offs

> **Last updated:** 2026-06-29 | **Branch:** `dev`
>
> Lightweight ADR (Architecture Decision Record) log. Each entry states the
> **problem**, the **options** considered, the **decision**, and the **trade-off
> accepted**. This is the "why" behind the architecture in
> [`ARCHITECTURE_REFERENCE.md`](./ARCHITECTURE_REFERENCE.md) and
> [`SOCIAL_FEATURES_REFERENCE.md`](./SOCIAL_FEATURES_REFERENCE.md).

---

## ADR-01 — Asynchronous pipeline, training off the request path

- **Problem:** 3DGS training (SfM + optimization) takes minutes to hours; an HTTP
  request cannot wait for it, and Lambda has a 15-minute ceiling.
- **Options:** (a) run training inside Lambda; (b) synchronous EC2 call from the
  API; (c) decouple via a queue and a worker fleet.
- **Decision:** the API returns `202`/queued immediately; jobs flow through **SQS**
  to **EC2 GPU workers**. Lambda only orchestrates metadata and state.
- **Trade-off:** added moving parts (queue, worker lifecycle, state machine) in
  exchange for an API that never blocks and compute that scales independently.

## ADR-02 — Spot-first GPU compute with scale-to-zero

- **Problem:** GPU instances are expensive; the workload is bursty and
  interruption-tolerant.
- **Options:** always-on GPU; on-demand per job; **Spot** with checkpointing.
- **Decision:** G4dn **Spot** ASG, desired=0 at rest, scaled out on queue depth;
  on Spot interruption the worker checkpoints to S3 and re-queues the job.
- **Trade-off:** must handle interruption and idempotency carefully; in return,
  large cost savings and no idle GPU spend.

## ADR-03 — Zero-buffer upload path (browser → S3 directly)

- **Problem:** capture datasets are large; API Gateway/Lambda payload limits and
  cost make proxying bytes through the API a non-starter.
- **Options:** multipart upload through Lambda; **presigned multipart direct to
  S3**.
- **Decision:** Lambda issues presigned multipart URLs; the **browser uploads
  directly to S3**. Lambda never receives binary data.
- **Trade-off:** more client-side upload logic; in return, no payload bottleneck
  and minimal Lambda cost/time.

## ADR-04 — Infrastructure as Code, three environments, no console drift

- **Problem:** reproducibility and safe promotion across dev/staging/prod.
- **Decision:** the entire AWS stack is **Terraform** with remote S3 state +
  DynamoDB locking and per-environment roots; `prod` adds `prevent_destroy` and
  KMS. File-per-concern module layout.
- **Trade-off:** more upfront IaC effort vs. click-ops; in return, auditable,
  repeatable infrastructure.

## ADR-05 — Zero standing credentials in CI (GitHub OIDC)

- **Problem:** long-lived AWS keys in CI are a major leak risk.
- **Decision:** GitHub Actions assumes a deploy role via **OIDC**, scoped to the
  exact `repo:…:environment:<env>`. No static keys anywhere.
- **Trade-off:** slightly more IAM/trust setup; in return, no credential to leak or
  rotate.

## ADR-06 — Single Lambda router vs. function-per-route

- **Problem:** dozens of small endpoints (scenes + the social layer).
- **Options:** one Lambda per route; **one router Lambda** switching on
  `routeKey`.
- **Decision:** a single Node.js router (`backend/upload.js`) delegating to one
  handler file per route, packaged by Terraform.
- **Trade-off:** all routes share a cold-start/deploy unit and IAM role (coarser
  blast radius) — accepted for a small team because it keeps deploys, local
  reasoning, and shared helpers simple. Splitting later is mechanical if needed.

## ADR-07 — Table-per-domain vs. single-table DynamoDB

- **Problem:** model profiles, follows, reactions, comments, notifications,
  bookmarks, shots, tours.
- **Options:** one generic single-table design; **a table per domain**.
- **Decision:** a table per domain, each with keys chosen for its primary access
  pattern (and a sparse GSI where a filtered listing needs it).
- **Trade-off:** more tables and some cross-table transactions vs. the cognitive
  load and migration risk of a single-table redesign on a live system. For an
  incrementally-shipped social layer, per-domain tables were far lower-risk.

## ADR-08 — Denormalized identity + transactional counters

- **Problem:** list endpoints must not do N+1 profile lookups; counts must stay
  consistent with the rows they summarize.
- **Decision:** copy author/owner identity onto child records at write time;
  mutate counters with **`TransactWriteItems`** (idempotent, non-negative).
- **Trade-off:** denormalized fields can go stale on rename (refreshed at the next
  relevant write) and transactions cost a little more — accepted for correct,
  cheap reads.

## ADR-09 — Personalized feed: fan-out on read (for now)

- **Problem:** show scenes from everyone a user follows, newest-first.
- **Options:** fan-out on **read** (query per followee at request time); fan-out on
  **write** (materialize each follower's feed).
- **Decision:** fan-out on **read**, bounded to 500 followees, merging per-followee
  queries against a sparse public-scene index.
- **Trade-off:** read cost scales with follow count; chosen because it needs no
  extra storage/eventing and is correct from day one. Upgrade path documented
  (materialized feed table) if scale demands it.

## ADR-10 — Static export frontend + CloudFront routing

- **Problem:** host a Next.js app cheaply behind a CDN with no SSR server.
- **Decision:** **static export** (`output: 'export'`) to S3 + CloudFront; a
  CloudFront Function rewrites extensionless and dynamic routes (e.g. `/u/*`) to
  the right static shell, and the client resolves dynamic params at runtime.
- **Trade-off:** dynamic routes need an explicit CloudFront rewrite (a known
  gotcha, documented), and there's no server rendering — accepted for a
  static-friendly app in exchange for near-zero hosting cost and simplicity.

## ADR-11 — Best-effort secondary effects (notifications)

- **Problem:** emitting a notification shouldn't be able to fail a follow, react,
  or comment.
- **Decision:** notification emission is wrapped and **best-effort** (errors
  logged, swallowed); the primary write is the source of truth.
- **Trade-off:** a rare missed notification vs. never breaking a core action —
  the right call for a secondary feature.

## ADR-12 — Remix copies output, not the training project

- **Problem:** "fork" a scene without re-running GPU training.
- **Decision:** server-side `CopyObject` of the resolved `.splat`/`.ply` + thumbnail
  into the forker's space; new PRIVATE scene with lineage.
- **Trade-off:** the fork is viewable/remixable but **not re-trainable** (raw images
  and manifest aren't copied), and single-part copy caps at 5 GB — accepted to keep
  forking instant and cheap; multipart copy / fork-and-retrain are future work.

---

*These decisions are deliberately revisitable. Each "trade-off accepted" line is
also the trigger condition for revisiting it.*
