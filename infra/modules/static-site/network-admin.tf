# Admin observability API routes.
#
# These reuse the existing dispatcher Lambda
# (aws_apigatewayv2_integration.upload_init -> aws_lambda_function.upload_lambda),
# which ALREADY holds dynamodb:Scan on the scenes table — so no new Lambda and no
# new IAM role are required for Phase 1.
#
# The upload.js dispatcher must route the "GET /admin/attempts" routeKey to the
# admin-attempts-list handler (see the Cursor prompt in README.md).
#
# Authorization: the standard Cognito JWT authorizer gates the route; the handler
# additionally enforces admin-group membership server-side.

resource "aws_apigatewayv2_route" "admin_attempts_list" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /admin/attempts"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}
