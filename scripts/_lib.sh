#!/usr/bin/env bash
# Shared helpers. Chaque garde crie si l'API n'est pas joignable — un
# garde silencieux ne garde rien.
set -euo pipefail

shout() {
  echo >&2 ""
  echo >&2 "!! $*"
  echo >&2 ""
  exit 2
}

require_api_base() {
  if [[ -z "${VITE_BC4_API_BASE:-}" ]]; then
    shout "VITE_BC4_API_BASE manquant (ex: http://localhost:8000)"
  fi
}

wait_for_api() {
  local base="${VITE_BC4_API_BASE%/}"
  local tries=20
  while (( tries > 0 )); do
    if curl -fsS "${base}/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
    tries=$((tries - 1))
  done
  shout "API ${base} injoignable (pas de /health 200 après 20s)."
}

bun_run() {
  if command -v bun >/dev/null 2>&1; then bun "$@"; return; fi
  if docker ps --format '{{.Names}}' | grep -q '^bc4-front-1$'; then
    # Depuis l'intérieur du container, l'API hôte est joignable sur `api:8000`
    # (nom de service docker-compose), pas sur `localhost`.
    local api_in="${VITE_BC4_API_BASE:-}"
    if [[ "$api_in" == http://localhost:* || "$api_in" == http://127.0.0.1:* ]]; then
      api_in="http://api:8000"
    fi
    docker exec \
      -e VITE_BC4_API_BASE="$api_in" \
      -e VITE_BC4_DATA="${VITE_BC4_DATA:-api}" \
      -e BC4_ADMIN_EMAIL="${BC4_ADMIN_EMAIL:-}" \
      -e BC4_ADMIN_PASSWORD="${BC4_ADMIN_PASSWORD:-}" \
      bc4-front-1 bun "$@"
    return
  fi
  shout "Ni bun local ni container bc4-front-1 : impossible de lancer bun."
}
