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
  description = "AMI for GPU Spot workers (WorkerGaussianSplattingARM_V1, us-east-1)."
  type        = string
  default     = "ami-0df365a537b0734b8"
}

variable "worker_spot_availability_zone" {
  description = "Availability zone for GPU Spot workers (us-east-1d = use1-az6, lower Spot prices)."
  type        = string
  default     = "us-east-1d"

  validation {
    condition     = var.worker_spot_availability_zone == "us-east-1d"
    error_message = "Worker spot subnet must stay in us-east-1d (use1-az6) for Spot pricing."
  }
}

variable "worker_spot_subnet_cidr" {
  description = "Private CIDR for the GPU Spot worker subnet in the app VPC."
  type        = string
}

variable "worker_nat_public_subnet_cidr" {
  description = "Public CIDR in the same AZ as worker_spot_subnet_cidr; hosts the worker NAT gateway."
  type        = string
}

variable "worker_instance_profile_name" {
  description = "Existing IAM instance profile attached to worker EC2 instances."
  type        = string
  default     = "backend-ec2-role"
}

variable "worker_instance_type" {
  description = "EC2 instance type for ARM GPU Spot workers (must match worker AMI architecture)."
  type        = string
  default     = "g5g.xlarge"
}

variable "worker_asg_max_size" {
  description = "Maximum number of GPU worker instances in the ASG."
  type        = number
  default     = 5
}

