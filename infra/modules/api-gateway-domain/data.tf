# ---------------------------------------------------------------------------
# Look up the pre-existing Route 53 public hosted zone for the root domain.
# The zone must already exist; this module does not create it.
# ---------------------------------------------------------------------------

data "aws_route53_zone" "root" {
  provider     = aws.this
  name         = var.domain_name
  private_zone = false
}

# ---------------------------------------------------------------------------
# Look up the REST API Gateway by name.
# Terraform fetches the ID automatically so callers never need to hard-code
# or manually look up the opaque 10-character resource ID.
# ---------------------------------------------------------------------------

data "aws_api_gateway_rest_api" "api" {
  provider = aws.this
  name     = var.api_gateway_name
}
