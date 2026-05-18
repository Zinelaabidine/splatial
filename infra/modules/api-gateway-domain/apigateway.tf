# ---------------------------------------------------------------------------
# API Gateway Custom Domain Name
#
# Registers the subdomain (e.g. api-dev.openspacenexus.store) with API
# Gateway so it can serve traffic on that hostname.
#
# The resource depends on the certificate validation waiter so the ARN
# is guaranteed to belong to an ISSUED certificate.
# ---------------------------------------------------------------------------

resource "aws_api_gateway_domain_name" "api" {
  provider        = aws.this
  domain_name     = local.subdomain
  certificate_arn = aws_acm_certificate_validation.api.certificate_arn

  # Match the endpoint type used when deploying the REST API. EDGE routes
  # traffic through CloudFront POPs; REGIONAL keeps traffic within one region.
  endpoint_configuration {
    types = [var.endpoint_type]
  }

  tags = merge(local.common_tags, {
    Name = "apigw-domain-${local.subdomain}"
  })
}

# ---------------------------------------------------------------------------
# Base Path Mapping
#
# Maps the root path ("/") of the custom domain to the environment stage of
# the target REST API. With an empty base_path callers reach the API at:
#   https://api-<env>.openspacenexus.store/<resource>
#
# If you need to host multiple APIs under the same custom domain, create
# additional mappings with distinct base_path values and different
# api_gateway_id/stage_name combinations.
# ---------------------------------------------------------------------------

resource "aws_api_gateway_base_path_mapping" "api" {
  provider    = aws.this
  api_id      = var.api_gateway_id
  stage_name  = local.stage_name
  domain_name = aws_api_gateway_domain_name.api.domain_name

  # Empty base_path means the API is accessible at the domain root.
  # Set to a non-empty string (e.g. "v1") if a path prefix is required.
  base_path = ""
}
