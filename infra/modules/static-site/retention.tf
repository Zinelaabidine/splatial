# Scheduled raw-source retention sweep (once daily).
#
# Invokes the same dispatcher Lambda directly (bypassing API Gateway) with a
# synthetic routeKey that upload.js switches on — same pattern as
# admin-notifications.tf's asg_manual_mode_check. Not reachable via any HTTP
# route, so it needs no admin-JWT gate — only EventBridge can invoke it.
#
# No new IAM grants needed: the existing DynamoDBScenesAccess statement in
# lambda-upload.tf already covers Query on any scenes-table GSI (via the
# "${aws_dynamodb_table.scenes.arn}/index/*" wildcard resource) and UpdateItem
# on the base table; the existing S3RawScenesListForDelete / S3MultipartUpload
# statements already cover the DeleteObject/ListBucket calls
# retention-sweep.js makes against the raw-scenes bucket.

resource "aws_cloudwatch_event_rule" "retention_sweep" {
  provider = aws.this

  name                = "${local.name_prefix}-retention-sweep"
  description         = "Daily sweep that deletes raw scene sources past their per-tier retention window (see backend/lib/retention.js)."
  schedule_expression = "rate(1 day)"

  tags = {
    Name        = "${local.name_prefix}-retention-sweep"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  depends_on = [time_sleep.network_iam_propagation]
}

resource "aws_cloudwatch_event_target" "retention_sweep" {
  provider = aws.this

  rule = aws_cloudwatch_event_rule.retention_sweep.name
  arn  = aws_lambda_function.upload_lambda.arn

  input = jsonencode({
    routeKey = "INTERNAL /retention/sweep"
  })
}

resource "aws_lambda_permission" "events_retention_sweep" {
  provider = aws.this

  statement_id  = "AllowExecutionFromEventBridgeRetentionSweep"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload_lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.retention_sweep.arn
}
