# ---------------------------------------------------------------------------
# Required inputs
# ---------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment. Controls the subdomain prefix: api-<env>.openspacenexus.store"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "api_gateway_id" {
  description = "The ID of the HTTP API Gateway to attach the custom domain to. Pass this directly from the module that creates the gateway (e.g. module.static_site.api_gateway_id) so Terraform can infer the dependency and avoid plan-time lookup failures."
  type        = string
}

# ---------------------------------------------------------------------------
# Optional inputs with sensible defaults
# ---------------------------------------------------------------------------

variable "domain_name" {
  description = "Root domain name that owns the Route 53 hosted zone. The subdomain is derived automatically as api-<environment>.<domain_name>."
  type        = string
  default     = "openspacenexus.store"
}

variable "aws_region" {
  description = "AWS region where the API Gateway is deployed."
  type        = string
  default     = "us-east-1"
}

# API Gateway v2 (HTTP API) only supports REGIONAL endpoints, so no
# endpoint_type variable is needed. The ACM certificate must be in the
# same region as the API (aws.us_east_1 when the API is in us-east-1).

variable "cert_validation_ttl" {
  description = "TTL (seconds) for the Route 53 DNS validation records created for the ACM certificate."
  type        = number
  default     = 60
}
