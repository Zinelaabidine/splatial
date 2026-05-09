terraform {
  backend "s3" {
    bucket       = "openspacenexus-terraform-state"
    key          = "dev/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}