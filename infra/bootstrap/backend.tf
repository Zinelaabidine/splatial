terraform {
  # Bootstrap state is stored in the same S3 bucket as app state under a
  # separate key.  The bucket itself is also managed in this root (see main.tf).
  # On the very first run, init with -backend=false, apply to create the bucket,
  # then run init again to migrate local state to S3.
  backend "s3" {
    bucket       = "openspacenexus-terraform-state"
    key          = "bootstrap/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
