# Splatial — Full Architecture Reference

> **Last updated:** 2026-05-30 | **Branch:** `dev` | **Region:** `us-east-1`
>
> This document is the definitive, as-built architectural reference for the Splatial 3D Gaussian Splatting platform. It covers the full stack: frontend, backend, infrastructure-as-code, CI/CD, data flows, IAM boundaries, known gaps, and the full prioritized remediation plan.

---

## Table of Contents

1. [System Overview & Core Purpose](#1-system-overview--core-purpose)
2. [Core Technical Stack](#2-core-technical-stack)
3. [Repository & Folder Structure](#3-repository--folder-structure)
4. [Network Topology](#4-network-topology)
5. [Data Lifecycle — End-to-End](#5-data-lifecycle--end-to-end)
   - 5.1 [Authentication Flow](#51-authentication-flow)
   - 5.2 [Scene Creation & Upload Initiation](#52-scene-creation--upload-initiation)
   - 5.3 [Direct-to-S3 Multipart Upload](#53-direct-to-s3-multipart-upload)
   - 5.4 [Upload Assembly & Job Dispatch](#54-upload-assembly--job-dispatch)
   - 5.5 [GPU Training (Asynchronous)](#55-gpu-training-asynchronous)
   - 5.6 [Distribution & Viewing](#56-distribution--viewing)
6. [AWS Service Inventory](#6-aws-service-inventory)
7. [Terraform Infrastructure — Resource Map](#7-terraform-infrastructure--resource-map)
   - 7.1 [Module Structure](#71-module-structure)
   - 7.2 [Per-.tf File Resource Inventory](#72-per-tf-file-resource-inventory)
   - 7.3 [Remote State & Bootstrap](#73-remote-state--bootstrap)
   - 7.4 [Lambda Packaging Pipeline](#74-lambda-packaging-pipeline)
8. [Lambda API — Route Map](#8-lambda-api--route-map)
9. [IAM Boundary Model](#9-iam-boundary-model)
   - 9.1 [Upload Lambda Exec Role](#91-upload-lambda-exec-role)
   - 9.2 [EC2 Worker Instance Role](#92-ec2-worker-instance-role)
   - 9.3 [GitHub OIDC Deploy Role](#93-github-oidc-deploy-role)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Worker Architecture](#11-worker-architecture)
12. [Security Controls](#12-security-controls)
13. [CI/CD Pipeline](#13-cicd-pipeline)
14. [Environment Matrix](#14-environment-matrix)
15. [DynamoDB Schema & State Machine](#15-dynamodb-schema--state-machine)
16. [SQS Queue Configuration](#16-sqs-queue-configuration)
17. [S3 Bucket Configuration Matrix](#17-s3-bucket-configuration-matrix)
18. [Known Gaps & Open Issues](#18-known-gaps--open-issues)
19. [Production Readiness Checklist](#19-production-readiness-checklist)
20. [Unified System Architecture Map](#20-unified-system-architecture-map)
21. [Infrastructure ↔ Application Constraint Mapping](#21-infrastructure--application-constraint-mapping)
22. [Prioritized Remediation Plan](#22-prioritized-remediation-plan)

---

## 1. System Overview & Core Purpose

**Splatial** is a cloud-native, end-to-end 3D Gaussian Splatting (3DGS) media pipeline productized as a SaaS.

It solves three coupled problems:

| Problem | Solution |
|---|---|
| **Ingestion** | Accept large raw capture inputs (`.mp4`/`.mov` video, `.jpg/.png/.webp/.tiff/.zip` image sets, `.glb/.gltf` geometry) directly from a browser via S3 multipart upload, bypassing Lambda payload limits entirely |
| **Orchestration** | Track scene lifecycle state in DynamoDB and dispatch GPU training jobs to a cost-optimized EC2 Spot fleet via SQS |
| **Distribution** | Serve processed `.splat`/`.spz` assets to browser-based 3D viewers over CloudFront with correct CORS headers for WebGL/WebGPU consumption |

**Core design principle:** The API tier (Lambda) **never touches binary asset data**. The browser writes directly to S3 via short-lived presigned part URLs; Lambda only orchestrates metadata and state.

---

## 2. Core Technical Stack

| Layer | Technology | Version | Role |
|---|---|---|---|
| **Frontend** | Next.js (App Router) | 16.2.6 | SPA/SSR framework, routing, static export |
| **Frontend** | React | 19.2.4 | UI runtime |
| **Frontend** | TypeScript | ^5, strict | Language |
| **Frontend** | Tailwind CSS | ^4 | Utility CSS |
| **Frontend** | shadcn/ui + Radix UI | ^4.7 / ^1.x | Headless component primitives |
| **Frontend** | AWS Amplify | ^6.17.0 | Cognito auth, JWT session management |
| **Frontend** | @aws-amplify/ui-react | ^6.15.4 | Pre-built auth UI components |
| **Frontend** | lucide-react | ^1.16.0 | Icon set |
| **Frontend** | clsx / tailwind-merge / cva | ^2.x / ^3.x | Conditional class utilities |
| **3D Viewer** | Custom GaussianViewer + splatviewer/ | — | WebGL/WebGPU `.splat`/`.spz` renderer |
| **Backend** | AWS Lambda | Node.js 18.x | API handler (CommonJS, no build step) |
| **Backend SDK** | @aws-sdk/client-s3 | ^3.x | S3 multipart orchestration |
| **Backend SDK** | @aws-sdk/client-dynamodb | ^3.x | Scene state persistence |
| **Backend SDK** | @aws-sdk/client-sqs | ^3.x | Job queue dispatch |
| **Backend SDK** | @aws-sdk/s3-request-presigner | ^3.x | Presigned URL generation |
| **Database** | DynamoDB | PAY_PER_REQUEST | Scene state machine, single table |
| **Queue** | SQS Standard | — | Async job buffer (45-min visibility timeout) |
| **Auth** | Cognito User Pool | — | Email SRP, JWT (ID/Access/Refresh tokens) |
| **CDN** | CloudFront | PriceClass_100 | Static site + splat file distribution |
| **Worker** | Python 3 on EC2 G4dn Spot | — | SQS long-poll, 3DGS training execution |
| **IaC** | Terraform | >= 1.10.0 | Full AWS stack definition |
| **AWS Provider** | hashicorp/aws | ~> 6.0 | |

---

## 3. Repository & Folder Structure

```
splatial/
│
├── docs/
│   ├── architecture.md               Original design narrative
│   ├── ARCHITECTURE_REFERENCE.md     This file — as-built reference
│   └── images/
│       └── architecture.jpg          Full architecture diagram
│
├── infra/                            ALL infrastructure-as-code
│   ├── bootstrap/
│   │   └── main.tf                   One-time account bootstrap:
│   │                                   S3 state bucket (openspacenexus-terraform-state)
│   │                                   DynamoDB lock table
│   │                                   GitHub OIDC provider
│   │
│   ├── envs/
│   │   ├── dev/
│   │   │   ├── main.tf               Instantiates static-site + api-gateway-domain modules
│   │   │   ├── backend.tf            S3 remote state + DynamoDB lock
│   │   │   └── outputs.tf            Exposes module outputs
│   │   ├── staging/                  Mirrors dev structure
│   │   └── prod/                     Mirrors dev; prevent_destroy on stateful resources
│   │
│   └── modules/
│       ├── static-site/              PRIMARY MODULE — entire application stack
│       │   ├── acm.tf                Wildcard ACM cert data source lookup
│       │   ├── auth.tf               Cognito User Pool + App Client
│       │   ├── cloudfront.tf         CloudFront distribution + OAC (sigv4)
│       │   ├── compute.tf            Security Group, Launch Template, ASG (commented out)
│       │   ├── dynamodb.tf           ScenesTable (PAY_PER_REQUEST, GSI, TTL, PITR)
│       │   ├── iam-github-oidc.tf    GitHub OIDC deploy role + granular inline policy
│       │   ├── iam-worker.tf         EC2 worker instance role + instance profile
│       │   ├── lambda-upload.tf      Upload Lambda: deps, zip, IAM exec role, policy
│       │   ├── lambdas.tf            Legacy scaffold Lambda (GET /helloFromLambda)
│       │   ├── locals.tf             name_prefix, github_repo_full, bucket_name
│       │   ├── network.tf            VPC, subnets, IGW, route tables, API Gateway HTTP API
│       │   ├── outputs.tf            20+ outputs: URLs, ARNs, IDs
│       │   ├── providers.tf          Provider alias: aws.this
│       │   ├── route53.tf            A + AAAA alias records → CloudFront
│       │   ├── s3.tf                 Static site bucket (private, SSE-AES256)
│       │   ├── s3-policy.tf          CloudFront OAC bucket policy
│       │   ├── s3-raw-scenes.tf      Raw upload bucket (private, versioned, Transfer Accel)
│       │   ├── s3-splat-scenes.tf    Output bucket (private, versioned, GET CORS)
│       │   ├── sqs.tf                Processing queue + DLQ
│       │   ├── variables.tf          All module inputs with validation
│       │   ├── versions.tf           Terraform + provider version constraints
│       │   └── src-upload/           Lambda source code (Node.js 18.x, CommonJS)
│       │       ├── upload.js         Router: maps API Gateway routeKey → handler
│       │       ├── package.json      @aws-sdk v3 dependencies
│       │       ├── handlers/
│       │       │   ├── init.js              POST /upload/init
│       │       │   ├── presign.js           POST /upload/presign
│       │       │   ├── complete.js          POST /upload/complete
│       │       │   ├── submit-job.js        POST /jobs/submit
│       │       │   ├── cancel-job.js        POST /jobs/{sceneId}/cancel
│       │       │   ├── attempt-patch.js     PATCH /api/attempts/{attemptId}
│       │       │   ├── attempt-heartbeat.js POST /api/attempts/{attemptId}/heartbeat
│       │       │   ├── scene-create.js      POST /api/v1/scenes
│       │       │   ├── scenes-list.js       GET /api/v1/scenes
│       │       │   ├── scene-status.js      GET /scenes/{sceneId}
│       │       │   ├── scene-delete.js      DELETE /scenes/{sceneId}
│       │       │   ├── scene-view-url.js    GET /api/v1/scenes/{sceneId}/view-url
│       │       │   └── scene-seed.js        POST /api/v1/scenes/seed (dev seeding)
│       │       └── lib/
│       │           └── response.js          Shared HTTP response builder
│       │
│       └── api-gateway-domain/       Custom domain + Route53 wiring for API GW
│                                     Produces: api-<env>.openspacenexus.store
│
├── site/
│   └── my-app/                       ALL frontend (Next.js App Router)
│       ├── app/
│       │   ├── layout.tsx            Root layout + AmplifyProvider
│       │   ├── page.tsx              Landing page
│       │   ├── globals.css
│       │   └── scenes/
│       │       ├── page.tsx          /scenes — protected by AuthGate → ScenesDashboard
│       │       ├── create/           Scene creation flow (Dropzone + multipart upload UI)
│       │       └── [sceneId]/        Per-scene viewer → ViewerShell → GaussianViewer
│       ├── components/
│       │   ├── AmplifyProvider.tsx   Injects Cognito config at root
│       │   ├── AuthGate.tsx          Route-level auth guard (redirects to sign-in)
│       │   ├── Dropzone.tsx          File picker; drives multipart upload hook
│       │   ├── GaussianViewer.tsx    WebGL/WebGPU splat renderer
│       │   ├── Layout.tsx            Shell layout wrapper
│       │   ├── RightSidebar.tsx      Scene info sidebar
│       │   ├── ScenesDashboard.tsx   Scene list + status polling
│       │   ├── ViewerShell.tsx       Viewer page wrapper
│       │   ├── dashboard/            Scene management sub-components
│       │   ├── splatviewer/          Low-level splat decode + render pipeline
│       │   └── ui/                   shadcn/ui generated primitives
│       ├── hooks/                    Custom React hooks (upload, polling)
│       ├── lib/                      Amplify config, pure utilities
│       ├── types/                    Shared TypeScript interfaces
│       └── utils/                    API client, fetch wrappers (attaches Cognito JWT)
│
└── worker/
    ├── worker.py                     Python SQS worker (runs on EC2 Spot)
    └── imds_extract.py               IMDSv2 metadata helper
```

---

## 4. Network Topology

```
AWS us-east-1
│
├── VPC  10.0.0.0/16   (DNS support + hostnames enabled)
│   │
│   ├── us-east-1a
│   │   ├── Public Subnet   10.0.1.0/24    map_public_ip_on_launch = true
│   │   └── Private Subnet  10.0.11.0/24   Workers (no public IP)
│   │
│   ├── us-east-1b
│   │   ├── Public Subnet   10.0.2.0/24
│   │   └── Private Subnet  10.0.12.0/24
│   │
│   ├── Internet Gateway → public route table (0.0.0.0/0)
│   ├── S3 Gateway Endpoint → private subnets (no NAT cost for S3 traffic)
│   └── [GAP] NAT Gateway / VPC Endpoints for SQS, DynamoDB, SSM — NOT IN TERRAFORM
│
└── Global / Regional Services (outside VPC)
    ├── CloudFront      PriceClass_100 (NA + EU) → static site S3 (OAC sigv4)
    ├── API Gateway     HTTP API → Upload Lambda (JWT Authorizer → Cognito)
    ├── Cognito         User Pool (email SRP, JWT)
    ├── Lambda          Upload handler (Node.js 18, CommonJS)
    ├── DynamoDB        ScenesTable (PAY_PER_REQUEST)
    ├── SQS             splat-processing-queue + splat-processing-dlq
    ├── S3              static site bucket, raw-scenes bucket, splat-scenes bucket
    ├── ACM             *.openspacenexus.store wildcard cert (must pre-exist in us-east-1)
    └── Route53         openspacenexus.store hosted zone
```

**Worker Security Group:** Egress-only (all ports/protocols to 0.0.0.0/0). No inbound rules — management exclusively via AWS SSM Session Manager.

---

## 5. Data Lifecycle — End-to-End

### 5.1 Authentication Flow

```
Browser (AWS Amplify)
  │
  ├─ ALLOW_USER_SRP_AUTH ──────────────────────────► Cognito User Pool
  │                                                    (email auto-verified)
  │                                                    Password policy:
  │                                                    8+ chars, upper, lower,
  │                                                    number, symbol
  │
  ◄── ID Token + Access Token + Refresh Token ────────┘
  │   (JWT, signed by Cognito JWKS endpoint)
  │
  └─ Silent refresh via ALLOW_REFRESH_TOKEN_AUTH
     (Amplify handles token lifecycle automatically)
```

### 5.2 Scene Creation & Upload Initiation

```
Browser  POST /api/v1/scenes  { name, inputType, fileSize }
  JWT: Authorization: Bearer <access_token>
  │
  └─► API Gateway HTTP API
        JWT Authorizer validates token against Cognito JWKS
        Invalid/expired → 401 Unauthorized
        │
        └─► scene-create.js (Lambda)
              1. Extract userId from event.requestContext.authorizer.jwt.claims.sub
              2. Validate + sanitize inputs (filename → /[^a-zA-Z0-9._-]/ → "_")
              3. DynamoDB PutItem:
                   scene_id   = uuid
                   user_id    = <userId>
                   status     = PENDING_UPLOAD
                   expires_at = now + 24h (TTL)
              4. Return { sceneId, uploadPath }

Browser  POST /upload/init  { sceneId, filename, contentType, partCount }
  └─► init.js (Lambda)
        1. Validate ownership: S3 key must start with uploads/<userId>/
        2. S3 CreateMultipartUpload → uploadId
        3. DynamoDB UpdateItem: store uploadId on scene record
        4. Return { uploadId, sceneId }
```

### 5.3 Direct-to-S3 Multipart Upload

```
For each part (min 5 MiB per part except last; max 100 parts):

  Browser  POST /upload/presign  { uploadId, key, partNumber }
    └─► presign.js (Lambda)
          1. Validate ownership (key prefix check)
          2. s3-request-presigner: UploadPartCommand → presigned URL
             expiresIn: 3600s (never exceeded)
          3. Return { presignedUrl }

  Browser  PUT <presignedUrl>  (binary part data)
    Direct to ──────────────────────────────────────► S3 raw-scenes bucket
                                                       Transfer Acceleration enabled
                                                       (routes via CloudFront edge → S3)
    Response: ETag header (required for CompleteMultipartUpload)
```

Lambda never receives binary data. All asset bytes flow browser → S3 directly.

### 5.4 Upload Assembly & Job Dispatch

```
Browser  POST /upload/complete  { uploadId, key, sceneId, parts: [{ PartNumber, ETag }] }
  └─► complete.js (Lambda)
        1. Validate ownership
        2. S3 CompleteMultipartUpload (assembles parts into single object)
        3. DynamoDB UpdateItem: status = QUEUED, expires_at = now + 7d
        4. SQS SendMessage to processing_queue:
             { jobId: sceneId, s3Key: key, userId }
        5. Return HTTP 202 Accepted immediately
             ← client gets response before training starts
```

### 5.5 GPU Training (Asynchronous)

```
EC2 G4dn.xlarge Spot Instance (pre-baked AMI ami-0512a845e4b778621)
  splat-worker.service (systemd) reads /etc/splatial-worker.env:
    QUEUE_NAME = splatial-<env>-splat-processing-queue
    DLQ_NAME   = splatial-<env>-splat-processing-dlq
  │
  └─► worker.py main loop
        SQS long-poll (WaitTimeSeconds=20)
        │
        ├─ No messages → check IDLE_EXIT_SECONDS (default 120s)
        │  If idle too long → ASG DecrementDesiredCapacity → self-terminate
        │
        └─ Message received:
             1. Check DynamoDB: if status == CANCELLED → delete message, continue
             2. DynamoDB UpdateItem: status = PROCESSING
             3. Extend SQS visibility (VISIBILITY_TIMEOUT_SECONDS=300,
                                       renewed every 150s via background thread)
             4. S3 GetObject: download input asset to WORKSPACE_ROOT=/tmp/streaming-splat
             │
             ├─ If input is .zip (ZIP dataset):
             │    a. Safely extract (path traversal protection)
             │    b. Run train.py:
             │         --data_device cpu
             │         --sh_degree 2
             │         --densify_until_iter 10000
             │         --densify_grad_threshold 0.0003
             │         --test_iterations -1
             │    c. Stream training logs → Python logger → CloudWatch
             │
             └─ If input is video/images (non-ZIP):
                  LEGACY SIMULATION MODE
                  (real COLMAP → 3DGS pipeline not yet wired)
             │
             5. Worker heartbeat loop:
                  POST /api/attempts/{attemptId}/heartbeat  every N seconds
                  PATCH /api/attempts/{attemptId}  (progress updates)
                  Auth: per-job worker token (separate from user JWT)
             │
             6. S3 PutObject: upload to splat-scenes bucket
                  outputs/{ sceneId }/manifest.json
                  outputs/{ sceneId }/*.splat / *.spz / point_cloud/
             │
             7. DynamoDB UpdateItem: status = COMPLETED
             8. SQS DeleteMessage (exponential backoff, max 5 retries)
             9. ASG DecrementDesiredCapacity → instance self-terminates

        On Spot interruption / process crash:
          Visibility timeout (45 min) expires → message becomes visible again
          After 3 failed receives → DLQ (14-day retention, KMS encrypted)

        On explicit cancel (POST /jobs/{sceneId}/cancel):
          DynamoDB status → CANCELLED
          Worker checks status before processing → drops message
```

### 5.6 Distribution & Viewing

```
Browser polls  GET /scenes/{sceneId}
  └─► scene-status.js (Lambda)
        DynamoDB GetItem → returns { status, ... }
        Browser polls until status = COMPLETED

Browser  GET /api/v1/scenes/{sceneId}/view-url
  └─► scene-view-url.js (Lambda)
        S3 presigned GET URL for splat artifact (expiresIn: 3600s)
        Return { viewUrl }

Browser  GET <viewUrl>  (Range requests for progressive loading)
  ──────────────────────────────────────────► S3 splat-scenes bucket
                                               CORS: GET, exposes Range header

GaussianViewer.tsx (WebGL/WebGPU)
  └─► splatviewer/ render pipeline
        Streams + decodes .splat/.spz binary
        Real-time Gaussian Splatting visualization
```

---

## 6. AWS Service Inventory

| Service | Resource Name Pattern | Purpose |
|---|---|---|
| S3 | `splatial-<env>-<domain-as-name>` | Static site (Next.js export) |
| S3 | `splatial-<env>-raw-scenes` | Raw upload inputs |
| S3 | `splatial-<env>-splat-scenes` | Trained output artifacts |
| S3 | `openspacenexus-terraform-state` | Terraform remote state |
| CloudFront | Distribution + OAC | Static site CDN, TLS termination |
| API Gateway | `splatial-<env>-gateway-api` | HTTP API, JWT Authorizer |
| Lambda | Upload handler | API routes (Node.js 18) |
| Lambda | `myfunc` (legacy) | Scaffold placeholder — to be removed |
| DynamoDB | `splatial-<env>-scenes` | Scene state machine |
| SQS | `splatial-<env>-splat-processing-queue` | Job dispatch queue |
| SQS | `splatial-<env>-splat-processing-dlq` | Dead-letter queue |
| Cognito | `splatial-<env>-user-pool` | User identity, JWT issuance |
| EC2 | G4dn.xlarge Spot | GPU training workers |
| EC2 ASG | `splatial-<env>-splat-worker-asg` | (Commented out — not deployed) |
| ACM | `*.openspacenexus.store` | Wildcard TLS cert (pre-existing) |
| Route53 | `openspacenexus.store` | DNS hosted zone |
| IAM | `splatial-<env>-github-deploy-role` | CI/CD deploy role (OIDC) |
| IAM | `splatial-<env>-upload-lambda-exec-role` | Lambda execution role |
| IAM | `splatial-<env>-splat-worker-instance-role` | EC2 worker instance role |
| VPC | `10.0.0.0/16` | Worker network isolation |
| CloudWatch | Log groups | Lambda + API GW logs |

---

## 7. Terraform Infrastructure — Resource Map

### 7.1 Module Structure

```
infra/
├── bootstrap/           Run ONCE manually to create:
│   └── main.tf            S3: openspacenexus-terraform-state (versioned, SSE, private)
│                          DynamoDB: lock table
│                          IAM: GitHub OIDC provider
│
├── envs/dev/            Environment entry point
│   ├── main.tf            module "static_site" source = ../../modules/static-site
│   │                      module "api_gateway_domain" source = ../../modules/api-gateway-domain
│   │                      provider alias: aws.us_east_1 = us-east-1
│   ├── backend.tf         s3://openspacenexus-terraform-state / dev key
│   └── outputs.tf
│
└── modules/static-site  Monolithic primary module
    └── src-upload/      Lambda source (bundled inside module)
```

**Provider injection pattern:** `aws.this` is aliased everywhere. The env root passes `providers = { aws.this = aws.us_east_1 }`. No implicit default provider exists within the module — region is always injected explicitly.

**IAM propagation:** `time_sleep.iam_propagation` (30s) gates DynamoDB table creation and S3 bucket creation after the deploy role policy update. This prevents race conditions where Terraform tries to create resources before the deploy role policy has fully propagated.

### 7.2 Per-.tf File Resource Inventory

| File | Resources | Key Details |
|---|---|---|
| `network.tf` | VPC, public/private subnets (×2 AZs), IGW, public route table + route + associations, API Gateway HTTP API, CloudWatch log group | VPC: `10.0.0.0/16`, DNS enabled; public: `10.0.1/2.0/24`; private: `10.0.11/12.0/24`; API GW CORS: pinned to domain + `cors_extra_origins` |
| `s3.tf` | Static site S3 bucket | Private, SSE-AES256, versioning |
| `s3-policy.tf` | S3 bucket policy for OAC | Allows CloudFront OAC sigv4 reads only |
| `s3-raw-scenes.tf` | Raw upload bucket + public access block + ownership controls + versioning + SSE + Transfer Acceleration + lifecycle + CORS | Lifecycle: abort incomplete multipart after 1d; expire noncurrent after 30d; CORS: PUT/POST/GET/DELETE, exposes ETag |
| `s3-splat-scenes.tf` | Output bucket + public access block + ownership controls + versioning + SSE + lifecycle + CORS | No Transfer Acceleration; CORS: GET only, exposes Range header (byte-range streaming) |
| `cloudfront.tf` | CloudFront distribution + OAC | PriceClass_100 (NA+EU), TLSv1.2_2021, IPv6, OAC always-sign sigv4, 403/404 → `/error.html`, compress=true |
| `acm.tf` | Data source: wildcard cert lookup | `*.openspacenexus.store` must pre-exist in `us-east-1` |
| `route53.tf` | A + AAAA alias records | Both point to CloudFront (dual-stack IPv6) |
| `auth.tf` | Cognito User Pool + App Client | Email auto-verified; password: 8+ chars upper/lower/num/symbol; auth flows: SRP, password, refresh, custom; no client secret (public SPA) |
| `dynamodb.tf` | ScenesTable | PK: `scene_id` (S); GSI: `user_id-status-index` (user_id PK, status SK, KEYS_ONLY projection); TTL: `expires_at`; PITR: enabled; SSE: enabled |
| `sqs.tf` | Processing queue + DLQ | Standard queue (NOT FIFO despite naming); visibility 2700s (45 min); KMS `alias/aws/sqs`; DLQ: 14-day retention; redrive: maxReceiveCount=3 |
| `lambda-upload.tf` | null_resource (npm install), archive_file (zip), Lambda function, exec IAM role, role policy attachment (BasicExecutionRole), inline data policy, API GW integration, Lambda permission | Triggers: SHA256 of `package.json` + all `**/*.js`; zips `src-upload/` including `node_modules/`; Lambda policy: S3 multipart on raw-scenes, DynamoDB full CRUD on ScenesTable+GSI, SQS SendMessage, S3 read/write on splat-scenes |
| `lambdas.tf` | Legacy `myfunc` Lambda + basic exec role + API GW integration + route (`GET /helloFromLambda`) | Scaffold/placeholder — should be removed |
| `compute.tf` | Security Group (egress-only), Launch Template | **ASG + Target Tracking Policy: fully commented out**; SG: no inbound, egress all; LT: `g4dn.xlarge` Spot one-time, 100 GiB gp3, private subnets, IMDSv2 required, `user_data` writes env file + starts `splat-worker.service` |
| `iam-worker.tf` | Worker instance role + instance profile + inline policy | SQS: receive/delete/change-visibility/get (main queue + DLQ); S3 raw-scenes: get+put; S3 splat-scenes: put; DynamoDB: get+update; ASG self-terminate (scoped by name); EC2 self-terminate (scoped by tag) |
| `iam-github-oidc.tf` | GitHub OIDC deploy role + inline policy + `time_sleep.iam_propagation` | Trust: `repo:Zinelaabidine/splatial:environment:<env>`; policy covers: Cognito, S3, CloudFront, Lambda, DynamoDB, SQS, SG, EC2, ASG, IAM PassRole, ACM, Route53, API GW, CloudWatch |
| `locals.tf` | `name_prefix`, `bucket_name`, `github_repo_full` | `name_prefix = "${project_name}-${environment}"` |
| `variables.tf` | All module inputs | `environment` validated as enum `[dev, staging, prod]`; `aws_region` default is `eu-east-1` (non-existent — always overridden by env `main.tf`) |
| `versions.tf` | Terraform `>= 1.10.0`, AWS `~> 6.0`, Archive `~> 2.0`, Null `~> 3.0`, Time `~> 0.12` | |
| `outputs.tf` | 20+ outputs | site_url, CloudFront distribution ID/ARN/domain, Cognito pool ID + client ID, API endpoint, invoke URL, API GW ID, VPC ID, public/private subnet IDs, hosted zone ID/name, S3 bucket names/ARNs, ACM cert ARN, deploy role ARN |

### 7.3 Remote State & Bootstrap

```
S3 Bucket: openspacenexus-terraform-state
  Versioning: Enabled
  SSE: AES256
  Public access: fully blocked
  Key layout:
    dev/terraform.tfstate
    staging/terraform.tfstate
    prod/terraform.tfstate

DynamoDB: lock table (provisioned in bootstrap)
  Used for state locking on concurrent applies

Rule: NEVER use local state. Never run terraform apply without the S3 backend configured.
```

### 7.4 Lambda Packaging Pipeline

```
terraform plan / apply
  │
  ├─ null_resource.upload_lambda_deps
  │   Triggers (content-addressed):
  │     SHA256(src-upload/package.json)
  │     SHA256(concat all src-upload/**/*.js sorted)
  │   Action: npm install --omit=dev
  │   Working dir: infra/modules/static-site/src-upload/
  │
  └─ data.archive_file.upload_zip
       source_dir:  src-upload/          (includes node_modules/)
       output_path: upload_payload.zip
         └─► aws_lambda_function.upload_handler
               runtime: nodejs18.x
               handler: upload.handler
```

> **Note:** `upload_payload.zip` and `function_payload.zip` are present in the module directory and tracked by git. This is a binary-in-repo pattern that should be addressed by adding them to `.gitignore` and relying solely on the Terraform packaging pipeline.

---

## 8. Lambda API — Route Map

All routes authenticated via API Gateway JWT Authorizer → Cognito User Pool, except worker callback routes which use a per-job worker token.

| Route Key | Handler | Purpose | Auth |
|---|---|---|---|
| `POST /upload/init` | `init.js` | CreateMultipartUpload in S3 + DynamoDB PutItem | Cognito JWT |
| `POST /upload/presign` | `presign.js` | Generate presigned UploadPart URL (TTL 3600s) | Cognito JWT |
| `POST /upload/complete` | `complete.js` | CompleteMultipartUpload + DynamoDB QUEUED + SQS SendMessage | Cognito JWT |
| `POST /jobs/submit` | `submit-job.js` | Alternative job dispatch entry point | Cognito JWT |
| `POST /jobs/{sceneId}/cancel` | `cancel-job.js` | Set DynamoDB status = CANCELLED | Cognito JWT |
| `PATCH /api/attempts/{attemptId}` | `attempt-patch.js` | Worker progress update | Worker token |
| `POST /api/attempts/{attemptId}/heartbeat` | `attempt-heartbeat.js` | Worker liveness signal | Worker token |
| `POST /api/v1/scenes` | `scene-create.js` | Create scene record in DynamoDB | Cognito JWT |
| `GET /api/v1/scenes` | `scenes-list.js` | List user's scenes (GSI query by user_id) | Cognito JWT |
| `GET /scenes/{sceneId}` | `scene-status.js` | Get scene status (legacy) | Cognito JWT |
| `DELETE /scenes/{sceneId}` | `scene-delete.js` | Delete scene record | Cognito JWT |
| `DELETE /api/v1/scenes/{sceneId}` | `scene-delete.js` | Delete scene record (v1) | Cognito JWT |
| `POST /api/v1/scenes/seed` | `scene-seed.js` | Seed test scenes (dev only) | Cognito JWT |
| `GET /api/v1/scenes/{sceneId}/view-url` | `scene-view-url.js` | Presigned GET URL for splat artifact | Cognito JWT |
| `GET /helloFromLambda` | legacy `myfunc` | Scaffold placeholder | Cognito JWT |

**Handler input validation — mandatory order (enforced by coding standard):**
1. Extract `userId` from `event.requestContext.authorizer.jwt.claims.sub` → 401 if absent
2. Parse `event.body` in try/catch → 400 on malformed JSON
3. Validate required string fields: `typeof x === "string" && x.trim() !== ""`
4. Sanitize filenames: `filename.replace(/[^a-zA-Z0-9._-]/g, "_")`
5. Validate ownership: key must start with `uploads/${userId}/` → 403 if false
6. Use `Set` allowlists for enumerations (`ALLOWED_CONTENT_TYPES`, `ALLOWED_INPUT_TYPES`)

---

## 9. IAM Boundary Model

### 9.1 Upload Lambda Exec Role

`splatial-<env>-upload-lambda-exec-role`

| Permission Scope | Actions | Resource |
|---|---|---|
| S3 raw-scenes | PutObject, DeleteObject, AbortMultipartUpload, ListMultipartUploadParts | `raw-scenes-bucket/*` |
| DynamoDB ScenesTable | GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan | `ScenesTable` + `ScenesTable/index/*` |
| SQS | SendMessage | `processing-queue` |
| S3 splat-scenes | GetObject, PutObject | `splat-scenes-bucket/*` |
| CloudWatch Logs | CreateLogGroup, CreateLogStream, PutLogEvents | (via AWSLambdaBasicExecutionRole) |

### 9.2 EC2 Worker Instance Role

`splatial-<env>-splat-worker-instance-role`

| Permission Scope | Actions | Resource |
|---|---|---|
| SQS | ReceiveMessage, DeleteMessage, ChangeMessageVisibility, GetQueueAttributes, GetQueueUrl | main queue + DLQ |
| S3 raw-scenes | GetObject, PutObject | `raw-scenes-bucket/*` |
| S3 splat-scenes | PutObject | `splat-scenes-bucket/*` |
| DynamoDB | GetItem, UpdateItem | `ScenesTable` (no delete, no query — minimal) |
| ASG self-terminate | TerminateInstanceInAutoScalingGroup | scoped to `splatial-<env>-splat-worker-asg` ARN pattern |
| ASG describe | DescribeAutoScalingInstances | `*` (required for self-lookup) |
| EC2 self-terminate | TerminateInstances | scoped to instances with tag `Environment=<env>` |

**No SSM permissions defined** — if SSM Session Manager is the intended management plane, `AmazonSSMManagedInstanceCore` policy attachment is missing.

### 9.3 GitHub OIDC Deploy Role

`splatial-<env>-github-deploy-role`

**Trust policy:**
```
Principal: arn:aws:iam::oidc-provider/token.actions.githubusercontent.com
Condition:
  aud = sts.amazonaws.com
  sub = repo:Zinelaabidine/splatial:environment:<env>
```

**Note:** Trust is scoped to GitHub Actions *environment*, not branch. Any branch targeting the `dev` environment in GitHub Actions can assume this role. Environment protection rules in GitHub are the gate for `staging` and `prod`.

**Covered services:** Cognito (user pool + client full lifecycle), S3 (site deploy, raw-scenes/splat-scenes config), CloudFront (invalidation), Lambda (code update + config), DynamoDB (full table lifecycle), SQS (full queue lifecycle), SG, EC2/ASG (Launch Template + ASG create/update), IAM (PassRole scoped), ACM (describe), Route53 (record management), API Gateway (full lifecycle), CloudWatch Logs.

---

## 10. Frontend Architecture

### Application Structure (Next.js App Router)

```
app/
├── layout.tsx          Root layout: <AmplifyProvider> wraps entire app tree
│                        Injects Cognito User Pool ID + Client ID from env vars
│                        (NEXT_PUBLIC_COGNITO_USER_POOL_ID, NEXT_PUBLIC_COGNITO_CLIENT_ID)
├── page.tsx            Landing page (public)
└── scenes/
    ├── page.tsx        /scenes — AuthGate → ScenesDashboard
    │                    Polls GET /api/v1/scenes for scene list + statuses
    ├── create/         Scene creation flow
    │                    Dropzone.tsx → multipart upload hook
    │                    POST /api/v1/scenes → POST /upload/init → POST /upload/presign ×N
    │                    → browser PUT to S3 → POST /upload/complete
    └── [sceneId]/      Scene viewer
                         GET /api/v1/scenes/{id}/view-url → presigned URL
                         GaussianViewer.tsx streams + renders .splat
```

### Key Components

| Component | Responsibility |
|---|---|
| `AmplifyProvider` | Configures Amplify with Cognito IDs; must be client component at root |
| `AuthGate` | Checks Amplify auth state; redirects unauthenticated users to sign-in |
| `Dropzone` | File picker (drag/drop + click); enforces allowed MIME types; drives upload hook |
| `GaussianViewer` | WebGL/WebGPU renderer; streams `.splat`/`.spz` binary via Range requests |
| `ScenesDashboard` | Scene list; polls scene status every N seconds; triggers navigation to viewer |
| `ViewerShell` | Layout wrapper for viewer page (sidebar + viewer canvas) |

### API Client Pattern (`utils/`)

All API calls attach the Cognito Access Token from the current Amplify session:
```typescript
const session = await fetchAuthSession();
const token = session.tokens?.accessToken?.toString();
fetch(url, { headers: { Authorization: `Bearer ${token}` } });
```

### Environment Variables Required (frontend)

```
NEXT_PUBLIC_COGNITO_USER_POOL_ID   = <cognito_user_pool_id output>
NEXT_PUBLIC_COGNITO_CLIENT_ID      = <cognito_client_id output>
NEXT_PUBLIC_API_URL                = https://api-<env>.openspacenexus.store
```

### Build & Dev Commands

```bash
cd site/my-app
npm install
npm run dev       # http://localhost:3000 (proxies to dev API; CORS allows localhost)
npm run build     # Static export; must pass before any merge
npm run lint
```

---

## 11. Worker Architecture

**Deployment model:** Pre-baked AMI (`ami-0512a845e4b778621` in us-east-1). Changes to `worker.py` require a full AMI rebuild and update to `locals.worker_ami_id` in `compute.tf`. Do not auto-update the AMI reference without a tested build.

**Lifecycle (one-message-per-instance):**
1. Instance boots → `user_data` writes env vars to `/etc/splatial-worker.env` → `systemctl start splat-worker.service`
2. `splat-worker.service` runs `worker.py`
3. Worker long-polls SQS (20s wait), processes exactly one message, then terminates the instance
4. If idle for `IDLE_EXIT_SECONDS` (default 120s) with no messages, terminates the instance

**Instance spec:**
- Type: `g4dn.xlarge` (NVIDIA T4 GPU, 4 vCPU, 16 GiB RAM)
- Market: Spot `one-time` (not persistent)
- Storage: 100 GiB gp3 EBS (delete on termination)
- Network: Private subnet, no public IP, egress-only SG
- IMDSv2: required (hop limit 1)

**Worker environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `RUN_ENV` | `local` | `local` or `ec2` mode |
| `QUEUE_NAME` | `splatial-dev-splat-processing-queue` | Injected via user_data |
| `DLQ_NAME` | `splatial-dev-splat-processing-dlq` | Injected via user_data |
| `WORKSPACE_ROOT` | `/tmp/streaming-splat` | Local working directory |
| `VISIBILITY_TIMEOUT_SECONDS` | 300 | New timeout set on each renewal |
| `VISIBILITY_EXTENSION_INTERVAL_SECONDS` | 150 | How often to renew |
| `IDLE_EXIT_SECONDS` | 120 | Idle termination threshold |
| `DELETE_MESSAGE_MAX_RETRIES` | 5 | Exponential backoff for SQS delete |
| `API_BASE_URL` | `https://api.zinelaabidine-nadir.com` | Callback URL for heartbeats |

**Training mode detection:**
- Input key ends in `.zip` → real `train.py` execution (3DGS)
- Any other input → legacy simulation mode (no real training)

**Spot interruption handling:**
- IMDSv2 termination notice polling (2-minute warning)
- On interrupt signal: S3 checkpoint current progress, set DynamoDB status = INTERRUPTED
- SQS message becomes visible after 45-min visibility timeout → auto-requeued
- After 3 failed receives → DLQ

---

## 12. Security Controls

| Control | Implementation | Status |
|---|---|---|
| Transport encryption | TLS 1.2+ (TLSv1.2_2021 on CloudFront) | ✅ |
| Data at rest | SSE-AES256 on all S3 buckets + DynamoDB | ✅ |
| SQS encryption | KMS `alias/aws/sqs` | ✅ |
| S3 public access | Blocked on all buckets (BucketOwnerEnforced) | ✅ |
| CloudFront OAC | sigv4 always-sign; no legacy OAI | ✅ |
| API authentication | Cognito JWT Authorizer on all user routes | ✅ |
| Lambda input validation | userId extraction + ownership check + allowlist enums | ✅ |
| Filename sanitization | `replace(/[^a-zA-Z0-9._-]/g, "_")` | ✅ |
| Worker credential isolation | IMDSv2 required (hop limit 1, prevents SSRF) | ✅ |
| Worker network | Egress-only SG; no inbound; SSM management plane | ✅ |
| CI/CD credentials | GitHub OIDC; no long-lived AWS keys | ✅ |
| Deploy role scope | Environment-scoped trust condition | ✅ |
| Terraform state | S3 backend + DynamoDB lock; no local state | ✅ |
| DynamoDB PITR | Point-in-time recovery enabled on ScenesTable | ✅ |
| S3 versioning | Enabled on raw-scenes, splat-scenes, static site | ✅ |
| Log security | `console.error` with structured context; raw `event` never logged | ✅ |
| Token logging | Tokens explicitly excluded from structured logs | ✅ |
| Worker callbacks | Per-job worker token (separate auth surface from user JWT) | ✅ |
| SSM managed instance | AmazonSSMManagedInstanceCore policy NOT attached | ⚠️ Gap |
| Hardcoded account ID | `886601940523` in `iam-github-oidc.tf` Cognito resource ARN | ⚠️ |

---

## 13. CI/CD Pipeline

```
GitHub repository: Zinelaabidine/splatial
Branch: dev → deploys to dev environment
        (staging/prod via branch protection + environment rules)

GitHub Actions workflow:
  trigger: push to branch / environment deploy
  │
  ├─ Frontend deploy:
  │   cd site/my-app && npm ci && npm run build
  │   aws s3 sync out/ s3://<static-site-bucket>/ --delete
  │   aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
  │
  ├─ Lambda deploy:
  │   cd infra/envs/<env>
  │   terraform init
  │   terraform plan
  │   terraform apply -auto-approve   (only for non-prod)
  │   (triggers null_resource → npm install → zip → Lambda update)
  │
  └─ OIDC auth:
       aws-actions/configure-aws-credentials
       role-to-assume: arn:aws:iam::886601940523:role/splatial-<env>-github-deploy-role
       role-session-name: github-actions-deploy
       aws-region: us-east-1
```

**Terraform commands (local / CI):**
```bash
cd infra/envs/<env>
terraform init
terraform fmt -recursive ../../     # Format all HCL before planning
terraform validate
terraform plan
terraform apply                     # Requires explicit approval; never -auto-approve in prod
```

---

## 14. Environment Matrix

| Attribute | `dev` | `staging` | `prod` |
|---|---|---|---|
| Domain | `splatial-dev.openspacenexus.store` | `splatial-staging.openspacenexus.store` | `splatial.openspacenexus.store` |
| API Domain | `api-dev.openspacenexus.store` | `api-staging.openspacenexus.store` | `api.openspacenexus.store` |
| CORS extra origins | `localhost:3000`, `127.0.0.1:3000` | None | None |
| `prevent_destroy` | No | No | Yes (stateful resources) |
| KMS encryption | SSE-AES256 (AWS managed) | SSE-AES256 | KMS CMK (customer managed) |
| Worker instance type | `g4dn.xlarge` | `g4dn.xlarge` | Configurable via variable |
| GitHub OIDC trust | `environment:dev` | `environment:staging` | `environment:prod` |
| Terraform backend key | `dev/terraform.tfstate` | `staging/terraform.tfstate` | `prod/terraform.tfstate` |

---

## 15. DynamoDB Schema & State Machine

**Table:** `splatial-<env>-scenes`
**Billing:** PAY_PER_REQUEST (no capacity planning required)
**Primary Key:** `scene_id` (String)

| Attribute | Type | Description |
|---|---|---|
| `scene_id` | S (PK) | UUID, generated by scene-create.js |
| `user_id` | S | Cognito sub claim; used for ownership validation |
| `status` | S | State machine value (see below) |
| `expires_at` | N | Unix epoch seconds; DynamoDB TTL attribute |
| `upload_id` | S | S3 multipart upload ID |
| `s3_key` | S | Object key in raw-scenes bucket |
| `output_key` | S | Object key in splat-scenes bucket (set on COMPLETED) |
| `created_at` | S | ISO timestamp |
| `attempt_id` | S | Current worker attempt ID |
| `worker_token` | S | Per-job worker auth token |

**GSI:** `user_id-status-index`
- Hash key: `user_id`, Range key: `status`
- Projection: KEYS_ONLY
- Used by `scenes-list.js` to query all scenes for a user, optionally filtered by status

**State machine:**
```
PENDING_UPLOAD → UPLOADED → QUEUED → PROCESSING → COMPLETED
                                  ↓                    ↓
                              CANCELLED             FAILED
                                                       ↓
                                              (SQS DLQ after 3 attempts)
```

**TTL policy:**
- `PENDING_UPLOAD`: expires after 24 hours (orphaned sessions cleanup)
- `PROCESSING`: expires after 7 days
- `COMPLETED`: no TTL set (permanent until user deletes)

---

## 16. SQS Queue Configuration

**Main Queue:** `splatial-<env>-splat-processing-queue`

| Parameter | Value | Rationale |
|---|---|---|
| Queue type | Standard (NOT FIFO) | At-least-once, best-effort ordering |
| Visibility timeout | 2700s (45 minutes) | Covers the longest expected 3DGS training run |
| Message retention | 14 days | Ensures jobs survive weekend outages |
| Encryption | KMS `alias/aws/sqs` | At-rest encryption |
| DLQ | `splatial-<env>-splat-processing-dlq` | |
| Max receive count | 3 | After 3 failed receives → DLQ |

**Dead Letter Queue:** `splatial-<env>-splat-processing-dlq`

| Parameter | Value |
|---|---|
| Message retention | 14 days |
| Encryption | KMS `alias/aws/sqs` |

> **Known mismatch:** `worker.py` defaults and documentation reference `.fifo` queue names. The Terraform resource is a standard queue. The `.fifo` suffix in environment variable defaults is misleading — the actual queue name does not have this suffix. Reconcile before adding deduplication or ordering requirements.

---

## 17. S3 Bucket Configuration Matrix

| Attribute | Static Site | Raw Scenes (input) | Splat Scenes (output) | Terraform State |
|---|---|---|---|---|
| Versioning | ✅ | ✅ | ✅ | ✅ |
| SSE | AES256 | AES256 | AES256 | AES256 |
| Public access | Blocked | Blocked | Blocked | Blocked |
| Object ownership | BucketOwnerEnforced | BucketOwnerEnforced | BucketOwnerEnforced | — |
| CORS | None (CloudFront) | PUT/POST/GET/DELETE, exposes ETag | GET only, exposes Range | None |
| Transfer Acceleration | No | ✅ Yes | No | No |
| Access method | CloudFront OAC | Lambda presigned UploadPart + CompleteMultipartUpload | Lambda presigned GET | Terraform backend |
| Lifecycle | None | Abort incomplete multipart: 1d; expire noncurrent: 30d | Expire noncurrent: 30d | — |
| Bucket name pattern | `<domain-as-dashes>` | `splatial-<env>-raw-scenes` | `splatial-<env>-splat-scenes` | `openspacenexus-terraform-state` |

---

## 18. Known Gaps & Open Issues

| # | Finding | Severity | Location | Impact |
|---|---|---|---|---|
| 1 | **ASG + Target Tracking Policy fully commented out** | 🔴 High | `compute.tf` | No automated scaling; workers must be manually launched |
| 2 | **No NAT Gateway in Terraform** | 🔴 High | `network.tf` | Private-subnet workers cannot reach SQS, DynamoDB, SSM, or Cognito (all public endpoints) |
| 3 | **No VPC Endpoints for SQS / DynamoDB / SSM** | 🔴 High | `network.tf` | Same impact as #2; required for private subnet egress without NAT |
| 4 | **SQS FIFO/Standard mismatch** | 🟡 Medium | `sqs.tf`, `worker.py` | `worker.py` defaults reference `.fifo` queue names; Terraform provisions a standard queue. Naming inconsistency causes confusion; fails hard if FIFO features (deduplication) are relied upon |
| 5 | **Real video-to-3DGS pipeline not wired** | 🟡 Medium | `worker.py` | Non-ZIP inputs (`.mp4`, `.mov`, raw images) fall into legacy simulation mode; real COLMAP → 3DGS pipeline is not executed |
| 6 | **`upload_payload.zip` + `function_payload.zip` committed to git** | 🟡 Medium | Module root | Binary artifacts in version control; stale zips can diverge from source; should be `.gitignore`d |
| 7 | **`variables.tf` default region is `eu-east-1`** (non-existent region) | 🟢 Low | `variables.tf` | Always overridden by env `main.tf`; harmless in practice but a foot-gun |
| 8 | **Legacy `myfunc` Lambda + `GET /helloFromLambda` route** | 🟢 Low | `lambdas.tf`, `network.tf` | Dead scaffold code consuming an IAM role and an API GW route; should be removed |
| 9 | **Account ID hardcoded** (`886601940523` in Cognito resource ARN) | 🟢 Low | `iam-github-oidc.tf` | Works, but blocks multi-account reuse; replace with `data.aws_caller_identity.current.account_id` |
| 10 | **`AmazonSSMManagedInstanceCore` not attached to worker role** | 🟢 Low | `iam-worker.tf` | SSM Session Manager (the intended management plane) requires this policy attachment |
| 11 | **`worker.py` `API_BASE_URL` default points to personal domain** | 🟢 Low | `worker.py` | Should reference `api-<env>.openspacenexus.store` pattern; injected via env file in production but default is misleading |

---

## 19. Production Readiness Checklist

### Fully Production-Ready ✅

- Static site delivery (CloudFront + OAC, TLS 1.2+, dual-stack IPv6)
- Multipart upload pipeline (browser → S3, Lambda orchestration only)
- DynamoDB state machine (schema, GSI, TTL, PITR, SSE)
- Cognito User Pool (SRP, JWT, email verification)
- API Gateway HTTP API (CORS, JWT Authorizer, CloudWatch logging)
- GitHub OIDC deploy role (no long-lived keys, environment-scoped)
- S3 lifecycle rules (incomplete multipart cleanup, noncurrent expiry)
- S3 Transfer Acceleration on raw-scenes bucket
- Worker IAM role (least-privilege, IMDSv2 enforced)
- SQS DLQ + 45-min visibility timeout
- Remote state + DynamoDB lock
- Multi-AZ private subnets provisioned
- SQS + DynamoDB KMS encryption

### Needs Work Before Full Production ⚠️

- [ ] Uncomment and enable ASG + Target Tracking Policy (`compute.tf`)
- [ ] Provision NAT Gateways OR VPC Interface Endpoints for SQS, DynamoDB, SSM (`network.tf`)
- [ ] Reconcile SQS FIFO/standard naming (`sqs.tf` + `worker.py` defaults)
- [ ] Wire real COLMAP → 3DGS pipeline for video/image inputs (not just ZIP)
- [ ] Add `upload_payload.zip` and `function_payload.zip` to `.gitignore`
- [ ] Replace hardcoded account ID with `data.aws_caller_identity.current.account_id`
- [ ] Attach `AmazonSSMManagedInstanceCore` to worker instance role
- [ ] Remove legacy `myfunc` Lambda and `GET /helloFromLambda` route
- [ ] Fix `variables.tf` default region (`eu-east-1` → `us-east-1`)
- [ ] Set `API_BASE_URL` in `user_data` env file (currently uses personal domain default)

---

## 20. Unified System Architecture Map

This diagram combines the frontend, Lambda API, data stores, compute plane, and distribution layer into a single reference view. Read top-to-bottom as the user request path; right-side annotations show the infrastructure resource each arrow traverses.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  BROWSER  (Next.js 16 / React 19 / TypeScript / Tailwind + shadcn/ui)       │
│                                                                              │
│  AmplifyProvider (root layout)                                               │
│    └─ Cognito SRP challenge ──────────────────────────────────────────────► │
│       Cognito User Pool (email SRP, JWT)                                     │
│    ◄─ ID Token + Access Token + Refresh Token ──────────────────────────── │
│       (Amplify handles silent refresh transparently)                         │
│                                                                              │
│  AuthGate: all /scenes/* routes require valid Amplify session                │
│                                                                              │
│  Dropzone.tsx ──── multipart upload hook ──────────────────────────────────►│
│  GaussianViewer.tsx ◄── HTTP Range streaming (.splat / .spz) ──────────────►│
└─────────────────┬────────────────────────────────────┬───────────────────────┘
                  │ All API calls                       │ presigned GET (splat)
                  │ Authorization: Bearer <access_token>│ (Range requests)
                  ▼                                     ▼
┌──────────────────────────────┐     ┌──────────────────────────────────────────┐
│  API Gateway HTTP API        │     │  S3: splatial-<env>-splat-scenes         │
│  api-<env>.openspace...store │     │  (output bucket)                         │
│                              │     │  CORS: GET only, exposes Range header     │
│  JWT Authorizer              │     │  Versioning + SSE-AES256                 │
│  → Cognito JWKS validation   │     │  Lifecycle: expire noncurrent 30d        │
│  Invalid/expired → 401       │     └──────────────────────────────────────────┘
└──────────────┬───────────────┘                  ▲
               │                                  │ PutObject (manifest.json + .splat)
               ▼                                  │
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAMBDA  (Node.js 18.x, CommonJS, no build step)                            │
│  infra/modules/static-site/src-upload/                                       │
│                                                                              │
│  upload.js (router) → handlers/                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ POST /api/v1/scenes      scene-create.js   → DynamoDB PutItem       │    │
│  │ POST /upload/init        init.js           → S3 CreateMultipartUpload│   │
│  │                                            → DynamoDB UpdateItem    │    │
│  │ POST /upload/presign     presign.js        → S3 presigned UploadPart│    │
│  │ POST /upload/complete    complete.js       → S3 CompleteMultipart   │    │
│  │                                            → DynamoDB status=QUEUED │    │
│  │                                            → SQS SendMessage        │    │
│  │                                            → HTTP 202 (immediate)   │    │
│  │ GET  /api/v1/scenes      scenes-list.js    → DynamoDB GSI Query     │    │
│  │ GET  /scenes/{id}        scene-status.js   → DynamoDB GetItem       │    │
│  │ GET  /api/v1/scenes/{id}/view-url          → S3 presigned GET URL   │    │
│  │ DELETE /scenes/{id}      scene-delete.js   → DynamoDB DeleteItem    │    │
│  │ POST /jobs/{id}/cancel   cancel-job.js     → DynamoDB status=CANCELLED│  │
│  │ POST /api/attempts/{id}/heartbeat          → DynamoDB UpdateItem    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  NEVER receives binary bytes. All file data flows browser ↔ S3 directly.   │
└──────┬───────────────────┬────────────────────┬────────────────────────────┘
       │ PutItem/UpdateItem│ SendMessage         │ CreateMultipartUpload
       │ GetItem/Query     │                     │ CompleteMultipartUpload
       │ DeleteItem        │                     │ PresignedUrl generation
       ▼                   ▼                     ▼
┌─────────────┐  ┌─────────────────────┐  ┌──────────────────────────────────┐
│  DynamoDB   │  │  SQS Standard       │  │  S3: splatial-<env>-raw-scenes   │
│  ScenesTable│  │  processing-queue   │  │  (input bucket)                  │
│             │  │                     │  │  Transfer Acceleration enabled    │
│  PK:scene_id│  │  Visibility: 45 min │  │  CORS: PUT/POST/GET/DELETE       │
│  GSI:       │  │  Retention: 14 days │  │  Exposes ETag header             │
│  user_id +  │  │  KMS encrypted      │  │  Versioning + SSE-AES256         │
│  status     │  │        │            │  │  Lifecycle: abort incomplete 1d  │
│  TTL:       │  │        │ DLQ after  │  └──────────────┬───────────────────┘
│  expires_at │  │        │ 3 failures │                 │ presigned PUT (parts)
│  PITR on    │  │        ▼            │                 │ direct browser → S3
│  PAY_PER_   │  │  splat-processing   │                 │ (Transfer Acceleration)
│  REQUEST    │  │  -dlq (14d, KMS)   │                 │
└─────────────┘  └─────────┬───────────┘                 │
                            │ ReceiveMessage               │ GetObject
                            ▼                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  EC2 G4dn.xlarge Spot  (NVIDIA T4 GPU, 4 vCPU, 16 GiB)                     │
│  Private subnet (10.0.11/12.0/24), no public IP, egress-only SG             │
│  Pre-baked AMI: ami-0512a845e4b778621                                        │
│  IMDSv2 required (hop limit 1)                                               │
│                                                                              │
│  worker.py  (Python 3)                                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 1. SQS long-poll (WaitTimeSeconds=20)                                 │  │
│  │    Idle > 120s → ASG DecrementDesiredCapacity → self-terminate        │  │
│  │                                                                       │  │
│  │ 2. On message received:                                               │  │
│  │    a. DynamoDB check: CANCELLED? → delete msg, continue               │  │
│  │    b. DynamoDB UpdateItem: status = PROCESSING                        │  │
│  │    c. Background thread: renew SQS visibility every 150s             │  │
│  │                                                                       │  │
│  │ 3. S3 GetObject → /tmp/streaming-splat/<sceneId>/                    │  │
│  │    (via S3 Gateway VPC Endpoint — free, no NAT required)             │  │
│  │                                                                       │  │
│  │ 4. Training:                                                          │  │
│  │    ZIP input   → train.py (3DGS, ~10k iterations, T4 GPU)            │  │
│  │    Video/image → [GAP] COLMAP → train.py (not yet wired)             │  │
│  │    Logs streamed to Python logger → CloudWatch                       │  │
│  │                                                                       │  │
│  │ 5. Heartbeat loop: POST /api/attempts/{id}/heartbeat every 30s       │  │
│  │    → Lambda → DynamoDB UpdateItem (progress %)                       │  │
│  │    [GAP] requires SQS+DDB VPC Endpoints or NAT GW for API calls      │  │
│  │                                                                       │  │
│  │ 6. S3 PutObject → splatial-<env>-splat-scenes/outputs/<sceneId>/     │  │
│  │    manifest.json + *.splat / *.spz / point_cloud/                    │  │
│  │                                                                       │  │
│  │ 7. DynamoDB UpdateItem: status = COMPLETED                            │  │
│  │ 8. SQS DeleteMessage (exponential backoff, max 5 retries)            │  │
│  │ 9. ASG TerminateInstanceInAutoScalingGroup (decrement desired)        │  │
│  │    [GAP] ASG commented out → self-terminate call fails               │  │
│  │                                                                       │  │
│  │ Spot interruption:                                                    │  │
│  │    IMDSv2 termination notice (2-min warning)                         │  │
│  │    → S3 checkpoint, DynamoDB status = INTERRUPTED                    │  │
│  │    → visibility timeout expires → message requeued automatically     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                              ▲
                              │  (all outbound)
┌──────────────────────────────────────────────────────────────────────────────┐
│  VPC  10.0.0.0/16  (us-east-1)                                              │
│                                                                              │
│  Public subnets:  10.0.1.0/24 (1a)  10.0.2.0/24 (1b)                       │
│  Private subnets: 10.0.11.0/24 (1a) 10.0.12.0/24 (1b)  ← workers live here │
│                                                                              │
│  Internet Gateway → public route table                                       │
│  S3 Gateway Endpoint → private subnets (free S3 egress)  ✅                 │
│  [GAP] No NAT Gateway                                     ❌                 │
│  [GAP] No Interface VPC Endpoints for SQS/DynamoDB/SSM   ❌                 │
└──────────────────────────────────────────────────────────────────────────────┘

GLOBAL / REGIONAL SERVICES (outside VPC)
┌──────────────────────────────────────────────────────────────────────────────┐
│  CloudFront PriceClass_100 (NA+EU)                                          │
│    → S3 static site (OAC sigv4, TLSv1.2_2021, IPv6, compress=true)         │
│    splatial-<env>.openspacenexus.store → CloudFront → S3                    │
│    Custom errors: 403/404 → /error.html                                      │
│                                                                              │
│  Route53: openspacenexus.store hosted zone                                  │
│    A + AAAA → CloudFront (dual-stack)                                        │
│    A + AAAA → API Gateway custom domain                                      │
│                                                                              │
│  ACM: *.openspacenexus.store (wildcard, must pre-exist in us-east-1)        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 21. Infrastructure ↔ Application Constraint Mapping

Each application-layer constraint is mapped to the specific infrastructure mechanism that satisfies (or currently fails to satisfy) it.

| Application Constraint | Root Cause | Infrastructure Mechanism | Status |
|---|---|---|---|
| Lambda 6 MB payload limit | S3 multipart presigned URLs | Browser uploads directly to S3; Lambda only receives JSON metadata (~1 KB) | ✅ Satisfied |
| Lambda 15-minute execution limit | SQS + EC2 async decoupling | Lambda returns `202` in <200ms; training runs on EC2 for hours | ✅ Satisfied |
| Large file upload reliability | Multipart + ETag reassembly | S3 multipart (min 5 MiB/part, max 10,000 parts); per-part retry; Transfer Acceleration on raw-scenes bucket | ✅ Satisfied |
| GPU compute cost control | Spot + idle termination | G4dn Spot `one-time`; `IDLE_EXIT_SECONDS=120` → ASG DecrementDesiredCapacity; pay only while training | ⚠️ ASG commented out |
| Spot interruption resilience | SQS visibility + S3 checkpoint | 45-min visibility timeout; message requeued after worker death; DLQ after 3 failures; S3 checkpoint on SIGTERM | ✅ Satisfied |
| Zero binary data through Lambda | Presigned URL pattern | `presign.js` generates UploadPart URLs; Lambda never calls `GetObject`/`PutObject` on raw asset bytes | ✅ Satisfied |
| Worker network isolation | Private subnet + egress-only SG | Workers in `10.0.11/12.0/24`; SG: no inbound, egress all; IMDSv2 hop limit=1 (prevents SSRF) | ✅ Satisfied |
| Worker reachability for ops | SSM Session Manager | Egress-only SG has no inbound SSH; SSM is the management plane — requires VPC endpoints + IAM policy | ❌ Both missing |
| Worker → SQS / DynamoDB access | VPC Endpoints or NAT | Private subnet has S3 GW Endpoint only; SQS and DynamoDB are not gateway-type services — require Interface Endpoints or NAT | ❌ Missing |
| Duplicate job prevention (SQS Standard) | Idempotency in worker | Worker checks DynamoDB status before training; 45-min visibility; exponential-backoff delete | ⚠️ Partial (status check present, no MessageDeduplicationId) |
| Auth boundary enforcement | API Gateway JWT Authorizer | Every route (except worker callbacks) validated against Cognito JWKS before Lambda invocation | ✅ Satisfied |
| Zero standing credentials | OIDC + IMDSv2 instance role | GitHub Actions: OIDC deploy role (no secrets); EC2: IMDSv2 instance profile; no static keys anywhere | ✅ Satisfied |
| S3 public access prevention | OAC + bucket policy | CloudFront OAC sigv4 on static site; presigned time-limited URLs on data buckets; all buckets: public access blocked | ✅ Satisfied |
| Multi-environment isolation | Terraform env roots + OIDC trust | Separate state files; OIDC trust scoped to GitHub environment; `prevent_destroy` on prod stateful resources | ✅ Satisfied |
| Frontend SPA served globally | CloudFront | PriceClass_100 (NA+EU); static Next.js export to S3; HSTS via TLSv1.2_2021 policy | ✅ Satisfied |
| Splat streaming (large binary, Range) | S3 CORS + presigned GET | `splat-scenes` CORS exposes `Range` header; Lambda generates presigned GET URL; CloudFront not in splat data path | ✅ Satisfied |

---

## 22. Prioritized Remediation Plan

Items are ordered by operational impact. P0 items must be resolved before any end-to-end job can complete. P1 items unblock production scale-out. P2 items are correctness/hygiene.

---

### P0-A — VPC Interface Endpoints for SQS, DynamoDB, and SSM

**Root cause:** Workers in private subnets (`10.0.11/12.0/24`) cannot reach SQS or DynamoDB because both are public HTTPS endpoints. The S3 Gateway Endpoint (free, already provisioned) only covers S3. Every `worker.py` SQS poll and DynamoDB heartbeat write will time out until this is fixed.

**Recommended fix:** Add Interface VPC Endpoints. This is cheaper than a NAT Gateway for dev (no per-GB charge, only per-hour). For `staging`/`prod` with other services needing internet egress, NAT Gateways become the right choice.

Create `infra/modules/static-site/vpc-endpoints.tf`:

```hcl
# vpc-endpoints.tf
# Interface VPC Endpoints — allow private-subnet workers to reach
# SQS, DynamoDB, and SSM without a NAT Gateway.

locals {
  endpoint_services = [
    "sqs",
    "dynamodb",       # Interface endpoint (distinct from the Gateway endpoint)
    "ssm",
    "ssmmessages",
    "ec2messages",
  ]
}

resource "aws_vpc_endpoint" "private_services" {
  for_each = toset(local.endpoint_services)

  provider            = aws.this
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.worker_sg.id]
  private_dns_enabled = true

  tags = {
    Name        = "${local.name_prefix}-endpoint-${each.key}"
    Environment = var.environment
  }
}
```

Also add an inbound rule to the worker Security Group (in `compute.tf`) to allow HTTPS traffic from within the VPC to the endpoint ENIs:

```hcl
# Add to the existing worker security group resource in compute.tf
ingress {
  description = "HTTPS to VPC Interface Endpoints"
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = [aws_vpc.main.cidr_block]
}
```

---

### P0-B — Attach `AmazonSSMManagedInstanceCore` to Worker Role

**Root cause:** `iam-worker.tf` provisions the instance role but does not attach the managed policy required by SSM Session Manager. Without it, the SSM agent on the worker cannot register with the control plane, making shell access impossible.

Add to `infra/modules/static-site/iam-worker.tf`:

```hcl
resource "aws_iam_role_policy_attachment" "worker_ssm" {
  provider   = aws.this
  role       = aws_iam_role.splat_worker_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
```

> Note: verify the exact `aws_iam_role` resource name in `iam-worker.tf` before applying.

---

### P1-A — Resolve SQS FIFO / Standard Naming Mismatch

**Root cause:** `worker.py` environment variable defaults reference `splatial-dev-splat-processing-queue.fifo` and `splatial-dev-splat-processing-dlq.fifo`. Terraform `sqs.tf` provisions a Standard queue (no `.fifo` suffix, `fifo_queue` attribute absent/false). The `GetQueueUrl` API call returns a 404 at worker startup.

**Recommended resolution:** Convert the queue to FIFO. This adds exactly-once delivery and `MessageDeduplicationId` (use `sceneId`), which eliminates the duplicate-processing risk inherent in a Standard queue. FIFO standard throughput (300 msg/s) is sufficient for this workload.

Changes required:

**`infra/modules/static-site/sqs.tf`** — add FIFO attributes:
```hcl
resource "aws_sqs_queue" "processing_queue" {
  # ... existing config ...
  name                        = "${local.name_prefix}-splat-processing-queue.fifo"
  fifo_queue                  = true
  content_based_deduplication = false   # use explicit MessageDeduplicationId
  # ... rest unchanged ...
}

resource "aws_sqs_queue" "processing_dlq" {
  name                        = "${local.name_prefix}-splat-processing-dlq.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  # ... rest unchanged ...
}
```

**`infra/modules/static-site/src-upload/handlers/complete.js`** — add required FIFO parameters to `SendMessage`:
```javascript
const sendParams = {
  QueueUrl: process.env.PROCESSING_QUEUE_URL,
  MessageBody: JSON.stringify({ jobId: sceneId, s3Key: key, userId }),
  MessageGroupId: sceneId,           // required for FIFO
  MessageDeduplicationId: sceneId,   // idempotency key: one job per scene
};
```

**`worker.py`** — the `.fifo` suffix in `QUEUE_NAME` / `DLQ_NAME` defaults already matches; no change needed to worker once Terraform is updated.

---

### P1-B — Uncomment ASG and Target Tracking Policy

**Root cause:** The `aws_autoscaling_group` and `aws_autoscaling_policy` blocks in `compute.tf` are commented out. The worker's self-termination call (`TerminateInstanceInAutoScalingGroup`) will error with `InvalidInstanceID.NotFound` at the end of every job because the instance was manually launched outside an ASG.

**Action:** Uncomment the ASG resource and its Target Tracking policy in `compute.tf`. Key parameters to verify before apply:
- `min_size = 0`, `max_size = 5` (adjust to budget)
- `desired_capacity = 0` (scale-to-zero at rest)
- `launch_template` references the existing `aws_launch_template` resource
- `vpc_zone_identifier` points to `aws_subnet.private[*].id`
- Target Tracking: scale on SQS `ApproximateNumberOfMessagesVisible`, target = 1 (one instance per queued job)

---

### P2-A — Worker Idempotency Guard

**Root cause:** SQS Standard (and even FIFO with `VisibilityTimeout` races) can deliver the same message more than once. The worker should check DynamoDB status before starting training.

Add to `worker.py`, inside the message processing block, before calling any training function:

```python
def is_job_already_processed(dynamodb_client, table_name: str, scene_id: str) -> bool:
    """Return True if the job is already COMPLETED or has a recent PROCESSING heartbeat."""
    response = dynamodb_client.get_item(
        TableName=table_name,
        Key={"scene_id": {"S": scene_id}},
        ProjectionExpression="#s, updated_at",
        ExpressionAttributeNames={"#s": "status"},
    )
    item = response.get("Item", {})
    status = item.get("status", {}).get("S", "")
    if status in ("COMPLETED", "CANCELLED"):
        log.info("Job %s already in terminal state %s — skipping", scene_id, status)
        return True
    return False
```

Call `is_job_already_processed()` after receiving the SQS message. If it returns `True`, delete the message and continue polling without running training.

---

### P2-B — Remove Legacy Lambda Scaffold

**Root cause:** `lambdas.tf` provisions a `myfunc` Lambda with a basic execution role, and `network.tf` registers a `GET /helloFromLambda` API Gateway route pointing to it. This is dead code consuming IAM resources and a Lambda function slot.

**Action:** Delete the `aws_lambda_function.myfunc`, its IAM role, the `aws_apigatewayv2_integration` for it, and the `aws_apigatewayv2_route` for `GET /helloFromLambda` from `lambdas.tf` and `network.tf`. Run `terraform plan` to confirm only deletions are shown before applying.

---

### P2-C — Replace Hardcoded Account ID

**Root cause:** `iam-github-oidc.tf` contains a hardcoded account ID (`886601940523`) in a Cognito resource ARN. This blocks using the module in other AWS accounts.

Add a data source and replace the literal:

```hcl
# In versions.tf or a new data.tf
data "aws_caller_identity" "current" {
  provider = aws.this
}
```

Replace all occurrences of `886601940523` with `data.aws_caller_identity.current.account_id`.

---

### P2-D — Binary Artifacts in Git

**Root cause:** `upload_payload.zip` and `function_payload.zip` are committed to the repository. These are generated by the Terraform `archive_file` data source and will silently diverge from source if regenerated without a commit.

Add to the project root `.gitignore`:
```
infra/modules/static-site/upload_payload.zip
infra/modules/static-site/function_payload.zip
```

Remove the existing committed files:
```bash
git rm --cached infra/modules/static-site/upload_payload.zip
git rm --cached infra/modules/static-site/function_payload.zip
```

---

### P3 — Wire Real COLMAP Video Pipeline in Worker AMI

**Root cause:** `worker.py` explicitly falls through to a legacy simulation for non-ZIP inputs (`.mp4`, `.mov`, raw image directories). The real 3DGS pipeline requires a COLMAP camera pose estimation step before `train.py` can run. This is the highest-effort gap.

**Scope:** This is an AMI-level change, not a Terraform change.

**Work required:**
1. Install COLMAP on the worker AMI build (apt: `colmap`, or build from source for CUDA support)
2. Add a `run_colmap(input_path: str, workspace_dir: str) -> str` function in `worker.py` that:
   - For video: runs `ffmpeg` to extract frames, then `colmap automatic_reconstructor`
   - For image directories: runs `colmap automatic_reconstructor` directly
   - Returns path to the COLMAP `sparse/` output directory
3. Pass the COLMAP output as `--source_path` to `train.py`
4. Bake a new AMI, test end-to-end, update `locals.worker_ami_id` in `compute.tf`

---

### Remediation Execution Order

| Step | Action | File(s) | Effort | Unblocks |
|---|---|---|---|---|
| 1 | VPC Interface Endpoints (SQS, DDB, SSM endpoints) | new `vpc-endpoints.tf` + `compute.tf` SG ingress | ~1h | Worker network connectivity |
| 2 | Attach `AmazonSSMManagedInstanceCore` | `iam-worker.tf` | ~5 min | SSM shell access for debugging |
| 3 | Convert SQS to FIFO + update `complete.js` | `sqs.tf` + `complete.js` | ~30 min | Worker startup, deduplication |
| 4 | Uncomment ASG + Target Tracking | `compute.tf` | ~30 min | Automated scale-out/in, self-terminate |
| 5 | Worker idempotency guard | `worker.py` | ~15 min | Safe duplicate message handling |
| 6 | Remove legacy `myfunc` Lambda + route | `lambdas.tf`, `network.tf` | ~10 min | Hygiene |
| 7 | Replace hardcoded account ID | `iam-github-oidc.tf`, `versions.tf` | ~10 min | Multi-account portability |
| 8 | Remove zip artifacts from git + `.gitignore` | `.gitignore` + `git rm` | ~5 min | Clean VCS history |
| 9 | COLMAP video pipeline + AMI rebuild | `worker.py` + AMI bake | ~2–3 days | Video input support |

Steps 1–5 are the functional critical path. Steps 1–5 together take approximately 2–3 hours of IaC work and fully unblock an end-to-end ZIP-input job. Steps 6–8 are hygiene and can be done alongside any other PR. Step 9 is a separate workstream.
