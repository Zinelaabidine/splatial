# Admin ASG notifications — SNS (email) + Slack webhook, plus a scheduled
# check for manual-mode sessions left active too long.
#
# Two notification channels, both best-effort and fired from
# backend/lib/notify.js:
#   - Slack: the Lambda POSTs directly to var.slack_webhook_url (no AWS
#     resource needed — just an env var).
#   - Email: published to this SNS topic, which fans out to
#     var.admin_notification_email if set.
#
# Trigger 1 — POST /admin/asg-config succeeds (see admin-asg-config-update.js).
# Trigger 2 — a manual boot session (POST /admin/asg/boot) has been active
# longer than var.manual_mode_alert_minutes. There's no AWS-native "suspended
# since" timestamp for an ASG process, so admin-asg-boot.js stamps a
# ManualModeSince tag on the ASG itself, and this EventBridge-scheduled check
# reads it back every 15 minutes (see admin-asg-check-manual-mode.js).

resource "aws_sns_topic" "admin_notifications" {
  provider = aws.this

  name = "${local.name_prefix}-admin-notifications"

  tags = {
    Name        = "${local.name_prefix}-admin-notifications"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  depends_on = [time_sleep.network_iam_propagation]
}

resource "aws_sns_topic_subscription" "admin_email" {
  count = var.admin_notification_email != "" ? 1 : 0

  provider = aws.this

  topic_arn = aws_sns_topic.admin_notifications.arn
  protocol  = "email"
  endpoint  = var.admin_notification_email
}

resource "aws_iam_role_policy" "admin_notifications_publish" {
  provider = aws.this

  name = "${var.name}-admin-notifications-publish"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "PublishAdminNotifications"
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.admin_notifications.arn
      },
    ]
  })
}

# ── Scheduled manual-mode check (every 15 minutes) ──────────────────────────
# Invokes the same dispatcher Lambda directly (bypassing API Gateway) with a
# synthetic routeKey that upload.js switches on. Not reachable via any HTTP
# route, so it needs no admin-JWT gate — only EventBridge can invoke it.

resource "aws_cloudwatch_event_rule" "asg_manual_mode_check" {
  provider = aws.this

  name                = "${local.name_prefix}-asg-manual-mode-check"
  description         = "Periodically checks whether a manual ASG boot session has been active too long and alerts admins."
  schedule_expression = "rate(15 minutes)"

  tags = {
    Name        = "${local.name_prefix}-asg-manual-mode-check"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  depends_on = [time_sleep.network_iam_propagation]
}

resource "aws_cloudwatch_event_target" "asg_manual_mode_check" {
  provider = aws.this

  rule = aws_cloudwatch_event_rule.asg_manual_mode_check.name
  arn  = aws_lambda_function.upload_lambda.arn

  input = jsonencode({
    routeKey = "INTERNAL /asg/check-manual-mode"
  })
}

resource "aws_lambda_permission" "events_asg_manual_mode_check" {
  provider = aws.this

  statement_id  = "AllowExecutionFromEventBridgeManualModeCheck"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload_lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.asg_manual_mode_check.arn
}
