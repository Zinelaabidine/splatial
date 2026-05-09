provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}


module "static_site" {
  source = "../../modules/static-site"

  project_name            = "hello"
  environment             = "prod"
  domain_name             = "hello-prod.openspacenexus.store"
  hosted_zone_name        = "openspacenexus.store"
  certificate_domain_name = "*.openspacenexus.store"

  github_owner = "Zinelaabidine"
  github_repo  = "hello-world-static-site"
}

