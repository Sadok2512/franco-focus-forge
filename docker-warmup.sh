#!/bin/sh
# PHASE F+ (1.77.2) — warm-up Vite dev à la seconde près après le ready log.
# Chaque route déclenchée côté serveur Vite SSR force le pre-bundling de ses
# modules dépendants, de sorte que la 1re visite utilisateur soit instantanée
# au lieu de 10-30s de « Loading… ». Idempotent, pas de boucle.
set -e
echo "[warmup] background launched"
# Attendre que Vite soit prêt (ping / jusqu'à 200 OK, max 60s).
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null | grep -q 200; then
    echo "[warmup] vite ready after ${i}s"
    break
  fi
  sleep 1
done
# Routes critiques — chaque GET force Vite à transformer la chaîne de modules.
# Les routes authentifiées renverront 200 (SSR rend quand même la coquille).
for path in /projects /overview /kpi /signaling /signaling-v2 /signaling-v2?mode=api /metrics /rrc /rf /assistant; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173$path" 2>/dev/null || echo 000)
  echo "[warmup] GET $path → $code"
done
echo "[warmup] done — cold routes pre-transformed"
