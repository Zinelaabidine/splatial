# Rolling-window quota ledger: one row per quota-consuming event (a
# successful training completion, or a manual retry submission — see
# backend/lib/quota.js). Auto-requeues from an INTERRUPTED (Spot-preempted)
# attempt never write here: attempt-patch.js only charges on status =
# SUCCEEDED, and skips that charge when the attempt was already charged as a
# manual retry at submit time (see is_manual_retry on the scenes-table
# attempt record).
#
# event_sk is "QUOTA#<ISO-8601 UTC timestamp>#<attemptId>" so a Query with
# `event_sk >= "QUOTA#<cutoff-iso>"` answers "how many qualifying events in
# the trailing N days" directly — the sort key IS the time index, no GSI
# required.
resource "aws_dynamodb_table" "job_quota_events" {
  provider = aws.this

  name         = "${local.name_prefix}-job-quota-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "event_sk"

  depends_on = [time_sleep.iam_propagation]

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "event_sk"
    type = "S"
  }

  # 9 days: a 2-day buffer past the 7-day enforcement window. Correctness
  # comes from the event_sk range condition in the query, not from TTL
  # timing — the buffer just absorbs DynamoDB's ~48h TTL deletion lag so a
  # row can never disappear before it ages out of the window on its own.
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
    Name        = "${local.name_prefix}-job-quota-events"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}
