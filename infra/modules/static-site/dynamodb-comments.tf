resource "aws_dynamodb_table" "comments" {
  provider = aws.this

  name         = "${local.name_prefix}-comments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scene_id"
  range_key    = "comment_id"

  depends_on = [time_sleep.network_iam_propagation]

  attribute {
    name = "scene_id"
    type = "S"
  }

  attribute {
    name = "comment_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-comments"
    Environment = var.environment
    Project     = var.project_name
  }
}
