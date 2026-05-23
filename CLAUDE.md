# Splatial — Agent Instructions

Persistent system instructions for AI assistants working in this repository. Read this file at the start of every session before making changes.

---

## 1. Project Overview

**Splatial** is a cloud-native **3D Gaussian Splatting** pipeline: users upload photo or video captures from a browser, GPU workers train a radiance field on EC2 Spot instances, and the resulting splats are served for real-time WebGL/WebGPU viewing.

### Architecture (high level)

```
Browser (Next.js)
  │
  ├─ Cognito JWT auth ─────────────────────► API Gateway HTTP API (Cognito Authorizer)
  │                                              │
  │                                              ▼
  │                                         Upload Lambda (Node.js 18)
  │                                              │
  │                                    ┌─────────┴──────────┐
  │                                    │ DynamoDB ScenesTable│
  │                                    │ S3 raw-scenes bucket│
  │                                    └─────────┬──────────┘
  │                                              │
  │                                              ▼
  │                                         SQS job queue
  │                                              │
  │                                              ▼
  │                                    EC2 Spot GPU workers (G4dn/G5 ASG)
  │                                    Python worker polls SQS, trains, checkpoints to S3
  │                                              │
  └─ CloudFront ◄── S3 static site + processed assets
```

**Core design principles:**

- **Asynchronous decoupling** — The API returns immediately (`202` / `QUEUED`); training runs on GPU workers via SQS, not inside Lambda (15-minute limit).
- **Zero-buffer upload path** — Lambda never receives binary data. The browser uploads directly to S3 via presigned multipart URLs; Lambda only orchestrates metadata and state.
- **Spot-first compute** — EC2 G4dn/G5 Spot ASG with S3 checkpointing and SQS re-queuing on interruption.
- **Zero standing credentials** — GitHub Actions deploys via OIDC; no long-lived AWS keys in CI.
- **Infrastructure as Code** — Full AWS stack (VPC, S3, CloudFront, API Gateway, Lambda, DynamoDB, SQS, Cognito, ACM, Route 53) defined in Terraform modules with `dev`, `staging`, and `prod` environment roots.

**Authoritative references:**

- [`docs/architecture.md`](docs/architecture.md) — Full technical deep-dive (VPC, IAM, spot recovery, scaling).
- [`CONTEXT.md`](CONTEXT.md) — Machine-readable component map and milestone status.

---

## 2. Directory Structure

The repo has **three distinct code boundaries**. Do not mix concerns across them.

```
splatial/
├── site/my-app/          # Frontend — Next.js App Router (TypeScript)
├── infra/                # Infrastructure — Terraform HCL + Lambda handlers
├── worker/               # GPU worker — Python SQS consumer (runs on EC2)
├── docs/                 # Architecture docs, Postman collections
└── .github/workflows/    # CI/CD (lint, terraform apply, Next.js build, S3 sync)
```

### Frontend (`site/my-app/`)

| Path | Purpose |
|---|---|
| `app/` | App Router pages (`/`, `/scenes`) |
| `components/` | React UI (`Dropzone`, `ScenesDashboard`, `AuthGate`, shadcn/ui primitives) |
| `hooks/` | Business logic (`useMultipartUpload.ts`) |
| `lib/` | Amplify config, API base URL, `cn()` helper |
| `utils/` | `authenticatedFetch` — all API calls go through here |
| `types/` | Shared API request/response TypeScript types |

Legacy static fallback pages live in `site/index.html` and `site/error.html` (CloudFront error pages).

### Infrastructure (`infra/`)

| Path | Purpose |
|---|---|
| `bootstrap/` | One-time remote state backend (S3 bucket + encryption) |
| `envs/dev\|staging\|prod/` | Environment root modules — **run Terraform from here** |
| `modules/static-site/` | Primary module: VPC, S3, CloudFront, Cognito, Lambda, DynamoDB, SQS, ASG |
| `modules/api-gateway-domain/` | Custom API domain + ACM + Route 53 |
| `modules/static-site/src-upload/` | Upload Lambda source (Node.js 18, CommonJS, no build step) |

Lambda handler layout:

```
src-upload/
├── upload.js              # Router: maps API Gateway routeKey → handler
├── handlers/              # init, presign, complete, scene-*, submit-job, cancel-job, …
└── lib/response.js        # Shared HTTP response envelope
```

