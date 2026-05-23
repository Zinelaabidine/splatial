# Project Architectural Context

> Machine-readable reference for LLM context windows. Last updated: 2026-05-23. Branch: `dev`.

---

## 1. System Overview & Core Purpose

**Splatial** is a cloud-native, end-to-end **3D Gaussian Splatting media pipeline**. It solves three coupled problems:

1. **Ingestion** — Accept large raw capture inputs (video `.mp4`/`.mov`, image sets `.jpg/.png/.webp/.tiff/.zip`, 3D geometry `.glb/.gltf`) directly from a browser via S3 multipart upload, bypassing Lambda payload limits entirely.
2. **Orchestration** — Track scene lifecycle state (`PENDING_UPLOAD → UPLOADED → PROCESSING → READY / FAILED`) in DynamoDB and dispatch GPU training jobs to a cost-optimized EC2 Spot fleet via SQS.
3. **Distribution** — Serve processed `.splat` / `.spz` assets (compressed Gaussian Splat formats) to browser-based 3D viewers over CloudFront with correct CORS headers for WebGL/WebGPU consumption.

**Target domain:** real-time photorealistic 3D reconstruction from multi-view captures, productized as a SaaS with per-user quota management.

**Core design principle:** the API tier (Lambda) never touches binary asset data. The browser writes directly to S3 via short-lived presigned part URLs; Lambda only orchestrates metadata and state.

---

## 2. Tech Stack & Environmental Constraints

- **Language & Standards:**
  - Frontend: TypeScript 5.x, React 19, Next.js 16 (App Router)
  - Backend (Lambda): Node.js 18.x, CommonJS (`"use strict"` / `require()`), no build step
  - Infrastructure: HCL (Terraform 1.5+), AWS Provider `~> 5.0`

- **Primary Frameworks & Libraries:**

  | Layer | Dependency | Version | Role |
  |---|---|---|---|
  | Frontend | `next` | 16.2.6 | App framework, SSR/RSC, routing |
  | Frontend | `react` / `react-dom` | 19.2.4 | UI runtime |
  | Frontend | `aws-amplify` | ^6.17.0 | Cognito auth (JWT session management) |
  | Frontend | `@aws-amplify/ui-react` | ^6.15.4 | Pre-built auth UI components |
  | Frontend | `tailwindcss` | ^4 | Utility CSS |
  | Frontend | `shadcn` / `@radix-ui` | ^4.7.0 / ^1.x | Headless component primitives |
  | Frontend | `lucide-react` | ^1.16.0 | Icon set |
  | Frontend | `clsx` / `tailwind-merge` | ^2.x / ^3.x | Conditional class utilities |
  | Lambda | `@aws-sdk/client-s3` | ^3.x | S3 multipart upload orchestration |
  | Lambda | `@aws-sdk/client-dynamodb` | ^3.x | Scene state persistence |
  | Lambda | `@aws-sdk/s3-request-presigner` | ^3.x | Presigned part URL generation |

- **Target Platform / Deployment:**
  - AWS Cloud-native, region: `us-east-1` (dev environment)
  - Domain: `openspacenexus.store` (hosted zone); environments served at `splatial-<env>.openspacenexus.store`
  - API custom domain: `api-<env>.openspacenexus.store`
  - Frontend deployed as static export to S3 + CloudFront (`PriceClass_100`, TLS 1.2+, OAC sigv4)
  - CI/CD: GitHub Actions via GitHub OIDC (no long-lived AWS credentials); deploy role constrained per environment

---

## 3. Folder Architecture & Component Mapping

