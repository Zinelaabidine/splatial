# AMI-bake pipeline — permissions only (trust policy lives in infra/bootstrap).
#
# splatial-github-ami-bake-role is a single global role (see
# infra/bootstrap/main.tf) assumed by .github/workflows/bake-worker-ami.yml.
# Its trust policy is managed exclusively in bootstrap, same reasoning as the
# github_deploy roles: a workflow must not manage its own trust chain.
#
# Everything in this file is gated behind var.enable_ami_bake_resources, which
# must be true in exactly one environment (dev — see infra/envs/dev/main.tf).
# The role is global but its permissions need to reference this environment's
# worker subnet/security group, so only one environment's state may own the
# attached policy — enabling this in more than one env would race on the same
# role's inline policy on every apply.
#
# The bake builder instance uses a SEPARATE, minimal instance role/profile
# (not aws_iam_instance_profile.worker_instance_profile) — it only needs SSM
# to receive commands, not the production worker's SQS/S3/DynamoDB access.

data "aws_iam_role" "github_ami_bake" {
  count = var.enable_ami_bake_resources ? 1 : 0

  provider = aws.this

  name = "splatial-github-ami-bake-role"
}

# ── Bake builder instance role (SSM only — deliberately not worker_instance_role) ──

resource "aws_iam_role" "bake_instance_role" {
  count = var.enable_ami_bake_resources ? 1 : 0

  provider = aws.this

  name = "${local.name_prefix}-ami-bake-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = {
    Name        = "${local.name_prefix}-ami-bake-instance-role"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_instance_profile" "bake_instance_profile" {
  count = var.enable_ami_bake_resources ? 1 : 0

  provider = aws.this

  name = "${local.name_prefix}-ami-bake-instance-profile"
  role = aws_iam_role.bake_instance_role[0].name
}

# SSM Session Manager only — no CloudWatch agent, no queue/table access.
# The bake workflow reads command output directly via ssm:GetCommandInvocation;
# it doesn't need the builder to write anywhere.
resource "aws_iam_role_policy_attachment" "bake_instance_ssm" {
  count = var.enable_ami_bake_resources ? 1 : 0

  role       = aws_iam_role.bake_instance_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# worker.py alone is ~170KB — too large to embed inline in an SSM command
# document (64KB limit). The workflow instead tars worker/*.py + the systemd
# unit, stages it under a dedicated prefix in the existing raw-scenes bucket,
# and the builder instance (via SSM) downloads it with its own instance
# credentials. Read-only, and scoped to this one prefix only — the bake
# builder never touches uploads/${userId}/ (the real user-scene prefix).
resource "aws_iam_role_policy" "bake_instance_s3_stage_read" {
  count = var.enable_ami_bake_resources ? 1 : 0

  name = "${local.name_prefix}-ami-bake-instance-s3-stage-read"
  role = aws_iam_role.bake_instance_role[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "ReadBakeStagingPrefix"
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = "${aws_s3_bucket.raw_scenes.arn}/_ami-bake/*"
    }]
  })
}

# ── Permissions attached to the global splatial-github-ami-bake-role ──────────

