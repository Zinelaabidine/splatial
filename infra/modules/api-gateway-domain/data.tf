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
# Look up the HTTP API Gateway (v2) by name.
# Terraform fetches the ID automatically so callers never need to hard-code
# or manually look up the opaque resource ID.
# The name must match the `name` attribute on the aws_apigatewayv2_api resource.
# ---------------------------------------------------------------------------

# aws_apigatewayv2_apis returns a set(string) of IDs filtered by name.
# one() asserts exactly one match exists and extracts it from the set –
# it will error at plan time if zero or more than one API shares the name.
data "aws_apigatewayv2_apis" "lookup" {
  provider      = aws.this
  name          = var.api_gateway_name
  protocol_type = "HTTP"
}

data "aws_apigatewayv2_api" "api" {
  provider = aws.this
  api_id   = one(data.aws_apigatewayv2_apis.lookup.ids)
}
