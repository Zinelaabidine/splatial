# Admin ASG configuration — IAM + API route.
#
# Lets an admin change the GPU worker's AMI, instance type, and ASG max size
# from the admin page (GET/POST /admin/asg-config) WITHOUT a Terraform apply
# or GitHub Actions deploy.
#
# How this avoids Terraform drift:
#   - aws_autoscaling_group.worker already references the launch template as
#     version = "$Latest" (see compute.tf). The admin handler calls
#     ec2:CreateLaunchTemplateVersion to publish a new AMI/instance type as a
#     new version — it never touches the template's default version, so
#     Terraform (which tracks the default version's content) sees no diff on
#     the next plan.
#   - max_size is a live ASG attribute, not a launch template attribute, so it
#     genuinely would drift; compute.tf's lifecycle.ignore_changes covers it.
#
# Reuses the existing dispatcher Lambda (upload_lambda) and Cognito authorizer,
# same pattern as admin-logs.tf. The handler additionally enforces admin-group
# membership server-side via lib/admin-auth.js.

resource "aws_iam_role_policy" "admin_asg_config" {
  provider = aws.this

  name = "${var.name}-admin-asg-config"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ec2:Describe* actions do not support resource-level permissions at
        # all (a well-documented EC2 IAM limitation) — Resource must be "*"
        # even though each call is logically scoped to one AMI/type/template.
        Sid    = "DescribeCallsRequireWildcardResource"
        Effect = "Allow"
        Action = [
          "ec2:DescribeImages",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeLaunchTemplates",
          "ec2:DescribeLaunchTemplateVersions",
          # Used to enrich the admin page with per-instance IPs/state so an
          # admin can copy an `aws ssm start-session` command — workers have
          # no inbound SG rules or SSH key pair by design (SSM-only access).
          "ec2:DescribeInstances",
          # Live Spot price lookup shown before an admin applies an instance
          # type change.
          "ec2:DescribeSpotPriceHistory",
        ]
        # No resource-level permission available for these actions.
        Resource = "*"
      },
      {
        # CreateLaunchTemplateVersion DOES support resource-level permission
        # (unlike the Describe calls above) — scope it to the worker template.
        Sid      = "CreateWorkerLaunchTemplateVersion"
        Effect   = "Allow"
        Action   = ["ec2:CreateLaunchTemplateVersion"]
        Resource = "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:launch-template/${aws_launch_template.worker.id}"
      },
      {
        # DescribeAutoScalingGroups is a list call and, like EC2 Describe
        # calls, requires Resource "*" — it cannot be scoped to one ASG ARN.
        Sid      = "DescribeAutoScalingGroupsRequiresWildcardResource"
        Effect   = "Allow"
        Action   = ["autoscaling:DescribeAutoScalingGroups"]
        Resource = "*"
      },
      {
        # UpdateAutoScalingGroup DOES support resource-level permission —
        # scope it to the worker ASG only.
        Sid      = "UpdateWorkerAsg"
        Effect   = "Allow"
        Action   = ["autoscaling:UpdateAutoScalingGroup"]
        Resource = aws_autoscaling_group.worker.arn
      },
      {
        # Manual "boot a worker now" testing flow (POST /admin/asg/boot and
        # /release): suspends the AlarmNotification process so the SQS
        # scale-in alarm doesn't race to reclaim the manually-requested
        # capacity, then resumes it on release. Both actions support
        # resource-level permission — scope to the worker ASG only.
        Sid      = "SuspendResumeWorkerAsgAlarms"
        Effect   = "Allow"
        Action   = ["autoscaling:SuspendProcesses", "autoscaling:ResumeProcesses"]
        Resource = aws_autoscaling_group.worker.arn
      },
      {
        # Tags the ASG with a ManualModeSince timestamp on boot (there's no
        # AWS-native "suspended since" field) and clears it on release, so the
        # scheduled check in admin-notifications.tf knows how long a manual
        # session has been active. Both Tagging actions support resource-level
        # permission — scope to the worker ASG only.
        Sid      = "TagWorkerAsgForManualModeTracking"
        Effect   = "Allow"
        Action   = ["autoscaling:CreateOrUpdateTags", "autoscaling:DeleteTags"]
        Resource = aws_autoscaling_group.worker.arn
      },
      {
        # Queue-depth readout on the admin page, for context before deciding
        # to boot a worker manually.
        Sid      = "ReadProcessingQueueDepth"
        Effect   = "Allow"
        Action   = ["sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.processing_queue.arn
      },
    ]
  })
}

resource "aws_apigatewayv2_route" "admin_asg_config_get" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /admin/asg-config"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "admin_asg_config_update" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /admin/asg-config"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

# Manual worker boot/release — force capacity from 0 to N right now (e.g. to
# smoke-test a newly-selected AMI) without waiting for a real SQS job.

resource "aws_apigatewayv2_route" "admin_asg_boot" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /admin/asg/boot"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "admin_asg_release" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /admin/asg/release"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "admin_asg_spot_price" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /admin/asg/spot-price"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}
