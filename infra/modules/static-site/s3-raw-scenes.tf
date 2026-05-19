resource "aws_s3_bucket" "raw_scenes" {
  provider = aws.this

  bucket = "${local.name_prefix}-raw-scenes"

  # s3:CreateBucket for this bucket is scoped in the deploy-role policy. Ensure
  # that policy update lands before creation is attempted.
  depends_on = [aws_iam_role_policy.github_deploy_policy]
}

resource "aws_s3_bucket_public_access_block" "raw_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.raw_scenes.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "raw_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.raw_scenes.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "raw_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.raw_scenes.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.raw_scenes.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_accelerate_configuration" "raw_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.raw_scenes.id
  status = "Enabled"
}

resource "aws_s3_bucket_cors_configuration" "raw_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.raw_scenes.id

  cors_rule {
    allowed_headers = ["Content-Type", "Content-MD5", "Authorization", "x-amz-date", "x-amz-content-sha256"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = ["https://${var.domain_name}"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
