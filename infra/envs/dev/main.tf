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
  environment             = "dev"
  aws_region              = "us-east-1"
  domain_name             = "splatial-dev.openspacenexus.store"
  hosted_zone_name        = "openspacenexus.store"
  certificate_domain_name = "*.openspacenexus.store"

  github_owner = "Zinelaabidine"

  name          = "splatial-dev"
  vpc_cidr      = "10.0.0.0/16"
  azs           = ["us-east-1a", "us-east-1b"]
  public_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]

  worker_spot_subnet_cidr = "10.0.21.0/24"

  # Dev-only: lets an admin SSH directly into a GPU worker instead of going
  # through SSM Session Manager. The GaussianWorker key pair already exists
  # in this account's EC2 key pairs. Open to 0.0.0.0/0 by request — the
  # private key is still required to authenticate, but this does widen the
  # worker SG's attack surface versus the SSM-only default, so it's
  # deliberately not set in staging/prod.
  worker_ssh_key_name     = "GaussianWorker"
  worker_ssh_allowed_cidr = "0.0.0.0/0"

  cors_extra_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]

  attach_deploy_policies_to_local_dev_role = true

  # The AMI-bake pipeline (.github/workflows/bake-worker-ami.yml) builds and
  # smoke-tests against dev's worker subnet/security group. This must be true
  # in exactly one environment — see the variable description.
  enable_ami_bake_resources = true

  # Account-wide API Gateway CloudWatch role — singleton per AWS account.
  manage_api_gateway_account = true

}

# ---------------------------------------------------------------------------
# API Gateway custom domain – dev
# Produces: api-dev.openspacenexus.store → <api_gateway_id>/dev
# ---------------------------------------------------------------------------
module "api_gateway_domain" {
  source = "../../modules/api-gateway-domain"

  providers = {
    aws.this      = aws.us_east_1
    aws.us_east_1 = aws.us_east_1
  }

  environment    = "dev"
  api_gateway_id = module.static_site.api_gateway_id
  domain_name    = "openspacenexus.store"
}

