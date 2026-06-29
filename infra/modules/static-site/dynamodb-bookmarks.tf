resource "aws_dynamodb_table" "bookmarks" {
  provider = aws.this

  name         = "${local.name_prefix}-bookmarks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "scene_id"

  depends_on = [time_sleep.iam_propagation]

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "scene_id"
    type = "S"
  }

  attribute {
    name = "added_at"
    type = "S"
  }

  global_secondary_index {
    name            = "user_id-added_at-index"
    hash_key        = "user_id"
    range_key       = "added_at"
    projection_type = "KEYS_ONLY"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-bookmarks"
    Environment = var.environment
    Project     = var.project_name
  }
}
