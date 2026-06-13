# CLAUDE.md — Splatial Persistent System Instructions

> This file is the authoritative architectural memory and coding-session contract for all AI assistants working in this repository. Read it in full before writing any code or infrastructure changes.

---

## 1. Architecture Overview

Splatial is a **3D Gaussian Splatting (3DGS) platform** that lets authenticated users upload raw scene assets (images or video), queue GPU training jobs, and stream the resulting `.splat` output files to an in-browser WebGL/WebGPU renderer.

### Request / Data Flow

```
Browser (Next.js)
  |  Cognito JWT auth  (AWS Amplify)
  v
API Gateway  -->  Lambda (Node.js 18 / CommonJS, src-upload/)
                      |  writes metadata
                      v
                  DynamoDB  (scene records, job status)
                      |  presigns PUT URLs
                      v
                  S3 - raw-scenes bucket  (multipart upload)
                      |  on upload complete
                      v
                  SQS FIFO queue  (splat-processing-queue.fifo)
                      |
                      v
               EC2 ASG - G4dn Spot workers  (Python worker.py)
                      |  downloads assets, runs 3DGS training
                      v
                  S3 - output bucket  (manifest.json + .splat)
                      |
                      v
               CloudFront  <--  Browser streams .splat file
```

### Core Design Principles

- **Asynchronous decoupling** — The API returns immediately (`202 QUEUED`); training runs on GPU workers via SQS, never inside Lambda (15-minute limit).
- **Zero-buffer upload path** — Lambda never receives binary data. The browser uploads directly to S3 via presigned multipart URLs; Lambda only orchestrates metadata and state.
- **Spot-first compute** — EC2 G4dn Spot ASG with S3 checkpointing and SQS re-queuing on interruption.
- **Zero standing credentials** — GitHub Actions deploys via OIDC; no long-lived AWS keys in CI.
- **Infrastructure as Code** — Full AWS stack defined in Terraform with `dev`, `staging`, and `prod` environment roots.

### Environments

| Environment | Domain | Notes |
|---|---|---|
| `dev` | `splatial-dev.openspacenexus.store` | `cors_extra_origins` includes `localhost:3000` |
| `staging` | `splatial-staging.openspacenexus.store` | Mirrors prod config, no localhost |
| `prod` | `splatial.openspacenexus.store` | `prevent_destroy = true`, KMS encryption |

API Gateway custom domain pattern: `api-<env>.openspacenexus.store`

---

## 2. Repository Structure

```
splatial/
├── infra/                          # <- ALL infrastructure lives here (Terraform only)
│   ├── bootstrap/                  #   One-time S3 backend + DynamoDB lock table
│   ├── envs/
│   │   ├── dev/                    #   Environment-specific entry points
│   │   ├── staging/
│   │   └── prod/
│   └── modules/
│       ├── static-site/            #   Primary Terraform module (all AWS resources)
│       │   ├── src-upload/         #   <- Lambda handler source (Node.js 18, CommonJS)
│       │   │   ├── upload.js       #     Router / entry point
│       │   │   ├── handlers/       #     One file per API route
│       │   │   └── lib/            #     Shared helpers (response.js)
│       │   └── *.tf                #   One .tf file per AWS service
│       └── api-gateway-domain/     #   Custom domain + Route53 wiring
├── site/
│   └── my-app/                     # <- ALL frontend lives here (Next.js / TypeScript)
│       ├── app/                    #   App Router pages and layouts
│       ├── api/                    #   HTTP client and API base URL
│       ├── components/             #   React UI (ui/, layout/, upload/, viewer/, dashboard/)
│       ├── hooks/                  #   Custom React hooks (upload/, viewer/)
│       ├── lib/                    #   Auth bootstrap, cn() helper
│       ├── types/                  #   Shared TypeScript types
│       ├── viewer/                 #   WebGL engine and trajectory math (non-React)
│       └── fixtures/               #   Dev/mock data
└── worker/
    ├── worker.py                   # <- Python SQS worker (runs on EC2 Spot)
    └── imds_extract.py             #   IMDSv2 metadata helper
```

### Hard Boundary Rules

- **Infrastructure changes belong exclusively in `infra/`.** Never modify `.tf` files to work around application bugs — fix the application.
- **Application logic belongs exclusively in `site/my-app/` (frontend) and `infra/modules/static-site/src-upload/` (Lambda).** Never embed business logic in `user_data`, `aws_lambda_function` inline code, or Terraform `local-exec` provisioners.
- **The worker (`worker/`) is deployed as a pre-baked AMI** (`ami-0512a845e4b778621` in us-east-1). Changes to `worker.py` require a new AMI bake and an update to `locals.worker_ami_id` in `compute.tf`. Do not auto-update the AMI reference without a tested build.

