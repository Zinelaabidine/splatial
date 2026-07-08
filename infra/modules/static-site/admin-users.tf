# Admin user-management — API routes + IAM.
#
# Reuses the existing dispatcher Lambda (aws_apigatewayv2_integration.upload_init
# -> aws_lambda_function.upload_lambda), same pattern as admin-worker-amis.tf /
# admin-logs.tf. upload.js routes these routeKeys to handlers/admin-users-*.js
# and handlers/admin-audit-logs-list.js; each handler additionally enforces a
# granular permission server-side via lib/rbac.js (never trusts the route
# existing as authorization).
#
# DynamoDB access to the users/profiles/usernames/scenes tables is already
# granted broadly to this role via the DynamoDBScenesAccess statement in
# lambda-upload.tf — only the NEW audit_logs table and the Cognito Admin*
# API surface need a new grant here.

resource "aws_iam_role_policy" "admin_users_management" {
  provider = aws.this

  name = "${var.name}-admin-users-management-policy"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AuditLogsAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
        ]
        Resource = [
          aws_dynamodb_table.audit_logs.arn,
          "${aws_dynamodb_table.audit_logs.arn}/index/*",
        ]
      },
      {
        # Cognito Admin* API has no resource-level permissions narrower than
        # the user pool itself (every Admin* action operates on a single user
        # within a pool, but IAM only lets us scope to the pool ARN).
        Sid    = "CognitoAdminUserManagement"
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminUserGlobalSignOut",
          "cognito-idp:AdminResetUserPassword",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:ListUsersInGroup",
        ]
        Resource = aws_cognito_user_pool.this.arn
      },
    ]
  })
}

locals {
  admin_users_route_keys = [
    "GET /admin/users",
    "GET /admin/users/{userId}",
    "POST /admin/users/{userId}/status",
    "POST /admin/users/{userId}/verify-override",
    "POST /admin/users/{userId}/reset-password",
    "POST /admin/users/{userId}/revoke-sessions",
    "POST /admin/users/{userId}/soft-delete",
    "POST /admin/users/{userId}/hard-delete",
    "POST /admin/users/{userId}/roles",
    "POST /admin/users/{userId}/plan",
    "GET /admin/audit-logs",
  ]
}

resource "aws_apigatewayv2_route" "admin_users" {
  for_each = toset(local.admin_users_route_keys)

  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = each.value

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}
