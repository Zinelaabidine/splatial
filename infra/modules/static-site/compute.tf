# ── Security Group ────────────────────────────────────────────────────────────

resource "aws_security_group" "worker" {
  provider = aws.this

  name        = "${local.name_prefix}-splat-worker-sg"
  description = var.worker_ssh_allowed_cidr != "" ? "3DGS GPU workers. SSM-managed; SSH also open to worker_ssh_allowed_cidr in this environment." : "Outbound-only SG for 3DGS GPU workers. No inbound needed - management via SSM."
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

# Opt-in SSH ingress (see variables.tf worker_ssh_allowed_cidr). Empty in
# staging/prod — those stay SSM-only with zero inbound rules. Dev sets this so
# an admin can SSH in directly with the GaussianWorker key pair (see
# worker_ssh_key_name on aws_launch_template.worker below) instead of going
# through Session Manager.
#
# Kept out of aws_security_group.worker inline blocks so this resource can
# depend on time_sleep.compute_iam_propagation without a cycle: the compute IAM
# policy references aws_security_group.worker.id for ec2:RunInstances.
resource "aws_vpc_security_group_ingress_rule" "worker_ssh" {
  for_each = var.worker_ssh_allowed_cidr != "" ? { ssh = var.worker_ssh_allowed_cidr } : {}

  provider = aws.this

  security_group_id = aws_security_group.worker.id
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
  cidr_ipv4         = each.value
  description       = "SSH (opt-in, see worker_ssh_allowed_cidr)"

  depends_on = [time_sleep.compute_iam_propagation]
}

resource "aws_vpc_security_group_ingress_rule" "worker_ssh_from_public_subnets" {
  for_each = var.worker_ssh_key_name != "" && var.worker_ssh_allowed_cidr != "" ? {
    for cidr in var.public_cidrs : cidr => cidr
  } : {}

  provider = aws.this

  security_group_id = aws_security_group.worker.id
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
  cidr_ipv4         = each.value
  description       = "SSH from public subnet CIDRs"

  depends_on = [time_sleep.compute_iam_propagation]
}

# ── Launch Template ───────────────────────────────────────────────────────────

resource "aws_launch_template" "worker" {
  provider = aws.this

  name        = "${local.name_prefix}-splat-worker-lt"
  description = "ARM GPU Spot worker template for 3DGS training jobs"
  image_id    = var.worker_ami_id

  instance_type = var.worker_instance_type

  # Empty string -> null -> launch template omits key_name entirely (AWS
  # rejects "" as an invalid key pair name). Opt-in per environment; see
  # variables.tf worker_ssh_key_name. Only meaningful together with the SG's
  # SSH ingress rule above.
  key_name = var.worker_ssh_key_name != "" ? var.worker_ssh_key_name : null

  # OS shutdown (shutdown -h now) terminates the instance instead of stopping it.
  instance_initiated_shutdown_behavior = "terminate"

  iam_instance_profile {
    name = aws_iam_instance_profile.worker_instance_profile.name
  }

  # Spot market type is set by the ASG mixed_instances_policy (price-capacity-optimized).

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size           = 40
      volume_type           = "gp3"
      delete_on_termination = true
    }
  }

  # Worker subnet is public (see network-worker.tf) — direct IGW route instead
  # of a NAT Gateway. The SG has zero inbound rules by default (staging/prod),
  # so a public IP there adds no reachable attack surface; it only makes the
  # public-IPv4 charge usage-based instead of paying for an always-on NAT
  # Gateway + EIP. In dev, the SG's opt-in SSH ingress rule (see above) does
  # make this public IP reachable on port 22 — an accepted tradeoff there.
  network_interfaces {
    associate_public_ip_address = true
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
    SQS_QUEUE_URL=${aws_sqs_queue.processing_queue.url}
    DLQURL=${aws_sqs_queue.processing_dlq.url}
    AWS_REGION=${var.aws_region}
    RUN_ENV=ec2
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

  lifecycle {
    # image_id / instance_type: as of admin-asg.tf's ec2:ModifyLaunchTemplate
    # grant, POST /admin/asg-config (admin-asg-config-update.js) can move this
    # template's Default Version to a new image_id/instance_type at runtime,
    # with no Terraform apply. Without ignore_changes here, the next apply
    # would see that live drift against var.worker_ami_id /
    # var.worker_instance_type and silently revert an admin-driven AMI change
    # back to whatever this file declares. var.worker_ami_id is therefore only
    # the bootstrap/initial AMI from here on — the launch template's Default
    # Version is the live source of truth once an admin has changed it via the
    # admin page. Same rationale as max_size on aws_autoscaling_group.worker
    # below.
    ignore_changes = [image_id, instance_type]
  }
}

