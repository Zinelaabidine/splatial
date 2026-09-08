terraform {
  # NOTE: Terraform `backend` blocks cannot reference variables/locals/functions,
  # so this bucket name can't be read from infra/config.json directly.
  # "tf_state_bucket" in infra/config.json is the canonical value — this
  # literal must match it exactly. scripts/check-infra-config.sh enforces
  # that on every commit.
  backend "s3" {
    bucket       = "openspacenexus-terraform-state"
    key          = "staging/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}