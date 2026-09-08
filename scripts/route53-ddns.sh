#!/usr/bin/env bash
#
# Update a Route53 A record when this machine's public IPv4 address changes.
#
# Designed for a dedicated IAM user/profile with ChangeResourceRecordSets on one
# hosted zone (ListHostedZonesByName is not required when HOSTED_ZONE_ID is set).
#
# Usage:
#   ./scripts/route53-ddns.sh --daemon          # run continuously (recommended)
#   ./scripts/route53-ddns.sh --once            # single check, then exit
#   ./scripts/route53-ddns.sh --force           # upsert even if cached IP matches
#   ./scripts/route53-ddns.sh --dry-run         # print actions, no AWS changes
#
# Environment overrides (or edit defaults below):
#   ROUTE53_DDNS_PROFILE      AWS CLI profile (default: route53-ddns)
#   ROUTE53_DDNS_REGION       AWS CLI region  (default: us-east-1)
#   ROUTE53_DDNS_HOSTED_ZONE  Route53 zone ID (default: openspacenexus.store)
#   ROUTE53_DDNS_RECORD       FQDN to update  (default: remote.openspacenexus.store)
#   ROUTE53_DDNS_TTL          Record TTL sec  (default: 3600)
#   ROUTE53_DDNS_INTERVAL     Poll interval s (default: 60, daemon mode only)
#   ROUTE53_DDNS_STATE_DIR    Cache directory (default: ~/.cache/route53-ddns)
#   ROUTE53_DDNS_IP_URLS      Space-separated IPv4 echo URLs (optional)
#
set -euo pipefail

PROFILE="${ROUTE53_DDNS_PROFILE:-route53-ddns}"
REGION="${ROUTE53_DDNS_REGION:-us-east-1}"
HOSTED_ZONE_ID="${ROUTE53_DDNS_HOSTED_ZONE:-Z02688311L741VWL57SFO}"
RECORD_NAME="${ROUTE53_DDNS_RECORD:-remote.openspacenexus.store}"
TTL="${ROUTE53_DDNS_TTL:-3600}"
INTERVAL="${ROUTE53_DDNS_INTERVAL:-60}"
STATE_DIR="${ROUTE53_DDNS_STATE_DIR:-${HOME}/.cache/route53-ddns}"
LAST_IP_FILE="${STATE_DIR}/last-ip"
LOG_FILE="${STATE_DIR}/route53-ddns.log"
PID_FILE="${STATE_DIR}/route53-ddns.pid"

DEFAULT_IP_URLS=(
  "https://checkip.amazonaws.com"
  "https://api.ipify.org"
  "https://ifconfig.me/ip"
)
read -r -a IP_URLS <<< "${ROUTE53_DDNS_IP_URLS:-${DEFAULT_IP_URLS[*]}}"

MODE="once"
DRY_RUN=false
FORCE=false

usage() {
  cat >&2 <<'EOF'
Usage: route53-ddns.sh [--daemon] [--once] [--force] [--dry-run] [-h]

  --daemon   Poll public IPv4 continuously and update Route53 when it changes.
             Default poll interval: 60s (override with ROUTE53_DDNS_INTERVAL).
  --once     Check once and exit (default if neither --daemon nor --once is given
             in systemd; use --once explicitly for cron-style runs).
  --force    Upsert the record even when the cached IP matches.
  --dry-run  Log what would change without calling Route53.
EOF
}

log() {
  local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
  mkdir -p "${STATE_DIR}"
  printf '%s\n' "${msg}" | tee -a "${LOG_FILE}" >&2
}

is_valid_ipv4() {
  local ip="$1"
  [[ "${ip}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  local o
  IFS='.' read -r -a o <<< "${ip}"
  for octet in "${o[@]}"; do
    (( octet >= 0 && octet <= 255 )) || return 1
  done
}

normalize_fqdn() {
  local name="$1"
  name="${name%.}"
  printf '%s.\n' "${name}"
}

fetch_public_ipv4() {
  local url ip
  for url in "${IP_URLS[@]}"; do
    if ! ip="$(curl -4fsS --connect-timeout 5 --max-time 10 "${url}" 2>/dev/null | tr -d '[:space:]')"; then
      continue
    fi
    if is_valid_ipv4 "${ip}"; then
      printf '%s' "${ip}"
      return 0
    fi
  done
  return 1
}

read_cached_ip() {
  if [[ -f "${LAST_IP_FILE}" ]]; then
    tr -d '[:space:]' < "${LAST_IP_FILE}"
  fi
}

write_cached_ip() {
  mkdir -p "${STATE_DIR}"
  printf '%s\n' "$1" > "${LAST_IP_FILE}"
}

upsert_a_record() {
  local ip="$1"
  local fqdn
  fqdn="$(normalize_fqdn "${RECORD_NAME}")"

  local change_batch
  change_batch="$(jq -nc \
    --arg comment "DDNS update from $(hostname -s 2>/dev/null || hostname)" \
    --arg name "${fqdn}" \
    --argjson ttl "${TTL}" \
    --arg ip "${ip}" \
    '{
      Comment: $comment,
      Changes: [{
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: $name,
          Type: "A",
          TTL: $ttl,
          ResourceRecords: [{ Value: $ip }]
        }
      }]
    }')"

  if [[ "${DRY_RUN}" == true ]]; then
    log "dry-run: would upsert ${RECORD_NAME} -> ${ip} (TTL ${TTL})"
    printf '%s\n' "${change_batch}"
    return 0
  fi

  local change_id
  change_id="$(aws route53 change-resource-record-sets \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --hosted-zone-id "${HOSTED_ZONE_ID}" \
    --change-batch "${change_batch}" \
    --query 'ChangeInfo.Id' \
    --output text)"

  log "updated ${RECORD_NAME} -> ${ip} (change ${change_id})"
  write_cached_ip "${ip}"
}

run_check() {
  local current_ip cached_ip

  if ! current_ip="$(fetch_public_ipv4)"; then
    log "error: could not determine public IPv4 from configured URLs"
    return 1
  fi

  cached_ip="$(read_cached_ip || true)"

  if [[ "${FORCE}" != true && "${cached_ip}" == "${current_ip}" ]]; then
    log "unchanged: ${current_ip}"
    return 0
  fi

  if [[ "${cached_ip}" != "${current_ip}" ]]; then
    log "detected change: ${cached_ip:-<none>} -> ${current_ip}"
  fi

  upsert_a_record "${current_ip}"
}

run_daemon() {
  if [[ -f "${PID_FILE}" ]]; then
    local existing_pid
    existing_pid="$(tr -d '[:space:]' < "${PID_FILE}")"
    if [[ -n "${existing_pid}" ]] && kill -0 "${existing_pid}" 2>/dev/null; then
      log "error: daemon already running (pid ${existing_pid})"
      exit 1
    fi
  fi

  printf '%s\n' "$$" > "${PID_FILE}"

  cleanup() {
    log "shutting down"
    rm -f "${PID_FILE}"
    exit 0
  }
  trap cleanup SIGTERM SIGINT

  log "daemon started (interval ${INTERVAL}s, record ${RECORD_NAME}, TTL ${TTL})"

  while true; do
    run_check || log "check failed; retrying in ${INTERVAL}s"
    sleep "${INTERVAL}"
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --daemon)
      MODE="daemon"
      shift
      ;;
    --once)
      MODE="once"
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

for cmd in aws curl jq; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    log "error: required command not found: ${cmd}"
    exit 1
  fi
done

if [[ "${MODE}" == "daemon" ]]; then
  run_daemon
else
  run_check
fi
