# Per-user subscription tier lookup for tiered quota/priority/compute
# features (see backend/lib/user-tier.js). One row per user, keyed by the
# Cognito `sub`. A missing row is treated as tier = "free" by the app layer —
# new users are never provisioned a row up front, so absence just means
# "hasn't been assigned anything else yet," not an error.
resource "aws_dynamodb_table" "users" {
  provider = aws.this

  name         = "${local.name_prefix}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  # Wait for the deploy-role policy update AND the IAM propagation delay
  # before attempting to create this table. See time_sleep.iam_propagation
  # in iam-github-oidc.tf for the rationale.
  depends_on = [time_sleep.iam_propagation]

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
    Name        = "${local.name_prefix}-users"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}
