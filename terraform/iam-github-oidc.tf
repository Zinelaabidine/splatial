data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_oidc_assume_role_policy" {
  statement {
    effect = "Allow"

    principals {
      type = "Federated"
      identifiers = [
        data.aws_iam_openid_connect_provider.github.arn,
      ]
    }

    actions = [
      "sts:AssumeRoleWithWebIdentity",
    ]
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values = [
        "sts.amazonaws.com",
      ]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:Zinelaabidine/hello-world-static-site:*",
        "repo:Zinelaabidine/hello-world-static-site:*"
      ]
    }
  }
}

resource "aws_iam_role" "github_oidc_role" {
  name               = "github-oidc-role"
  assume_role_policy = data.aws_iam_policy_document.github_oidc_assume_role_policy.json
}