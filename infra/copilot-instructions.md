# Splatial — Infrastructure & Backend Lambda Copilot Instructions

> Scope: `infra/` — Terraform 1.5+ HCL (`infra/modules/`, `infra/envs/`) and Node.js Lambda handlers (`backend/`).

---

## Part 1 — Terraform / AWS Infrastructure

### Version & Provider Targets

- **Terraform:** `required_version = ">= 1.5.0"`
- **AWS Provider:** `source = "hashicorp/aws"`, `version = "~> 5.0"`
- Every module's `versions.tf` must declare both `terraform {}` and `required_providers {}` blocks.
- All module resources must set `provider = aws.this` explicitly — the alias pattern is established and mandatory.

### Module & File Structure

Follow the existing file-per-concern layout under `infra/modules/static-site/`:

| File | Responsibility |
|---|---|
| `acm.tf` | ACM certificates |
| `auth.tf` | Cognito User Pool + App Client |
| `cloudfront.tf` | CloudFront distribution + OAC |
| `dynamodb.tf` | DynamoDB tables |
| `iam-github-oidc.tf` | GitHub OIDC role, deploy policy, `time_sleep` propagation |
| `lambdas.tf` | `aws_lambda_function`, IAM exec role, `archive_file` data source |
| `network.tf` | VPC, subnets, IGW, NAT gateways, route tables, S3 Gateway Endpoint |
| `s3.tf` | Static site S3 bucket |
| `s3-raw-scenes.tf` | Raw scene upload bucket (multipart, versioning, lifecycle) |
| `s3-policy.tf` | Bucket policies |
| `variables.tf` | All input variable declarations |
| `outputs.tf` | All output declarations |
| `versions.tf` | Provider and Terraform version constraints |

Never place multiple unrelated resource types in the same file. When adding a new AWS service, create a new dedicated `.tf` file.

### Security — Non-Negotiable Rules

#### IAM Least Privilege
- **No wildcard `"*"` in `actions`** unless the AWS API genuinely has no resource-level permission scope (e.g., `cognito-idp:ListUserPools`). When a wildcard is unavoidable, add an inline comment: `# No resource-level permission available for this action`.
- **No wildcard `"*"` in `resources`** when a specific ARN or ARN pattern is determinable at plan time. Use `data "aws_caller_identity"` and `data "aws_region"` to construct ARNs dynamically.
- Use `data "aws_iam_policy_document"` with discrete `statement {}` blocks grouped by service. Assign a unique `sid` (CamelCase) to every statement, e.g., `"S3RawScenesReadWrite"`.
- Attach narrow inline policies via `aws_iam_role_policy` for Lambda execution roles. Never attach `AdministratorAccess` or `PowerUserAccess`.
- The GitHub OIDC deploy role (`iam-github-oidc.tf`) must constrain `token.actions.githubusercontent.com:sub` to the exact `repo:<owner>/<repo>:environment:<env>` value.

#### S3 Private by Default
Every `aws_s3_bucket` resource **must** be accompanied by all four of these resources — no exceptions, including dev/temp buckets:

```hcl
aws_s3_bucket_public_access_block     # block_public_acls = true, block_public_policy = true,
                                       # ignore_public_acls = true, restrict_public_buckets = true
aws_s3_bucket_ownership_controls      # object_ownership = "BucketOwnerEnforced"
aws_s3_bucket_server_side_encryption_configuration  # sse_algorithm = "AES256" (or "aws:kms" for prod)
aws_s3_bucket_versioning              # status = "Enabled" (or "Suspended" with a justification comment)
```

#### S3 CORS for WebGL / WebGPU Streaming
For any bucket serving `.splat`, `.spz`, or `.ply` files to browser clients, generate an explicit `aws_s3_bucket_cors_configuration`:

```hcl
cors_rule {
  allowed_methods = ["GET", "HEAD"]           # Add "PUT" only for direct-upload buckets
  allowed_origins = concat(
    ["https://${var.domain_name}"],           # Never use ["*"]
    var.cors_extra_origins                    # Includes localhost for dev
  )
  allowed_headers = [
    "Content-Type", "Content-Length",
    "Authorization", "x-amz-date",
    "x-amz-security-token", "x-amz-content-sha256"
  ]
  expose_headers  = ["ETag", "x-amz-request-id"]  # Required for multipart assembly
  max_age_seconds = 3600
}
```

### HCL Quality Rules

- **Complete blocks only.** No `# TODO`, no `# add other resources here`, no `"REPLACE_ME"` placeholders. Every block must be deployable as-is.
- Use `locals {}` for computed name prefixes (e.g., `local.name_prefix = "${var.project_name}-${var.environment}"`). Never repeat string interpolations inline across multiple resources.
- Every `variable` declaration requires `description` and `type`. Include `default` or a comment explaining why none is provided.
- Every `output` declaration requires `description` and `value`.
- Use `depends_on` explicitly when ordering is not captured by resource references (e.g., `depends_on = [time_sleep.iam_propagation]`).
- Apply `lifecycle { prevent_destroy = true }` to stateful resources (S3 buckets, DynamoDB tables, Cognito User Pools) in `prod` environments.
- Tag every taggable resource with at minimum:
  ```hcl
  tags = {
    Name        = "<descriptive-name>"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
  ```

