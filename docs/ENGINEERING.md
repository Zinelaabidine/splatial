# Splatial — Engineering Practices

> **Last updated:** 2026-06-29 | **Branch:** `dev`
>
> How the project is built, validated, and shipped. For *what* it is see the
> [root README](../README.md); for *why* see [`DESIGN_DECISIONS.md`](./DESIGN_DECISIONS.md).

---

## 1. Environments

| Env | Domain | Notes |
|---|---|---|
| `dev` | `splatial-dev.openspacenexus.store` | CORS allows `localhost:3000` |
| `staging` | `splatial-staging.openspacenexus.store` | Mirrors prod, no localhost |
| `prod` | `splatial.openspacenexus.store` | `prevent_destroy`, KMS encryption |

Each environment is a Terraform root under `infra/envs/<env>` with its own remote
S3 state + DynamoDB lock table. API custom domain pattern: `api-<env>.openspacenexus.store`.

## 2. CI/CD pipeline

`.github/workflows/deploy.yml` runs on push to `dev`/`staging`/`main`.

- **Auth:** GitHub **OIDC** assumes a per-environment deploy role — no long-lived
  AWS keys.
- **Change detection (cost optimization):** a `dorny/paths-filter` job computes
  whether `frontend/`, `backend/`, or `infra/` changed. Then:
  - `terraform apply` runs only when **infra or backend** changed (the Lambda is
    packaged by Terraform, so backend changes deploy via apply);
  - the frontend **build → S3 sync → CloudFront invalidation** runs only when
    **frontend** changed (it reads Terraform outputs for env config).
- **Guards:** `concurrency: cancel-in-progress` cancels superseded runs;
  `timeout-minutes` caps every job; `paths-ignore` skips docs/markdown/scripts/worker/
  cursor files so documentation commits don't deploy.
- **Net effect:** an Infra+Backend push and a Frontend push each run only their
  relevant half — roughly half the CI minutes per push.

## 3. Local validation gate (run before every push)

The project is built **locally-first**: catch errors on your machine so each push
is a single, clean deploy. The same checks CI runs, plus a dev `plan`:

```bash
# Backend (backend/)
npm ci
node -e "require('./upload.js')"          # router loads; no syntax/require errors

# Frontend (frontend/)
npm ci && npm run lint && npm run build    # zero TS/ESLint errors; static export ok

# Infra (from infra/ and infra/envs/dev)
terraform fmt -check -recursive
terraform init && terraform validate && terraform plan   # review the diff
```

One-shot helper and git hook:

```bash
./scripts/install-git-hooks.sh   # install the pre-commit hook once per clone
./scripts/pre-commit-check.sh    # run the same checks manually anytime
```

`pre-commit-check.sh` validates `terraform fmt`, `terraform validate` for **dev,
staging, and prod** (via `init -backend=false`, no AWS creds), frontend ESLint, and
backend `require('./upload.js')`.

## 4. Testing & verification strategy

This is an infrastructure-heavy project; correctness is enforced through layered
checks rather than a single unit-test suite:

- **Static guarantees:** TypeScript `strict` on the frontend; ESLint; `terraform
  validate` + `fmt`.
- **Plan review:** every infra change is inspected via `terraform plan` against
  `dev`; an unexpected `destroy` is treated as a blocker.
- **Router/handler sanity:** `require('./upload.js')` proves the Lambda loads and
  every route is wired.
- **Per-feature manual verification:** each feature shipped with an explicit
  API-level and UI checklist (see the prompts/PRs) exercised on `dev`.

> **Honest gap / next step:** there is no automated unit/integration test suite yet.
> Highest-value additions would be handler-level unit tests for the validation and
> transactional-counter logic, and a smoke test in CI post-deploy.

## 5. Coding standards (enforced by `CLAUDE.md`)

- **Backend (Lambda):** Node.js 18 **CommonJS**, `"use strict"`, **AWS SDK v3**
  only; SDK clients instantiated outside the handler; strict input-validation order
  (auth → parse → validate → sanitize → ownership); responses via `lib/response.js`;
  never log raw `event` objects or tokens; never buffer large S3 objects.
- **Frontend:** App Router only; TS `strict`, no `any`; all authenticated calls via
  `authenticatedFetch`; API base URL via `getApiBaseUrl()`; no JWT in
  `localStorage`/`sessionStorage`; shadcn/ui primitives + Tailwind; heavy 3D
  lazy-loaded with `{ ssr: false }`.
- **Terraform:** file-per-concern; `local.name_prefix` naming; required tags on
  every resource; least-privilege IAM (no wildcard actions/resources where a scope
  exists); private-by-default S3 (public-access-block + ownership + encryption +
  versioning); remote state only.

## 6. Delivery workflow (how features ship)

Each feature is delivered as two deployable units — **Infra+Backend** then
**Frontend** — so the API stabilizes before the UI builds on it, the blast radius
stays small, and the path-filtered CI runs only the relevant half. Commits follow
**Conventional Commits** (`feat(scope): …`, `fix(scope): …`, `docs: …`).

---

See [`logging-spec.md`](./logging-spec.md) for the structured-logging contract and
[`ARCHITECTURE_REFERENCE.md`](./ARCHITECTURE_REFERENCE.md) for the full as-built
system.
