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

output "cognito_user_pool_id" {
  value = module.static_site.cognito_user_pool_id
}

output "cognito_client_id" {
  value = module.static_site.cognito_client_id
}

output "api_endpoint" {
  value = "https://${module.api_gateway_domain.subdomain}"
}

output "api_url" {
  value = module.static_site.invoke_url
}

output "raw_scenes_bucket_name" {
  description = "Prod raw scenes S3 bucket name"
  value       = module.static_site.raw_scenes_bucket_name
}

output "raw_scenes_bucket_arn" {
  description = "Prod raw scenes S3 bucket ARN"
  value       = module.static_site.raw_scenes_bucket_arn
}

output "scenes_table_name" {
  description = "Prod DynamoDB ScenesTable name"
  value       = module.static_site.scenes_table_name
}

output "scenes_table_arn" {
  description = "Prod DynamoDB ScenesTable ARN"
  value       = module.static_site.scenes_table_arn
}

output "vpc" {
  description = "VPC where prod resources are deployed"
  value       = module.static_site.vpc
}

output "vpc_id" {
  description = "ID of the VPC where prod resources are deployed"
  value       = module.static_site.vpc_id
}
