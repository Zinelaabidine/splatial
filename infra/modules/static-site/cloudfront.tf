resource "aws_cloudfront_origin_access_control" "site" {
  provider = aws.this

  name                              = "${local.name_prefix}-oac"
  description                       = "OAC for ${var.domain_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Next.js static export writes routes as *.html (e.g. scenes/create.html) but
# browsers request extensionless paths (/scenes/create). S3 REST + OAC returns
# 403 for missing keys, so rewrite viewer requests before they hit the origin.
resource "aws_cloudfront_function" "nextjs_url_rewrite" {
  provider = aws.this

  name    = "${local.name_prefix}-nextjs-url-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Map extensionless paths to .html for Next.js static export on S3"
  publish = true
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      var uri = request.uri;

      if (uri.endsWith("/")) {
        request.uri += "index.html";
      } else if (!uri.includes(".")) {
        request.uri += ".html";
      }

      return request;
    }
  EOF

  depends_on = [time_sleep.cdn_iam_propagation]
}

resource "aws_cloudfront_distribution" "site" {
  provider = aws.this

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Static site for ${var.domain_name}"
  default_root_object = "index.html"

  aliases = [var.domain_name]

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.site.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id

    s3_origin_config {
      origin_access_identity = ""
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-${aws_s3_bucket.site.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    allowed_methods = ["GET", "HEAD"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.nextjs_url_rewrite.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }

  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.wildcard.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  price_class = "PriceClass_100"


}




