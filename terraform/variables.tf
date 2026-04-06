variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "us-east-1"
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

variable "certificate_domain_name" {
  description = "Existing ACM certificate domain name to use for CloudFront"
  type        = string
}