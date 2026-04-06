
locals {
  certificate_domain_name = "*.${var.hosted_zone_name}"
}

data "aws_acm_certificate" "site" {
  domain      = local.certificate_domain_name
  statuses    = ["ISSUED"]
  most_recent = true
  types       = ["AMAZON_ISSUED"]
}