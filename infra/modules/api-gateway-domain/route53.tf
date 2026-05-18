# ---------------------------------------------------------------------------
# Route 53 – Alias A record
#
# Points the subdomain at the regional endpoint that API Gateway v2 exposes
# for the custom domain name.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "api_a" {
  provider = aws.this

  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.subdomain
  type    = "A"

  alias {
    # v2 domain name exposes target_domain_name and hosted_zone_id directly.
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# Optional AAAA record for IPv6 – uncomment to enable dual-stack DNS.
# ---------------------------------------------------------------------------

# resource "aws_route53_record" "api_aaaa" {
#   provider = aws.this
#
#   zone_id = data.aws_route53_zone.root.zone_id
#   name    = local.subdomain
#   type    = "AAAA"
#
#   alias {
#     name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
#     zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
#     evaluate_target_health = false
#   }
# }