```
splatial/
├── .github/
│   └── copilot-instructions.md       # Global AI workflow rules (conventional commits, agentic behavior)
│
├── docs/
│   ├── architecture.md               # System design narrative (VPC, ASG, auth flows, cost model)
│   └── images/architecture.jpg       # Full architecture diagram reference
│
├── infra/                            # All infrastructure-as-code (Terraform + Lambda source)
│   ├── copilot-instructions.md       # Scoped AI rules: Terraform HCL + Lambda Node.js handlers
│   ├── bootstrap/
│   │   └── main.tf                   # One-time account bootstrap (OIDC provider, remote state bucket)
│   ├── envs/
│   │   ├── dev/                      # Dev environment root module
│   │   │   ├── main.tf               # Instantiates static-site + api-gateway-domain modules
│   │   │   ├── backend.tf            # S3 remote state + DynamoDB lock
│   │   │   └── outputs.tf            # Exposes: site_url, api_endpoint, cognito IDs, bucket names
│   │   ├── staging/                  # Mirrors dev structure
│   │   └── prod/                     # Mirrors dev; prevent_destroy enforced on stateful resources
│   └── modules/
│       ├── static-site/              # PRIMARY MODULE — entire application stack
│       │   ├── acm.tf                # Wildcard ACM cert (data source lookup)
│       │   ├── auth.tf               # Cognito User Pool + App Client (email auth, SRP)
│       │   ├── cloudfront.tf         # CloudFront distribution + OAC (sigv4), custom error pages
│       │   ├── dynamodb.tf           # ScenesTable (PAY_PER_REQUEST, GSI: user_id-status, TTL, PITR)
│       │   ├── iam-github-oidc.tf    # GitHub OIDC deploy role + granular inline policy (per-service)
│       │   ├── lambda-upload.tf      # Upload Lambda: npm install trigger, zip archive, IAM exec role
│       │   ├── lambdas.tf            # Static-site Lambda (index.js handler, basic exec role)
│       │   ├── locals.tf             # name_prefix, github_repo_full, bucket_name derivations
│       │   ├── network.tf            # VPC, public/private subnets (multi-AZ), IGW, NAT, S3 GW Endpoint
│       │   ├── outputs.tf            # 20+ outputs: URLs, ARNs, IDs for env module consumption
│       │   ├── providers.tf          # Provider alias: aws.this
│       │   ├── route53.tf            # A/AAAA alias records → CloudFront
│       │   ├── s3.tf                 # Static site bucket (private, SSE-AES256, versioned)
│       │   ├── s3-policy.tf          # CloudFront OAC bucket policy
│       │   ├── s3-raw-scenes.tf      # Raw upload bucket (private, versioned, Transfer Acceleration,
│       │   │                         #   lifecycle: abort incomplete multipart after 1d,
│       │   │                         #   expire noncurrent versions)
│       │   ├── variables.tf          # All module inputs with validation (environment enum)
│       │   ├── versions.tf           # Terraform + AWS provider version constraints
│       │   └── src-upload/           # Lambda source code (Node.js 18.x, CommonJS)
│       │       ├── upload.js         # Router: maps API Gateway routeKey → handler
│       │       ├── package.json      # Dependencies: @aws-sdk v3 (s3, dynamodb, presigner)
│       │       ├── handlers/
│       │       │   ├── init.js       # POST /upload/init — CreateMultipartUpload + DynamoDB PutItem
│       │       │   ├── presign.js    # POST /upload/presign — batch UploadPartCommand presign
│       │       │   ├── complete.js   # POST /upload/complete — CompleteMultipartUpload + DynamoDB UpdateItem
│       │       │   ├── scene-create.js  # POST /api/v1/scenes — DynamoDB PutItem (named scene record)
│       │       │   ├── scene-delete.js  # DELETE /scenes/{sceneId} + /api/v1/scenes/{sceneId}
│       │       │   ├── scene-status.js  # GET /scenes/{sceneId} — DynamoDB GetItem
│       │       │   └── scenes-list.js   # GET /api/v1/scenes — DynamoDB Scan + filter by user_id
│       │       └── lib/
│       │           └── response.js   # Shared HTTP response envelope helper
│       └── api-gateway-domain/       # Custom domain binding module
│           ├── apigateway.tf         # aws_apigatewayv2_domain_name + api_mapping ($default stage)
│           ├── acm.tf                # Regional ACM cert for API subdomain
│           ├── route53.tf            # Alias record → API GW regional endpoint
│           └── variables.tf          # api_gateway_id, domain_name, environment
│
└── site/                             # Frontend application
    ├── copilot-instructions.md       # Scoped AI rules: Next.js, TypeScript, Amplify, upload hook
    ├── index.html / error.html       # CloudFront fallback pages (served from S3 root)
    └── my-app/                       # Next.js 16 application root
        ├── app/
        │   ├── layout.tsx            # Root layout: AmplifyProvider wrapper, global CSS
        │   ├── page.tsx              # Route "/" — upload entry point (Dropzone + RightSidebar)
        │   └── scenes/
        │       └── page.tsx          # Route "/scenes" — ScenesDashboard (list + upload modal)
        ├── components/
        │   ├── AmplifyProvider.tsx   # Client boundary: configureAmplify() called once
        │   ├── AuthGate.tsx          # Auth guard: redirects unauthenticated users
        │   ├── Dropzone.tsx          # Drag-and-drop file input (calls onFiles callback)
        │   ├── Layout.tsx            # Shell: nav + optional right sidebar slot
        │   ├── RightSidebar.tsx      # Upload progress panel (consumes UseMultipartUploadResult)
        │   ├── ScenesDashboard.tsx   # Full scenes manager: list, upload modal, delete, status badges
        │   └── ui/
        │       ├── button.tsx        # shadcn/ui Button primitive
        │       └── progress.tsx      # shadcn/ui Progress bar primitive
        ├── hooks/
        │   └── useMultipartUpload.ts # Core upload state machine (queue, presign, PUT, poll, cancel)
        ├── lib/
        │   ├── amplifyClient.ts      # configureAmplify(): reads NEXT_PUBLIC_* env vars at runtime
        │   ├── apiBaseUrl.ts         # getApiBaseUrl(): resolves NEXT_PUBLIC_API_GATEWAY_URL
        │   └── utils.ts              # cn() class merge helper
        ├── types/
        │   └── api.ts                # All API request/response interfaces (upload flow + scene mgmt)
        └── utils/
            └── apiClient.ts          # authenticatedFetch(): injects Cognito JWT into every request
```

