# ── Splat Scenes Bucket ───────────────────────────────────────────────────────
# Stores completed, trained Gaussian Splat files (.ply).
# Objects are private; the API Lambda issues presigned GET URLs for the viewer.

resource "aws_s3_bucket" "splat_scenes" {
  provider = aws.this

  bucket = "${local.name_prefix}-splat-scenes"

  depends_on = [time_sleep.iam_propagation]
}

resource "aws_s3_bucket_public_access_block" "splat_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.splat_scenes.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "splat_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.splat_scenes.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "splat_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.splat_scenes.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "splat_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.splat_scenes.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "splat_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.splat_scenes.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# CORS is required so the browser-side viewer can fetch the PLY via presigned URL.
resource "aws_s3_bucket_cors_configuration" "splat_scenes" {
  provider = aws.this

  bucket = aws_s3_bucket.splat_scenes.id

  cors_rule {
    allowed_headers = ["Authorization", "Range"]
    allowed_methods = ["GET"]
    allowed_origins = concat(["https://${var.domain_name}"], var.cors_extra_origins)
    expose_headers  = ["Content-Length", "Content-Range", "ETag"]
    max_age_seconds = 3000
  }
}
