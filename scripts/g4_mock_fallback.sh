#!/usr/bin/env bash
# G4 : non-régression mock. Build en mode mock → OK. Et contrat P1-3
# (bc4-front ≥ 1.5.0) : en mode api, `apiOrMock()` ne masque PLUS les
# erreurs réseau — elles sont propagées pour que la UI affiche la vraie
# classe d'erreur. Seul un 501 avec `fallbackOn501: true` retombe sur
# le mock, avec un `console.warn` visible.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/_lib.sh"
cd "$(dirname "$HERE")"

echo "[G4] build en mode mock explicite (VITE_BC4_DATA=mock)"
VITE_BC4_DATA=mock bun_run run build

echo "[G4] contrat apiOrMock() : réseau propagé, 501 opt-in"
bun_run run scripts/g4_fallback_probe.ts
echo "[G4] OK"
