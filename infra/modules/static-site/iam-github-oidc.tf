data "aws_iam_openid_connect_provider" "github" {
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
  name               = "${local.name_prefix}-github-deploy-role"
  assume_role_policy = data.aws_iam_policy_document.github_oidc_assume_role_policy.json
}

data "aws_iam_policy_document" "github_deploy_policy" {
  statement {
    sid    = "AllowListSiteBucket"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation"
    ]

    resources = [
      aws_s3_bucket.site.arn
    ]
  }

  statement {
    sid    = "AllowManageSiteObjects"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]

    resources = [
      "${aws_s3_bucket.site.arn}/*"
    ]
  }

  statement {
    sid    = "AllowCloudFrontInvalidation"
    effect = "Allow"

    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetDistribution",
      "cloudfront:GetInvalidation"
    ]

    resources = [
      aws_cloudfront_distribution.site.arn
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy_policy" {
  name   = "${local.name_prefix}-github-deploy-policy"
  role   = aws_iam_role.github_oidc_deploy_role.id
  policy = data.aws_iam_policy_document.github_deploy_policy.json
}