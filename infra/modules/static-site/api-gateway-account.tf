# Account-wide API Gateway CloudWatch Logs role (singleton per AWS account).
# Required before aws_apigatewayv2_stage access_log_settings can be created.
# Managed from exactly one environment (dev) — same pattern as enable_ami_bake_resources.

resource "aws_iam_role" "api_gateway_cloudwatch" {
  count = var.manage_api_gateway_account ? 1 : 0

  provider = aws.this

  name = "splatial-apigateway-cloudwatch-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Principal = {
        Service = "apigateway.amazonaws.com"
      }
    }]
  })

  depends_on = [time_sleep.iam_propagation]
}

resource "aws_iam_role_policy" "api_gateway_cloudwatch" {
  count = var.manage_api_gateway_account ? 1 : 0

  provider = aws.this

  name = "splatial-apigateway-cloudwatch-policy"
  role = aws_iam_role.api_gateway_cloudwatch[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "APIGatewayCloudWatchLogs"
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:PutLogEvents",
        "logs:GetLogEvents",
        "logs:FilterLogEvents",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_api_gateway_account" "this" {
  count = var.manage_api_gateway_account ? 1 : 0

  provider = aws.this

  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch[0].arn

  depends_on = [aws_iam_role_policy.api_gateway_cloudwatch]
}