### GPU Worker (`worker/`)

| Path | Purpose |
|---|---|
| `worker.py` | SQS long-poll loop, S3 download/upload, spot interruption handling |
| `imds_extract.py` | IMDSv2 metadata discovery |

The worker runs on EC2 Spot instances bootstrapped by the ASG defined in `infra/modules/static-site/compute.tf`. It is **not** part of the Node.js frontend or Lambda codebase.

---

## 3. Tech Stack & Tooling

### Runtime prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 24 |
| npm | ships with Node |
| Python | ≥ 3.10 (worker development) |
| Terraform | ≥ 1.10 (`versions.tf`); CI pins 1.9.0 |
| AWS CLI | ≥ 2.x (configured) |
| CUDA Toolkit | ≥ 11.8 (GPU training only) |

### Frontend (`site/my-app/`)

| Package | Version | Role |
|---|---|---|
| `next` | 16.2.6 | App framework, static export for S3 deploy |
| `react` / `react-dom` | 19.2.4 | UI runtime |
| `typescript` | ^5 | Strict typing |
| `tailwindcss` | ^4 | Utility CSS |
| `aws-amplify` | ^6.17.0 | Cognito auth |
| `@aws-amplify/ui-react` | ^6.15.4 | Auth UI components |
| `eslint` + `eslint-config-next` | ^9 / 16.2.6 | Linting |
| `shadcn` / `@radix-ui` | ^4.7.0 / ^1.x | Component primitives |

> **Important:** This project uses **Next.js 16**, not Next.js 14. APIs and conventions may differ from older training data. Read guides in `node_modules/next/dist/docs/` before writing Next.js code. See also `site/my-app/AGENTS.md`.

Production builds use `output: "export"` (static HTML) for S3 + CloudFront deployment. Dev server uses API rewrites to proxy `/api/*` to API Gateway (avoids CORS).

### Lambda handlers (`infra/modules/static-site/src-upload/`)

| Package | Version | Role |
|---|---|---|
| Node.js runtime | 18.x | Lambda execution environment |
| `@aws-sdk/client-s3` | ^3.x | S3 multipart orchestration |
| `@aws-sdk/client-dynamodb` | ^3.x | Scene state persistence |
| `@aws-sdk/client-sqs` | ^3.x | Job queue dispatch |
| `@aws-sdk/s3-request-presigner` | ^3.x | Presigned part URLs |

Style: CommonJS (`"use strict"`, `require()`), plain functions, no transpilation.

### Terraform (`infra/`)

| Provider | Version |
|---|---|
| Terraform | `>= 1.10.0` |
| `hashicorp/aws` | `~> 6.0` |
| `hashicorp/archive` | `~> 2.0` |
| `hashicorp/null` | `~> 3.0` |
| `hashicorp/time` | `~> 0.12` |

- **Region:** `us-east-1` (all environments)
- **Domain:** `openspacenexus.store` hosted zone; sites at `splatial-<env>.openspacenexus.store`; API at `api-<env>.openspacenexus.store`
- **Remote state:** S3 bucket `openspacenexus-terraform-state` with lockfile (`infra/envs/*/backend.tf`)

### CI/CD (`.github/workflows/deploy.yml`)

| Branch | Environment | Terraform root |
|---|---|---|
| `dev` | Development | `infra/envs/dev` |
| `staging` | Staging | `infra/envs/staging` |
| `main` | Production | `infra/envs/prod` |

Pipeline: ESLint → `terraform fmt -check` → `terraform apply` → `next build` → S3 sync → CloudFront invalidation. Authenticates via GitHub OIDC role `splatial-<env>-github-deploy-role`.

---

## 4. Build & Run Commands

### Frontend — install & dev server

```bash
cd site/my-app
npm install          # or: npm ci
npm run dev          # http://localhost:3000
```

Create `.env.local` with Terraform outputs before running locally:

```env
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_USER_POOL_ID=<cognito_user_pool_id>
NEXT_PUBLIC_CLIENT_ID=<cognito_client_id>
NEXT_PUBLIC_API_GATEWAY_URL=<api_endpoint>
NEXT_PUBLIC_RAW_SCENES_BUCKET=<raw_scenes_bucket_name>
NEXT_PUBLIC_SCENES_TABLE=<scenes_table_name>
```

### Frontend — lint, build, production serve

