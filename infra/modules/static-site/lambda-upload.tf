resource "null_resource" "upload_lambda_deps" {
  triggers = {
    # Re-run npm install whenever package.json or any handler/lib source changes.
    package_json = filesha256("${local.backend_source_dir}/package.json")
    handlers = sha256(join("", [
      for f in sort(fileset(local.backend_source_dir, "**/*.js")) :
      filesha256("${local.backend_source_dir}/${f}")
    ]))
  }

  provisioner "local-exec" {
    # npm install generates package-lock.json on first run; subsequent runs use
    # the lockfile for reproducibility. --omit=dev keeps node_modules lean.
    command     = "npm install --omit=dev"
    working_dir = local.backend_source_dir
  }
}

data "archive_file" "upload_zip" {
  type        = "zip"
  source_dir  = local.backend_source_dir
  output_path = "${path.module}/upload_payload.zip"

  depends_on = [null_resource.upload_lambda_deps]
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

  # Wait for the deploy-role policy update AND the IAM propagation delay before
  # attempting to create this role. See time_sleep.iam_propagation in
  # iam-github-oidc.tf for the rationale.
  depends_on = [time_sleep.iam_propagation]
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
        Sid      = "S3RawScenesListForDelete"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.raw_scenes.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["users/*"]
          }
        }
      },
      {
        Sid    = "S3MultipartUpload"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:DeleteObject",
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
          "dynamodb:BatchGetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:TransactWriteItems",
        ]
        Resource = [
          aws_dynamodb_table.scenes.arn,
          "${aws_dynamodb_table.scenes.arn}/index/*",
          aws_dynamodb_table.profiles.arn,
          "${aws_dynamodb_table.profiles.arn}/index/*",
          aws_dynamodb_table.usernames.arn,
          aws_dynamodb_table.follows.arn,
          "${aws_dynamodb_table.follows.arn}/index/*",
          aws_dynamodb_table.reactions.arn,
          aws_dynamodb_table.comments.arn,
          aws_dynamodb_table.notifications.arn,
          aws_dynamodb_table.bookmarks.arn,
          "${aws_dynamodb_table.bookmarks.arn}/index/*",
          aws_dynamodb_table.shots.arn,
        ]
      },
      {
        Sid      = "SQSJobSubmit"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.processing_queue.arn
      },
      {
        Sid      = "S3SplatScenesListForDelete"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.splat_scenes.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["splat-scenes/*", "users/*"]
          }
        }
      },
      {
        Sid    = "S3SplatScenesReadWrite"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.splat_scenes.arn}/*"
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
      RAW_SCENES_BUCKET_NAME      = aws_s3_bucket.raw_scenes.bucket
      SPLAT_SCENES_BUCKET_NAME    = aws_s3_bucket.splat_scenes.bucket
      SCENES_TABLE_NAME           = aws_dynamodb_table.scenes.name
      PROFILES_TABLE_NAME         = aws_dynamodb_table.profiles.name
      USERNAMES_TABLE_NAME        = aws_dynamodb_table.usernames.name
      FOLLOWS_TABLE_NAME          = aws_dynamodb_table.follows.name
      REACTIONS_TABLE_NAME        = aws_dynamodb_table.reactions.name
      COMMENTS_TABLE_NAME         = aws_dynamodb_table.comments.name
      NOTIFICATIONS_TABLE_NAME    = aws_dynamodb_table.notifications.name
      BOOKMARKS_TABLE_NAME        = aws_dynamodb_table.bookmarks.name
      SHOTS_TABLE_NAME            = aws_dynamodb_table.shots.name
      SQS_QUEUE_URL               = aws_sqs_queue.processing_queue.url
      API_BASE_URL                = "https://api-${var.environment}.openspacenexus.store"
      GDRIVE_IMPORT_FUNCTION_NAME = aws_lambda_function.gdrive_import_lambda.function_name
      WORKER_LOG_GROUP            = local.worker_log_group
      NODE_ENV                    = "production"
    }
  }

  # Exec role already existing in state doesn't satisfy the IAM propagation
  # gate — depend directly so lambda:CreateFunction is always available.
  depends_on = [time_sleep.iam_propagation]
}

resource "aws_lambda_permission" "apigw_upload_lambda" {
  provider = aws.this

  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# ── Google Drive import Lambda ─────────────────────────────────────────────────
# A long-running (up to 15 min) worker that streams a public Google Drive ZIP
# directly into the raw-scenes S3 bucket. Invoked asynchronously by the
# upload_lambda (InvocationType=Event) so API Gateway never blocks on the download.

resource "aws_iam_role_policy" "upload_lambda_invoke_gdrive" {
  provider = aws.this

  name = "${var.name}-upload-lambda-invoke-gdrive"
  role = aws_iam_role.upload_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "InvokeGdriveImportLambda"
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.gdrive_import_lambda.arn
    }]
  })
}

resource "aws_iam_role" "gdrive_import_lambda_exec" {
  provider = aws.this

  name = "${var.name}-gdrive-import-lambda-exec-role"

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

resource "aws_iam_role_policy_attachment" "gdrive_import_lambda_logs" {
  role       = aws_iam_role.gdrive_import_lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "gdrive_import_lambda_data" {
  provider = aws.this

  name = "${var.name}-gdrive-import-lambda-data-policy"
  role = aws_iam_role.gdrive_import_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3RawScenesWrite"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
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
          "dynamodb:UpdateItem",
        ]
        Resource = aws_dynamodb_table.scenes.arn
      },
    ]
  })
}

resource "aws_lambda_function" "gdrive_import_lambda" {
  provider = aws.this

  function_name = "${var.name}-gdrive-import-lambda"
  role          = aws_iam_role.gdrive_import_lambda_exec.arn
  # Entry point is handlers/gdrive-import.js inside the shared upload zip.
  handler     = "handlers/gdrive-import.handler"
  runtime     = "nodejs20.x"
  timeout     = 900 # 15 minutes — covers downloading up to 500 MB
  memory_size = 512 # headroom for the streaming multipart upload buffers

  filename         = data.archive_file.upload_zip.output_path
  source_code_hash = data.archive_file.upload_zip.output_base64sha256

  environment {
    variables = {
      RAW_SCENES_BUCKET_NAME = aws_s3_bucket.raw_scenes.bucket
      SCENES_TABLE_NAME      = aws_dynamodb_table.scenes.name
      NODE_ENV               = "production"
    }
  }

  # Exec role already existing in state doesn't satisfy the IAM propagation
  # gate — depend directly so lambda:CreateFunction is always available.
  depends_on = [time_sleep.iam_propagation]
}

