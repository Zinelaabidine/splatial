resource "aws_dynamodb_table" "shots" {
  provider = aws.this

  name         = "${local.name_prefix}-shots"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scene_id"
  range_key    = "shot_id"

  depends_on = [time_sleep.network_iam_propagation]

  attribute {
    name = "scene_id"
    type = "S"
  }

  attribute {
    name = "shot_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-shots"
    Environment = var.environment
    Project     = var.project_name
  }
}
