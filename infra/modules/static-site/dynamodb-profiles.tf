resource "aws_dynamodb_table" "profiles" {
  provider = aws.this

  name         = "${local.name_prefix}-profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  depends_on = [time_sleep.iam_propagation]

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "username"
    type = "S"
  }

  global_secondary_index {
    name            = "username-index"
    hash_key        = "username"
    projection_type = "KEYS_ONLY"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-profiles"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_dynamodb_table" "usernames" {
  provider = aws.this

  name         = "${local.name_prefix}-usernames"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "username"

  depends_on = [time_sleep.iam_propagation]

  attribute {
    name = "username"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-usernames"
    Environment = var.environment
    Project     = var.project_name
  }
}
