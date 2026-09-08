#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: scripts/github.sh <dev|staging|prod> [options] [act-args...]

Options:
  --profile PROFILE   AWS profile to resolve credentials from (default: $AWS_PROFILE, else "default")
  --assume-role       Assume the same splatial-<env>-github-deploy-role the real GitHub
                      Actions run assumes via OIDC, for exact permission parity.
  --env-file PATH     Extra env file to pass to act
  --                  Everything after this is passed straight through to act

Credentials are resolved on the HOST and injected into the act container as concrete
keys. act does not mount ~/.aws, so AWS_PROFILE alone is never enough.
EOF
}

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

env_name="$1"
shift

profile=""
env_file=""
assume_role=0
extra_args=()

while [ $# -gt 0 ]; do
  case "$1" in
    --profile)
      [ $# -ge 2 ] || { echo "Missing value for --profile" >&2; exit 1; }
      profile="$2"
      shift 2
      ;;
    --env-file)
      [ $# -ge 2 ] || { echo "Missing value for --env-file" >&2; exit 1; }
      env_file="$2"
      shift 2
      ;;
    --assume-role)
      assume_role=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      extra_args+=("$@")
      break
      ;;
    *)
      extra_args+=("$1")
      shift
      ;;
  esac
done

case "$env_name" in
  dev|staging|prod) ;;
  *)
    echo "Unsupported environment: $env_name" >&2
    usage
    exit 1
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

command -v docker >/dev/null 2>&1 || { echo "docker is not installed or not on PATH" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "docker daemon is not running" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Clear leftovers from an interrupted run. act reuses a fixed container and
# volume name per workflow+job, so a container killed mid-run keeps the volume
# attached and the next run dies with "volume is in use".
# ---------------------------------------------------------------------------
act_resource_prefix="act-deploy-full-manual"

stale_containers="$(docker ps -aq --filter "name=${act_resource_prefix}" 2>/dev/null || true)"
if [ -n "$stale_containers" ]; then
  echo "Removing stale act containers from a previous run..."
  # shellcheck disable=SC2086
  docker rm -f $stale_containers >/dev/null 2>&1 || true
fi

stale_volumes="$(docker volume ls -q --filter "name=${act_resource_prefix}" 2>/dev/null || true)"
if [ -n "$stale_volumes" ]; then
  echo "Removing stale act volumes from a previous run..."
  # shellcheck disable=SC2086
  docker volume rm -f $stale_volumes >/dev/null 2>&1 || docker volume rm $stale_volumes >/dev/null 2>&1 || true
fi

runner_image="local-act-runner:latest"
if ! docker image inspect "$runner_image" >/dev/null 2>&1; then
  echo "Building local act runner image..."
  if docker build --platform linux/amd64 -t "$runner_image" -f .github/docker/Dockerfile .; then
    echo "Built $runner_image"
  else
    echo "WARNING: could not build $runner_image; falling back to catthehacker/ubuntu:act-latest." >&2
    echo "         The workflow will install the AWS CLI in-container instead (slower)." >&2
    runner_image="catthehacker/ubuntu:act-latest"
  fi
fi

aws_account_id="886601940523"
aws_region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
deploy_role_arn="arn:aws:iam::${aws_account_id}:role/splatial-${env_name}-github-deploy-role"

command -v act >/dev/null 2>&1 || { echo "act is not installed (brew install act)" >&2; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "aws CLI is not installed on the host" >&2; exit 1; }

if [ -z "$profile" ]; then
  profile="${AWS_PROFILE:-default}"
fi

access_key=""
secret_key=""
session_token=""

# ---------------------------------------------------------------------------
# 1. Explicit env credentials in the current shell always win.
# ---------------------------------------------------------------------------
if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  echo "Using AWS credentials from the current shell environment."
  access_key="$AWS_ACCESS_KEY_ID"
  secret_key="$AWS_SECRET_ACCESS_KEY"
  session_token="${AWS_SESSION_TOKEN:-}"
else
  # -------------------------------------------------------------------------
  # 2. Resolve the profile into concrete keys on the host. This transparently
  #    handles SSO, credential_process, and source_profile/role_arn chains.
  # -------------------------------------------------------------------------
  echo "Resolving AWS credentials from profile '$profile'..."
  if ! exported="$(aws configure export-credentials --profile "$profile" --format env-no-export 2>&1)"; then
    cat >&2 <<EOF

Could not resolve AWS credentials from profile '$profile'.

  aws configure export-credentials --profile $profile
  -> $exported

Fix one of the following, then re-run:
  * SSO profile with an expired session:  aws sso login --profile $profile
  * Wrong profile name:                   scripts/github.sh $env_name --profile <name>
  * No profile configured:                aws configure --profile $profile
  * Or export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in your shell.

(Requires AWS CLI v2.9+. Check with: aws --version)
EOF
    exit 1
  fi

  while IFS='=' read -r key value; do
    case "$key" in
      AWS_ACCESS_KEY_ID) access_key="$value" ;;
      AWS_SECRET_ACCESS_KEY) secret_key="$value" ;;
      AWS_SESSION_TOKEN) session_token="$value" ;;
    esac
  done <<< "$exported"
