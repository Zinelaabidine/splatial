data "archive_file" "upload_zip" {
  type        = "zip"
  source_dir  = "${path.module}/src-upload"
  output_path = "${path.module}/upload_payload.zip"
}

resource "aws_iam_role" "upload_lambda_exec" {
  provider = aws.this

  name = "${var.name}-upload-lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "upload_lambda_logs" {
  role       = aws_iam_role.upload_lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "upload_lambda_data_access" {
  provider = aws.this

  name = "${var.name}-upload-lambda-data-policy"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3MultipartUpload"
        Effect = "Allow"
        Action = [
          "s3:CreateMultipartUpload",
          "s3:UploadPart",
          "s3:CompleteMultipartUpload",
          "s3:AbortMultipartUpload",
          "s3:ListMultipartUploadParts",
        ]
        Resource = "${aws_s3_bucket.raw_scenes.arn}/*"
      },
      {
        Sid    = "DynamoDBScenesAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
        ]
        Resource = [
          aws_dynamodb_table.scenes.arn,
          "${aws_dynamodb_table.scenes.arn}/index/*",
        ]
      },
    ]
  })
}

resource "aws_lambda_function" "upload_lambda" {
  provider = aws.this

  function_name = "${var.name}-upload-lambda"
  role          = aws_iam_role.upload_lambda_exec.arn
  handler       = "upload.handler"
  runtime       = "nodejs20.x"

  filename         = data.archive_file.upload_zip.output_path
  source_code_hash = data.archive_file.upload_zip.output_base64sha256

  environment {
    variables = {
      RAW_SCENES_BUCKET_NAME = aws_s3_bucket.raw_scenes.bucket
      SCENES_TABLE_NAME      = aws_dynamodb_table.scenes.name
      NODE_ENV               = "production"
    }
  }
}

resource "aws_lambda_permission" "apigw_upload_lambda" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
