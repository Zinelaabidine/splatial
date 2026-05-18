# ---------------------------------------------------------------------------
# Route 53 – Alias A record
#
# Points the subdomain at the CloudFront distribution (EDGE) or regional
# endpoint (REGIONAL) that API Gateway exposes for the custom domain name.
#
# An alias record is preferred over a CNAME at the zone apex because it
# incurs no extra DNS query charge and supports health-check integration.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "api_a" {
  provider = aws.this

  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.subdomain
  type    = "A"

  alias {
    # API Gateway surfaces a CloudFront domain (EDGE) or a regional hostname
    # (REGIONAL) for custom domains – both are accessed via the same attribute.
    name                   = aws_api_gateway_domain_name.api.cloudfront_domain_name
    zone_id                = aws_api_gateway_domain_name.api.cloudfront_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# Optional AAAA record for IPv6
#
# Uncomment the block below to enable dual-stack DNS for the API endpoint.
# The alias targets are identical to the A record because API Gateway's
# CloudFront distribution already handles both protocol families.
# ---------------------------------------------------------------------------

# resource "aws_route53_record" "api_aaaa" {
#   provider = aws.this
#
#   zone_id = data.aws_route53_zone.root.zone_id
#   name    = local.subdomain
#   type    = "AAAA"
#
#   alias {
#     name                   = aws_api_gateway_domain_name.api.cloudfront_domain_name
#     zone_id                = aws_api_gateway_domain_name.api.cloudfront_zone_id
#     evaluate_target_health = false
#   }
# }
