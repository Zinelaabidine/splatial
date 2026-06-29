# Security

This document describes Splatial's security posture and how to report issues.
It is intentionally concise; the controls below are enforced in code and IaC.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the maintainer
(**z.nadir@ymail.com**) rather than opening a public issue. Include reproduction
steps and impact. You'll receive an acknowledgement and a remediation timeline.

## Authentication & authorization

- **Authentication:** Amazon Cognito user pool; every API request carries a JWT
  validated by the API Gateway **JWT authorizer** before the Lambda is invoked.
  Handlers derive the caller from `claims.sub` and reject unauthenticated requests
  with `401`.
- **Authorization model:**
  - **Read** of scene data is allowed when the caller **owns** the scene **or** the
    scene is `PUBLIC` (a single "owner OR public" rule).
  - **Mutation** of a child resource is restricted to the actor who created it
    **or** the scene owner (e.g. comment delete = author or scene owner).
  - Ownership/visibility is always checked server-side before any S3 or DynamoDB
    write; the client is never trusted for authorization.
- **Username uniqueness** is enforced by a dedicated DynamoDB table via conditional
  writes — not by client logic.

## Input handling

- Strict input-validation order in every handler: auth → parse JSON → validate
  required fields (explicit type checks, not truthiness) → sanitize user-supplied
  filenames before constructing S3 keys → ownership check → allowlist enumerations.
- User-generated text (comments, etc.) is stored as **raw text** and rendered as
  **plain text** in the UI (`whitespace-pre-wrap`); links and `@mentions` are built
  from React nodes, never `dangerouslySetInnerHTML` — eliminating HTML/script
  injection.
- Presigned URLs are time-limited (`expiresIn: 3600`).

## Credentials & secrets

- **No long-lived AWS keys in CI.** GitHub Actions assumes a deploy role via
  **OIDC**, scoped to the exact `repo:…:environment:<env>`.
- **No standing credentials on compute.** Worker instances use an instance profile;
  **IMDSv2 is required** (`http_tokens = "required"`); security groups are
  outbound-only; management is via SSM (no inbound SSH).
- **Secrets are never committed.** `.env*` and `*.pem` are git-ignored; tokens and
  raw JWT claims are never logged.

## Network & data

- **Private-by-default S3:** every bucket has public-access-block, bucket-owner
  enforced ownership, server-side encryption, and versioning; CORS is scoped to the
  app's domains (never `*`).
- **CloudFront + OAC (sigv4)** front the static site and outputs; TLS 1.2+.
- **Least-privilege IAM:** discrete policy statements per service with
  resource-scoped ARNs; no `AdministratorAccess`/`PowerUserAccess`; wildcards
  avoided wherever a resource scope exists.
- **DynamoDB:** encryption at rest and point-in-time recovery on all tables.

## Known security follow-up

- An EC2 worker private key (`.gaussian_worker.pem`) was committed early in history
  and later removed from the working tree (it is now git-ignored and untracked).
  Because the key bytes remain recoverable from older commits, the keypair should
  be **rotated**, and history scrubbing (e.g. `git filter-repo`) is recommended if
  the repository is or becomes public. The current working tree contains no
  committed secrets.

---

*Controls referenced here are implemented in `infra/modules/static-site/*.tf`
(IAM, S3, CloudFront, Cognito, compute) and `backend/handlers/*` + `backend/lib/*`
(auth, validation). See [`docs/ENGINEERING.md`](./docs/ENGINEERING.md) and the
project [`CLAUDE.md`](./CLAUDE.md) for the enforced standards.*
