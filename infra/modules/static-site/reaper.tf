# Scheduled attempt-lease reaper (every 5 minutes).
#
# Invokes the shared dispatcher Lambda directly (bypassing API Gateway) with a
# synthetic routeKey that upload.js switches on — same pattern as retention.tf
# and admin-notifications.tf. Not reachable via any HTTP route, so it needs no
# admin-JWT gate: only EventBridge can invoke it.
#
# WHY THIS EXISTS
#
# SQS redelivers a message whose visibility timeout lapses, so a dead worker's
# job does eventually come back. Two gaps that does not cover:
#
#   1. The scenes table keeps saying PROCESSING. Nothing reconciles the record,
#      so the dashboard shows an in-progress job that exists nowhere.
#   2. maxReceiveCount is 3 (sqs.tf) and neither DLQ has a redrive-back policy.
#      Once exhausted, the attempt is stuck with no message and no worker.
#
# A worker that is merely Spot-interrupted re-enqueues itself and clears its own
# lease (worker.py's _handle_stop), so it never reaches the reaper. What the
# reaper catches is the case no worker-side code can: a hard crash, an OOM kill,
# or a Spot hardware termination that sends no PATCH at all.
#
# NO NEW IAM REQUIRED. The existing DynamoDBScenesAccess statement in
# lambda-upload.tf already grants Query on any scenes-table GSI (via the
# "${aws_dynamodb_table.scenes.arn}/index/*" wildcard resource) plus
# GetItem/UpdateItem on the base table, and the SQSJobSubmit statement already
# grants sqs:SendMessage on both processing queues — which is exactly the set of
# calls attempts-reap.js makes.
#
# ROLLBACK: set `attempt_reaper_enabled = false`. Recovery stops; nothing
# corrupts, because the reaper only ever writes on a lease that has already
# expired. Leave the GSI in place — dropping it is slow and it is harmless.

resource "aws_cloudwatch_event_rule" "attempts_reap" {
  provider = aws.this

  name                = "${local.name_prefix}-attempts-reap"
  description         = "Recovers training attempts whose worker died without reporting, by re-enqueueing them under a cap (see backend/handlers/attempts-reap.js)."
  schedule_expression = var.attempt_reaper_schedule
  state               = var.attempt_reaper_enabled ? "ENABLED" : "DISABLED"

  tags = {
    Name        = "${local.name_prefix}-attempts-reap"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  depends_on = [time_sleep.network_iam_propagation]
}

resource "aws_cloudwatch_event_target" "attempts_reap" {
  provider = aws.this

  rule = aws_cloudwatch_event_rule.attempts_reap.name
  arn  = aws_lambda_function.upload_lambda.arn

  input = jsonencode({
    routeKey = "INTERNAL /attempts/reap"
  })
}

resource "aws_lambda_permission" "events_attempts_reap" {
  provider = aws.this

  statement_id  = "AllowExecutionFromEventBridgeAttemptsReap"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload_lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.attempts_reap.arn
}