data "aws_iam_policy_document" "github_ami_bake_policy" {
  count = var.enable_ami_bake_resources ? 1 : 0

  # RunInstances evaluates resource-level permissions across every resource
  # type touched in one call (AND, not OR) — same shape as the existing
  # EC2RunInstancesWorker statement in iam-github-oidc.tf.
  statement {
    sid    = "EC2RunInstancesBakeBuilder"
    effect = "Allow"
    actions = [
      "ec2:RunInstances",
    ]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*",
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:volume/*",
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:network-interface/*",
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:security-group/${aws_security_group.worker.id}",
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:subnet/${aws_subnet.worker_spot.id}",
      # base_ami_id is a workflow input chosen at run time (the currently
      # registered AMI, or an override) — it cannot be pinned at plan time the
      # way var.worker_ami_id is for the real launch template, so this one
      # resource type is unavoidably a wildcard.
      # No resource-level permission available for a dynamically-chosen AMI.
      "arn:aws:ec2:${var.aws_region}::image/*",
    ]
  }

  # Tagging at creation time (Name, ManagedBy, Purpose=ami-bake, git SHA) so
  # the builder instance and resulting image are identifiable in the console.
  statement {
    sid    = "EC2CreateTagsBakeBuilder"
    effect = "Allow"
    actions = [
      "ec2:CreateTags",
    ]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*",
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:volume/*",
      "arn:aws:ec2:${var.aws_region}::image/*",
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:snapshot/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["RunInstances", "CreateImage"]
    }
  }

  # CreateImage's resulting image/snapshot IDs don't exist at authorization
  # time, so the source instance is the only resource AWS can check —
  # scoped down to instances tagged for this pipeline, not any instance.
  statement {
    sid    = "EC2CreateImageBakeBuilder"
    effect = "Allow"
    actions = [
      "ec2:CreateImage",
    ]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Purpose"
      values   = ["ami-bake"]
    }
  }

  # Stop before CreateImage — same Purpose=ami-bake tag scope as terminate.
  statement {
    sid    = "EC2StopBakeBuilder"
    effect = "Allow"
    actions = [
      "ec2:StopInstances",
    ]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Purpose"
      values   = ["ami-bake"]
    }
  }

  # Cleanup is restricted to instances this pipeline itself launched and
  # tagged — never an arbitrary instance in the account.
  statement {
    sid    = "EC2TerminateBakeBuilder"
    effect = "Allow"
    actions = [
      "ec2:TerminateInstances",
    ]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Purpose"
      values   = ["ami-bake"]
    }
  }

  # Staging prefix for the worker-files tarball (worker.py alone is ~170KB,
  # too large for an inline SSM command parameter). Scoped to one prefix in
  # the existing raw-scenes bucket — never the uploads/${userId}/ prefix used
  # for real user scenes.
  statement {
    sid    = "S3BakeStagingWrite"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "${aws_s3_bucket.raw_scenes.arn}/_ami-bake/*",
    ]
  }

  # Describe*/List* calls are list APIs — AWS requires Resource "*" for all of
  # these (no resource-level permission is defined for them).
  statement {
    sid    = "EC2DescribeGlobalBakeBuilder"
    effect = "Allow"
    actions = [
      "ec2:DescribeImages",
      "ec2:DescribeInstances",
      "ec2:DescribeInstanceStatus",
      "ec2:DescribeInstanceTypes",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups",
    ]
    resources = ["*"]
  }

  # SendCommand on builder instances — scoped to instances this pipeline tagged.
  statement {
    sid    = "SSMSendCommandBakeBuilderInstances"
    effect = "Allow"
    actions = [
      "ssm:SendCommand",
    ]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Purpose"
      values   = ["ami-bake"]
    }
  }

  # SendCommand on the AWS-owned shell document — tag conditions do not apply
  # to document ARNs, so this must be a separate statement from the instance
  # resource above (same pattern as admin deploy policies elsewhere).
  statement {
    sid    = "SSMSendCommandBakeBuilderDocument"
    effect = "Allow"
    actions = [
      "ssm:SendCommand",
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
    ]
  }

  # Reading command status/output is a list/describe-style API — no
  # resource-level permission available.
  statement {
    sid    = "SSMReadCommandStatusBakeBuilder"
    effect = "Allow"
    actions = [
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
      "ssm:DescribeInstanceInformation",
    ]
    resources = ["*"]
  }

  # PassRole constrained to the dedicated, minimal bake instance role only —
  # never the production worker_instance_role.
  statement {
    sid     = "IAMPassRoleToBakeBuilder"
    effect  = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      aws_iam_role.bake_instance_role[0].arn,
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "github_ami_bake" {
  count = var.enable_ami_bake_resources ? 1 : 0

  name   = "splatial-github-ami-bake-policy"
  role   = data.aws_iam_role.github_ami_bake[0].name
  policy = data.aws_iam_policy_document.github_ami_bake_policy[0].json
}