---

## 3. Tech Stack & Tooling

### Frontend — `site/my-app/`

| Item | Version / Detail |
|---|---|
| Framework | Next.js `16.2.6` — App Router exclusively |
| Language | TypeScript `^5`, `strict: true` |
| React | `19.2.4` |
| Styling | Tailwind CSS `^4`, `tw-animate-css` |
| UI Primitives | `shadcn/ui ^4.7`, `@radix-ui/react-progress`, `@base-ui/react` |
| Auth / API | AWS Amplify `^6.17.0`, `@aws-amplify/ui-react ^6.15.4` |
| Icons | `lucide-react ^1.16.0` |
| Class Utilities | `clsx`, `tailwind-merge`, `class-variance-authority` |
| Linting | `eslint ^9`, `eslint-config-next 16.2.6` |

### Lambda Handlers — `infra/modules/static-site/src-upload/`

| Item | Version / Detail |
|---|---|
| Runtime | Node.js `18.x`, CommonJS (`"use strict"`, `require()`) |
| AWS SDK | `@aws-sdk/client-s3 ^3`, `@aws-sdk/client-dynamodb ^3`, `@aws-sdk/client-sqs ^3` |
| Presigning | `@aws-sdk/s3-request-presigner ^3` |

### Infrastructure — `infra/`

| Item | Version / Detail |
|---|---|
| Terraform | `>= 1.10.0` |
| AWS Provider | `hashicorp/aws ~> 6.0` |
| Archive Provider | `hashicorp/archive ~> 2.0` |
| Null / Time Providers | `~> 3.0` / `~> 0.12` |
| Primary AWS Region | `us-east-1` |
| Remote State Backend | S3 + DynamoDB lock table (see `infra/envs/*/backend.tf`) |

### GPU Worker — `worker/`

| Item | Detail |
|---|---|
| Language | Python 3 |
| Instance type | `g4dn.xlarge` (default), Spot `one-time` |
| Key env vars | `QUEUE_NAME`, `DLQ_NAME`, `VISIBILITY_TIMEOUT_SECONDS`, `IDLE_EXIT_SECONDS` |
| Scale-to-zero | ASG desired=0 at rest; Lambda increments desired on job submission |

### AWS Services in Use

S3 (static site + raw scenes + output), CloudFront, API Gateway (REST), Lambda, DynamoDB, SQS FIFO (queue + DLQ), Cognito User Pool, EC2 ASG + Launch Template (Spot), ACM (wildcard `*.openspacenexus.store`), Route53, IAM (OIDC for GitHub Actions, instance profiles, Lambda exec roles), VPC (public + private subnets, NAT gateways, S3 Gateway Endpoint).

---

## 4. Local Development & Commands

### Frontend

```bash
# Install dependencies
cd site/my-app
npm install

# Start dev server (proxies to dev API endpoint)
npm run dev       # http://localhost:3000

# Type-check & build (must pass before any merge)
npm run build

# Lint
npm run lint
```

### Lambda Handlers

```bash
# Install dependencies
cd infra/modules/static-site/src-upload
npm install

# Syntax / require sanity check (no test framework configured)
node -e "require('./upload')"
```

### Terraform

```bash
# --- Bootstrap (one-time, per account) ---
cd infra/bootstrap
terraform init
terraform apply

# --- Environment operations (replace <env> with dev | staging | prod) ---
cd infra/envs/<env>

terraform init                        # initialise with remote S3 backend

terraform fmt -recursive ../../       # format all HCL before planning
terraform validate                    # structural validation

terraform plan                        # review before applying
terraform apply                       # requires explicit approval; never use -auto-approve in prod

# Destroy (requires confirmation; never run on prod without a full backup plan)
terraform destroy
```

> **Never use local state.** The `backend.tf` in each environment directory points to the shared S3 bucket + DynamoDB lock table provisioned by `infra/bootstrap/`.

---

## 5. Node.js Coding Standards (Lambda Handlers)

### Module System

**CommonJS only.** Use `"use strict"` at the top of every file. Use `require()` for imports and `module.exports` for exports. Do not use ES module syntax (`import`/`export`) — the Lambda runtime is Node.js 18 without ESM configuration.

### AWS SDK Instantiation

Instantiate SDK clients **outside** the handler function to benefit from execution context reuse across warm invocations:

```js
"use strict";
const { S3Client } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

// Top-level — reused across warm invocations
const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

module.exports = async (event) => { /* ... */ };
```