```bash
cd site/my-app
npm run lint
npm run build        # static export → ./out/
npm run start        # serve production build locally (optional)
```

### Lambda handlers — install dependencies

Dependencies are installed automatically by Terraform's `null_resource` provisioner during `terraform apply`. For local syntax checks:

```bash
cd infra/modules/static-site/src-upload
npm install
node -e "require('./upload')"
```

### Terraform — bootstrap (once per AWS account)

```bash
cd infra/bootstrap
terraform init
terraform apply
```

### Terraform — deploy an environment

```bash
cd infra/envs/dev        # or staging / prod
terraform init
terraform plan
terraform apply
```

Format and validate before committing infra changes:

```bash
cd infra
terraform fmt -recursive
cd envs/dev              # pick target environment
terraform validate
terraform plan
```

Copy example vars before first deploy:

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
# Edit domain, account ID, region as needed
```

### GPU worker (local development)

```bash
cd worker
python3 worker.py        # requires AWS credentials and queue configuration via env vars
```

---

## 5. Coding Conventions

### General agent behavior

1. **Minimize scope** — Smallest correct diff. Do not refactor unrelated code.
2. **No placeholders** — No `# TODO`, `"REPLACE_ME"`, or incomplete Terraform blocks.
3. **Security by default** — Least-privilege IAM, private S3, input validation at every Lambda entry point, no secrets in code.
4. **Plan before code** — For non-trivial changes, outline the approach first.
5. **One concern per change** — Do not mix frontend, infra, and worker edits unless explicitly requested.

