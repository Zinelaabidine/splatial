# Admin Cognito group.
#
# Membership drives the `cognito:groups` JWT claim that the /admin/* API handlers
# check server-side (backend/lib/admin-auth.js) and that the frontend reads for
# the UX gate (useIsAdmin). Add users with:
#
#   aws cognito-idp admin-add-user-to-group \
#     --user-pool-id <pool-id> --username <email> --group-name admin

resource "aws_cognito_user_group" "admin" {
  provider = aws.this

  name         = "admin"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Operators who can access the admin observability dashboard."
  precedence   = 1
}
