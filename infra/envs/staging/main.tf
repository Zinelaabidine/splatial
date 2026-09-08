


provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# Single source of truth for account-wide/cross-environment constants — see
# infra/config.json. Do not hardcode project_name, domain_name,
# hosted_zone_name, or certificate_domain_name anywhere else; update them
# there only.
locals {
  cfg = jsondecode(file("${path.module}/../../config.json"))
}

module "static_site" {
  source = "../../modules/static-site"

  providers = {
    aws.this = aws.us_east_1
  }

  project_name            = local.cfg.project_name
  environment             = "staging"
  aws_region              = "us-east-1"
  domain_name             = local.cfg.domain_names.staging
  hosted_zone_name        = local.cfg.hosted_zone_name
  certificate_domain_name = local.cfg.certificate_domain_name

  github_owner = "Zinelaabidine"

  name          = "${local.cfg.project_name}-staging"
  vpc_cidr      = "10.1.0.0/16"
  azs           = ["us-east-1a", "us-east-1b"]
  public_cidrs  = ["10.1.1.0/24", "10.1.2.0/24"]
  private_cidrs = ["10.1.11.0/24", "10.1.12.0/24"]

  worker_spot_subnet_cidr = "10.1.21.0/24"

}

# ---------------------------------------------------------------------------
# API Gateway custom domain – staging
# Produces: api-staging.openspacenexus.store → <api_gateway_id>/staging
# ---------------------------------------------------------------------------
module "api_gateway_domain" {
  source = "../../modules/api-gateway-domain"

  providers = {
    aws.this      = aws.us_east_1
    aws.us_east_1 = aws.us_east_1
  }

  environment    = "staging"
  api_gateway_id = module.static_site.api_gateway_id
  domain_name    = local.cfg.hosted_zone_name
}

