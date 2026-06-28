locals {
  name_prefix        = "${var.project_name}-${var.environment}"
  github_repo_full   = "${var.github_owner}/${var.github_repo}"
  bucket_name        = replace(var.domain_name, ".", "-")
  backend_source_dir = abspath("${path.module}/../../../backend")
  worker_log_group   = "/${var.project_name}/${var.environment}/worker"
}
