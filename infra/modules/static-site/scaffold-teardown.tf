# Legacy helloFromLambda exec role — kept until deploy policy (ListInstanceProfilesForRole)
# propagates on envs that skipped the interim apply. Delete this file after staging/prod
# CI succeeds; the next apply removes the role cleanly.
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

  depends_on = [time_sleep.iam_propagation]
}