fi

if [ -z "$access_key" ] || [ -z "$secret_key" ]; then
  echo "Resolved credentials are incomplete; refusing to run act with no credentials." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Optionally assume the same role the real GitHub Actions run assumes, so
#    local runs hit the identical permission boundary.
# ---------------------------------------------------------------------------
if [ "$assume_role" -eq 1 ]; then
  echo "Assuming $deploy_role_arn for GitHub Actions parity..."
  if ! assumed="$(
    AWS_ACCESS_KEY_ID="$access_key" \
    AWS_SECRET_ACCESS_KEY="$secret_key" \
    AWS_SESSION_TOKEN="$session_token" \
    AWS_REGION="$aws_region" \
    aws sts assume-role \
      --role-arn "$deploy_role_arn" \
      --role-session-name "local-act-$(date +%s)" \
      --duration-seconds 3600 \
      --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
      --output text 2>&1
  )"; then
    cat >&2 <<EOF

Failed to assume $deploy_role_arn:
  $assumed

The role's trust policy targets the GitHub OIDC provider, so your local IAM
principal may not be allowed to assume it. Drop --assume-role to deploy with
your own credentials instead.
EOF
    exit 1
  fi
  read -r access_key secret_key session_token <<< "$assumed"
fi

# ---------------------------------------------------------------------------
# 4. Confirm the identity before spending 45 minutes in a container.
# ---------------------------------------------------------------------------
caller="$(
  AWS_ACCESS_KEY_ID="$access_key" \
  AWS_SECRET_ACCESS_KEY="$secret_key" \
  AWS_SESSION_TOKEN="$session_token" \
  AWS_REGION="$aws_region" \
  aws sts get-caller-identity --query Arn --output text
)"
echo "Deploying to '$env_name' as: $caller"

# ---------------------------------------------------------------------------
# 5. Hand concrete credentials to act. Deliberately NOT forwarding AWS_PROFILE:
#    ~/.aws is not mounted in the container, so a profile name there resolves to
#    nothing while still making every `env.AWS_PROFILE != ''` gate pass.
# ---------------------------------------------------------------------------
act_env_file="$(mktemp)"
chmod 600 "$act_env_file"
trap 'rm -f "$act_env_file"' EXIT

{
  echo "ACT=true"
  echo "AWS_ACCESS_KEY_ID=$access_key"
  echo "AWS_SECRET_ACCESS_KEY=$secret_key"
  if [ -n "$session_token" ]; then echo "AWS_SESSION_TOKEN=$session_token"; fi
  echo "AWS_REGION=$aws_region"
  echo "AWS_DEFAULT_REGION=$aws_region"
} > "$act_env_file"

act_args=(
  --workflows .github/workflows/deploy-full-manual.yml
  -j deploy
  --container-architecture linux/amd64
  -P ubuntu-latest="$runner_image"
  --input environment="$env_name"
  --rm
)

if [ -n "$env_file" ]; then
  act_args+=(--env-file "$env_file")
fi
act_args+=(--env-file "$act_env_file")

ACT=true act "${act_args[@]}" "${extra_args[@]}"
