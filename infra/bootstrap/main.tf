# ──────────────────────────────────────────────────────────────────────────────
# Bootstrap — AWS IAM / OIDC foundation
#
# WHY THIS IS SEPARATE FROM THE APP INFRA:
#   The resources here (GitHub OIDC provider + deploy-role trust policy) form
#   the trust chain that allows GitHub Actions to authenticate to AWS at all.
#   If the deploy workflow were responsible for managing its own trust chain, a
#   misconfiguration could lock out GitHub Actions entirely — recovery would
#   require manual AWS console access.
#
#   By keeping OIDC bootstrap in a separate Terraform root and a separate
#   workflow (bootstrap.yml, manual-trigger only) we ensure:
#     1. The trust chain is changed deliberately after human review.
#     2. A normal deployment cannot accidentally break OIDC authentication.
#     3. Bootstrap uses different credentials (static key, not OIDC) so it
#        does not depend on the very role it manages.
#
# WHY THE DEPLOY WORKFLOW MUST NOT REPAIR ITS OWN TRUST CHAIN:
#   A GitHub Actions job authenticates by assuming splatial-<env>-github-deploy-role.
#   If that job is also allowed to modify the trust policy of that role, a bug
#   or a compromised workflow could silently grant arbitrary principals access.
#   Separating bootstrap means the trust policy can only change via this file,
#   applied through a protected manual workflow with required reviewers.
#
# FILES TO REVIEW MANUALLY BEFORE EVERY APPLY:
#   - infra/bootstrap/main.tf       (OIDC provider thumbprints, trust conditions)
#   - infra/bootstrap/variables.tf  (local_dev_iam_users list)
#   - infra/bootstrap/backend.tf    (state bucket must exist before first run)
# ──────────────────────────────────────────────────────────────────────────────

locals {
  github_repo_full = "${var.github_owner}/${var.github_repo}"

  # GitHub Actions environments — must match the `environment:` field in deploy.yml.
  # dev → push to dev branch, staging → push to staging branch, prod → push to main.
  environments = ["dev", "staging", "prod"]
}

# ─── Terraform Remote State ───────────────────────────────────────────────────

resource "aws_s3_bucket" "terraform_state" {
  bucket = "openspacenexus-terraform-state"

  tags = {
    Name      = "terraform-state"
    ManagedBy = "Terraform/bootstrap"
  }
}

resource "aws_s3_bucket_versioning" "state_versioning" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state_encryption" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state_block" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── GitHub Actions OIDC Provider ─────────────────────────────────────────────

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  # AWS requires this exact audience value for OIDC federation.
  client_id_list = ["sts.amazonaws.com"]

  # SHA-1 thumbprints for token.actions.githubusercontent.com.
  # Keep up to date: https://docs.github.com/en/actions/security-guides/security-hardening-with-openid-connect
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  tags = {
    ManagedBy = "Terraform/bootstrap"
  }
}

# ─── GitHub Deploy Roles (one per environment) ────────────────────────────────
#
# Trust is scoped to:
#   1. This specific GitHub repository (Zinelaabidine/splatial)
#   2. The matching GitHub Actions environment (dev / staging / prod)
#   3. The GitHub OIDC audience (sts.amazonaws.com)
#
# Local IAM users (e.g. terraadmin) are NOT in this trust policy.
# Use the local_dev role below for local Terraform workflows.

