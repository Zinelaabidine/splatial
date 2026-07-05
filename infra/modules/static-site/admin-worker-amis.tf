# Worker AMI registry — API routes only.
#
# A small, hand-curated list of "known-good" worker AMIs (stored as
# record_type = "worker_ami" rows in the existing scenes DynamoDB table, see
# backend/handlers/admin-worker-ami*.js) that backs a dropdown on the ASG
# config admin page. This is deliberately NOT a live query against AWS's AMI
# catalog — admins register an AMI once (which does a single, one-image
# ec2:DescribeImages existence check) and it stays in the list until removed.
#
# No new IAM policy needed: the handlers only touch the scenes DynamoDB table
# (already granted broadly to the Lambda exec role in lambda-upload.tf) and
# ec2:DescribeImages (already granted with Resource "*" in admin-asg.tf's
# DescribeCallsRequireWildcardResource statement, reused here since it's the
# same Lambda function/role).
#
# Reuses the existing dispatcher Lambda (upload_lambda) and Cognito
# authorizer, same pattern as admin-asg.tf. The handlers additionally enforce
# admin-group membership server-side via lib/admin-auth.js.

resource "aws_apigatewayv2_route" "admin_worker_amis_list" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /admin/worker-amis"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "admin_worker_ami_create" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /admin/worker-amis"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "admin_worker_ami_delete" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "DELETE /admin/worker-amis/{amiId}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}
