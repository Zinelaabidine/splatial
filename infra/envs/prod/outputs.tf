output "site_url" {
  description = "Dev site URL"
  value       = module.static_site.site_url
}

output "s3_bucket_name" {
  description = "Dev S3 bucket name"
  value       = module.static_site.s3_bucket_name
}

output "cloudfront_distribution_id" {
  description = "Dev CloudFront distribution ID"
  value       = module.static_site.cloudfront_distribution_id
}

output "github_oidc_deploy_role_arn" {
  description = "GitHub Actions deploy role ARN for dev"
  value       = module.static_site.github_oidc_deploy_role_arn
}
