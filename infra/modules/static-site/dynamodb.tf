resource "aws_dynamodb_table" "scenes" {
  provider = aws.this

  name         = "${local.name_prefix}-scenes"
  billing_mode = "PAY_PER_REQUEST"

  key_schema {
    attribute_name = "scene_id"
    key_type       = "HASH"
  }

  attribute {
    name = "scene_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  # GSI used by the Lambda quota check: query all scenes for a user filtered
  # by status (e.g. PENDING_UPLOAD, PROCESSING) to enforce upload limits.
  global_secondary_index {
    name            = "user_id-status-index"
    hash_key        = "user_id"
    range_key       = "status"
    projection_type = "KEYS_ONLY"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-scenes"
    Environment = var.environment
    Project     = var.project_name
  }
}
