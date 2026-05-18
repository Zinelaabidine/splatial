# ---------------------------------------------------------------------------
# Derived values – single source of truth for naming across all resources.
# ---------------------------------------------------------------------------

locals {
  # Full subdomain: e.g. api-dev.openspacenexus.store
  subdomain = "api-${var.environment}.${var.domain_name}"

  # The stage name in API Gateway mirrors the environment.
  stage_name = var.environment

  # Common tags applied to every resource in this module.
  common_tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Module      = "api-gateway-domain"
  }
}
