# ---------------------------------------------------------------------------
# ACM Certificate
#
# For EDGE-optimised API Gateway custom domains the certificate MUST reside
# in us-east-1, regardless of the region where the API Gateway is deployed.
# For REGIONAL endpoints the certificate must be in the same region as the
# API – adjust the provider alias in the caller if needed.
#
# The certificate covers the exact subdomain (e.g. api-dev.openspacenexus.store).
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "api" {
  provider          = aws.us_east_1
  domain_name       = local.subdomain
  validation_method = "DNS"

  # Ensures zero-downtime replacement: the new cert is issued before the old
  # one is destroyed when the domain name changes.
  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = "acm-${local.subdomain}"
  })
}

# ---------------------------------------------------------------------------
# Route 53 DNS validation records
#
# ACM emits one CNAME per domain in domain_validation_options.
# for_each iterates that set so Terraform manages each CNAME independently.
# allow_overwrite = true is safe here: multiple environments share the same
# hosted zone but each subdomain produces a distinct CNAME key.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "cert_validation" {
  provider = aws.this

  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id         = data.aws_route53_zone.root.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = var.cert_validation_ttl
  records         = [each.value.value]
  allow_overwrite = true
}

# ---------------------------------------------------------------------------
# Certificate validation waiter
#
# Blocks until ACM has verified all DNS records, ensuring downstream
# resources that reference the certificate ARN only proceed once it is ISSUED.
# ---------------------------------------------------------------------------

resource "aws_acm_certificate_validation" "api" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
