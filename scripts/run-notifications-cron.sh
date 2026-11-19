#!/usr/bin/env bash
set -euo pipefail

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is not set on this cron job" >&2
  exit 1
fi

URL="${AIGIS_CRON_URL:-https://aigis-platform.onrender.com/api/cron/notifications}"
curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "${URL}"
echo
