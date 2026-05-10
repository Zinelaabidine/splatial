resource "aws_cognito_user_pool" "this" {
  provider = aws.this
  
  name = "${var.name}-user-pool"

  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }
}

resource "aws_cognito_user_pool_client" "this" {
  provider = aws.this
  
  name         = "${var.name}-user-pool-client"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false 
  
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_CUSTOM_AUTH",
  ]

  supported_identity_providers = ["COGNITO"]
}