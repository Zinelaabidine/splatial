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
  description = "AMI for GPU Spot workers (WorkerGaussianSplattingARM_V2, us-east-1)."
  type        = string
  default     = "ami-0a6913682d6d953eb"
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

variable "worker_asg_max_size_cap" {
  description = "Hard ceiling the admin ASG-config page cannot exceed when setting max_size at runtime (cost safety net for expensive GPU Spot capacity)."
  type        = number
  default     = 5

  validation {
    condition     = var.worker_asg_max_size_cap >= 1
    error_message = "worker_asg_max_size_cap must be at least 1."
  }
}

variable "attach_deploy_policies_to_local_dev_role" {
  description = "Attach this environment's deploy managed policies to splatial-local-dev-role. Only dev should enable this — the role is shared and AWS allows at most 10 managed policy attachments per role."
  type        = bool
  default     = false
}

