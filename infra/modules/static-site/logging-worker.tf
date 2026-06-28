# Worker log group.
#
# The worker ships its structured JSON logs here directly via boto3 (see
# worker/log_envelope.py). No CloudWatch agent is installed; the worker IAM role's
# CloudWatchAgentServerPolicy already grants PutLogEvents / CreateLogStream /
# CreateLogGroup, so no new IAM is required.
#
# One log stream per instance id (e.g. "i-0abc123/2026-06-28"). The worker reads
# the group name from WORKER_LOG_GROUP (set in compute.tf user_data); keep the two
# in sync.

resource "aws_cloudwatch_log_group" "worker" {
  provider = aws.this

  name              = "/${var.project_name}/${var.environment}/worker"
  retention_in_days = var.environment == "prod" ? 90 : 30

  tags = {
    Name        = "${local.name_prefix}-worker-logs"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}
