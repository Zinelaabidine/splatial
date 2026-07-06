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

  attribute {
    name = "parent_comment_id"
    type = "S"
  }

  # Sparse GSI: parent_comment_id is only set on reply items (see
  # lib/comments.js createReply). Lets listReplies() fetch a top-level
  # comment's replies without scanning the whole scene's comment history.
  global_secondary_index {
    name = "parent_comment_id-index"

    key_schema {
      attribute_name = "parent_comment_id"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "comment_id"
      key_type       = "RANGE"
    }

    projection_type = "ALL"
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
