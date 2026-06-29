# Legacy helloFromLambda exec role — kept for one apply cycle so the updated
# deploy policy (ListInstanceProfilesForRole) propagates before tear-down.
# Delete this file after CI succeeds; the next apply removes the role cleanly.
resource "aws_iam_role" "lambda_exec" {
  provider = aws.this
  name     = "${var.name}-lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}
