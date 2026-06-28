data "aws_iam_instance_profile" "worker" {
  name = var.worker_instance_profile_name
}

# ── Security Group ────────────────────────────────────────────────────────────

resource "aws_security_group" "worker" {
  provider = aws.this

  name        = "${local.name_prefix}-splat-worker-sg"
  description = "Outbound-only SG for 3DGS GPU workers. No inbound needed - management via SSM."
  vpc_id      = aws_vpc.static_site.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound (S3, SQS, DynamoDB, SSM)"
  }

  tags = {
    Name        = "${local.name_prefix}-splat-worker-sg"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# ── Launch Template ───────────────────────────────────────────────────────────

resource "aws_launch_template" "worker" {
  provider = aws.this

  name        = "${local.name_prefix}-splat-worker-lt"
  description = "ARM GPU Spot worker template for 3DGS training jobs"
  image_id    = var.worker_ami_id

  instance_type = var.worker_instance_type

  # OS shutdown (shutdown -h now) terminates the instance instead of stopping it.
  instance_initiated_shutdown_behavior = "terminate"

  iam_instance_profile {
    name = data.aws_iam_instance_profile.worker.name
  }

  # Request Spot capacity
  instance_market_options {
    market_type = "spot"
    spot_options {
      spot_instance_type = "one-time"
    }
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 100
      volume_type           = "gp3"
      delete_on_termination = true
    }
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.worker.id]
    delete_on_termination       = true
  }

  # IMDSv2 required — prevents SSRF-based credential extraction
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # Inject queue names before starting the pre-baked worker service on the AMI.
  user_data = base64encode(<<-EOT
    #!/bin/bash
    set -e
    cat > /etc/splatial-worker.env <<'ENVFILE'
    QUEUE_NAME=${aws_sqs_queue.processing_queue.name}
    DLQ_NAME=${aws_sqs_queue.processing_dlq.name}
    SPLATIAL_ENV=${var.environment}
    WORKER_LOG_GROUP=${local.worker_log_group}
    LOG_TO_CLOUDWATCH=true
    ENVFILE
    mkdir -p /etc/systemd/system/gaussian-worker.service.d
    cat > /etc/systemd/system/gaussian-worker.service.d/env.conf <<'DROPIN'
    [Service]
    EnvironmentFile=/etc/splatial-worker.env
    DROPIN
    systemctl daemon-reload
    systemctl enable gaussian-worker.service
    systemctl start gaussian-worker.service
  EOT
  )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name               = "${local.name_prefix}-splat-worker"
      Environment        = var.environment
      AllowSelfTerminate = "true"
      Project            = var.project_name
      ManagedBy          = "terraform"
    }
  }

  tags = {
    Name        = "${local.name_prefix}-splat-worker-lt"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# ── Auto Scaling Group ────────────────────────────────────────────────────────
# Scale out when SQS visible messages > 0; scale to zero when the queue is empty.

resource "aws_autoscaling_group" "worker" {
  provider = aws.this

  name = "${local.name_prefix}-splat-worker-asg"

  min_size         = 0
  max_size         = var.worker_asg_max_size
  desired_capacity = 0

  vpc_zone_identifier = [aws_subnet.worker_spot.id]

  launch_template {
    id      = aws_launch_template.worker.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
  }

  tag {
    key                 = "Name"
    value               = "${local.name_prefix}-splat-worker"
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }

  tag {
    key                 = "Project"
    value               = var.project_name
    propagate_at_launch = true
  }

  tag {
    key                 = "ManagedBy"
    value               = "terraform"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

# ── Step Scaling — Scale Out ──────────────────────────────────────────────────
# Target tracking cannot scale from zero when queue depth equals target_value (1
# message vs threshold > 1.0). Step scaling fires on the first visible message.

resource "aws_autoscaling_policy" "sqs_step_scale_out" {
  provider = aws.this

  name                      = "${local.name_prefix}-sqs-step-scale-out"
  autoscaling_group_name    = aws_autoscaling_group.worker.name
  policy_type               = "StepScaling"
  adjustment_type           = "ExactCapacity"
  metric_aggregation_type   = "Maximum"
  estimated_instance_warmup = 120

  # Set capacity to exactly 1 when any message is visible — do not stack +1 on
  # top of an instance already launched manually or by a prior alarm evaluation.
  step_adjustment {
    metric_interval_lower_bound = 0
    scaling_adjustment          = 1
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_scale_out" {
  provider = aws.this

  alarm_name          = "${local.name_prefix}-sqs-scale-out"
  alarm_description   = "Scale out GPU workers when the processing queue has visible messages."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.processing_queue.name
  }

  alarm_actions = [aws_autoscaling_policy.sqs_step_scale_out.arn]

  tags = {
    Name        = "${local.name_prefix}-sqs-scale-out"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# ── Step Scaling — Scale In ───────────────────────────────────────────────────
# Scale-out sets desired=1 but nothing previously reset it to 0 when the queue
# drained. Worker self-terminate is a backstop; this policy handles empty queue.

resource "aws_autoscaling_policy" "sqs_step_scale_in" {
  provider = aws.this

  name                      = "${local.name_prefix}-sqs-step-scale-in"
  autoscaling_group_name    = aws_autoscaling_group.worker.name
  policy_type               = "StepScaling"
  adjustment_type           = "ExactCapacity"
  metric_aggregation_type   = "Maximum"
  estimated_instance_warmup = 0

  step_adjustment {
    metric_interval_upper_bound = 0
    scaling_adjustment          = 0
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_scale_in" {
  provider = aws.this

  alarm_name          = "${local.name_prefix}-sqs-scale-in"
  alarm_description   = "Scale in GPU workers when the processing queue is fully empty."
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateNumberOfMessages"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.processing_queue.name
  }

  alarm_actions = [aws_autoscaling_policy.sqs_step_scale_in.arn]

  tags = {
    Name        = "${local.name_prefix}-sqs-scale-in"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# Worker self-termination remains a backstop if the queue is empty but the
# instance is still running after the scale-in alarm evaluation window.
