variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "eu-east-1"
}

variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "hello-world-static-site"
}

variable "domain_name" {
  description = "The domain name for the static site"
  type        = string
  #default     = "hello.zinelaabidine-nadir.com"
}

variable "hosted_zone_name" {
  description = "The hosted zone for the domain"
  type        = string
  #default     = "zinelaabidine-nadir.com"
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
  default     = "hello-world-static-site"
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

