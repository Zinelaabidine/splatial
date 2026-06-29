resource "aws_dynamodb_table" "reactions" {
  provider = aws.this

  name         = "${local.name_prefix}-reactions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scene_id"
  range_key    = "user_id"

  depends_on = [time_sleep.iam_propagation]

  attribute {
    name = "scene_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-reactions"
    Environment = var.environment
    Project     = var.project_name
  }
}
