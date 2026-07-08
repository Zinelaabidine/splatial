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

# Moderator Cognito group — see backend/lib/rbac.js for the exact permission
# set this grants (MODERATOR_PERMISSIONS): can search/view users and change
# account STANDING (suspend/ban/reactivate/verify/reset password/force
# logout), but cannot reassign roles, hard-delete, or change billing plans.
# Precedence 2 (lower priority than "admin") is cosmetic here — the two
# groups are additive permission sets, not a strict hierarchy, but Cognito
# requires every group to have a precedence value.
resource "aws_cognito_user_group" "moderator" {
  provider = aws.this

  name         = "moderator"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Support/trust-and-safety operators who can moderate account standing but cannot change roles, billing, or hard-delete."
  precedence   = 2
}

# Beta-tester Cognito group — a feature-flag-style role. Grants no admin
# permissions (see lib/rbac.js: ROLE_PERMISSIONS[BETA_GROUP] = []); reserved
# for gating early-access product features client-side/server-side outside
# the admin surface.
resource "aws_cognito_user_group" "beta_tester" {
  provider = aws.this

  name         = "beta_tester"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Early-access feature flag — grants no admin permissions."
  precedence   = 3
}
