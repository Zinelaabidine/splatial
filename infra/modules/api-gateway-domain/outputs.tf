output "subdomain" {
  description = "The fully-qualified subdomain created for this environment (e.g. api-dev.openspacenexus.store)."
  value       = local.subdomain
}

output "api_gateway_domain_name" {
  description = "The custom domain name registered with API Gateway v2."
  value       = aws_apigatewayv2_domain_name.api.domain_name
}

output "regional_domain_name" {
  description = "The regional hostname that backs the API Gateway v2 custom domain – used in Route 53 alias records."
  value       = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
}

output "regional_zone_id" {
  description = "The hosted zone ID of the regional endpoint used in Route 53 alias records."
  value       = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
}

output "acm_certificate_arn" {
  description = "The ARN of the ACM certificate issued for the subdomain."
  value       = aws_acm_certificate_validation.api.certificate_arn
}

output "route53_record_fqdn" {
  description = "The FQDN of the Route 53 A alias record created for the subdomain."
  value       = aws_route53_record.api_a.fqdn
}

output "api_mapping_id" {
  description = "The ID of the API Gateway v2 API mapping."
  value       = aws_apigatewayv2_api_mapping.api.id
}
