resource "aws_dynamodb_table" "notifications" {
  provider = aws.this

  name         = "${local.name_prefix}-notifications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "notification_id"

  depends_on = [time_sleep.network_iam_propagation]

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "notification_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-notifications"
    Environment = var.environment
    Project     = var.project_name
  }
}
