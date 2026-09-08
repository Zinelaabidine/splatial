#!/usr/bin/env bash
#
# Full local deploy — the terminal equivalent of .github/workflows/deploy.yml.
# No act, no Docker. Runs every stage the workflow runs, in the same order:
#
#   checks -> backend deps -> terraform apply -> frontend build -> s3 sync -> invalidate
#
#   ./scripts/deploy.sh dev
#   ./scripts/deploy.sh prod --plan-only
#
# Credentials come from your local AWS profile instead of GitHub OIDC, so the
# workflow's three "Refresh AWS credentials" steps are omitted: they exist only
# because an assumed OIDC session does not pick up IAM policy changes mid-run.
#
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: scripts/deploy.sh <dev|staging|prod> [options]

Deploys everything: terraform, backend Lambdas, and the frontend.

Options:
  --profile PROFILE   AWS profile to use (default: $AWS_PROFILE, else "default")
  --plan-only         Show the terraform plan and stop. Nothing is applied.
  --skip-checks       Skip terraform fmt, eslint, and the backend require/test checks
  --wait              Block until the CloudFront invalidation completes
  -y, --yes           Do not prompt for confirmation
  -h, --help          Show this help
EOF
}

[ $# -ge 1 ] || { usage; exit 1; }

env_name="$1"
shift

profile=""
plan_only=false
skip_checks=false
wait_invalidation=false
assume_yes=false

while [ $# -gt 0 ]; do
  case "$1" in
    --plan-only)   plan_only=true; shift ;;
    --skip-checks) skip_checks=true; shift ;;
    --wait)        wait_invalidation=true; shift ;;
    -y|--yes)      assume_yes=true; shift ;;
    --profile)
      [ $# -ge 2 ] || { echo "Missing value for --profile" >&2; exit 1; }
      profile="$2"; shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

case "$env_name" in
  dev)     tf_dir="infra/envs/dev";     git_branch="dev" ;;
  staging) tf_dir="infra/envs/staging"; git_branch="staging" ;;
  prod)    tf_dir="infra/envs/prod";    git_branch="main" ;;
  *) echo "Unsupported environment: $env_name" >&2; usage; exit 1 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

aws_region="${AWS_REGION:-us-east-1}"
export AWS_REGION="$aws_region" AWS_DEFAULT_REGION="$aws_region"
[ -z "$profile" ] && profile="${AWS_PROFILE:-}"
[ -n "$profile" ] && export AWS_PROFILE="$profile"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --------------------------------------------------------------------------
step "Preflight"
# --------------------------------------------------------------------------
for bin in aws terraform node npm; do
  command -v "$bin" >/dev/null 2>&1 || die "$bin is not installed or not on PATH"
done

tf_version="$(terraform version -json 2>/dev/null | sed -n 's/.*"terraform_version": *"\([^"]*\)".*/\1/p' | head -1)"
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$node_major" -ge 20 ] 2>/dev/null || warn "Node $node_major is older than CI (24); the build may differ."

current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
[ "$current_branch" = "$git_branch" ] || warn "On branch '$current_branch' but deploying '$env_name' (CI deploys it from '$git_branch')."

if ! caller_arn="$(aws sts get-caller-identity --query Arn --output text 2>&1)"; then
  die "Could not authenticate to AWS with profile '${profile:-default}':
    $caller_arn
  Try: aws sso login --profile ${profile:-default}"
fi

info "environment : $env_name"
info "terraform   : $tf_dir  (v${tf_version:-unknown}, CI pins 1.10.0)"
info "region      : $aws_region"
info "identity    : $caller_arn"
[ "$plan_only" = true ] && info "mode        : PLAN ONLY — nothing will be applied"

if [ "$assume_yes" = false ]; then
  prompt="Deploy everything to '$env_name'?"
  [ "$env_name" = "prod" ] && prompt="About to deploy to PRODUCTION. Continue?"
  [ "$plan_only" = true ] && prompt="Run a plan against '$env_name'?"
  printf '%s [y/N] ' "$prompt"
  read -r reply
  case "$reply" in y|Y|yes|Yes) ;; *) die "Aborted." ;; esac
fi

# --------------------------------------------------------------------------
# Backend dependencies must land before terraform runs: data.archive_file zips
# all of backend/ (node_modules included). Terraform's own null_resource only
# re-installs when its source hashes change, so a missing node_modules would
# otherwise be zipped as-is and the Lambdas would fail on "Cannot find module".
# --------------------------------------------------------------------------
step "Install backend Lambda dependencies"
(cd backend && npm ci --omit=dev)

step "Install frontend dependencies"
(cd frontend && npm ci)

# --------------------------------------------------------------------------
if [ "$skip_checks" = false ]; then
  step "Checks"

  terraform fmt -check -recursive infra >/dev/null \
    || die "terraform fmt -check failed. Run: terraform fmt -recursive infra"
  info "terraform fmt passed"

  (cd frontend && npm run lint) || die "eslint failed."
  info "frontend lint passed"

  # CLAUDE.md §9 post-change checklist: catches syntax errors and broken
  # require() paths before archive_file zips them into four live Lambdas.
  (cd backend && node -e "require('./upload')") || die "backend require check failed."
  info "backend require check passed"

  (cd backend && npm test) || die "backend tests failed."
  info "backend tests passed"
fi

# --------------------------------------------------------------------------
step "Terraform init"
# --------------------------------------------------------------------------
terraform -chdir="$tf_dir" init -input=false

if [ "$plan_only" = true ]; then
  step "Terraform plan"
  terraform -chdir="$tf_dir" plan -input=false -no-color
  step "Plan complete — stopping because --plan-only was passed."
  exit 0
