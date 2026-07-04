locals {
  name_prefix        = "${var.project_name}-${var.environment}"
  github_repo_full   = "${var.github_owner}/${var.github_repo}"
  bucket_name        = replace(var.domain_name, ".", "-")
  backend_source_dir = abspath("${path.module}/../../../backend")
  worker_log_group   = "/${var.project_name}/${var.environment}/worker"

  # Dedicated worker_spot subnet (us-east-1d) plus matching public subnets for other AZs.
  worker_asg_subnet_ids = distinct(compact(flatten([
    for az in var.worker_spot_availability_zones : (
      az == aws_subnet.worker_spot.availability_zone
      ? [aws_subnet.worker_spot.id]
      : [for subnet in aws_subnet.public : subnet.id if subnet.availability_zone == az]
    )
  ])))
}
