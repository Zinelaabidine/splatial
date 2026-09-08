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
  environment             = "prod"
  aws_region              = "us-east-1"
  domain_name             = local.cfg.domain_names.prod
  hosted_zone_name        = local.cfg.hosted_zone_name
  certificate_domain_name = local.cfg.certificate_domain_name

  github_owner = "Zinelaabidine"

  name          = "${local.cfg.project_name}-prod"
  vpc_cidr      = "10.2.0.0/16"
  azs           = ["us-east-1a", "us-east-1b"]
  public_cidrs  = ["10.2.1.0/24", "10.2.2.0/24"]
  private_cidrs = ["10.2.11.0/24", "10.2.12.0/24"]

  worker_spot_subnet_cidr = "10.2.21.0/24"

}

# ---------------------------------------------------------------------------
# API Gateway custom domain – prod
# Produces: api-prod.openspacenexus.store → <api_gateway_id>/prod
# ---------------------------------------------------------------------------
module "api_gateway_domain" {
  source = "../../modules/api-gateway-domain"

  providers = {
    aws.this      = aws.us_east_1
    aws.us_east_1 = aws.us_east_1
  }

  environment    = "prod"
  api_gateway_id = module.static_site.api_gateway_id
  domain_name    = local.cfg.hosted_zone_name
}

