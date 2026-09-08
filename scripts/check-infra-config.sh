#!/usr/bin/env bash
# Verifies that infra/config.json (the single source of truth for
# AWS_ACCOUNT_ID, PROJECT_NAME, TF_STATE_BUCKET, HOSTED_ZONE_NAME, and
# CERTIFICATE_DOMAIN_NAME) hasn't drifted out of sync with the handful of
# places that are structurally unable to read it directly:
#   - Terraform `backend "s3" {}` blocks (parsed before variables/locals/
#     functions exist, so they cannot call jsondecode(file(...))).
#   - Terraform `variable` defaults that reference the account ID (defaults
#     must be constant expressions — they cannot call data.aws_caller_identity).
#
# Run as part of ./scripts/pre-commit-check.sh, or standalone:
#   ./scripts/check-infra-config.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}==> $1${NC}"; }
pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}" >&2; FAILED=1; }

FAILED=0

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is not installed or not on PATH" >&2
  exit 1
fi

CONFIG="infra/config.json"
if [[ ! -f "$CONFIG" ]]; then
  echo "missing $CONFIG" >&2
  exit 1
fi

AWS_ACCOUNT_ID="$(jq -r '.aws_account_id' "$CONFIG")"
TF_STATE_BUCKET="$(jq -r '.tf_state_bucket' "$CONFIG")"

# --- backend.tf bucket names must match infra/config.json ---
step "backend.tf bucket names vs. $CONFIG"
BACKEND_FILES=(
  infra/bootstrap/backend.tf
  infra/envs/dev/backend.tf
  infra/envs/staging/backend.tf
  infra/envs/prod/backend.tf
)
for f in "${BACKEND_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    fail "missing $f"
    continue
  fi
  found="$(grep -oE 'bucket[[:space:]]*=[[:space:]]*"[^"]+"' "$f" | head -1 | sed -E 's/bucket[[:space:]]*=[[:space:]]*"([^"]+)"/\1/')"
  if [[ "$found" != "$TF_STATE_BUCKET" ]]; then
    fail "$f: backend bucket \"$found\" does not match tf_state_bucket \"$TF_STATE_BUCKET\" in $CONFIG"
  fi
done
[[ "$FAILED" -eq 0 ]] && pass "all backend.tf bucket names match $CONFIG"

# --- Any literal AWS account ID outside config.json must match config.json,
#     and must only appear in the one documented exception (a Terraform
#     variable default that cannot call data.aws_caller_identity). ---
step "stray AWS account ID literals vs. $CONFIG"
ALLOWED_FILE="infra/bootstrap/variables.tf"
MATCHES="$(grep -rlE '\b[0-9]{12}\b' --include="*.tf" --include="*.yml" --include="*.yaml" infra .github 2>/dev/null | grep -v '/\.terraform/' | grep -v "^${CONFIG}$" || true)"
BAD=0
for f in $MATCHES; do
  ids="$(grep -oE '\b[0-9]{12}\b' "$f" | sort -u)"
  for id in $ids; do
    if [[ "$id" != "$AWS_ACCOUNT_ID" ]]; then
      fail "$f: hardcoded account ID $id does not match aws_account_id \"$AWS_ACCOUNT_ID\" in $CONFIG"
      BAD=1
    fi
  done
  if [[ "$f" != "$ALLOWED_FILE" ]]; then
    fail "$f: hardcodes the AWS account ID outside the documented exception ($ALLOWED_FILE) — use data.aws_caller_identity or read $CONFIG instead"
    BAD=1
  fi
done
[[ "$BAD" -eq 0 ]] && pass "no stray/mismatched account ID literals (only the documented exception in $ALLOWED_FILE)"

if [[ "$FAILED" -ne 0 ]]; then
  echo -e "\n${RED}infra config consistency check failed.${NC}" >&2
  exit 1
fi

echo -e "\n${GREEN}infra config consistency check passed.${NC}"
