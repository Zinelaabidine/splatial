resource "aws_dynamodb_table" "follows" {
  provider = aws.this

  name         = "${local.name_prefix}-follows"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "follower_id"
  range_key    = "followee_id"

  depends_on = [time_sleep.iam_propagation]

  attribute {
    name = "follower_id"
    type = "S"
  }

  attribute {
    name = "followee_id"
    type = "S"
  }

  global_secondary_index {
    name            = "followee-follower-index"
    hash_key        = "followee_id"
    range_key       = "follower_id"
    projection_type = "KEYS_ONLY"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-follows"
    Environment = var.environment
    Project     = var.project_name
  }
}