# ── Auto Scaling Group ────────────────────────────────────────────────────────
# Scale out when SQS visible messages > 0; scale to zero when the queue is empty.
# mixed_instances_policy + price-capacity-optimized lets EC2 Fleet pick the AZ/subnet
# with the best Spot price and capacity across worker_asg_subnet_ids.

resource "aws_autoscaling_group" "worker" {
  provider = aws.this

  name = "${local.name_prefix}-splat-worker-asg"

  min_size         = 0
  max_size         = var.worker_asg_max_size
  desired_capacity = 0

  vpc_zone_identifier = local.worker_asg_subnet_ids
  capacity_rebalance  = true

  mixed_instances_policy {
    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.worker.id
        version            = "$Latest"
      }
    }

    instances_distribution {
      on_demand_base_capacity                  = 0
      on_demand_percentage_above_base_capacity = 0
      spot_allocation_strategy                 = "price-capacity-optimized"
    }
  }

  instance_refresh {
    strategy = "Rolling"
  }

  # Required for the queue-empty scale-in composite alarm (GroupDesiredCapacity).
  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
  ]

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
    # desired_capacity: managed by SQS-driven step scaling, not Terraform.
    # max_size: managed live from the admin page (POST /admin/asg-config) via
    # autoscaling:UpdateAutoScalingGroup — see admin-asg.tf. Terraform still
    # sets the initial value from var.worker_asg_max_size on first apply, but
    # never reverts an admin-driven change afterwards.
    ignore_changes = [desired_capacity, max_size]
  }

  # IAM policy must grant EnableMetricsCollection before this resource can
  # enable ASG metrics; without depends_on Terraform applies both in parallel.
  depends_on = [time_sleep.compute_iam_propagation]
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

# ── Step Scaling — Scale In (ASG termination on empty queue) ─────────────────
# Complements worker self-termination: when the queue is fully drained but the
# ASG still requests capacity, set desired=0 so Auto Scaling terminates any
# running or pending Spot instances. Sums visible + in-flight (not the
# ApproximateNumberOfMessages aggregate, which often stops publishing when empty).

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
  alarm_description   = "Terminate worker ASG capacity when the processing queue is fully empty but workers are still requested."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "queue_visible"
    return_data = false

    metric {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      period      = 60
      stat        = "Maximum"

      dimensions = {
        QueueName = aws_sqs_queue.processing_queue.name
      }
    }
  }

  metric_query {
    id          = "queue_inflight"
    return_data = false

    metric {
      metric_name = "ApproximateNumberOfMessagesNotVisible"
      namespace   = "AWS/SQS"
      period      = 60
      stat        = "Maximum"

      dimensions = {
        QueueName = aws_sqs_queue.processing_queue.name
      }
    }
  }

  metric_query {
    id          = "asg_desired"
    return_data = false

    metric {
      metric_name = "GroupDesiredCapacity"
      namespace   = "AWS/AutoScaling"
      period      = 60
      stat        = "Maximum"

      dimensions = {
        AutoScalingGroupName = aws_autoscaling_group.worker.name
      }
    }
  }

  metric_query {
    id          = "asg_in_service"
    return_data = false

    metric {
      metric_name = "GroupInServiceInstances"
      namespace   = "AWS/AutoScaling"
      period      = 60
      stat        = "Maximum"

      dimensions = {
        AutoScalingGroupName = aws_autoscaling_group.worker.name
      }
    }
  }

  # Fire when queue is empty AND the ASG still has requested or running workers.
  # In-flight SQS messages keep queue_inflight > 0 during active jobs.
  metric_query {
    id          = "queue_empty_workers_still_up"
    expression  = "IF((queue_visible + queue_inflight) <= 0 AND (asg_desired > 0 OR asg_in_service > 0), 1, 0)"
    label       = "QueueEmptyWorkersStillUp"
    return_data = true
  }

  alarm_actions = [aws_autoscaling_policy.sqs_step_scale_in.arn]

  tags = {
    Name        = "${local.name_prefix}-sqs-scale-in"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# Worker self-termination remains the primary scale-down path after each job;
# this alarm is the ASG-level backstop when capacity is still requested on an
# empty queue (e.g. worker terminate API failure or stale desired capacity).
