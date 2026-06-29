# The GitHub Actions OIDC provider and the deploy-role trust policy are managed
# in infra/bootstrap (bootstrap.yml workflow, manual trigger only).
#
# WHY: A workflow must not manage its own trust chain — doing so creates a
# circular dependency where a broken trust policy cannot be repaired by the
# same workflow that broke it.  Bootstrap resources are intentionally separated
# into a workflow that uses different credentials (static key, not OIDC) and
# requires a protected environment with human approval.
#
# This data source looks up the role that bootstrap already created.
# Applying infra/envs/<env> will NOT modify the trust policy — only
# infra/bootstrap can change it.
data "aws_iam_role" "github_oidc_deploy_role" {
  provider = aws.this

  name = "${local.name_prefix}-github-deploy-role"
}

# Shared across all envs — created once in infra/bootstrap. Local developers
# assume this role (not the GitHub OIDC deploy role) when running Terraform.
data "aws_iam_role" "local_dev_role" {
  provider = aws.this

  name = "splatial-local-dev-role"
}

data "aws_iam_policy_document" "github_deploy_policy" {

  # ─── Cognito ──────────────────────────────────────────────────────────────────

  statement {
    sid    = "CognitoListGlobal"
    effect = "Allow"
    actions = [
      "cognito-idp:ListUserPools",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "CognitoManage"
    effect = "Allow"
    actions = [
      "cognito-idp:CreateUserPool",
      "cognito-idp:DescribeUserPool",
      "cognito-idp:UpdateUserPool",
      "cognito-idp:AddCustomAttributes",
      "cognito-idp:DeleteUserPool",
      "cognito-idp:SetUserPoolMfaConfig",
      "cognito-idp:GetUserPoolMfaConfig",
      "cognito-idp:ListUserPoolClients",
      "cognito-idp:CreateUserPoolClient",
      "cognito-idp:DescribeUserPoolClient",
      "cognito-idp:UpdateUserPoolClient",
      "cognito-idp:DeleteUserPoolClient",
      "cognito-idp:TagResource",
      "cognito-idp:UntagResource",
      "cognito-idp:ListTagsForResource",
      "cognito-idp:CreateGroup",
      "cognito-idp:GetGroup",
      "cognito-idp:UpdateGroup",
      "cognito-idp:DeleteGroup",
      "cognito-idp:ListGroups",
    ]
    resources = [
      "arn:aws:cognito-idp:${var.aws_region}:886601940523:userpool/*",
    ]
  }

  # ─── S3 ───────────────────────────────────────────────────────────────────────

  statement {
    sid    = "S3ListAllBuckets"
    effect = "Allow"
    actions = [
      "s3:ListAllMyBuckets",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "S3SiteBucketManage"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketOwnershipControls",
      "s3:PutBucketOwnershipControls",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:GetBucketTagging",
      "s3:PutBucketTagging",
      "s3:GetBucketAcl",
      "s3:GetBucketCORS",
      "s3:GetBucketWebsite",
      "s3:GetBucketLogging",
      "s3:GetBucketRequestPayment",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
      "s3:GetAccelerateConfiguration",
      "s3:GetIntelligentTieringConfiguration",
    ]
    resources = [
      aws_s3_bucket.site.arn,
    ]
  }

  statement {
    sid    = "S3SiteObjectsAccess"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "${aws_s3_bucket.site.arn}/*",
    ]
  }

  statement {
    sid    = "S3SplatScenesBucketManage"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketOwnershipControls",
      "s3:PutBucketOwnershipControls",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:GetBucketTagging",
      "s3:PutBucketTagging",
      "s3:GetBucketAcl",
      "s3:GetBucketCORS",
      "s3:PutBucketCORS",
      "s3:GetBucketWebsite",
      "s3:GetBucketLogging",
      "s3:GetBucketRequestPayment",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
      "s3:GetAccelerateConfiguration",
      "s3:GetIntelligentTieringConfiguration",
    ]
    resources = [
      # Constructed ARN — bucket may not exist yet on first apply.
      "arn:aws:s3:::${local.name_prefix}-splat-scenes",
    ]
  }

  statement {
    sid    = "S3RawScenesBucketManage"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketOwnershipControls",
      "s3:PutBucketOwnershipControls",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:GetBucketTagging",
      "s3:PutBucketTagging",
      "s3:GetBucketAcl",
      "s3:GetBucketCORS",
      "s3:PutBucketCORS",
      "s3:GetBucketWebsite",
      "s3:GetBucketLogging",
      "s3:GetBucketRequestPayment",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
      "s3:GetAccelerateConfiguration",
      "s3:PutAccelerateConfiguration",
      "s3:GetIntelligentTieringConfiguration",
    ]
    resources = [
      # Constructed ARN avoids a circular dependency: the deploy role policy must
      # exist before Terraform can create the bucket, so we cannot reference the
      # resource object here.
      "arn:aws:s3:::${local.name_prefix}-raw-scenes",
    ]
  }

  statement {
    sid    = "S3TerraformStateBackend"
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

  # ─── API Gateway v2 ───────────────────────────────────────────────────────────

  statement {
    sid    = "APIGatewayManage"
    effect = "Allow"
    actions = [
      "apigateway:GET",
      "apigateway:POST",
      "apigateway:PUT",
      "apigateway:PATCH",
      "apigateway:DELETE",
      "apigateway:TagResource",
      "apigateway:UntagResource",
    ]
    resources = [
      "arn:aws:apigateway:${var.aws_region}::/apis",
      "arn:aws:apigateway:${var.aws_region}::/apis/*",
    ]
  }

  statement {
    sid    = "APIGatewayDomainNamesManage"
    effect = "Allow"
    actions = [
      "apigateway:GET",
      "apigateway:POST",
      "apigateway:PUT",
      "apigateway:PATCH",
      "apigateway:DELETE",
      "apigateway:TagResource",
      "apigateway:UntagResource",
    ]
    resources = [
      "arn:aws:apigateway:${var.aws_region}::/domainnames",
      "arn:aws:apigateway:${var.aws_region}::/domainnames/*",
    ]
  }

  # ─── IAM ──────────────────────────────────────────────────────────────────────

  # ListOpenIDConnectProviders is a list API that AWS requires on "*".
  statement {
    sid    = "IAMListOIDCGlobal"
    effect = "Allow"
    actions = [
      "iam:ListOpenIDConnectProviders",
    ]
    resources = ["*"]
  }

  # Read the pre-existing GitHub Actions OIDC provider (data source only).
  statement {
    sid    = "IAMOIDCProviderRead"
    effect = "Allow"
    actions = [
      "iam:GetOpenIDConnectProvider",
    ]
    resources = [
      "arn:aws:iam::886601940523:oidc-provider/token.actions.githubusercontent.com",
    ]
  }

  # Scoped exclusively to the two roles this module owns: the GitHub deployment
  # role and the Lambda execution role. No other role ARN is permitted here to
  # prevent unchecked privilege escalation.
  statement {
    sid    = "IAMProjectRolesManage"
    effect = "Allow"
    actions = [
      "iam:GetRole",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListRoleTags",
    ]
    resources = [
      "arn:aws:iam::886601940523:role/${local.name_prefix}-github-deploy-role",
      "arn:aws:iam::886601940523:role/splatial-local-dev-role",
      aws_iam_role.lambda_exec.arn,
      # Constructed ARN for the upload Lambda execution role (does not exist yet).
      "arn:aws:iam::886601940523:role/${var.name}-upload-lambda-exec-role",
      # Constructed ARN for the Google Drive import Lambda execution role.
      "arn:aws:iam::886601940523:role/${var.name}-gdrive-import-lambda-exec-role",
      # Constructed ARN for the GPU worker instance role (does not exist yet).
      "arn:aws:iam::886601940523:role/${local.name_prefix}-splat-worker-instance-role",
    ]
  }

  # PassRole is constrained to Lambda only via the iam:PassedToService condition,
  # preventing the execution role from being passed to any other AWS service.
  statement {
    sid    = "IAMPassRoleToLambda"
    effect = "Allow"
    actions = [
      "iam:PassRole",
    ]
    resources = [
      aws_iam_role.lambda_exec.arn,
      # Constructed ARN for the upload Lambda execution role (does not exist yet).
      "arn:aws:iam::886601940523:role/${var.name}-upload-lambda-exec-role",
      # Constructed ARN for the Google Drive import Lambda execution role.
      "arn:aws:iam::886601940523:role/${var.name}-gdrive-import-lambda-exec-role",
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

}


# Managed policy — inline policies on splatial-local-dev-role are shared across
# all envs and hit the 10 240-byte cumulative inline quota after two env applies.
resource "aws_iam_policy" "github_deploy_core_policy" {
  provider = aws.this

  name        = "${local.name_prefix}-github-deploy-core-policy"
  description = "Core deploy permissions (Cognito, S3, API Gateway, IAM) for GitHub and local-dev roles"
  policy      = data.aws_iam_policy_document.github_deploy_policy.json
}

resource "aws_iam_role_policy_attachment" "github_deploy_core" {
  role       = data.aws_iam_role.github_oidc_deploy_role.name
  policy_arn = aws_iam_policy.github_deploy_core_policy.arn
}

resource "aws_iam_role_policy_attachment" "local_dev_core" {
  count = var.attach_deploy_policies_to_local_dev_role ? 1 : 0

  role       = data.aws_iam_role.local_dev_role.name
  policy_arn = aws_iam_policy.github_deploy_core_policy.arn
}

# IAM inline-policy changes take a few seconds to propagate before subsequent
# AWS API calls from the same session will see the updated permissions. Any
# resource whose creation permission was added to github_deploy_core_policy must
# gate on this sleep so it is not attempted before IAM has propagated.
#
# The `triggers` map causes this resource to be replaced (destroy + recreate,
# sleeping 15 s on create) whenever the policy document changes — not only on
# first creation. Without triggers, the sleep is a no-op on subsequent applies
# and a race condition occurs between the PutRolePolicy API call returning and
# IAM finishing propagation.
resource "time_sleep" "iam_propagation" {
  create_duration = "15s"

  triggers = {
    policy_hash = sha256(aws_iam_policy.github_deploy_core_policy.policy)
  }

  depends_on = [aws_iam_role_policy_attachment.github_deploy_core]
}

# ── Compute pipeline permissions (separate policy to stay under 10 240-byte limit) ──

data "aws_iam_policy_document" "github_deploy_compute_policy" {

  # ─── SQS ───────────────────────────────────────────────────────────────────

  statement {
    sid       = "SQSListGlobal"
    effect    = "Allow"
    actions   = ["sqs:ListQueues"]
    resources = ["*"]
  }

  statement {
    sid    = "SQSQueuesManage"
    effect = "Allow"
    actions = [
      "sqs:CreateQueue",
      "sqs:DeleteQueue",
      "sqs:GetQueueAttributes",
      "sqs:SetQueueAttributes",
      "sqs:GetQueueUrl",
      "sqs:ListQueueTags",
      "sqs:TagQueue",
      "sqs:UntagQueue",
    ]
    resources = [
      "arn:aws:sqs:${var.aws_region}:886601940523:${local.name_prefix}-splat-processing-queue",
      "arn:aws:sqs:${var.aws_region}:886601940523:${local.name_prefix}-splat-processing-dlq",
    ]
  }

  # ─── EC2 Compute (Launch Templates + Security Groups) ──────────────────────

  statement {
    sid    = "EC2ComputeDescribeGlobal"
    effect = "Allow"
    actions = [
      "ec2:DescribeLaunchTemplates",
      "ec2:DescribeLaunchTemplateVersions",
      "ec2:DescribeImages",
      "ec2:DescribeInstanceTypes",
      "ec2:DescribeSpotInstanceRequests",
      "ec2:DescribeKeyPairs",
      "ec2:DescribeAccountAttributes",
      "ec2:DescribeSecurityGroupRules",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "EC2ComputeManage"
    effect = "Allow"
    actions = [
      "ec2:CreateLaunchTemplate",
      "ec2:ModifyLaunchTemplate",
      "ec2:DeleteLaunchTemplate",
      "ec2:CreateLaunchTemplateVersion",
      "ec2:DeleteLaunchTemplateVersions",
      "ec2:CreateSecurityGroup",
      "ec2:DeleteSecurityGroup",
      "ec2:AuthorizeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupEgress",
      "ec2:ModifySecurityGroupRules",
    ]
    resources = ["*"]
  }

  # ─── Auto Scaling ──────────────────────────────────────────────────────────

  statement {
    sid    = "AutoScalingDescribeGlobal"
    effect = "Allow"
    actions = [
      "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:DescribeScalingActivities",
      "autoscaling:DescribePolicies",
      "autoscaling:DescribeAutoScalingInstances",
      "autoscaling:DescribeTerminationPolicyTypes",
      "autoscaling:DescribeInstanceRefreshes",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "AutoScalingWorkerManage"
    effect = "Allow"
    actions = [
      "autoscaling:CreateAutoScalingGroup",
      "autoscaling:UpdateAutoScalingGroup",
      "autoscaling:DeleteAutoScalingGroup",
      "autoscaling:PutScalingPolicy",
      "autoscaling:DeletePolicy",
      "autoscaling:CreateOrUpdateTags",
      "autoscaling:DeleteTags",
      "autoscaling:SetDesiredCapacity",
      "autoscaling:TerminateInstanceInAutoScalingGroup",
      "autoscaling:StartInstanceRefresh",
      "autoscaling:CancelInstanceRefresh",
      "autoscaling:EnableMetricsCollection",
      "autoscaling:DisableMetricsCollection",
    ]
    resources = [
      "arn:aws:autoscaling:${var.aws_region}:886601940523:autoScalingGroup:*:autoScalingGroupName/${local.name_prefix}-splat-worker-asg",
    ]
  }

  # ─── IAM — Worker Instance Profile ─────────────────────────────────────────

  statement {
    sid    = "IAMWorkerInstanceProfileRead"
    effect = "Allow"
    actions = [
      "iam:GetInstanceProfile",
    ]
    resources = [
      "arn:aws:iam::886601940523:instance-profile/${var.worker_instance_profile_name}",
    ]
  }

  statement {
    sid    = "IAMInstanceProfileManage"
    effect = "Allow"
    actions = [
      "iam:CreateInstanceProfile",
      "iam:DeleteInstanceProfile",
      "iam:GetInstanceProfile",
      "iam:AddRoleToInstanceProfile",
      "iam:RemoveRoleFromInstanceProfile",
      "iam:ListInstanceProfilesForRole",
      "iam:TagInstanceProfile",
      "iam:UntagInstanceProfile",
    ]
    resources = [
      "arn:aws:iam::886601940523:instance-profile/${local.name_prefix}-splat-worker-instance-profile",
    ]
  }

  statement {
    sid     = "IAMPassRoleToEC2"
    effect  = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      "arn:aws:iam::886601940523:role/${local.name_prefix}-splat-worker-instance-role",
      "arn:aws:iam::886601940523:role/backend-ec2-role",
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ec2.amazonaws.com"]
    }
  }

  statement {
    sid    = "IAMManagedPoliciesRead"
    effect = "Allow"
    actions = [
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyVersions",
    ]
    resources = [
      "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
      "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
      # Terraform needs to read these customer-managed policies to manage them.
      "arn:aws:iam::886601940523:policy/${local.name_prefix}-github-deploy-core-policy",
      "arn:aws:iam::886601940523:policy/${local.name_prefix}-github-deploy-compute-policy",
      "arn:aws:iam::886601940523:policy/${local.name_prefix}-github-deploy-network-policy",
      "arn:aws:iam::886601940523:policy/${local.name_prefix}-github-deploy-cdn-policy",
    ]
  }

  statement {
    sid    = "IAMManagedPoliciesWrite"
    effect = "Allow"
    actions = [
      "iam:CreatePolicy",
      "iam:DeletePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
    ]
    resources = [
      "arn:aws:iam::886601940523:policy/${local.name_prefix}-github-deploy-core-policy",
      "arn:aws:iam::886601940523:policy/${local.name_prefix}-github-deploy-compute-policy",
      "arn:aws:iam::886601940523:policy/${local.name_prefix}-github-deploy-network-policy",
      "arn:aws:iam::886601940523:policy/${local.name_prefix}-github-deploy-cdn-policy",
    ]
  }

  # ─── KMS (AWS-managed SQS key) ─────────────────────────────────────────────

  statement {
    sid       = "KMSSQSDescribe"
    effect    = "Allow"
    actions   = ["kms:DescribeKey", "kms:ListAliases"]
    resources = ["*"]
  }
}

# Managed policy — does not count toward the 10 240-byte inline policy quota.
resource "aws_iam_policy" "github_deploy_compute_policy" {
  provider = aws.this

  name        = "${local.name_prefix}-github-deploy-compute-policy"
  description = "Compute pipeline permissions (SQS, EC2, ASG, IAM worker) for GitHub deploy role"
  policy      = data.aws_iam_policy_document.github_deploy_compute_policy.json
}

resource "aws_iam_role_policy_attachment" "github_deploy_compute" {
  role       = data.aws_iam_role.github_oidc_deploy_role.name
  policy_arn = aws_iam_policy.github_deploy_compute_policy.arn
}

resource "aws_iam_role_policy_attachment" "local_dev_compute" {
  count = var.attach_deploy_policies_to_local_dev_role ? 1 : 0

  role       = data.aws_iam_role.local_dev_role.name
  policy_arn = aws_iam_policy.github_deploy_compute_policy.arn
}

# ── Network / data-plane permissions (split out to stay under 6144-byte policy limit) ──

data "aws_iam_policy_document" "github_deploy_network_policy" {

  # ─── DynamoDB ──────────────────────────────────────────────────────────────

  statement {
    sid    = "DynamoDBListGlobal"
    effect = "Allow"
    actions = [
      "dynamodb:ListTables",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "DynamoDBScenesTableManage"
    effect = "Allow"
    actions = [
      "dynamodb:CreateTable",
      "dynamodb:DeleteTable",
      "dynamodb:DescribeTable",
      "dynamodb:UpdateTable",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:UpdateContinuousBackups",
      "dynamodb:ListTagsOfResource",
      "dynamodb:TagResource",
      "dynamodb:UntagResource",
    ]
    resources = [
      # Constructed ARNs — table does not exist yet on first apply.
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-scenes",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-scenes/index/*",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-profiles",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-profiles/index/*",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-usernames",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-follows",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-follows/index/*",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-reactions",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-comments",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-notifications",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-bookmarks",
      "arn:aws:dynamodb:${var.aws_region}:886601940523:table/${local.name_prefix}-bookmarks/index/*",
    ]
  }

  # ─── EC2 / VPC ─────────────────────────────────────────────────────────────

  statement {
    sid    = "EC2DescribeGlobal"
    effect = "Allow"
    actions = [
      "ec2:DescribeVpcs",
      "ec2:DescribeVpcAttribute",
      "ec2:DescribeSubnets",
      "ec2:DescribeInternetGateways",
      "ec2:DescribeRouteTables",
      "ec2:DescribeAvailabilityZones",
      "ec2:DescribeTags",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeAddressesAttribute",
      "ec2:DescribePrefixLists",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "EC2VPCManage"
    effect = "Allow"
    actions = [
      "ec2:CreateVpc",
      "ec2:ModifyVpcAttribute",
      "ec2:DeleteVpc",
      "ec2:CreateSubnet",
      "ec2:ModifySubnetAttribute",
      "ec2:DeleteSubnet",
      "ec2:CreateInternetGateway",
      "ec2:AttachInternetGateway",
      "ec2:DetachInternetGateway",
      "ec2:DeleteInternetGateway",
      "ec2:CreateRouteTable",
      "ec2:DeleteRouteTable",
      "ec2:CreateRoute",
      "ec2:DeleteRoute",
      "ec2:AssociateRouteTable",
      "ec2:DisassociateRouteTable",
      "ec2:ReplaceRoute",
      "ec2:AllocateAddress",
      "ec2:ReleaseAddress",
      "ec2:CreateNatGateway",
      "ec2:DeleteNatGateway",
      "ec2:DescribeNatGateways",
      "ec2:DescribeAddresses",
      "ec2:CreateVpcEndpoint",
      "ec2:DeleteVpcEndpoints",
      "ec2:ModifyVpcEndpoint",
      "ec2:DescribeVpcEndpoints",
      "ec2:CreateTags",
      "ec2:DeleteTags",
    ]
    resources = ["*"]
  }

  # ─── Lambda ────────────────────────────────────────────────────────────────

  statement {
    sid    = "LambdaFunctionManage"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:DeleteFunction",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:GetPolicy",
      "lambda:ListTags",
      "lambda:TagResource",
      "lambda:UntagResource",
      "lambda:GetFunctionCodeSigningConfig",
      "lambda:ListVersionsByFunction",
    ]
    resources = [
      aws_lambda_function.myfunc.arn,
      # Constructed ARN for the upload Lambda (does not exist yet on first apply).
      "arn:aws:lambda:${var.aws_region}:886601940523:function:${var.name}-upload-lambda",
      # Constructed ARN for the Google Drive import Lambda.
      "arn:aws:lambda:${var.aws_region}:886601940523:function:${var.name}-gdrive-import-lambda",
    ]
  }
}

resource "aws_iam_policy" "github_deploy_network_policy" {
  provider = aws.this

  name        = "${local.name_prefix}-github-deploy-network-policy"
  description = "Network, DynamoDB, and Lambda permissions for GitHub deploy role"
  policy      = data.aws_iam_policy_document.github_deploy_network_policy.json
}

resource "aws_iam_role_policy_attachment" "github_deploy_network" {
  role       = data.aws_iam_role.github_oidc_deploy_role.name
  policy_arn = aws_iam_policy.github_deploy_network_policy.arn
}

resource "aws_iam_role_policy_attachment" "local_dev_network" {
  count = var.attach_deploy_policies_to_local_dev_role ? 1 : 0

  role       = data.aws_iam_role.local_dev_role.name
  policy_arn = aws_iam_policy.github_deploy_network_policy.arn
}

# Network policy updates must propagate before DynamoDB CreateTable in the same apply.
resource "time_sleep" "network_iam_propagation" {
  create_duration = "15s"

  triggers = {
    network_policy_hash = sha256(aws_iam_policy.github_deploy_network_policy.policy)
  }

  depends_on = [aws_iam_role_policy_attachment.github_deploy_network]
}

# ── CDN / DNS / TLS / Logs permissions (separate policy to stay under 10 240-byte limit) ──

data "aws_iam_policy_document" "github_deploy_cdn_policy" {

  # ─── CloudFront ────────────────────────────────────────────────────────────

  # OAC IDs are opaque at plan time; AWS does not support resource-level ARN
  # scoping for these OAC-specific actions.
  statement {
    sid    = "CloudFrontOACManage"
    effect = "Allow"
    actions = [
      "cloudfront:CreateOriginAccessControl",
      "cloudfront:GetOriginAccessControl",
      "cloudfront:GetOriginAccessControlConfig",
      "cloudfront:UpdateOriginAccessControl",
      "cloudfront:DeleteOriginAccessControl",
      "cloudfront:ListOriginAccessControls",
    ]
    resources = ["*"]
  }

  # Function names are assigned at apply time; ListFunctions is account-global.
  statement {
    sid       = "CloudFrontFunctionList"
    effect    = "Allow"
    actions   = ["cloudfront:ListFunctions"]
    resources = ["*"]
  }

  # CreateFunction is evaluated before the function exists; AWS does not honor
  # name-prefix resource constraints for this action (returns AccessDenied).
  statement {
    sid    = "CloudFrontFunctionCreate"
    effect = "Allow"
    actions = [
      "cloudfront:CreateFunction",
      "cloudfront:PublishFunction",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "CloudFrontFunctionManage"
    effect = "Allow"
    actions = [
      "cloudfront:UpdateFunction",
      "cloudfront:DeleteFunction",
      "cloudfront:DescribeFunction",
      "cloudfront:GetFunction",
      "cloudfront:TestFunction",
      "cloudfront:TagResource",
      "cloudfront:UntagResource",
      "cloudfront:ListTagsForResource",
    ]
    resources = [
      "arn:aws:cloudfront::886601940523:function/${local.name_prefix}-*",
    ]
  }

  statement {
    sid    = "CloudFrontDistributionManage"
    effect = "Allow"
    actions = [
      "cloudfront:CreateDistribution",
      "cloudfront:GetDistribution",
      "cloudfront:GetDistributionConfig",
      "cloudfront:UpdateDistribution",
      "cloudfront:DeleteDistribution",
      "cloudfront:ListDistributions",
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
      "cloudfront:ListInvalidations",
      "cloudfront:TagResource",
      "cloudfront:UntagResource",
      "cloudfront:ListTagsForResource",
    ]
    # Scoped to this account; CloudFront distribution IDs are assigned by AWS
    # and are not known until after the first apply, so a specific ARN reference
    # cannot be used for CreateDistribution.
    resources = [
      "arn:aws:cloudfront::886601940523:distribution/*",
    ]
  }

  # ─── Route 53 ──────────────────────────────────────────────────────────────

  statement {
    sid    = "Route53ListGlobal"
    effect = "Allow"
    actions = [
      "route53:ListHostedZones",
      "route53:ListHostedZonesByName",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "Route53ZoneManage"
    effect = "Allow"
    actions = [
      "route53:GetHostedZone",
      "route53:ChangeResourceRecordSets",
      "route53:ListResourceRecordSets",
      "route53:GetChange",
      "route53:ListTagsForResource",
    ]
    resources = [
      "arn:aws:route53:::hostedzone/*",
      "arn:aws:route53:::change/*",
    ]
  }

  # ─── ACM ───────────────────────────────────────────────────────────────────

  statement {
    sid    = "ACMListGlobal"
    effect = "Allow"
    actions = [
      "acm:ListCertificates",
    ]
    resources = ["*"]
  }

  # The api-gateway-domain module creates its own ACM certificate (DNS-validated).
  # RequestCertificate/DeleteCertificate/tag actions are required for create and
  # destroy; the describe/read actions cover plan and the validation waiter.
  statement {
    sid    = "ACMCertificateManage"
    effect = "Allow"
    actions = [
      "acm:RequestCertificate",
      "acm:DeleteCertificate",
      "acm:DescribeCertificate",
      "acm:GetCertificate",
      "acm:ListTagsForCertificate",
      "acm:AddTagsToCertificate",
      "acm:RemoveTagsFromCertificate",
    ]
    resources = [
      "arn:aws:acm:us-east-1:886601940523:certificate/*",
    ]
  }

  # ─── CloudWatch Logs ───────────────────────────────────────────────────────

  statement {
    sid    = "CloudWatchAlarmsManage"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricAlarm",
      "cloudwatch:DeleteAlarms",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:TagResource",
      "cloudwatch:UntagResource",
      "cloudwatch:ListTagsForResource",
    ]
    resources = [
      "arn:aws:cloudwatch:${var.aws_region}:886601940523:alarm:${local.name_prefix}-sqs-scale-out",
      "arn:aws:cloudwatch:${var.aws_region}:886601940523:alarm:${local.name_prefix}-sqs-scale-in",
      "arn:aws:cloudwatch:${var.aws_region}:886601940523:alarm:TargetTracking-${local.name_prefix}-splat-worker-asg-*",
    ]
  }

  # DescribeLogGroups is a list API that AWS requires on "*".
  statement {
    sid    = "CloudWatchLogsDescribeGlobal"
    effect = "Allow"
    actions = [
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "CloudWatchLogsLambdaManage"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:DeleteRetentionPolicy",
      "logs:ListTagsLogGroup",
      "logs:ListTagsForResource",
      "logs:TagLogGroup",
      "logs:UntagLogGroup",
      "logs:TagResource",
      "logs:UntagResource",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:886601940523:log-group:/aws/lambda/${var.name}-*",
      "arn:aws:logs:${var.aws_region}:886601940523:log-group:/aws/apigateway/${var.name}-*",
      "arn:aws:logs:${var.aws_region}:886601940523:log-group:/${var.project_name}/${var.environment}/worker",
    ]
  }

  # Required by API Gateway v2 to enable access logging on a stage.
  # CreateLogDelivery / UpdateLogDelivery are service-linked actions that AWS
  # evaluates against "*" — resource-level scoping is not supported.
  statement {
    sid    = "APIGatewayLogDelivery"
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:GetLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
    ]
    resources = ["*"]
  }
}

# Managed policy — does not count toward the 10 240-byte inline policy quota.
resource "aws_iam_policy" "github_deploy_cdn_policy" {
  provider = aws.this

  name        = "${local.name_prefix}-github-deploy-cdn-policy"
  description = "CloudFront, Route53, ACM, and CloudWatch Logs permissions for GitHub deploy role"
  policy      = data.aws_iam_policy_document.github_deploy_cdn_policy.json
}

resource "aws_iam_role_policy_attachment" "github_deploy_cdn" {
  role       = data.aws_iam_role.github_oidc_deploy_role.name
  policy_arn = aws_iam_policy.github_deploy_cdn_policy.arn
}

resource "aws_iam_role_policy_attachment" "local_dev_cdn" {
  count = var.attach_deploy_policies_to_local_dev_role ? 1 : 0

  role       = data.aws_iam_role.local_dev_role.name
  policy_arn = aws_iam_policy.github_deploy_cdn_policy.arn
}

# Managed CDN policy updates must propagate before CloudFront Function APIs
# are called in the same apply (otherwise CreateFunction returns AccessDenied).
resource "time_sleep" "cdn_iam_propagation" {
  create_duration = "45s"

  triggers = {
    cdn_policy_sha = sha256(aws_iam_policy.github_deploy_cdn_policy.policy)
  }

  depends_on = [
    aws_iam_policy.github_deploy_cdn_policy,
    aws_iam_role_policy_attachment.github_deploy_cdn,
  ]
}
