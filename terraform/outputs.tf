output "hosted_zone_id" {
  description = "The ID of the hosted zone"
  value       = data.aws_route53_zone.this.id
}

output "hosted_zone_name" {
  description = "The name of the hosted zone"
  value       = data.aws_route53_zone.this.name

}

output "s3_bucket_name" {
  description = "The name of the S3 bucket for the static site"
  value       = aws_s3_bucket.site.bucket
}

output "s3_bucket_arn" {
  description = "The ARN of the S3 bucket for the static site"
  value       = aws_s3_bucket.site.arn

}

output "s3_bucket_regional_domain_name" {
  description = "The regional domain name of the S3 bucket for the static site"
  value       = aws_s3_bucket.site.bucket_regional_domain_name
}

output "acm_certificate_arn" {
  description = "The ARN of the ACM certificate for the static site"
  value       = aws_acm_certificate.site.arn
}

output "acm_certificate_domain" {
  description = "The domain name of the ACM certificate for the static site"
  value       = aws_acm_certificate.site.domain_name
}


output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.site.domain_name
}

output "cloudfront_distribution_arn" {
  value = aws_cloudfront_distribution.site.arn
}

output "site_url" {
  value = "https://${var.domain_name}"
}

output "github_oidc_role_arn" {
  description = "The ARN of the IAM role for GitHub OIDC"
  value       = aws_iam_role.github_oidc_role.arn
}