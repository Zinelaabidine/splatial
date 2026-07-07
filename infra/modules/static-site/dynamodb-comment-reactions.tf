resource "aws_dynamodb_table" "comment_reactions" {
  provider = aws.this

  name         = "${local.name_prefix}-comment-reactions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "comment_id"
  range_key    = "user_id"

  depends_on = [time_sleep.network_iam_propagation]

  attribute {
    name = "comment_id"
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
    Name        = "${local.name_prefix}-comment-reactions"
    Environment = var.environment
    Project     = var.project_name
  }
}
