data "aws_route53_zone" "this" {
  provider = aws.this

  name         = var.hosted_zone_name
  private_zone = false
}

