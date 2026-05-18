# ---------------------------------------------------------------------------
# API Gateway v2 Custom Domain Name
#
# Registers the subdomain (e.g. api-dev.openspacenexus.store) with the
# HTTP API so it can serve traffic on that hostname.
#
# HTTP API (v2) custom domains are always REGIONAL – the certificate must
# live in the same region as the API, which is why aws.us_east_1 is used
# for ACM when the API is deployed in us-east-1.
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_domain_name" "api" {
  provider    = aws.this
  domain_name = local.subdomain

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = merge(local.common_tags, {
    Name = "apigw-domain-${local.subdomain}"
  })
}

# ---------------------------------------------------------------------------
# API Mapping
#
# Binds the custom domain to the HTTP API's $default stage so all traffic
# arriving at api-<env>.openspacenexus.store is forwarded to the API.
#
# stage = "$default" matches the auto-deployed stage created in network.tf.
# Leave api_mapping_key empty ("") to serve the API at the domain root.
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api_mapping" "api" {
  provider        = aws.this
  api_id          = data.aws_apigatewayv2_api.api.id
  domain_name     = aws_apigatewayv2_domain_name.api.id
  stage           = "$default"
  api_mapping_key = ""

  depends_on = [aws_apigatewayv2_domain_name.api]
}
