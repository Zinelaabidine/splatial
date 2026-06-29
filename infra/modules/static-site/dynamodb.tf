resource "aws_dynamodb_table" "scenes" {
  provider = aws.this

  name         = "${local.name_prefix}-scenes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "scene_id"

  # Wait for the deploy-role policy update AND the IAM propagation delay before
  # attempting to create this table. See time_sleep.iam_propagation in
  # iam-github-oidc.tf for the rationale.
  depends_on = [time_sleep.iam_propagation]

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

  attribute {
    name = "visibility"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  # GSI for listing a user's scenes by status (e.g. PENDING_UPLOAD, READY).
  global_secondary_index {
    name            = "user_id-status-index"
    hash_key        = "user_id"
    range_key       = "status"
    projection_type = "KEYS_ONLY"
  }

  # GSI for listing public scenes newest-first (explore / feed).
  global_secondary_index {
    name            = "visibility-created_at-index"
    hash_key        = "visibility"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  # TTL: Lambda sets `expires_at` (epoch seconds) on every record.
  # PENDING_UPLOAD records expire after 24 h; PROCESSING after 7 days.
  # DynamoDB deletes expired items within ~48 h — no Lambda cleanup needed.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
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
