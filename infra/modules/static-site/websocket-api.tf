# ── Presence WebSocket API ───────────────────────────────────────────────────
# Powers the viewer's live "N people looking at this scene" indicator
# (SceneInfoCard). This is a genuinely separate AWS service configuration
# from the REST api in network.tf — protocol_type WEBSOCKET instead of HTTP —
# so per the "one dedicated file per new AWS service" rule it gets its own
# file even though both are technically API Gateway v2.
#
# Frontend wiring is opt-in and degrades gracefully: hooks/viewer/usePresence.ts
# only connects if NEXT_PUBLIC_PRESENCE_WS_URL is set. Applying this file adds
# a new, currently-unused entry point — nothing here modifies existing
# resources. Cost is PAY_PER_REQUEST-shaped (billed per connection-minute and
# per message), so it scales with actual viewer traffic rather than a fixed
# monthly charge, but it is a genuinely new cost line item.

resource "aws_apigatewayv2_api" "presence_ws" {
  provider = aws.this

  name                       = "${var.name}-presence-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

resource "aws_cloudwatch_log_group" "presence_ws" {
  provider = aws.this

  name              = "/aws/apigateway/${var.name}-presence-ws"
  retention_in_days = 14
}

resource "aws_apigatewayv2_stage" "presence_ws" {
  provider = aws.this

  api_id      = aws_apigatewayv2_api.presence_ws.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.presence_ws.arn
    format = jsonencode({
      connectionId = "$context.connectionId"
      eventType    = "$context.eventType"
      requestId    = "$context.requestId"
      requestTime  = "$context.requestTime"
      routeKey     = "$context.routeKey"
      status       = "$context.status"
    })
  }

  depends_on = [
    aws_cloudwatch_log_group.presence_ws,
    aws_api_gateway_account.this,
  ]
}

# ── $connect authorizer ──────────────────────────────────────────────────────
# WebSocket routes can't use the JWT authorizer type (HTTP-API-only, see
# aws_apigatewayv2_authorizer.cognito in network.tf), and a browser's
# WebSocket handshake can't set a custom Authorization header. The client
# instead passes the Cognito ID token as a query string parameter
# (wss://.../?token=...&sceneId=...), verified here by a Lambda REQUEST
# authorizer using aws-jwt-verify (see backend/lib/cognito-verifier.js).

resource "aws_apigatewayv2_authorizer" "presence_ws" {
  provider = aws.this

  api_id = aws_apigatewayv2_api.presence_ws.id

  name             = "${var.name}-presence-ws-authorizer"
  authorizer_type  = "REQUEST"
  authorizer_uri   = aws_lambda_function.presence_authorizer.invoke_arn
  identity_sources = ["route.request.querystring.token"]
}

resource "aws_iam_role" "presence_authorizer_exec" {
  provider = aws.this

  name = "${var.name}-presence-authorizer-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  # Wait for the deploy-role policy update AND the IAM propagation delay
  # before attempting to create this role. See time_sleep.iam_propagation in
  # iam-github-oidc.tf for the rationale.
  depends_on = [time_sleep.iam_propagation]
}

resource "aws_iam_role_policy_attachment" "presence_authorizer_logs" {
  role       = aws_iam_role.presence_authorizer_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "presence_authorizer" {
  provider = aws.this

  function_name = "${var.name}-presence-authorizer"
  role          = aws_iam_role.presence_authorizer_exec.arn
  # Entry point is handlers/presence-authorizer.js inside the shared upload
  # zip — same source dir as upload_lambda, no separate build pipeline.
  handler = "handlers/presence-authorizer.handler"
  runtime = "nodejs20.x"
  timeout = 5

  filename         = data.archive_file.upload_zip.output_path
  source_code_hash = data.archive_file.upload_zip.output_base64sha256

  environment {
    variables = {
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.this.id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.this.id
    }
  }

  depends_on = [time_sleep.iam_propagation]
}

resource "aws_lambda_permission" "presence_ws_authorizer_invoke" {
  provider = aws.this

  statement_id  = "AllowPresenceWsAuthorizerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presence_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.presence_ws.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.presence_ws.id}"
}

# ── Presence router Lambda ($connect / $disconnect / heartbeat) ────────────
# Reuses the same zipped backend/ source as upload_lambda (data.archive_file
# .upload_zip, defined in lambda-upload.tf) — presence.js is just another
# entry point in that package.

resource "aws_iam_role" "presence_lambda_exec" {
  provider = aws.this

  name = "${var.name}-presence-lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  depends_on = [time_sleep.iam_propagation]
}

resource "aws_iam_role_policy_attachment" "presence_lambda_logs" {
  role       = aws_iam_role.presence_lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "presence_lambda_data_access" {
  provider = aws.this

  name = "${var.name}-presence-lambda-data-policy"
  role = aws_iam_role.presence_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PresenceConnectionsTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
        ]
        Resource = [
          aws_dynamodb_table.presence_connections.arn,
          "${aws_dynamodb_table.presence_connections.arn}/index/*",
        ]
      },
      {
        Sid      = "PresenceManageWebsocketConnections"
        Effect   = "Allow"
        Action   = ["execute-api:ManageConnections"]
        Resource = "${aws_apigatewayv2_api.presence_ws.execution_arn}/${aws_apigatewayv2_stage.presence_ws.name}/POST/@connections/*"
      },
    ]
  })
}

resource "aws_lambda_function" "presence_lambda" {
  provider = aws.this

  function_name = "${var.name}-presence-lambda"
  role          = aws_iam_role.presence_lambda_exec.arn
  handler       = "presence.handler"
  runtime       = "nodejs20.x"
  timeout       = 10

  filename         = data.archive_file.upload_zip.output_path
  source_code_hash = data.archive_file.upload_zip.output_base64sha256

  environment {
    variables = {
      PRESENCE_TABLE_NAME = aws_dynamodb_table.presence_connections.name
      NODE_ENV            = "production"
    }
  }

  depends_on = [time_sleep.iam_propagation]
}

resource "aws_lambda_permission" "presence_ws_invoke" {
  provider = aws.this

  statement_id  = "AllowPresenceWsInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presence_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.presence_ws.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "presence_lambda" {
  provider = aws.this

  api_id           = aws_apigatewayv2_api.presence_ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.presence_lambda.invoke_arn
}

resource "aws_apigatewayv2_route" "presence_connect" {
  provider = aws.this

  api_id    = aws_apigatewayv2_api.presence_ws.id
  route_key = "$connect"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.presence_ws.id

  target = "integrations/${aws_apigatewayv2_integration.presence_lambda.id}"
}

resource "aws_apigatewayv2_route" "presence_disconnect" {
  provider = aws.this

  api_id    = aws_apigatewayv2_api.presence_ws.id
  route_key = "$disconnect"

  target = "integrations/${aws_apigatewayv2_integration.presence_lambda.id}"
}

resource "aws_apigatewayv2_route" "presence_heartbeat" {
  provider = aws.this

  api_id    = aws_apigatewayv2_api.presence_ws.id
  route_key = "heartbeat"

  target = "integrations/${aws_apigatewayv2_integration.presence_lambda.id}"
}