fi

# Two-phase IAM apply, same ordering and reasoning as the workflow: the compute
# policy authorizes CreatePolicy for any new splatial-*-github-deploy-* managed
# policy, so it has to land before the remaining deploy policies. -refresh=false
# because these targets only rewrite IAM policy JSON from HCL and state IDs —
# refreshing all ~226 resources routinely stalls on the EC2 APIs.
step "Terraform apply — deploy compute IAM policy"
terraform -chdir="$tf_dir" apply -refresh=false -auto-approve \
  -target=module.static_site.aws_iam_policy.github_deploy_compute_policy \
  -target=module.static_site.aws_iam_role_policy_attachment.github_deploy_compute \
  -target=module.static_site.time_sleep.compute_iam_propagation

step "Terraform apply — remaining deploy IAM policies"
terraform -chdir="$tf_dir" apply -refresh=false -auto-approve \
  -target=module.static_site.aws_iam_policy.github_deploy_core_policy \
  -target=module.static_site.aws_iam_role_policy_attachment.github_deploy_core \
  -target=module.static_site.time_sleep.iam_propagation \
  -target=module.static_site.aws_iam_policy.github_deploy_storage_policy \
  -target=module.static_site.aws_iam_role_policy_attachment.github_deploy_storage \
  -target=module.static_site.time_sleep.storage_iam_propagation \
  -target=module.static_site.aws_iam_policy.github_deploy_compute_policy \
  -target=module.static_site.aws_iam_role_policy_attachment.github_deploy_compute \
  -target=module.static_site.time_sleep.compute_iam_propagation \
  -target=module.static_site.aws_iam_policy.github_deploy_network_policy \
  -target=module.static_site.aws_iam_role_policy_attachment.github_deploy_network \
  -target=module.static_site.time_sleep.network_iam_propagation \
  -target=module.static_site.aws_route.worker_spot_igw \
  -target=module.static_site.aws_route.worker_spot_nat \
  -target=module.static_site.aws_iam_policy.github_deploy_cdn_policy \
  -target=module.static_site.aws_iam_role_policy_attachment.github_deploy_cdn \
  -target=module.static_site.time_sleep.cdn_iam_propagation

# Full stack, including the backend Lambda zips.
step "Terraform apply — full stack"
terraform -chdir="$tf_dir" plan -out=tfplan -input=false -no-color
terraform -chdir="$tf_dir" apply -auto-approve tfplan
rm -f "$tf_dir/tfplan"

# --------------------------------------------------------------------------
step "Read Terraform outputs"
# --------------------------------------------------------------------------
tf_out() {
  local value
  if ! value="$(terraform -chdir="$tf_dir" output -raw "$1" 2>/dev/null)" || [ -z "$value" ]; then
    die "Terraform output '$1' is missing or empty — the apply may not have completed."
  fi
  printf '%s' "$value"
}

s3_bucket_name="$(tf_out s3_bucket_name)"
cloudfront_distribution_id="$(tf_out cloudfront_distribution_id)"
site_url="$(tf_out site_url)"
cognito_user_pool_id="$(tf_out cognito_user_pool_id)"
cognito_client_id="$(tf_out cognito_client_id)"
api_endpoint="$(tf_out api_endpoint)"
raw_scenes_bucket_name="$(tf_out raw_scenes_bucket_name)"
scenes_table_name="$(tf_out scenes_table_name)"
presence_ws_endpoint="$(tf_out presence_ws_endpoint)"

info "bucket      : $s3_bucket_name"
info "distribution: $cloudfront_distribution_id"
info "api         : $api_endpoint"

# --------------------------------------------------------------------------
step "Build frontend"
# --------------------------------------------------------------------------
# NODE_ENV=production is what makes next.config.ts switch on `output: "export"`,
# which is what produces frontend/out for the S3 sync.
(
  cd frontend
  NODE_ENV=production \
  NEXT_PUBLIC_AWS_REGION="$aws_region" \
  NEXT_PUBLIC_USER_POOL_ID="$cognito_user_pool_id" \
  NEXT_PUBLIC_CLIENT_ID="$cognito_client_id" \
  NEXT_PUBLIC_API_GATEWAY_URL="$api_endpoint" \
  NEXT_PUBLIC_RAW_SCENES_BUCKET="$raw_scenes_bucket_name" \
  NEXT_PUBLIC_SCENES_TABLE="$scenes_table_name" \
  NEXT_PUBLIC_PRESENCE_WS_URL="$presence_ws_endpoint" \
  npm run build
)
[ -d frontend/out ] || die "frontend/out was not produced by the build."

# --------------------------------------------------------------------------
step "Sync static assets to s3://$s3_bucket_name"
# --------------------------------------------------------------------------
aws s3 sync frontend/out "s3://$s3_bucket_name" \
  --delete \
  --exclude ".git/*" \
  --exclude ".github/*" \
  --exclude "node_modules/*" \
  --exclude ".terraform/*" \
  --exclude "*.tf" \
  --exclude "*.tfvars" \
  --exclude "README.md"

# --------------------------------------------------------------------------
step "Invalidate CloudFront"
# --------------------------------------------------------------------------
invalidation_id="$(
  aws cloudfront create-invalidation \
    --distribution-id "$cloudfront_distribution_id" \
    --paths "/*" \
    --query 'Invalidation.Id' --output text
)"
info "invalidation: $invalidation_id"

if [ "$wait_invalidation" = true ]; then
  info "Waiting for the invalidation to complete..."
  aws cloudfront wait invalidation-completed \
    --distribution-id "$cloudfront_distribution_id" --id "$invalidation_id"
  info "Invalidation complete."
fi

step "Deployed to: $site_url"
