output "hosted_zone_id" {
  description = "The ID of the hosted zone"
  value       = data.aws_route53_zone.this.id
}

output "hosted_zone_name" {
  description = "The name of the hosted zone"
  value       = data.aws_route53_zone.this.name

}