---

## 4. Key Design Patterns & Engineering Rules

### Memory / Performance Constraints

- **Zero-buffer upload path:** Lambda never receives binary data. Browser slices files into `DEFAULT_PART_SIZE = 5 MiB` chunks and PUTs each part directly to S3 via a presigned `UploadPartCommand` URL. Lambda only issues presigned URLs and calls `CompleteMultipartUpload`.
- **Parallel part uploads:** `DEFAULT_CONCURRENCY = 6` (homepage hook) / `CONCURRENCY = 4` (ScenesDashboard) simultaneous S3 PUTs per file to saturate available bandwidth without overloading the network stack.
- **Transfer Acceleration:** `aws_s3_bucket_accelerate_configuration` is `Enabled` on the raw-scenes bucket to reduce upload latency from geographically distributed clients.
- **Lambda cold-start minimization:** AWS SDK v3 clients (`S3Client`, `DynamoDBClient`) are instantiated at module scope, outside handler functions, to reuse connections across warm invocations.
- **GPU worker decoupling (planned):** EC2 G4dn/G5 Spot instances consume training jobs from SQS, checkpoint state to S3, and re-queue on Spot interruption — isolating heavy compute from the synchronous API tier.
- **DynamoDB TTL:** `PENDING_UPLOAD` records auto-expire after 24 h; `PROCESSING` records after 7 days. No compensating Lambda cleanup required.

### Data Flow

```
Browser
  │
  ├─ POST /upload/init ──────────────────► Lambda (init.js)
  │    { filename, contentType, name }       │  CreateMultipartUpload → S3
  │    ◄── { uploadId, key, sceneId } ───────┤  PutItem → DynamoDB (status: PENDING_UPLOAD)
  │
  ├─ POST /upload/presign ───────────────► Lambda (presign.js)
  │    { uploadId, key, partCount }           │  GetSignedUrl × N → UploadPartCommand
  │    ◄── { parts: [{partNumber, url}] } ───┘
  │
  ├─ PUT <presigned S3 URL> × N ─────────► S3 raw-scenes bucket (direct, no Lambda)
  │    ◄── ETag per part ─────────────────┘
  │
  ├─ POST /upload/complete ──────────────► Lambda (complete.js)
  │    { uploadId, key, sceneId, parts }      │  CompleteMultipartUpload → S3
  │    ◄── { sceneId, status, location } ─────┤  UpdateItem → DynamoDB (status: PROCESSING)
  │                                           └─ (future) SendMessage → SQS training queue
  │
  ├─ GET /scenes/{sceneId} (polling) ───► Lambda (scene-status.js)
  │    ◄── { sceneId, status, location }      └  GetItem → DynamoDB
  │
  └─ GET /api/v1/scenes ─────────────────► Lambda (scenes-list.js)
       ◄── { scenes: [...] }                  └  Scan + FilterExpression (user_id + has `name`)

Auth: Every request carries a Cognito JWT in the Authorization header.
      API Gateway Cognito Authorizer validates the token before Lambda invokes.
      Lambda extracts userId from event.requestContext.authorizer.jwt.claims.sub.
      All S3 key paths are namespaced: uploads/<userId>/<sceneId>/<filename>

Output path (planned):
  EC2 Spot GPU worker
    ├─ Polls SQS for sceneId
    ├─ Downloads raw asset from S3 (uploads/<userId>/<sceneId>/...)
    ├─ Runs Gaussian Splatting training
    ├─ Uploads .splat / .spz to S3 processed bucket
    └─ UpdateItem → DynamoDB (status: READY, s3_location: <CloudFront URL>)
```

