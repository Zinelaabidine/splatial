resource "aws_vpc" "static_site" {
  provider = aws.this

  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}


resource "aws_subnet" "public" {
  provider = aws.this

  for_each = {
    for idx, cidr in var.public_cidrs :
    idx => {
      cidr = cidr
      az   = var.azs[idx]
    }
  }

  vpc_id                  = aws_vpc.static_site.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.name}-public-${each.key}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  provider = aws.this

  for_each = {
    for idx, cidr in var.private_cidrs :
    idx => {
      cidr = cidr
      az   = var.azs[idx]
    }
  }

  vpc_id            = aws_vpc.static_site.id
  cidr_block        = each.value.cidr
  availability_zone = each.value.az

  tags = {
    Name = "${var.name}-private-${each.key}"
    Tier = "private"
  }
}



resource "aws_internet_gateway" "static_site" {
  provider = aws.this

  vpc_id = aws_vpc.static_site.id

  tags = {
    Name        = "${var.project_name}-${var.environment}-igw"
    Environment = var.environment
  }
}

resource "aws_route_table" "public" {
  provider = aws.this

  vpc_id = aws_vpc.static_site.id

  tags = {
    Name        = "${var.project_name}-${var.environment}-public-rt"
    Environment = var.environment
  }
}

resource "aws_route" "public_internet" {
  provider = aws.this

  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.static_site.id
}

resource "aws_route_table_association" "public" {
  provider = aws.this

  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}


# Create the HTTP API Gateway
resource "aws_apigatewayv2_api" "http_api" {
  provider = aws.this

  name          = "${var.name}-gateway-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["content-type", "authorization"]
    allow_methods = ["GET", "POST", "OPTIONS", "DELETE", "PUT"]
    allow_origins = [
      "https://${var.domain_name}",
      "http://localhost:3000",
    ]
    max_age = 300
  }

}

resource "aws_cloudwatch_log_group" "api_gateway" {
  provider = aws.this

  name              = "/aws/apigateway/${var.name}-gateway-api"
  retention_in_days = 7
}

resource "aws_apigatewayv2_stage" "http_api" {
  provider = aws.this

  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
  }

  depends_on = [aws_cloudwatch_log_group.api_gateway]
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  provider = aws.this

  api_id = aws_apigatewayv2_api.http_api.id

  name = "${var.name}-cognito-authorizer"

  authorizer_type = "JWT"

  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.this.id]
    issuer   = "https://${aws_cognito_user_pool.this.endpoint}"
  }

  depends_on = [
    aws_cognito_user_pool.this,
    aws_cognito_user_pool_client.this,
    aws_apigatewayv2_stage.http_api
  ]
}




resource "aws_apigatewayv2_integration" "hello_from_lambda" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY" # "AWS_PROXY" is used for Lambda

  integration_uri        = aws_lambda_function.myfunc.invoke_arn
  payload_format_version = "2.0" # Always use 2.0 for HTTP APIs
}


resource "aws_lambda_permission" "apigw_lambda" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.myfunc.function_name
  principal     = "apigateway.amazonaws.com"

  # This scope ensures ONLY your specific API can call the function
  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}


resource "aws_apigatewayv2_route" "hello_from_lambda" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /helloFromLambda"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.hello_from_lambda.id}"
}

resource "aws_apigatewayv2_integration" "upload_init" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"

  integration_uri        = aws_lambda_function.upload_lambda.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "upload_init" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /upload/init"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "upload_presign" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /upload/presign"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}

resource "aws_apigatewayv2_route" "upload_complete" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /upload/complete"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id

  target = "integrations/${aws_apigatewayv2_integration.upload_init.id}"
}