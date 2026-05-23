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
