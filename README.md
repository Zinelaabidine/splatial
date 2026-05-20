<div align="center">

# ✦ Splatial

### From photos to photorealistic 3D — in minutes, in your browser.

A high-performance, cloud-native **3D Gaussian Splatting** pipeline.  
Upload a photo or video collection, train a radiance field on GPU-backed spot workers,  
and render the result in real-time directly inside a web browser.

<br/>

![Deploy](https://github.com/zinelaabidinenadir/splatial/actions/workflows/deploy.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![IaC](https://img.shields.io/badge/IaC-Terraform-7B42BC?logo=terraform)
![Runtime](https://img.shields.io/badge/runtime-AWS%20Serverless-FF9900?logo=amazonaws)
![Frontend](https://img.shields.io/badge/frontend-Next.js%2024-black?logo=next.js)

</div>

<div align="center">
  <img src="./docs/images/pipeline.png" alt="Splatial Pipeline — From photos to photorealistic 3D in your browser" width="900"/>
</div>

---

## ✦ Core Features

- **⚡ CUDA-Accelerated Training on Spot Instances** — EC2 G4dn / G5 GPU workers train your scenes in minutes at a fraction of on-demand cost. Spot interruptions are handled gracefully via S3 checkpointing and SQS re-queuing — no work is ever lost.

- **🌐 Real-Time Browser Rendering** — Completed splats are delivered over CloudFront and rendered in real-time in the web viewer. No plugin, no download, no compromise.

- **🔐 Secure, Quota-Aware API** — Every request is JWT-validated through a native AWS Cognito Authorizer on API Gateway. Per-user scene quotas are enforced at the Lambda layer via DynamoDB, supporting Free and Pro tiers out of the box.

- **☁️ Fully Serverless, Multi-Environment Infrastructure** — The entire cloud stack — VPC, S3, CloudFront, API Gateway, Lambda, DynamoDB, SQS, ACM, Route 53 — is defined as Terraform modules with `dev`, `staging`, and `prod` workspaces. One `git push` deploys everything.

- **🔄 Zero-Touch CI/CD Pipeline** — GitHub Actions runs lint, Terraform format checks, `terraform apply`, Next.js builds, S3 sync, and CloudFront invalidation automatically on every push to a tracked branch.

---

## ✦ Architecture at a Glance

> For the full technical breakdown — network topology, IAM design, spot-interruption recovery, scaling rules, and file format schemas — see the **[`/docs`](./docs/architecture.md)** directory.

---

## ✦ Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| [Node.js](https://nodejs.org/) | ≥ 24 |
| [Python](https://www.python.org/) | ≥ 3.10 |
| [CUDA Toolkit](https://developer.nvidia.com/cuda-toolkit) | ≥ 11.8 |
| [Terraform](https://www.terraform.io/) | ≥ 1.9 |
| AWS CLI (configured) | ≥ 2.x |

---

### 1 · Clone the Repository

```bash
git clone https://github.com/your-org/splatial.git
cd splatial
```

---

### 2 · Configure Infrastructure Variables

```bash
# Copy the example vars file for your target environment
cp infra/terraform.tfvars.example infra/terraform.tfvars

# Open and fill in your domain, AWS account ID, and region
nano infra/terraform.tfvars
```

---

### 3 · Bootstrap the Terraform State Backend

> This only needs to be run once per AWS account to create the S3 state bucket and DynamoDB lock table.

```bash
cd infra/bootstrap
terraform init
terraform apply
```

---

### 4 · Deploy the Cloud Infrastructure

```bash
cd infra/envs/dev
terraform init
terraform apply
```

---

### 5 · Set Up the Frontend

```bash
cd site/my-app

# Install dependencies
npm install

# Copy the environment template and fill in the Terraform outputs
cp .env.local.example .env.local
nano .env.local
```

Your `.env.local` should look like:

```env
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_USER_POOL_ID=<cognito_user_pool_id>
NEXT_PUBLIC_CLIENT_ID=<cognito_client_id>
NEXT_PUBLIC_API_GATEWAY_URL=<api_endpoint>
NEXT_PUBLIC_RAW_SCENES_BUCKET=<raw_scenes_bucket_name>
NEXT_PUBLIC_SCENES_TABLE=<scenes_table_name>
```

---

### 6 · Run the Local Viewer

```bash
# Start the Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign up, upload a photo set, and watch your scene train.

---

## ✦ Deployment (CI/CD)

Splatial ships with a fully automated GitHub Actions pipeline. Every push to a tracked branch runs lint, format checks, infrastructure apply, and a production build — then syncs the static output to S3 and invalidates CloudFront.

| Branch | Environment | Terraform Workspace |
|---|---|---|
| `dev` | Development | `infra/envs/dev` |
| `staging` | Staging | `infra/envs/staging` |
| `main` | Production | `infra/envs/prod` |

Required GitHub environment secrets:

```
AWS_ACCOUNT_ID
# IAM role ARN is resolved dynamically from branch name — no static credentials stored.
```

---

## ✦ Repository Structure

```
splatial/
├── site/
│   └── my-app/          # Next.js 24 frontend (React, Amplify, Cognito)
├── infra/
│   ├── bootstrap/       # One-time state backend provisioning
│   ├── envs/            # Per-environment Terraform roots (dev / staging / prod)
│   └── modules/
│       ├── static-site/ # CloudFront, S3, Cognito, Lambda, DynamoDB, SQS, VPC
│       └── api-gateway-domain/ # Custom domain + ACM + Route 53
├── docs/
│   ├── architecture.md  # Full technical deep-dive
│   └── images/          # Architecture diagrams
└── .github/
    └── workflows/
        └── deploy.yml   # CI/CD pipeline
```

---

## ✦ Technical Deep Dive

> The `/docs` directory is the authoritative reference for everything under the hood.

| Document | Contents |
|---|---|
| [`docs/architecture.md`](./docs/architecture.md) | Full pipeline blueprint, VPC design, IAM strategy, spot-interruption recovery, SQS orchestration, DynamoDB schema, scaling rules, and cost governance |

Key design decisions documented there include:

- **Asynchronous decoupling** — the API never blocks on training; jobs are enqueued in SQS and processed by autoscaling GPU workers independently.
- **Spot-first compute** — EC2 G4dn / G5 mixed-instance ASG with S3 checkpointing ensures training continues even after a spot reclaim.
- **Zero standing credentials** — GitHub Actions authenticates to AWS via OIDC (no long-lived keys stored anywhere).
- **S3 Gateway Endpoint** — eliminates NAT Gateway egress costs for all S3 traffic from within the VPC.

---

## ✦ Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/).
4. Open a pull request against `dev`.

---

## ✦ License

```
MIT License

Copyright (c) 2026 Splatial Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

 

 
