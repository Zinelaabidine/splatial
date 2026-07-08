# Structured audit trail for the admin user-management surface (suspend,
# ban, reactivate, verify override, reset password, revoke sessions,
# soft/hard delete, role changes, plan changes). See backend/lib/audit-log.js
# for the read/write helpers and query patterns this schema supports.
resource "aws_dynamodb_table" "audit_logs" {
  provider = aws.this

  name         = "${local.name_prefix}-audit-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "target_user_id"
  range_key    = "log_sk"

  depends_on = [time_sleep.iam_propagation]

  attribute {
    name = "target_user_id"
    type = "S"
  }

  attribute {
    name = "log_sk"
    type = "S"
  }

  attribute {
    name = "actor_admin_id"
    type = "S"
  }

  # Constant fan-out key ("ALL" on every row) so the whole audit feed can be
  # Queried newest-first without a table Scan. Audit-event volume is low
  # (admin actions only, never end-user traffic), so a single hot partition
  # is an accepted tradeoff here — unlike the scenes table, which has a
  # per-status/per-visibility GSI specifically to avoid this for
  # user-generated volume.
  attribute {
    name = "feed_bucket"
    type = "S"
  }

  # "What has this admin done" — GET /admin/audit-logs?actorAdminId=...
  global_secondary_index {
    name = "actor_admin_id-log_sk-index"

    key_schema {
      attribute_name = "actor_admin_id"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "log_sk"
      key_type       = "RANGE"
    }

    projection_type = "ALL"
  }

  # "Every audit event, any user" — GET /admin/audit-logs (no filters).
  global_secondary_index {
    name = "feed_bucket-log_sk-index"

    key_schema {
      attribute_name = "feed_bucket"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "log_sk"
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
    Name        = "${local.name_prefix}-audit-logs"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}