---

## 5. Current Active Milestone

### Completed

- **Infrastructure (fully deployed to `dev`):**
  - VPC (multi-AZ, public/private subnets, IGW, NAT gateways, S3 Gateway Endpoint)
  - Cognito User Pool + App Client (email auth, SRP, JWT)
  - API Gateway HTTP API + Cognito Authorizer + `$default` auto-deploy stage
  - Custom API domain (`api-dev.openspacenexus.store`) with regional ACM cert + Route 53 alias
  - S3 static site bucket + CloudFront distribution (OAC, TLS 1.2, custom error pages)
  - S3 raw-scenes bucket (private, versioned, SSE-AES256, Transfer Acceleration, lifecycle rules)
  - DynamoDB `ScenesTable` (PAY_PER_REQUEST, GSI `user_id-status-index`, TTL, PITR, SSE)
  - Upload Lambda (Node.js 18.x, `npm install` provisioner, IAM exec role + inline data policy)
  - GitHub OIDC deploy role (environment-scoped, granular per-service inline policy)
  - `time_sleep.iam_propagation` dependency chain for IAM eventual-consistency safety

- **Backend Lambda API (all routes wired and deployed):**
  - `POST /upload/init`, `POST /upload/presign`, `POST /upload/complete` — full multipart flow
  - `POST /api/v1/scenes`, `GET /api/v1/scenes`, `DELETE /api/v1/scenes/{sceneId}` — scene CRUD
  - `GET /scenes/{sceneId}` — legacy status polling endpoint

- **Frontend (functional, deployed to dev):**
  - Amplify v6 auth integration (`configureAmplify`, `AuthGate`, email login via Cognito)
  - Route `/` — upload entry: `Dropzone` → `useMultipartUpload` hook → `RightSidebar` progress panel
  - Route `/scenes` — `ScenesDashboard`: scene list (status badges), upload modal (inline multipart), delete
  - `useMultipartUpload` hook: full state machine (queue → init → presign → parallel PUT → complete → poll)
  - `authenticatedFetch` utility: Cognito JWT injection for all API calls

### In Progress / Next Steps

1. **SQS training queue dispatch:** `complete.js` must `SendMessage` to SQS after `CompleteMultipartUpload` succeeds to trigger the GPU worker pipeline. SQS queue resource and Lambda `sqs:SendMessage` IAM permission not yet provisioned.
2. **EC2 Spot GPU worker infrastructure:** `aws_autoscaling_group` with `mixed_instances_policy` (G4dn/G5 Spot), launch template with user-data bootstrapping the Gaussian Splatting training process, EventBridge Spot interruption handler Lambda.
3. **`scenes-list.js` GSI migration:** current implementation uses a full `ScanCommand` with `FilterExpression`, which will not scale. A dedicated GSI on `user_id` with `created_at` as range key (`user_id-created_at-index`) must be added to `dynamodb.tf` and the handler updated to use `QueryCommand`.
4. **Processed asset storage:** S3 bucket for trained `.splat` / `.spz` output files with CloudFront origin, IAM policy for EC2 worker write access, and viewer presigned URL generation.
5. **User quota system:** DynamoDB `UsersTable` (provisioned by Cognito Post-Confirmation Lambda trigger) to enforce per-user scene limits and tier management (`Free` / `Pro`).
6. **`staging` and `prod` environment wiring:** `infra/envs/staging/` and `infra/envs/prod/` Terraform roots are scaffolded but unpopulated.
