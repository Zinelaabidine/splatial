


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

