# ---------------------------------------------------------------------------
# Outputs – expose values callers commonly need for cross-module references
# or for display after `terraform apply`.
# ---------------------------------------------------------------------------

output "subdomain" {
  description = "The fully-qualified subdomain created for this environment (e.g. api-dev.openspacenexus.store)."
  value       = local.subdomain
}

output "api_gateway_domain_name" {
  description = "The custom domain name resource name registered with API Gateway."
  value       = aws_api_gateway_domain_name.api.domain_name
}

output "cloudfront_domain_name" {
  description = "The CloudFront distribution hostname that backs the API Gateway custom domain (EDGE endpoint type)."
  value       = aws_api_gateway_domain_name.api.cloudfront_domain_name
}

output "cloudfront_zone_id" {
  description = "The hosted zone ID of the CloudFront distribution used in Route 53 alias records."
  value       = aws_api_gateway_domain_name.api.cloudfront_zone_id
}

output "acm_certificate_arn" {
  description = "The ARN of the ACM certificate issued for the subdomain."
  value       = aws_acm_certificate_validation.api.certificate_arn
}

output "route53_record_fqdn" {
  description = "The FQDN of the Route 53 A alias record created for the subdomain."
  value       = aws_route53_record.api_a.fqdn
}

output "base_path_mapping_id" {
  description = "The composite ID of the API Gateway base path mapping (domain/base-path)."
  value       = aws_api_gateway_base_path_mapping.api.id
}