### Git commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>
```

| Type | Use for |
|---|---|
| `feat` | New feature or resource |
| `fix` | Bug or error fix |
| `refactor` | Restructure without behavior change |
| `docs` | Documentation only |
| `style` | Formatting (e.g. `terraform fmt`) |
| `chore` | Deps, config, CI |
| `security` | IAM, policy, auth hardening |

Common scopes: `frontend`, `infra`, `backend`, `lambda`, `iam`, `upload`, `auth`.

Subject line: ≤ 50 characters, imperative mood, no trailing period.

Do **not** commit automatically unless explicitly asked.

---

### Frontend (TypeScript / Next.js)

- **App Router only** — Pages live under `app/`. No `pages/` directory.
- **`"use client"`** only when the component uses hooks, event handlers, browser APIs, or refs. Server Components are the default.
- **`strict: true`** — Never use `any`. Prefer `unknown` and narrow. Avoid `!` non-null assertions.
- **API types** — Declare all request/response shapes in `types/api.ts`. Do not inline ad-hoc types in components.
- **Path alias** — `@/*` maps to `site/my-app/*` (see `tsconfig.json`).
- **Auth** — All authenticated requests via `utils/apiClient.ts` (`authenticatedFetch`). Never call `fetch` with raw JWTs. Do not store tokens in `localStorage`.
- **API URL** — Read from `lib/apiBaseUrl.ts` (`getApiBaseUrl()`). No hardcoded stage URLs in components.
- **Upload logic** — Extend `hooks/useMultipartUpload.ts`; do not duplicate multipart logic elsewhere.
  - Part size: `5 * 1024 * 1024` (S3 minimum).
  - Concurrency: 6 parallel PUTs (homepage) / 4 (ScenesDashboard).
- **UI** — Use shadcn/ui primitives from `components/ui/`. Conditional classes via `cn()` from `lib/utils.ts`.
- **3D rendering** — Lazy-load with `next/dynamic` and `{ ssr: false }`. Offload CPU-heavy splat sorting to Web Workers.
- **Lint** — ESLint flat config (`eslint.config.mjs`) extends `eslint-config-next/core-web-vitals` and `typescript`.

Scoped rules: [`site/copilot-instructions.md`](site/copilot-instructions.md)

---

### Lambda handlers (Node.js 18 / CommonJS)

- **SDK v3 only** — `@aws-sdk/client-*`. No `aws-sdk` v2.
- **Client reuse** — Instantiate `S3Client`, `DynamoDBClient`, etc. at module scope (outside handlers).
- **No classes** — Plain functions with `module.exports`.
- **Validation order** (every handler):
  1. Extract `userId` from `event.requestContext.authorizer.jwt.claims.sub` → `401` if absent.
  2. Parse `event.body` in try/catch → `400` on malformed JSON.
  3. Validate required strings: `typeof x === "string" && x.trim() !== ""`.
  4. Sanitize filenames: `filename.replace(/[^a-zA-Z0-9._\-]/g, "_")`.
  5. Verify S3 key ownership: `key.startsWith(\`uploads/${userId}/\`)` → `403` if false.
- **Responses** — Use shared `lib/response.js` helper. Do not inline response construction.
- **Errors** — `console.error("context", { route, err })`. Do not log raw `event` objects (may contain tokens).
- **Memory** — Never buffer large binary files (> 1 MB) into memory. Stream S3 bodies.
- **Presigned URLs** — `expiresIn: 3600` maximum for upload presigns.

Scoped rules: [`infra/copilot-instructions.md`](infra/copilot-instructions.md) (Part 2)

---

### Terraform (HCL)

- **File-per-concern** — One AWS service per file (`s3.tf`, `dynamodb.tf`, `network.tf`, etc.). Create a new file when adding a service.
- **Provider alias** — All module resources use `provider = aws.this`. The alias pattern is mandatory.
- **Variables** — Every `variable` block requires `description` and `type`. Use `validation {}` for enums (e.g. `environment ∈ {dev, staging, prod}`).
- **Outputs** — Every `output` requires `description` and `value`.
- **Locals** — Computed name prefixes in `locals {}` (e.g. `local.name_prefix = "${var.project_name}-${var.environment}"`). Do not repeat interpolations inline.
- **Formatting** — Run `terraform fmt -recursive` before committing. CI runs `terraform fmt -check -recursive`.
- **No hardcoded account IDs** — Use `data "aws_caller_identity"` and `data "aws_region"`.
- **Tags** — Minimum: `Name`, `Environment`, `Project`, `ManagedBy = "terraform"`.
- **S3 security** (every bucket):
  - `aws_s3_bucket_public_access_block` (all four flags `true`)
  - `aws_s3_bucket_ownership_controls` (`BucketOwnerEnforced`)
  - `aws_s3_bucket_server_side_encryption_configuration` (`AES256` or `aws:kms` in prod)
  - `aws_s3_bucket_versioning` (`Enabled`)
- **IAM** — No wildcard `"*"` in `actions` or `resources` unless AWS API has no resource-level scope (comment why). Use `data "aws_iam_policy_document"` with discrete `statement {}` blocks and CamelCase `sid` values.
- **Ordering** — Use `depends_on` when references alone don't capture ordering (e.g. `time_sleep.iam_propagation`).
- **Prod safety** — `lifecycle { prevent_destroy = true }` on stateful resources in prod.

Scoped rules: [`infra/copilot-instructions.md`](infra/copilot-instructions.md) (Part 1)

---

### GPU Worker (Python)

- Runs on EC2 Spot instances; not deployed via the Next.js or Lambda toolchain.
- Uses IMDSv2 for region/instance discovery (`imds_extract.py`).
- Long-polls SQS, extends visibility timeout, handles spot interruption signals, checkpoints to S3.
- Configure via environment variables (see docstring in `worker/worker.py`).

---

## Environment Mapping

| Git branch | GitHub environment | Terraform root | Site URL pattern |
|---|---|---|---|
| `dev` | `development` | `infra/envs/dev` | `splatial-dev.openspacenexus.store` |
| `staging` | `staging` | `infra/envs/staging` | `splatial-staging.openspacenexus.store` |
| `main` | `production` | `infra/envs/prod` | `splatial.openspacenexus.store` (prod domain) |

Dev environment includes `http://localhost:3000` in `cors_extra_origins` for local frontend development.

---

## Verification Checklists

After making changes, run the appropriate checks:

**Frontend:**
```bash
cd site/my-app && npm run lint && npm run build
```

**Lambda:**
```bash
cd infra/modules/static-site/src-upload && node -e "require('./upload')"
```

**Terraform:**
```bash
cd infra && terraform fmt -recursive
cd envs/dev && terraform validate && terraform plan
```

**IAM changes:** Review plan output for unexpected `"*"` wildcards.

---

## Trigger Commands

These phrases are hard triggers defined in [`.github/copilot-instructions.md`](.github/copilot-instructions.md):

- **"Update Context"** — Update `CONTEXT.md` only if architectural changes occurred.
- **"Log changes"** — Generate a structured commit message from the current diff.
