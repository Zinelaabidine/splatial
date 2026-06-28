#!/usr/bin/env bash
# Run all local checks before committing. Safe to run manually:
#   ./scripts/pre-commit-check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

step() {
  echo -e "\n${BLUE}==> $1${NC}"
}

pass() {
  echo -e "${GREEN}✓ $1${NC}"
}

fail() {
  echo -e "${RED}✗ $1${NC}" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "$1 is not installed or not on PATH"
  fi
}

require_cmd terraform
require_cmd node
require_cmd npm

# --- Terraform format ---
step "terraform fmt (check)"
if terraform fmt -check -recursive infra/; then
  pass "terraform fmt"
else
  fail "terraform fmt failed — run: terraform fmt -recursive infra/"
fi

# --- Terraform validate (all envs, no remote backend) ---
TERRAFORM_ENVS=(dev staging prod)
for env in "${TERRAFORM_ENVS[@]}"; do
  env_dir="infra/envs/$env"
  if [[ ! -d "$env_dir" ]]; then
    fail "missing terraform env directory: $env_dir"
  fi

  step "terraform validate ($env)"
  (
    cd "$env_dir"
    terraform init -backend=false -input=false >/dev/null
    terraform validate
  )
  pass "terraform validate ($env)"
done

# --- Frontend lint ---
step "frontend lint"
if [[ ! -d frontend/node_modules ]]; then
  fail "frontend/node_modules missing — run: cd frontend && npm install"
fi
(
  cd frontend
  npm run lint
)
pass "frontend lint"

# --- Backend syntax check ---
step "backend require check"
if [[ ! -d backend/node_modules ]]; then
  fail "backend/node_modules missing — run: cd backend && npm install"
fi
(
  cd backend
  node -e "require('./upload')"
)
pass "backend require check"

echo -e "\n${GREEN}All pre-commit checks passed.${NC}"
