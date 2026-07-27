#!/usr/bin/env bash
# Build the frontend locally using the same command the workflow relies on.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT/frontend"

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "error: frontend directory not found at $FRONTEND_DIR" >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "error: frontend/node_modules is missing — run 'cd frontend && npm install' first" >&2
  exit 1
fi

cd "$FRONTEND_DIR"
npm run build
