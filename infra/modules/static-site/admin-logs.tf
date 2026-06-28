# Admin log drill-down — IAM + API route.
#
# Grants the dispatcher Lambda (upload_lambda) read access to the worker log
# group so GET /admin/attempts/{attemptId}/logs can run FilterLogEvents, and adds
# the route. Reuses the existing integration and Cognito authorizer; the handler
# additionally enforces admin-group membership server-side.

resource "aws_iam_role_policy" "admin_lambda_logs_read" {
  provider = aws.this

  name = "${var.name}-admin-lambda-logs-read"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadWorkerLogs"
        Effect = "Allow"
        Action = [
          "logs:FilterLogEvents",
          "logs:GetLogEvents",
          "logs:DescribeLogStreams",
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:log-group:${local.worker_log_group}",
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:log-group:${local.worker_log_group}:*",
        ]
      },
    ]
  })
}

resource "aws_apigatewayv2_route" "admin_attempt_logs" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /admin/attempts/{attemptId}/logs"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}
