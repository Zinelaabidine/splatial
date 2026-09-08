variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "eu-east-1"
}

variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "splatial"
}

variable "domain_name" {
  description = "The domain name for the static site"
  type        = string
  #default     = "splatial.openspacenexus.store"
}

variable "hosted_zone_name" {
  description = "The hosted zone for the domain"
  type        = string
  #default     = "openspacenexus.store"
}

variable "environment" {
  description = "Deployment environment"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "github_owner" {
  description = "GitHub owner or organization name"
  type        = string
  default     = "Zinelaabidine"
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "splatial"
}

variable "certificate_domain_name" {
  description = "Existing wildcard ACM certificate domain name. Example: *.openspacenexus.store"
  type        = string
}


variable "name" { type = string }

variable "vpc_cidr" { type = string }
variable "azs" { type = list(string) }
variable "public_cidrs" { type = list(string) }
variable "private_cidrs" { type = list(string) }

variable "cors_extra_origins" {
  description = "Additional origins to allow in S3 and API Gateway CORS rules (e.g. http://localhost:3000 for local dev)."
  type        = list(string)
  default     = []
}

variable "worker_ami_id" {
  description = "AMI for GPU Spot workers. ami-01ce7dc9f9762db2c is the restored copy of the original WorkerGaussianSplattingARM_V2 image (ami-0a6913682d6d953eb), which was deregistered."
  type        = string
  default     = "ami-01ce7dc9f9762db2c"
}

variable "worker_spot_dedicated_availability_zone" {
  description = "AZ for the dedicated worker Spot subnet (S3/DynamoDB gateway endpoints, IGW route). Typically us-east-1d."
  type        = string
  default     = "us-east-1d"
}

variable "worker_spot_availability_zones" {
  description = "AZs the worker ASG may launch g5g.xlarge Spot instances in. EC2 Fleet price-capacity-optimized picks the best AZ/subnet at launch time."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1d"]

  validation {
    condition = alltrue([
      for az in var.worker_spot_availability_zones : can(regex("^us-east-1[a-z]$", az))
    ])
    error_message = "worker_spot_availability_zones must be us-east-1 AZ identifiers (e.g. us-east-1a)."
  }

  validation {
    condition     = contains(var.worker_spot_availability_zones, var.worker_spot_dedicated_availability_zone)
    error_message = "worker_spot_dedicated_availability_zone must appear in worker_spot_availability_zones."
  }
}

variable "worker_spot_subnet_cidr" {
  description = "Public CIDR for the GPU Spot worker subnet in the app VPC (direct IGW route, no NAT Gateway)."
  type        = string
}

variable "worker_instance_type" {
  description = "EC2 instance type for ARM GPU Spot workers (must match worker AMI architecture)."
  type        = string
  default     = "g5g.xlarge"
}

variable "worker_asg_max_size" {
  description = "Maximum number of GPU worker instances in the ASG."
  type        = number
  default     = 1
}

variable "worker_priority_asg_max_size" {
  description = "Maximum number of GPU worker instances in the priority (paid-tier, On-Demand) ASG."
  type        = number
  default     = 1
}

variable "worker_ssh_key_name" {
  description = "EC2 key pair name attached to the worker launch template for direct SSH access (e.g. \"GaussianWorker\"). Empty string (default) disables SSH entirely — workers stay SSM-only. Must be paired with worker_ssh_allowed_cidr; setting only one of the two has no effect. Only enable this in environments where opening port 22 is an accepted tradeoff (see the worker security group in compute.tf)."
  type        = string
  default     = ""
}

variable "worker_ssh_allowed_cidr" {
  description = "CIDR allowed to reach port 22 on GPU workers, e.g. \"0.0.0.0/0\" or a specific /32. Empty string (default) means no ingress rule is created. Only takes effect when worker_ssh_key_name is also set."
  type        = string
  default     = ""

  validation {
    condition     = var.worker_ssh_allowed_cidr == "" || can(cidrhost(var.worker_ssh_allowed_cidr, 0))
    error_message = "worker_ssh_allowed_cidr must be empty or a valid CIDR block (e.g. 0.0.0.0/0)."
  }
}

variable "worker_asg_max_size_cap" {
  description = "Hard ceiling the admin ASG-config page cannot exceed when setting max_size at runtime (cost safety net for expensive GPU Spot capacity)."
  type        = number
  default     = 5

  validation {
    condition     = var.worker_asg_max_size_cap >= 1
    error_message = "worker_asg_max_size_cap must be at least 1."
  }
}

variable "worker_priority_asg_max_size_cap" {
  description = "Hard ceiling the admin ASG-config page cannot exceed when setting the priority pool's max_size at runtime (cost safety net for expensive GPU On-Demand capacity)."
  type        = number
  default     = 3

  validation {
    condition     = var.worker_priority_asg_max_size_cap >= 1
    error_message = "worker_priority_asg_max_size_cap must be at least 1."
  }
}

variable "attach_deploy_policies_to_local_dev_role" {
  description = "Attach this environment's deploy managed policies to splatial-local-dev-role. Only dev should enable this — the role is shared and AWS allows at most 10 managed policy attachments per role."
  type        = bool
  default     = false
}

variable "enable_ami_bake_resources" {
  description = "Create the AMI-bake builder instance role/profile and attach bake permissions (from infra/modules/static-site/iam-github-oidc-bake.tf) to the splatial-github-ami-bake-role created in infra/bootstrap. That role is a single global role, not one per environment, so exactly one environment (dev) should set this true — enabling it in more than one env's state would cause each apply to fight over the same role's attached policy."
  type        = bool
  default     = false
}

variable "manage_api_gateway_account" {
  description = "Create the account-wide API Gateway CloudWatch Logs role (api-gateway-account.tf). This is a singleton per AWS account, so exactly one environment (dev) should set this true."
  type        = bool
  default     = false
}

variable "slack_webhook_url" {
  description = "Slack incoming webhook URL for admin ASG notifications (config changes, manual-mode-active-too-long alerts). Empty string disables Slack notifications."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_notification_email" {
  description = "Email address subscribed to the admin ASG notifications SNS topic. Empty string means no email subscription is created (Slack-only, or add subscriptions manually later)."
  type        = string
  default     = ""
}

variable "manual_mode_alert_minutes" {
  description = "Minutes a manual ASG boot session (POST /admin/asg/boot) can stay active before the scheduled check sends a Slack/email alert that SQS-driven scale-out is still paused."
  type        = number
  default     = 30

  validation {
    condition     = var.manual_mode_alert_minutes >= 1
    error_message = "manual_mode_alert_minutes must be at least 1."
  }
}

# ── Attempt-lease recovery (reaper.tf, backend/lib/attempt-lease.js) ──────────

variable "attempt_lease_seconds" {
  description = "How long a training attempt's lease stays valid without a heartbeat before the reaper treats the worker as dead. Deliberately generous relative to worker.py's HEARTBEAT_INTERVAL_SECONDS (30s): expiring too early costs duplicate GPU work, expiring late costs only a few minutes of delayed recovery, so a transient API outage must not look like a crash."
  type        = number
  default     = 600

  validation {
    condition     = var.attempt_lease_seconds >= 120
    error_message = "attempt_lease_seconds must be at least 120 — anything shorter risks reaping a live worker between heartbeats."
  }
}

variable "attempt_max_requeues" {
  description = "Infrastructure requeues (Spot interruptions plus reaper recoveries) allowed for a single attempt before it is failed with reason LEASE_EXPIRED. Does not count user-visible retries, which create separate attempts. Without a cap, a scene that reliably crashes its worker would be re-enqueued forever."
  type        = number
  default     = 5

  validation {
    condition     = var.attempt_max_requeues >= 1 && var.attempt_max_requeues <= 20
    error_message = "attempt_max_requeues must be between 1 and 20."
  }
}

variable "attempt_reaper_dry_run" {
  description = "When true the reaper logs every action it would take and writes nothing. A reaper bug can mass-requeue or mass-fail live work, so ship each environment in dry-run, confirm one real cycle in the logs, then set false to arm it."
  type        = bool
  default     = true
}

variable "attempt_reaper_enabled" {
  description = "Whether the reaper's EventBridge schedule is ENABLED. Setting this false is the rollback: recovery stops and nothing corrupts, because the reaper only ever writes against leases that have already expired."
  type        = bool
  default     = true
}

variable "attempt_reaper_schedule" {
  description = "EventBridge schedule expression for the attempt-lease reaper. Should be comfortably shorter than attempt_lease_seconds so an expired lease is noticed promptly."
  type        = string
  default     = "rate(5 minutes)"
}
