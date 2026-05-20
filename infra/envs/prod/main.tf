provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}


module "static_site" {
  source = "../../modules/static-site"

  providers = {
    aws.this = aws.us_east_1
  }

  project_name            = "splatial"
  environment             = "prod"
  aws_region              = "us-east-1"
  domain_name             = "splatial.openspacenexus.store"
  hosted_zone_name        = "openspacenexus.store"
  certificate_domain_name = "*.openspacenexus.store"

  github_owner = "Zinelaabidine"

  name          = "splatial-prod"
  vpc_cidr      = "10.2.0.0/16"
  azs           = ["us-east-1a", "us-east-1b"]
  public_cidrs  = ["10.2.1.0/24", "10.2.2.0/24"]
  private_cidrs = ["10.2.11.0/24", "10.2.12.0/24"]

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
  domain_name    = "openspacenexus.store"
}

