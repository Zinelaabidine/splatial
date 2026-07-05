# ── Worker AMI registry ───────────────────────────────────────────────────────
# Tracks GPU worker AMIs baked by .github/workflows/bake-worker-ami.yml so the
# admin console can list them, boot a single standalone instance from one for
# smoke-testing ("Manual worker boot"), and mark one as the app-level "current"
# pointer ("Update configuration").
#
# This table is intentionally NOT the source of truth for what the ASG actually
# launches — that stays 100% Terraform-owned via var.worker_ami_id in
# compute.tf, changed only by a human through the normal plan/apply flow (see
# CLAUDE.md §1, §8). The "current" pointer here (item key ami_id = "__CURRENT__")
# is registry/UI metadata only; it never triggers an EC2 or Auto Scaling API call.
resource "aws_dynamodb_table" "worker_amis" {
  provider = aws.this

  name         = "${local.name_prefix}-worker-amis"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "ami_id"

  depends_on = [time_sleep.network_iam_propagation]

  attribute {
    name = "ami_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${local.name_prefix}-worker-amis"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}
