


provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}


module "static_site" {
  source = "../../modules/static-site"

  providers = {
    aws.this = aws.us_east_1
  }

  project_name            = "hello"
  environment             = "staging"
  aws_region              = "us-east-1"
  domain_name             = "hello-staging.openspacenexus.store"
  hosted_zone_name        = "openspacenexus.store"
  certificate_domain_name = "*.openspacenexus.store"

  github_owner = "Zinelaabidine"
  github_repo  = "hello-world-static-site"

  name          = "hello-staging"
  vpc_cidr      = "10.1.0.0/16"
  azs           = ["us-east-1a", "us-east-1b"]
  public_cidrs  = ["10.1.1.0/24", "10.1.2.0/24"]
  private_cidrs = ["10.1.11.0/24", "10.1.12.0/24"]

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

  environment      = "staging"
  api_gateway_name = "hello-staging-gateway-api"   # matches ${var.name}-gateway-api in network.tf
  domain_name      = "openspacenexus.store"
}

