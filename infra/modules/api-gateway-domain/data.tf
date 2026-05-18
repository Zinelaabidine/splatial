# ---------------------------------------------------------------------------
# Look up the pre-existing Route 53 public hosted zone for the root domain.
# The zone must already exist; this module does not create it.
# ---------------------------------------------------------------------------

data "aws_route53_zone" "root" {
  provider     = aws.this
  name         = var.domain_name
  private_zone = false
}
