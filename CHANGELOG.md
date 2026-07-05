# Changelog — Engineering Highlights

Curated from the `dev` branch's full commit history (272 commits). Routine noise — typo fixes, formatting-only commits, deploy retriggers, duplicate/rebase artifacts, IAM permission drips — is omitted in favor of the decisions and features that show the system's design.

## Architecture & Infrastructure (Terraform / AWS)

- **2026-04-06** — Bootstrapped IaC: provider setup, private encrypted S3 bucket, Route53 alias + CloudFront lookup
- **2026-05-10** — Added Cognito User Pool + API Gateway JWT authorizer for auth
- **2026-05-18** — Implemented least-privilege IAM for the GitHub OIDC deploy role, removing long-lived AWS keys from CI
- **2026-05-18** — Unified multi-environment (dev/staging/prod) deploy workflow via GitHub Actions OIDC
- **2026-05-19** — Provisioned raw-scenes S3 bucket (multipart, CORS, Transfer Acceleration) + DynamoDB `ScenesTable` with GSI, PITR, SSE
- **2026-05-31** — Separated bootstrap IAM/OIDC state from app infra to break a circular deploy dependency
- **2026-06-28** — Restructured the repo into `frontend/`, `backend/`, `worker/`, `infra/` with clear ownership boundaries
- **2026-06-28** — Added SQS scale-in alarm to reset worker ASG desired capacity to zero
- **2026-06-29** — Fixed worker ASG termination when the queue is empty but capacity remains
- **2026-07-04** — Rebuilt the worker Auto Scaling Group as a multi-AZ, price-capacity-optimized Spot fleet
- **2026-07-04** — Migrated GPU worker networking from NAT Gateway to a public subnet with a direct IGW route, cutting NAT cost
- **2026-07-05** — Added admin-controlled ASG runtime config (AMI/instance type/max size via launch template versions), manual worker boot/release, SSM connect panel, spot-price + queue-depth visibility
- **2026-07-05** — Added SNS/Slack admin alerting for manual-mode operation

## Backend (Lambda / API)

- **2026-05-19** — Implemented presigned multipart upload flow (`upload_presign` / `upload_complete`) so Lambda never buffers binary scene data
- **2026-05-21** — Added `useMultipartUpload` hook for the S3 4-step upload flow
- **2026-05-23** — Added submit action to send uploaded scenes into processing
- **2026-06-25** — Fixed a DLQ race by writing the attempt record before SQS enqueue
- **2026-06-26** — Added scene delete with full S3, attempt, and DynamoDB cleanup
- **2026-06-28** — Wired structured logging across worker, backend, and infra for observability
- **2026-06-28** — Added Phase 1 admin attempts overview
- **2026-06-28** — Added Phase 3 worker log drill-down in the admin panel
- **2026-06-29** — Added visibility toggle and owner identity denormalization for scenes
- **2026-06-29** — Built out the social layer: multi-type reactions, comments with @mentions, notifications, bookmarks, follows, personalized feed, public profiles
- **2026-06-29** — Added tours table and CRUD API for guided fly-throughs
- **2026-06-29** — Added shots table and CRUD API for camera viewpoints
- **2026-06-29** — Added scene fork endpoint with server-side artifact copy and lineage tracking

## GPU Worker (Python / EC2 Spot pipeline)

- **2026-06-27** — Poison-message handling: delete SQS messages when the backing attempt record is gone (404/403)
- **2026-06-28** — Added COLMAP step progress and image-count ETA heartbeats
- **2026-06-28** — Persisted worker progress sub-phase and ETA on scene records
- **2026-06-28** — Implemented Spot interruption handling via IMDSv2 instance-action polling, with checkpoint-to-S3 and SQS re-queue

## Frontend (Next.js / React)

- **2026-05-21** — Built the core upload UX: dropzone, queue sidebar, home page
- **2026-05-24** — Migrated the legacy WebGL2 Gaussian Splat viewer, adding trajectory recording and video export
- **2026-06-14** — Modularized the viewer engine and fixed worker tsconfig scope
- **2026-06-15** — Split the viewer engine into engine, state, and entry modules
- **2026-06-30** — Glassmorphic UI overhaul across the dashboard and scenes/explore pages
- **2026-07-04** — Added the splat editor (studio) with presigned-URL loading and save flow

## Security & Reliability Fixes

- **2026-06-28** — Removed a committed worker private key (PEM) from the repository
- **2026-07-04** — Fixed a race condition on concurrent scene visibility PATCH requests
- Enforced least-privilege IAM throughout (no wildcard actions/resources without documented justification)

## Documentation

- **2026-05-09** — Added initial architecture documentation
- **2026-05-20** — README rewritten with embedded pipeline architecture diagram
- **2026-05-30** — Added unified architecture map and infra↔app constraint matrix
- **2026-06-07** — README rewritten for Cloud/DevOps portfolio positioning
- **2026-06-13** — Added AWS Well-Architected Framework alignment section