### Environments

- `infra/envs/dev/` — `cors_extra_origins` includes `http://localhost:3000`
- `infra/envs/staging/` — mirrors prod config, no localhost origins
- `infra/envs/prod/` — `prevent_destroy = true` on critical resources; KMS encryption preferred over AES256
- `infra/envs/*/backend.tf` — remote state backend (S3 + DynamoDB lock table); never use local state
- Do not hardcode account IDs or region strings. Use `data "aws_caller_identity".current.account_id` and `data "aws_region".current.name`.

### EC2 Spot / GPU Training Workers

- Use `aws_autoscaling_group` with `mixed_instances_policy` for G4dn/G5 Spot fleet. Always configure `instance_refresh` on the ASG.
- Spot interruption handler: a Lambda subscribed to the `EC2 Spot Instance Interruption Warning` EventBridge rule must checkpoint training state to S3 and re-queue the job to SQS before the two-minute deadline.
- Security group for GPU workers: inbound restricted to VPC CIDR only (`0.0.0.0/0` is forbidden); outbound to S3 via the S3 Gateway Endpoint only.

---

## Part 2 — Node.js Lambda Handlers (`backend/`)

### Runtime & Style

- **Node.js 18.x**, CommonJS (`"use strict"`, `require()`). No transpilation step.
- Do not use `class` syntax. Use plain functions and `module.exports`.
- Instantiate AWS SDK clients **outside** the handler function to benefit from Lambda execution context reuse:
  ```js
  const s3 = new S3Client({});      // top-level — reused across warm invocations
  const dynamo = new DynamoDBClient({});
  ```
- Use `@aws-sdk/client-s3` and `@aws-sdk/client-dynamodb` (SDK v3). Do not use `aws-sdk` v2.
- Use `@aws-sdk/s3-request-presigner` for presigned URLs with explicit `expiresIn: 3600` (never exceed this for upload presigns).

### Input Validation — Every Handler Entry Point

Every handler must follow this exact validation order:
1. Extract `userId` from `event.requestContext.authorizer.jwt.claims.sub` → return `401` if absent.
2. Parse `event.body` in a `try/catch` → return `400` on malformed JSON.
3. Validate required string fields: `typeof x === "string" && x.trim() !== ""` — never rely on truthy shortcuts.
4. Sanitize user-supplied filenames before constructing S3 keys: `filename.replace(/[^a-zA-Z0-9._\-]/g, "_")`.
5. Validate ownership before any S3 or DynamoDB operation: `key.startsWith(\`uploads/${userId}/\`)` → return `403` if false.
6. Use `Set` allowlists for enumerations (`ALLOWED_CONTENT_TYPES`, `ALLOWED_INPUT_TYPES`). Never use open-ended checks.

### Memory & Streaming

- **Never buffer entire `.ply`, `.splat`, or `.spz` files into memory.** Do not call `.Body.transformToByteArray()` on S3 objects > 1 MB.
- Stream S3 `GetObjectCommand` body through `stream.pipeline()` for any passthrough or transformation.
- For multipart uploads: enforce the S3 minimum of 5 MiB per part except the last. Part count must be validated: `1 ≤ partCount ≤ 100`.
- `abort-incomplete-multipart-uploads` lifecycle rule is already configured on the raw-scenes bucket — do not add compensating cleanup logic in Lambda unless processing a `complete` failure.

### Error Handling

- The top-level `try/catch` in `upload.js` is the global safety net. Individual handlers may throw — the router will catch and return `500`.
- Log errors with `console.error("context", { route, err })` for structured CloudWatch output. Do not log raw `event` objects (may contain tokens).
- Return errors using the shared `response(statusCode, body)` helper from `lib/response.js`. Do not inline `JSON.stringify` response construction.

---

## Phase-Based Output & Post-Execution Rules

After every infrastructure or Lambda change, append:

```
---
### Proposed Commit Message
feat(infra): <subject>         # new Terraform resource or module
fix(infra): <subject>          # policy correction, security tightening, resource fix
refactor(infra): <subject>     # restructure with no resource changes (plan shows no-op)
feat(backend): <subject>       # new Lambda handler or upload feature
fix(backend): <subject>        # bug fix in Lambda handler
chore(infra): <subject>        # terraform fmt, version bump, comment update

### Verification Checklist
- [ ] Terraform: cd infra/envs/<env> && terraform fmt -recursive && terraform validate && terraform plan
- [ ] Terraform: Confirm plan diff contains only expected changes — treat any unexpected destroy as a blocker.
- [ ] Lambda: node -e "require('./upload')" in backend/ for syntax/require errors; check IAM policy for wildcards.
```