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

# ── Target Tracking Scaling Policy ───────────────────────────────────────────
# One visible SQS message targets one running worker instance.

resource "aws_autoscaling_policy" "sqs_target_tracking" {
  provider = aws.this

  name                   = "${local.name_prefix}-sqs-target-tracking"
  autoscaling_group_name = aws_autoscaling_group.worker.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    customized_metric_specification {
      metrics {
        id    = "queue_depth"
        label = "SQS visible messages"

        metric_stat {
          metric {
            namespace   = "AWS/SQS"
            metric_name = "ApproximateNumberOfMessagesVisible"

            dimensions {
              name  = "QueueName"
              value = aws_sqs_queue.processing_queue.name
            }
          }
          stat = "Sum"
        }

        return_data = true
      }
    }

    target_value     = 1
    disable_scale_in = false
  }
}
