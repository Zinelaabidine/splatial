resource "aws_sqs_queue" "processing_dlq" {
  provider = aws.this

  name                      = "${local.name_prefix}-splat-processing-dlq"
  kms_master_key_id         = "alias/aws/sqs"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name        = "${local.name_prefix}-splat-processing-dlq"
    Environment = var.environment
  }
}

resource "aws_sqs_queue" "processing_queue" {
  provider = aws.this

  name                       = "${local.name_prefix}-splat-processing-queue"
  visibility_timeout_seconds = 2700 # 45 minutes — covers long 3DGS training jobs
  kms_master_key_id          = "alias/aws/sqs"
  message_retention_seconds  = 1209600 # 14 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.processing_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name        = "${local.name_prefix}-splat-processing-queue"
    Environment = var.environment
  }
}

# ── Priority pool (paid tier) ─────────────────────────────────────────────────
# Separate queue + DLQ so paid-tier jobs are never queued behind free-tier
# jobs at all, rather than reordering a shared queue. Feeds
# aws_autoscaling_group.worker_priority (compute-priority.tf), which runs
# 100% On-Demand. Same shape as the standard queue/DLQ above.

resource "aws_sqs_queue" "processing_dlq_priority" {
  provider = aws.this

  name                      = "${local.name_prefix}-splat-processing-dlq-priority"
  kms_master_key_id         = "alias/aws/sqs"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name        = "${local.name_prefix}-splat-processing-dlq-priority"
    Environment = var.environment
  }
}

resource "aws_sqs_queue" "processing_queue_priority" {
  provider = aws.this

  name                       = "${local.name_prefix}-splat-processing-queue-priority"
  visibility_timeout_seconds = 2700
  kms_master_key_id          = "alias/aws/sqs"
  message_retention_seconds  = 1209600

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.processing_dlq_priority.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name        = "${local.name_prefix}-splat-processing-queue-priority"
    Environment = var.environment
  }
}