### Input Validation — Mandatory Order

Every handler entry point must follow this exact sequence:

1. Extract `userId` from `event.requestContext.authorizer.jwt.claims.sub` → return `401` if absent.
2. Parse `event.body` in a `try/catch` → return `400` on malformed JSON.
3. Validate required string fields: `typeof x === "string" && x.trim() !== ""` — never rely on truthy shortcuts.
4. Sanitize user-supplied filenames before constructing S3 keys: `filename.replace(/[^a-zA-Z0-9._-]/g, "_")`.
5. Validate ownership before any S3 or DynamoDB operation: key must start with `uploads/${userId}/` → return `403` if false.
6. Use `Set` allowlists for enumerations (`ALLOWED_CONTENT_TYPES`, `ALLOWED_INPUT_TYPES`). Never use open-ended checks.

### Error Handling

- Use `async/await` throughout. Never mix callbacks with async handlers.
- The top-level `try/catch` in `upload.js` is the global safety net. Individual handlers may throw — the router catches and returns `500`.
- Log errors with `console.error("context", { route, err })` for structured CloudWatch output. **Do not log raw `event` objects** — they may contain tokens.
- Return all responses via `lib/response.js` (`response(statusCode, body)`). Do not inline `JSON.stringify` response construction.

### Memory & Streaming

- **Never buffer entire `.ply`, `.splat`, or `.spz` files into memory.** Do not call `.Body.transformToByteArray()` on S3 objects > 1 MB.
- Stream S3 `GetObjectCommand` body through `stream.pipeline()` for passthrough operations.
- For multipart uploads: enforce the S3 minimum of 5 MiB per part except the last. Validate part count: `1 <= partCount <= 100`.
- Use `expiresIn: 3600` for all presigned URLs. Never exceed this value for upload presigns.

### Security

- Do not log sensitive fields (`Authorization`, `x-amz-security-token`, raw JWT claims beyond `sub`).
- Do not use `eval()`, `new Function()`, or dynamic `require()` with user-supplied strings.
- Do not use `aws-sdk` v2. Use `@aws-sdk` v3 packages exclusively.

---

## 6. TypeScript / Frontend Coding Standards (`site/my-app/`)

### TypeScript Rules

- `strict: true` is enabled. **Never use `any`.** Use `unknown` and narrow explicitly.
- Prefer `type` over `interface` for component props and function signatures unless declaration merging is required.
- All API response shapes must be declared in `types/api.ts`. Do not inline ad-hoc response types in component files.
- Use `satisfies` to validate object literals without widening. Avoid `!` non-null assertions — use optional chaining and explicit null checks.

### Framework Conventions

- Use the **App Router** (`app/` directory) exclusively. Do not use `pages/`.
- Mark a component `"use client"` only when it uses browser APIs, event handlers, refs, or React hooks. Server Components are the default.
- Co-locate page-level data fetching in Server Components; push interactivity to leaf Client Components.

### Authentication & API Calls

- All authenticated API calls must go through `api/client.ts` (`authenticatedFetch`). Never call `fetch` directly with raw tokens.
- Read the API base URL exclusively from `api/baseUrl.ts` (`getApiBaseUrl()`). Do not hardcode stage URLs.
- Do not store JWTs or Cognito tokens in `localStorage` or `sessionStorage`. Rely on Amplify's managed session storage.
- Wrap Amplify-dependent components in `<AmplifyProvider>` and gate authenticated routes with `<AuthGate>`.

### Upload & Binary Data

- The canonical upload implementation is `hooks/upload/useMultipartUpload.ts`. Extend it; do not create parallel upload logic elsewhere.
- `DEFAULT_PART_SIZE = 5 * 1024 * 1024` (S3 minimum). Do not lower this value. `DEFAULT_CONCURRENCY = 6`. Do not exceed 10 without profiling.
- Pass `AbortSignal` from a `useRef<AbortController>` into each `fetch` call inside the upload loop for cancellation support.
- Use `DataView` for cross-endian safety when parsing `.splat` binary buffers. Never use `JSON.parse` or `TextDecoder` on raw binary.
- For CPU-bound operations (depth sorting, `.spz` decompression), offload to a `Worker`. Never block the main thread.

### Component Quality

- Use `shadcn/ui` primitives (`components/ui/`) as the base for all new UI elements. Do not re-implement buttons, progress bars, or dialogs from scratch.
- Use Tailwind utility classes exclusively — no raw inline styles. Use `cn()` from `lib/utils.ts` for conditional classes.
- `components/upload/Dropzone`, `components/scenes/ScenesDashboard`, `components/upload/RightSidebar` are established compositions — extend them rather than duplicating layout logic.
- Lazy-load heavy 3D rendering components with `next/dynamic` and `{ ssr: false }`. WebGL/WebGPU contexts must not run during SSR.

