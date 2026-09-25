#!/usr/bin/env bash
set -euo pipefail
echo "== MaruMaru preflight =="
node --version
command -v forge >/dev/null 2>&1 && forge --version || echo "forge ABSENT (expected on editing box; run forge test on build machine)"
[ -f .env ] && echo ".env present" || echo ".env MISSING (copy .env.example)"
if [ -f .env ]; then
  set -a; . ./.env; set +a
  echo "WORLD_ID_MODE=${WORLD_ID_MODE:-unset} RECLAIM_MODE=${RECLAIM_MODE:-unset}"
fi
echo "preflight OK"
