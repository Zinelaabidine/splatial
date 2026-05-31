variable "aws_region" {
  description = "AWS region for all bootstrap resources."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID."
  type        = string
  default     = "886601940523"
}

variable "github_owner" {
  description = "GitHub organisation or user that owns the repo."
  type        = string
  default     = "Zinelaabidine"
}

variable "github_repo" {
  description = "GitHub repository name (without owner prefix)."
  type        = string
  default     = "splatial"
}

variable "local_dev_iam_users" {
  description = <<-EOT
    List of IAM user ARNs permitted to assume the local-developer role.
    These users are intentionally absent from the GitHub deploy-role trust policy.
    REVIEW THIS LIST before every bootstrap apply.
  EOT
  type        = list(string)
  default     = ["arn:aws:iam::886601940523:user/terraadmin"]
}