---

## 7. Terraform & IaC Standards

### File-per-Concern Layout

Never place multiple unrelated resource types in the same file. When adding a new AWS service, create a new dedicated `.tf` file. The established layout under `infra/modules/static-site/`:

| File | Responsibility |
|---|---|
| `acm.tf` | ACM certificates |
| `auth.tf` | Cognito User Pool + App Client |
| `cloudfront.tf` | CloudFront distribution + OAC |
| `compute.tf` | EC2 Launch Template, ASG, Security Groups |
| `dynamodb.tf` | DynamoDB tables |
| `iam-github-oidc.tf` | GitHub OIDC role, deploy policy, `time_sleep` propagation |
| `iam-worker.tf` | EC2 instance profile and worker IAM role |
| `lambda-upload.tf` | `aws_lambda_function`, Lambda IAM exec role |
| `lambdas.tf` | `archive_file` data sources |
| `network.tf` | VPC, subnets, IGW, NAT gateways, route tables, S3 Gateway Endpoint |
| `s3.tf` | Static site S3 bucket |
| `s3-raw-scenes.tf` | Raw scene upload bucket (multipart, versioning, lifecycle) |
| `s3-policy.tf` | Bucket policies |
| `sqs.tf` | SQS queues (processing + DLQ) |
| `variables.tf` | All input variable declarations |
| `outputs.tf` | All output declarations |
| `versions.tf` | Provider and Terraform version constraints |

### Naming Conventions

- All resource `name` attributes use the `local.name_prefix` pattern: `"${var.project_name}-${var.environment}"` (e.g., `splatial-dev`).
- Use snake_case for Terraform resource labels. Use kebab-case for AWS resource names (what appears in the console).
- Module output names use snake_case and are descriptive: `api_gateway_id`, not `gw`.

### Required Tagging

Every taggable AWS resource must include at minimum:

```hcl
tags = {
  Name        = "<descriptive-kebab-case-name>"
  Environment = var.environment
  Project     = var.project_name
  ManagedBy   = "terraform"
}
```

### Variable Standards

- Every `variable` declaration requires `description` and `type`. Include `default` or add a comment explaining why none is provided.
- Use `validation` blocks for constrained values (e.g., environment names).
- Every `output` declaration requires `description` and `value`. No bare outputs without descriptions.

### IAM Least Privilege — Non-Negotiable

- **No wildcard `"*"` in `actions`** unless the AWS API genuinely has no resource-level permission scope. When unavoidable, add: `# No resource-level permission available for this action`.
- **No wildcard `"*"` in `resources`** when a specific ARN or pattern is determinable at plan time. Use `data "aws_caller_identity"` and `data "aws_region"` to construct ARNs.
- Use `data "aws_iam_policy_document"` with discrete `statement {}` blocks grouped by service. Assign a unique CamelCase `sid` to every statement (e.g., `"S3RawScenesReadWrite"`).
- The GitHub OIDC deploy role must constrain `token.actions.githubusercontent.com:sub` to the exact `repo:<owner>/<repo>:environment:<env>` value.
- Never attach `AdministratorAccess` or `PowerUserAccess` to any role.

### S3 — Private by Default

Every `aws_s3_bucket` resource **must** be accompanied by all four of these — no exceptions:

```hcl
aws_s3_bucket_public_access_block          # all four block_* flags = true
aws_s3_bucket_ownership_controls           # object_ownership = "BucketOwnerEnforced"
aws_s3_bucket_server_side_encryption_configuration  # AES256 (dev/staging), aws:kms (prod)
aws_s3_bucket_versioning                   # status = "Enabled"
```

### S3 CORS for `.splat` / `.spz` / `.ply` Buckets

```hcl
cors_rule {
  allowed_methods = ["GET", "HEAD"]
  allowed_origins = concat(
    ["https://${var.domain_name}"],
    var.cors_extra_origins
  )
  allowed_headers = [
    "Content-Type", "Content-Length",
    "Authorization", "x-amz-date",
    "x-amz-security-token", "x-amz-content-sha256"
  ]
  expose_headers  = ["ETag", "x-amz-request-id"]
  max_age_seconds = 3600
}
```

Never use `allowed_origins = ["*"]`.

### Environment-Specific Rules

