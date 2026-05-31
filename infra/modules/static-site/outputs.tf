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
  value       = data.aws_acm_certificate.wildcard.arn
}

output "acm_certificate_domain" {
  description = "The domain name of the ACM certificate for the static site"
  value       = data.aws_acm_certificate.wildcard.domain
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

output "github_oidc_deploy_role_arn" {
  description = "The ARN of the IAM role used by GitHub Actions to deploy the static site"
  value       = data.aws_iam_role.github_oidc_deploy_role.arn
}

output "vpc_id" {
  value = aws_vpc.static_site.id
}

output "public_subnet_ids" {
  value = [for s in aws_subnet.public : s.id]
}

output "private_subnet_ids" {
  value = [for s in aws_subnet.private : s.id]
}


output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.this.id
}


output "cognito_client_id" {
  value = aws_cognito_user_pool_client.this.id
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.http_api.invoke_url
}


output "invoke_url" {
  value = aws_apigatewayv2_stage.http_api.invoke_url
}

output "api_gateway_id" {
  description = "The ID of the HTTP API Gateway created by this module."
  value       = aws_apigatewayv2_api.http_api.id
}

output "raw_scenes_bucket_name" {
  description = "The name of the S3 bucket for raw scene uploads"
  value       = aws_s3_bucket.raw_scenes.bucket
}

output "splat_scenes_bucket_name" {
  description = "The name of the S3 bucket for completed Gaussian Splat PLY files"
  value       = aws_s3_bucket.splat_scenes.bucket
}

output "raw_scenes_bucket_arn" {
  description = "The ARN of the S3 bucket for raw scene uploads"
  value       = aws_s3_bucket.raw_scenes.arn
}

output "scenes_table_name" {
  description = "The name of the DynamoDB ScenesTable"
  value       = aws_dynamodb_table.scenes.name
}

output "scenes_table_arn" {
  description = "The ARN of the DynamoDB ScenesTable"
  value       = aws_dynamodb_table.scenes.arn
}

output "sqs_processing_queue_url" {
  description = "URL of the SQS job processing queue"
  value       = aws_sqs_queue.processing_queue.url
}

output "sqs_processing_queue_arn" {
  description = "ARN of the SQS job processing queue"
  value       = aws_sqs_queue.processing_queue.arn
}

output "sqs_dlq_url" {
  description = "URL of the SQS Dead Letter Queue"
  value       = aws_sqs_queue.processing_dlq.url
}

# output "worker_asg_name" {
#   description = "Name of the GPU worker Auto Scaling Group"
#   value       = aws_autoscaling_group.worker.name
# }

output "worker_launch_template_id" {
  description = "ID of the GPU worker EC2 Launch Template"
  value       = aws_launch_template.worker.id
}
