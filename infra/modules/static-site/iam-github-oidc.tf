data "aws_iam_openid_connect_provider" "github" {
  provider = aws.this

  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_oidc_assume_role_policy" {
  statement {
    sid    = "AllowGitHubActionsAssumeRole"
    effect = "Allow"

    principals {
      type = "Federated"
      identifiers = [
        data.aws_iam_openid_connect_provider.github.arn
      ]
    }

    actions = [
      "sts:AssumeRoleWithWebIdentity"
    ]

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values = [
        "sts.amazonaws.com"
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${local.github_repo_full}:environment:${var.environment}"
      ]
    }
  }
}

resource "aws_iam_role" "github_oidc_deploy_role" {
  provider = aws.this

  name               = "${local.name_prefix}-github-deploy-role"
  assume_role_policy = data.aws_iam_policy_document.github_oidc_assume_role_policy.json
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

  # ─── DynamoDB ─────────────────────────────────────────────────────────────────

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
    ]
  }

  # ─── EC2 / VPC ────────────────────────────────────────────────────────────────

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
      "ec2:CreateTags",
      "ec2:DeleteTags",
    ]
    resources = ["*"]
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

  # ─── Lambda ───────────────────────────────────────────────────────────────────

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
    ]
  }

  # ─── CloudFront ───────────────────────────────────────────────────────────────

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

  # ─── Route 53 ─────────────────────────────────────────────────────────────────

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

  # ─── ACM ──────────────────────────────────────────────────────────────────────

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
      aws_iam_role.lambda_exec.arn,
      # Constructed ARN for the upload Lambda execution role (does not exist yet).
      "arn:aws:iam::886601940523:role/${var.name}-upload-lambda-exec-role",
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
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

}


resource "aws_iam_role_policy" "github_deploy_policy" {
  provider = aws.this

  name   = "${local.name_prefix}-github-deploy-policy"
  role   = aws_iam_role.github_oidc_deploy_role.id
  policy = data.aws_iam_policy_document.github_deploy_policy.json
}

 