- `infra/envs/*/backend.tf` — always remote state (S3 + DynamoDB lock). Never use local state.
- Do not hardcode account IDs or region strings. Use `data "aws_caller_identity".current.account_id` and `data "aws_region".current.name`.
- Apply `lifecycle { prevent_destroy = true }` to stateful resources (S3 buckets, DynamoDB tables, Cognito User Pools) in `prod`.
- Use `depends_on` explicitly when ordering is not captured by resource references (e.g., `depends_on = [time_sleep.iam_propagation]`).

### HCL Quality Rules

- **Complete blocks only.** No `# TODO`, no `"REPLACE_ME"` placeholders. Every block must be deployable as-is.
- Use `locals {}` for computed name prefixes. Never repeat string interpolations inline across multiple resources.
- Run `terraform fmt -recursive` before every commit.
- Treat any unexpected `destroy` in a plan as a **blocker** — do not proceed until understood.

---

## 8. GPU Worker Standards (`worker/`)

- The worker is a single-message-per-instance Python script. After processing one SQS message it terminates itself and signals the ASG to decrement desired capacity.
- Environment configuration is exclusively via environment variables (set by `user_data` in `compute.tf` via `/etc/splatial-worker.env`). Do not hardcode queue names or bucket names in `worker.py`.
- The worker handles Spot interruption: on `SIGTERM` it checkpoints state to S3 and re-queues the job to SQS before the two-minute deadline.
- IMDSv2 is **required** (`http_tokens = "required"` in the launch template). The `imds_extract.py` helper uses the token-based flow — do not revert to IMDSv1.
- Idle termination: the worker exits after `IDLE_EXIT_SECONDS` (default 120) with no messages in the queue, driving the ASG to scale to zero.

### Scene Processing State Machine
When writing backend logic, database schemas, or worker services for the Gaussian Splat pipeline, adhere strictly to the following job states. All job state transitions must be event-driven.

*   `UPLOADING`: Multipart upload to S3 in progress.
*   `VALIDATING`: S3 event triggered; verifying media integrity (resolution, frame count).
*   `QUEUED`: Validated, sitting in SQS waiting for EC2 Spot compute.
*   `INITIALIZING`: EC2 Spot instance booting and pulling containers.
*   `PROCESSING_SFM`: Running COLMAP/GLOMAP (CPU/RAM bound).
*   `PROCESSING_TRAINING`: Running 3DGS optimization (GPU bound).
*   `INTERRUPTED`: Spot instance preempted (2-minute warning). Checkpoint saved to S3. Worker must gracefully exit and requeue the job.
*   `COMPLETED`: Artifacts (.ply) successfully written to S3.
*   `FAILED`: Terminal error (e.g., SfM failed to resolve poses). Logged to DLQ.
*   `CANCELED`: User manually aborted; job purged from queue or worker killed.

**Implementation Rules:**
- Any code generated for the worker MUST include a graceful shutdown handler for AWS Spot Interruption notices.
- Jobs in `INTERRUPTED` state should be treated as recoverable and placed back into the `QUEUED` state upon successful checkpointing.

---

## 9. Post-Change Checklist

### Terraform Changes
```
- [ ] terraform fmt -recursive && terraform validate
- [ ] terraform plan — confirm diff contains only expected changes
- [ ] No unexpected destroy actions in the plan
- [ ] IAM policies reviewed for wildcards
- [ ] All new S3 buckets have the four required companion resources
- [ ] All new resources have the required four tags
```

### Lambda Handler Changes
```
- [ ] node -e "require('./upload')" in src-upload/ — no syntax or require errors
- [ ] Input validation order (auth -> parse -> validate -> sanitize -> ownership) upheld
- [ ] No raw event objects logged
- [ ] No aws-sdk v2 imports
```

### Frontend Changes
```
- [ ] cd site/my-app && npm run build — zero TypeScript errors
- [ ] No direct fetch calls with raw tokens (all calls via authenticatedFetch)
- [ ] No hardcoded API URLs (all via getApiBaseUrl())
- [ ] No JWT/token storage in localStorage or sessionStorage
```

### Proposed Commit Message Format

```
feat(infra): <subject>        # new Terraform resource or module
fix(infra): <subject>         # policy correction, security fix, resource fix
refactor(infra): <subject>    # restructure with no resource changes (plan = no-op)
feat(frontend): <subject>     # new component, page, or hook
fix(frontend): <subject>      # bug fix in UI layer
feat(backend): <subject>      # new Lambda handler or upload feature
fix(backend): <subject>       # bug fix in Lambda handler
feat(worker): <subject>       # Python worker change
chore: <subject>              # fmt, version bump, comment update
```
