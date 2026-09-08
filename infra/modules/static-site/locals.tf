locals {
  name_prefix        = "${var.project_name}-${var.environment}"
  github_repo_full   = "${var.github_owner}/${var.github_repo}"
  bucket_name        = replace(var.domain_name, ".", "-")
  backend_source_dir = abspath("${path.module}/../../../backend")
  worker_log_group   = "/${var.project_name}/${var.environment}/worker"

  # Constructed names/ARNs for the bootstrap-managed deploy roles. Do not look
  # these up with data.aws_iam_role — iam:GetRole is not available on a
  # greenfield/recreate until the bootstrap seed policy is attached, and the
  # first targeted IAM apply in deploy.yml must not depend on that call.
  github_deploy_role_name = "${local.name_prefix}-github-deploy-role"
  local_dev_role_name     = "${var.project_name}-local-dev-role"
  github_deploy_role_arn  = "arn:aws:iam::${data.aws_caller_identity.worker.account_id}:role/${local.github_deploy_role_name}"
  local_dev_role_arn      = "arn:aws:iam::${data.aws_caller_identity.worker.account_id}:role/${local.local_dev_role_name}"

  # Dedicated worker_spot subnet (us-east-1d) plus matching public subnets for other AZs.
  worker_asg_subnet_ids = distinct(compact(flatten([
    for az in var.worker_spot_availability_zones : (
      az == aws_subnet.worker_spot.availability_zone
      ? [aws_subnet.worker_spot.id]
      : [for subnet in aws_subnet.public : subnet.id if subnet.availability_zone == az]
    )
  ])))
}
