# ── EC2 Worker Instance Role ─────────────────────────────────────────────────

data "aws_caller_identity" "worker" {
  provider = aws.this
}

resource "aws_iam_role" "worker_instance_role" {
  provider = aws.this

  name = "${local.name_prefix}-splat-worker-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = {
    Name        = "${local.name_prefix}-splat-worker-instance-role"
    Environment = var.environment
  }
}

resource "aws_iam_instance_profile" "worker_instance_profile" {
  provider = aws.this

  name = "${local.name_prefix}-splat-worker-instance-profile"
  role = aws_iam_role.worker_instance_role.name
}

resource "aws_iam_role_policy" "worker_policy" {
  provider = aws.this

  name = "${local.name_prefix}-splat-worker-policy"
  role = aws_iam_role.worker_instance_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SQSWorker"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
        ]
        Resource = [
          aws_sqs_queue.processing_queue.arn,
          aws_sqs_queue.processing_dlq.arn,
        ]
      },
      {
        Sid    = "S3RawSceneRead"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
        ]
        Resource = "${aws_s3_bucket.raw_scenes.arn}/*"
      },
      {
        Sid      = "S3SplatScenesWrite"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.splat_scenes.arn}/*"
      },
      {
        Sid    = "DynamoDBJobStatus"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
        ]
        Resource = aws_dynamodb_table.scenes.arn
      },
      {
        # Worker self-terminates via ASG API to enable scale-to-zero.
        # Scoped to the worker ASG by name.
        Sid    = "ASGSelfTerminate"
        Effect = "Allow"
        Action = [
          "autoscaling:TerminateInstanceInAutoScalingGroup",
        ]
        Resource = "arn:aws:autoscaling:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:autoScalingGroup:*:autoScalingGroupName/${local.name_prefix}-splat-worker-asg"
      },
      {
        # Required to look up the ASG name from the instance's metadata.
        Sid      = "ASGDescribeSelf"
        Effect   = "Allow"
        Action   = ["autoscaling:DescribeAutoScalingInstances"]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchWorkerLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:PutRetentionPolicy",
          "logs:DescribeLogStreams",
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:log-group:${local.worker_log_group}",
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:log-group:${local.worker_log_group}:*",
        ]
      },
      {
        # EC2 fallback self-termination when not in an ASG (manual test launches).
        # Requires AllowSelfTerminate=true on the instance (set in launch template).
        Sid      = "EC2SelfTerminate"
        Effect   = "Allow"
        Action   = ["ec2:TerminateInstances"]
        Resource = "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*"
        Condition = {
          StringEquals = {
            "ec2:ResourceTag/AllowSelfTerminate" = "true"
          }
        }
      },
      {
        # Backward-compatible path for instances launched with the worker Name tag only.
        Sid      = "EC2SelfTerminateByName"
        Effect   = "Allow"
        Action   = ["ec2:TerminateInstances"]
        Resource = "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.worker.account_id}:instance/*"
        Condition = {
          StringEquals = {
            "ec2:ResourceTag/Name" = "${local.name_prefix}-splat-worker"
          }
        }
      },
    ]
  })
}

# SSM Session Manager + CloudWatch agent — no SSH keys needed on workers
resource "aws_iam_role_policy_attachment" "worker_ssm" {
  role       = aws_iam_role.worker_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "worker_cloudwatch" {
  role       = aws_iam_role.worker_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# ── Upload Lambda — SQS send permission ──────────────────────────────────────

resource "aws_iam_role_policy" "upload_lambda_sqs" {
  provider = aws.this

  name = "${var.name}-upload-lambda-sqs-policy"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "SQSSubmitJob"
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = aws_sqs_queue.processing_queue.arn
    }]
  })
}
