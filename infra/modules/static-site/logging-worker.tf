# Worker log group name (see docs/logging-spec.md §9).
#
# The group is created at runtime by the worker (log_envelope.py) because IAM
# policy evaluation for log-group names containing "/" is unreliable for the
# GitHub deploy role during terraform apply. The worker instance role already
# grants logs:CreateLogGroup via CloudWatchAgentServerPolicy; retention is set
# in log_envelope._ensure_group_and_stream.
#
# WORKER_LOG_GROUP in compute.tf user_data must stay in sync with local.worker_log_group.
