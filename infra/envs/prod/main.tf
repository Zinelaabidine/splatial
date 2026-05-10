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
  environment             = "prod"
  aws_region              = "us-east-1"
  domain_name             = "hello-prod.openspacenexus.store"
  hosted_zone_name        = "openspacenexus.store"
  certificate_domain_name = "*.openspacenexus.store"

  github_owner = "Zinelaabidine"
  github_repo  = "hello-world-static-site"

  name          = "hello-prod"
  vpc_cidr      = "10.2.0.0/16"
  azs           = ["us-east-1a", "us-east-1b"]
  public_cidrs  = ["10.2.1.0/24", "10.2.2.0/24"]
  private_cidrs = ["10.2.11.0/24", "10.2.12.0/24"]

}

