# Admin worker-AMI registry — API routes + IAM.
#
# Reuses the existing dispatcher Lambda (aws_apigatewayv2_integration.upload_init
# -> aws_lambda_function.upload_lambda), same pattern as network-admin.tf /
# admin-logs.tf. The upload.js dispatcher routes these routeKeys to
# handlers/admin-worker-amis-*.js; each handler additionally enforces
# admin-group membership server-side via lib/admin-auth.js.
#
# Scope, by design (see CLAUDE.md §1, §8 and the bake-worker-ami.yml comments):
#   - "Register a new AMI"     -> DynamoDB write only (aws_dynamodb_table.worker_amis).
#   - "Manual worker boot"     -> ec2:RunInstances of ONE standalone instance,
#                                 same subnet/SG/instance-profile as the real
#                                 launch template, for smoke-testing one real job.
#                                 Never touches the ASG or its Launch Template.
#   - "Update configuration"   -> DynamoDB write only (sets the registry's
#                                 "current" pointer for UI display). It never
#                                 calls any EC2/ASG API — the ASG's actual AMI
#                                 stays 100% Terraform-owned via
#                                 var.worker_ami_id in compute.tf, changed only
#                                 by a human through plan/apply.

resource "aws_iam_role_policy" "admin_worker_amis_dynamodb" {
  provider = aws.this

  name = "${var.name}-admin-worker-amis-dynamodb-policy"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "WorkerAmisRegistryAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Scan",
        ]
        Resource = aws_dynamodb_table.worker_amis.arn
      },
    ]
  })
}

resource "aws_iam_role_policy" "admin_worker_amis_ec2_boot" {
  provider = aws.this

  name = "${var.name}-admin-worker-amis-ec2-boot-policy"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # RunInstances checks permissions against every resource type the
        # call touches (image, instance, subnet, security-group,
        # network-interface, volume) — AWS requires all of them in one
        # statement's Resource list; there is no way to split RunInstances
        # itself across multiple scoped statements.
        Sid    = "ManualWorkerBootRunInstances"
        Effect = "Allow"
        Action = ["ec2:RunInstances"]
        Resource = [
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:image/*",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:network-interface/*",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:volume/*",
          aws_subnet.worker_spot.arn,
          aws_security_group.worker.arn,
        ]
      },
      {
        # RunInstances requires the caller to be able to pass the instance
        # profile's role to EC2. Scoped to exactly the worker instance role —
        # the same one the Terraform-managed launch template uses.
        Sid      = "ManualWorkerBootPassWorkerRole"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = aws_iam_role.worker_instance_role.arn
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ec2.amazonaws.com"
          }
        }
      },
      {
        # Tag-on-create, scoped to the RunInstances call that created the
        # resource — standard pattern for tagging instances/volumes at launch.
        Sid    = "ManualWorkerBootTagOnCreate"
        Effect = "Allow"
        Action = ["ec2:CreateTags"]
        Resource = [
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:volume/*",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:network-interface/*",
        ]
        Condition = {
          StringEquals = {
            "ec2:CreateAction" = "RunInstances"
          }
        }
      },
      {
        # DescribeImages (validate an AMI on registration) and DescribeInstances
        # (poll a manually booted instance's state) have no resource-level
        # permissions in the EC2 API.
        # No resource-level permission available for this action
        Sid      = "WorkerAmisEc2Describe"
        Effect   = "Allow"
        Action   = ["ec2:DescribeImages", "ec2:DescribeInstances"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_apigatewayv2_route" "admin_worker_amis_list" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /admin/worker-amis"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "admin_worker_amis_register" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /admin/worker-amis"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "admin_worker_amis_boot" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /admin/worker-amis/{amiId}/boot"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "admin_worker_amis_activate" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /admin/worker-amis/{amiId}/activate"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}
