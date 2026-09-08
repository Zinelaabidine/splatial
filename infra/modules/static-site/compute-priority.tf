# ── Priority worker pool (paid tier) ──────────────────────────────────────────
#
# Mirrors compute.tf's launch template + ASG + step-scaling pair, but this
# pool runs 100% On-Demand (instances_distribution.on_demand_percentage_
# above_base_capacity = 100, vs. 0 for the standard/free-tier pool in
# compute.tf) and is fed by its own queue (aws_sqs_queue.processing_queue_
# priority in sqs.tf) instead of the shared one.
#
# Reuses aws_security_group.worker and aws_iam_instance_profile.
# worker_instance_profile from compute.tf / iam-worker.tf — egress rules and
# instance permissions are identical regardless of which pool an instance
# belongs to, so there's nothing pool-specific to duplicate there.
#
# worker.py itself is unchanged: it already reads QUEUE_NAME/DLQ_NAME from
# env, set here via user_data to the priority queue/DLQ names. Its Spot-
# interruption checkpoint/requeue logic simply never fires on this pool,
# since On-Demand instances never receive interruption notices.

resource "aws_launch_template" "worker_priority" {
  provider = aws.this

  name        = "${local.name_prefix}-splat-worker-priority-lt"
  description = "ARM GPU On-Demand worker template for 3DGS training jobs (priority/paid-tier pool)"
  image_id    = var.worker_ami_id

  instance_type = var.worker_instance_type

  key_name = var.worker_ssh_key_name != "" ? var.worker_ssh_key_name : null

  instance_initiated_shutdown_behavior = "terminate"

  iam_instance_profile {
    name = aws_iam_instance_profile.worker_instance_profile.name
  }

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size           = 40
      volume_type           = "gp3"
      delete_on_termination = true
    }
  }

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.worker.id]
    delete_on_termination       = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  user_data = base64encode(<<-EOT
    #!/bin/bash
    set -e
    cat > /etc/splatial-worker.env <<'ENVFILE'
    QUEUE_NAME=${aws_sqs_queue.processing_queue_priority.name}
    DLQ_NAME=${aws_sqs_queue.processing_dlq_priority.name}
    SQS_QUEUE_URL=${aws_sqs_queue.processing_queue_priority.url}
    DLQURL=${aws_sqs_queue.processing_dlq_priority.url}
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
      Name               = "${local.name_prefix}-splat-worker-priority"
      Environment        = var.environment
      AllowSelfTerminate = "true"
      Project            = var.project_name
      ManagedBy          = "terraform"
    }
  }

  tags = {
    Name        = "${local.name_prefix}-splat-worker-priority-lt"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  lifecycle {
    # Same rationale as aws_launch_template.worker in compute.tf: POST
    # /admin/asg-config can move this template's Default Version to a new
    # image_id/instance_type at runtime (admin-asg-config-update.js), and
    # without ignore_changes here the next `terraform apply` would revert
    # that admin-driven change back to var.worker_ami_id /
    # var.worker_instance_type.
    ignore_changes = [image_id, instance_type]
  }
}

resource "aws_autoscaling_group" "worker_priority" {
  provider = aws.this

  name = "${local.name_prefix}-splat-worker-priority-asg"

  min_size         = 0
  max_size         = var.worker_priority_asg_max_size
  desired_capacity = 0

  vpc_zone_identifier = local.worker_asg_subnet_ids

  mixed_instances_policy {
    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.worker_priority.id
        version            = "$Latest"
      }
    }

    instances_distribution {
      on_demand_base_capacity                  = 0
      on_demand_percentage_above_base_capacity = 100
    }
  }

  instance_refresh {
    strategy = "Rolling"
  }

  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
  ]

  tag {
    key                 = "Name"
    value               = "${local.name_prefix}-splat-worker-priority"
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
    # Same rationale as aws_autoscaling_group.worker in compute.tf:
    # desired_capacity is SQS-driven, max_size is admin-page-driven.
    ignore_changes = [desired_capacity, max_size]
  }

  depends_on = [time_sleep.compute_iam_propagation]
}

# ── Step Scaling — Scale Out ──────────────────────────────────────────────────

resource "aws_autoscaling_policy" "sqs_step_scale_out_priority" {
  provider = aws.this

  name                      = "${local.name_prefix}-sqs-step-scale-out-priority"
  autoscaling_group_name    = aws_autoscaling_group.worker_priority.name
  policy_type               = "StepScaling"
  adjustment_type           = "ExactCapacity"
  metric_aggregation_type   = "Maximum"
  estimated_instance_warmup = 120

  step_adjustment {
    metric_interval_lower_bound = 0
    scaling_adjustment          = 1
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_scale_out_priority" {
  provider = aws.this

  alarm_name          = "${local.name_prefix}-sqs-scale-out-priority"
  alarm_description   = "Scale out priority-pool GPU workers when the priority processing queue has visible messages."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.processing_queue_priority.name
  }

  alarm_actions = [aws_autoscaling_policy.sqs_step_scale_out_priority.arn]

  tags = {
    Name        = "${local.name_prefix}-sqs-scale-out-priority"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# ── Step Scaling — Scale In ───────────────────────────────────────────────────

resource "aws_autoscaling_policy" "sqs_step_scale_in_priority" {
  provider = aws.this

  name                      = "${local.name_prefix}-sqs-step-scale-in-priority"
  autoscaling_group_name    = aws_autoscaling_group.worker_priority.name
  policy_type               = "StepScaling"
  adjustment_type           = "ExactCapacity"
  metric_aggregation_type   = "Maximum"
  estimated_instance_warmup = 0

  step_adjustment {
    metric_interval_upper_bound = 0
    scaling_adjustment          = 0
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_scale_in_priority" {
  provider = aws.this

  alarm_name          = "${local.name_prefix}-sqs-scale-in-priority"
  alarm_description   = "Terminate priority-pool GPU worker capacity when its queue is fully empty but workers are still requested."
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
        QueueName = aws_sqs_queue.processing_queue_priority.name
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
        QueueName = aws_sqs_queue.processing_queue_priority.name
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
        AutoScalingGroupName = aws_autoscaling_group.worker_priority.name
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
        AutoScalingGroupName = aws_autoscaling_group.worker_priority.name
      }
    }
  }

  metric_query {
    id          = "queue_empty_workers_still_up"
    expression  = "IF((queue_visible + queue_inflight) <= 0 AND (asg_desired > 0 OR asg_in_service > 0), 1, 0)"
    label       = "QueueEmptyWorkersStillUp"
    return_data = true
  }

  alarm_actions = [aws_autoscaling_policy.sqs_step_scale_in_priority.arn]

  tags = {
    Name        = "${local.name_prefix}-sqs-scale-in-priority"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}
