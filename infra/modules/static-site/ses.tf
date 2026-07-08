# SES domain identity for transactional email (comment/reaction/follow/job
# status notifications — see backend/lib/email.js). One identity per
# environment domain (splatial-dev.openspacenexus.store, etc.), verified via
# DNS records on the same Route53 zone ACM already validates against.
#
# New AWS accounts start in the SES sandbox (send only to verified addresses,
# low rate limit). Moving to production sending requires a one-time manual
# request in the SES console — Terraform cannot do this for you.

data "aws_region" "current" {
  provider = aws.this
}

resource "aws_ses_domain_identity" "this" {
  provider = aws.this
  domain   = var.domain_name
}

resource "aws_route53_record" "ses_verification" {
  provider = aws.this

  zone_id = data.aws_route53_zone.this.zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.this.verification_token]
}

resource "aws_ses_domain_identity_verification" "this" {
  provider   = aws.this
  domain     = aws_ses_domain_identity.this.id
  depends_on = [aws_route53_record.ses_verification]
}

resource "aws_ses_domain_dkim" "this" {
  provider = aws.this
  domain   = aws_ses_domain_identity.this.domain
}

resource "aws_route53_record" "dkim" {
  provider = aws.this
  count    = 3

  zone_id = data.aws_route53_zone.this.zone_id
  name    = "${aws_ses_domain_dkim.this.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.this.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# Custom MAIL FROM domain so SPF aligns with our own domain rather than
# amazonses.com — improves deliverability and DMARC alignment.
resource "aws_ses_domain_mail_from" "this" {
  provider         = aws.this
  domain           = aws_ses_domain_identity.this.domain
  mail_from_domain = "mail.${var.domain_name}"
}

resource "aws_route53_record" "mail_from_mx" {
  provider = aws.this

  zone_id = data.aws_route53_zone.this.zone_id
  name    = aws_ses_domain_mail_from.this.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${data.aws_region.current.name}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  provider = aws.this

  zone_id = data.aws_route53_zone.this.zone_id
  name    = aws_ses_domain_mail_from.this.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}