data "aws_iam_policy_document" "github_deploy_trust" {
  for_each = toset(local.environments)

  statement {
    sid    = "AllowGitHubActionsOIDC"
    effect = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    actions = ["sts:AssumeRoleWithWebIdentity"]

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      # Restrict to the exact repo + environment combination.
      # Adding :ref: conditions here further narrows to a specific branch.
      values = ["repo:${local.github_repo_full}:environment:${each.key}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  for_each = toset(local.environments)

  name        = "splatial-${each.key}-github-deploy-role"
  description = "Assumed by GitHub Actions (OIDC) for ${each.key} deployments. Trust policy managed in infra/bootstrap."

  assume_role_policy = data.aws_iam_policy_document.github_deploy_trust[each.key].json

  # Application-specific IAM policies (S3, CloudFront, Lambda, etc.) are
  # created and attached by the app module in infra/envs/<env>.
  # This role is created without any permissions — the app module adds them.
  tags = {
    ManagedBy   = "Terraform/bootstrap"
    Environment = each.key
    Purpose     = "github-actions-deploy"
  }
}

# ─── Local Developer Role ─────────────────────────────────────────────────────
#
# Used by local IAM users (e.g. terraadmin) running Terraform on workstations.
# This role is NEVER referenced in the GitHub deploy role trust policy above —
# keeping CI/CD credentials and local developer credentials fully separate.
#
# Application-specific policies are attached by the app module, the same way
# as for the deploy role, so both roles can plan/apply app infrastructure.

data "aws_iam_policy_document" "local_dev_trust" {
  statement {
    sid     = "AllowLocalIAMUsers"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type = "AWS"
      # Add or remove specific IAM user/role ARNs here.
      # Wildcards (e.g. arn:aws:iam::*:root) are intentionally disallowed.
      identifiers = var.local_dev_iam_users
    }
  }
}

resource "aws_iam_role" "local_dev" {
  name        = "splatial-local-dev-role"
  description = "Assumed by local developers running Terraform. Not used by GitHub Actions."

  assume_role_policy = data.aws_iam_policy_document.local_dev_trust.json

  tags = {
    ManagedBy = "Terraform/bootstrap"
    Purpose   = "local-developer"
  }
}

# ─── Bootstrap CI Role (OIDC, no static keys) ─────────────────────────────────
#
# This role is assumed by the bootstrap.yml workflow itself via OIDC.
# Trust is scoped to the exact workflow file + branch using the
# job_workflow_ref claim — no other workflow in this repo can assume it.
#
# Requires the OIDC provider to already exist (created once manually via CLI
# or imported). After the first apply, Terraform manages it from this file.
#
# To use: replace BOOTSTRAP_AWS_ACCESS_KEY_ID / BOOTSTRAP_AWS_SECRET_ACCESS_KEY
# in bootstrap.yml with role-to-assume pointing at this role's ARN.

data "aws_iam_policy_document" "bootstrap_ci_trust" {
  statement {
    sid    = "AllowBootstrapWorkflowOIDC"
    effect = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    actions = ["sts:AssumeRoleWithWebIdentity"]

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Restrict to this repo only
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_repo_full}:*"]
    }

    # The critical condition: only the bootstrap.yml file on main can assume
    # this role. No other workflow file — even in this repo — can use it.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:job_workflow_ref"
      values   = ["${local.github_repo_full}/.github/workflows/bootstrap.yml@refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "bootstrap_ci" {
  name        = "splatial-bootstrap-ci-role"
  description = "Assumed by bootstrap.yml via OIDC. Manages IAM/OIDC resources only. No static keys."

  assume_role_policy = data.aws_iam_policy_document.bootstrap_ci_trust.json

  tags = {
    ManagedBy = "Terraform/bootstrap"
    Purpose   = "bootstrap-ci"
  }
}

data "aws_iam_policy_document" "bootstrap_ci_permissions" {
  statement {
    sid    = "OIDCProvider"
    effect = "Allow"
    actions = [
      "iam:CreateOpenIDConnectProvider",
      "iam:GetOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider",
      "iam:ListOpenIDConnectProviders",
      "iam:AddClientIDToOpenIDConnectProvider",
      "iam:RemoveClientIDFromOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:TagOpenIDConnectProvider",
      "iam:UntagOpenIDConnectProvider",
      "iam:ListOpenIDConnectProviderTags",
    ]
    resources = [aws_iam_openid_connect_provider.github.arn]
  }

  statement {
    sid    = "DeployRoles"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:GetRole",
      "iam:UpdateRole",
      "iam:DeleteRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:ListRoleTags",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:GetRolePolicy",
    ]
    resources = [
      "arn:aws:iam::${var.aws_account_id}:role/splatial-*-github-deploy-role",
      "arn:aws:iam::${var.aws_account_id}:role/splatial-local-dev-role",
      "arn:aws:iam::${var.aws_account_id}:role/splatial-bootstrap-ci-role",
    ]
  }

  statement {
    sid    = "TerraformState"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "arn:aws:s3:::openspacenexus-terraform-state",
      "arn:aws:s3:::openspacenexus-terraform-state/*",
    ]
  }

  statement {
    sid    = "S3BucketBootstrap"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:GetBucketTagging",
      "s3:PutBucketTagging",
      "s3:GetBucketLocation",
      "s3:ListAllMyBuckets",
    ]
    resources = ["arn:aws:s3:::openspacenexus-terraform-state"]
  }

  statement {
    sid       = "STSIdentity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "bootstrap_ci" {
  name   = "splatial-bootstrap-ci-policy"
  role   = aws_iam_role.bootstrap_ci.id
  policy = data.aws_iam_policy_document.bootstrap_ci_permissions.json
}