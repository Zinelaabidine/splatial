output "bootstrap_ci_role_arn" {
  description = "ARN of the bootstrap CI role assumed by bootstrap.yml via OIDC (no static keys)."
  value       = aws_iam_role.bootstrap_ci.arn
}

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "github_deploy_role_arns" {
  description = "Map of environment name to GitHub deploy role ARN."
  value       = { for env, r in aws_iam_role.github_deploy : env => r.arn }
}

output "local_dev_role_arn" {
  description = "ARN of the local-developer IAM role (not used by GitHub Actions)."
  value       = aws_iam_role.local_dev.arn
}

output "terraform_state_bucket" {
  description = "Name of the S3 bucket used for Terraform remote state."
  value       = aws_s3_bucket.terraform_state.id
}
