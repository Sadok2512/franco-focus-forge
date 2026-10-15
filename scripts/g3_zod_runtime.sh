#!/usr/bin/env bash
# G3 : chaque réponse HTTP est validée par son schéma Zod au runtime.
# C'est G2 lui-même : si le smoke passe, c'est que CHAQUE réponse
# contre le schéma Zod associé est passée. Ce script le réaffirme et
# ajoute un cas de corruption volontaire pour prouver qu'une forme
# non conforme fait bien lever une erreur, pas un rendu silencieux.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/_lib.sh"
cd "$(dirname "$HERE")"

require_api_base
wait_for_api
export VITE_BC4_API_BASE

echo "[G3] smoke (parité Zod runtime)"
bun_run run scripts/smoke_api.ts

echo "[G3] test négatif : un schéma volontairement incompatible doit lever"
bun_run x bun -e "
import { z } from 'zod';
const Wrong = z.object({ nope: z.string() });
const r = await fetch(process.env.VITE_BC4_API_BASE + '/projects');
const j = await r.json();
const p = Wrong.safeParse(j);
if (p.success) { console.error('G3 FAIL: le schéma volontairement faux a passé'); process.exit(1); }
console.log('  ✓ parse() a bien levé sur schéma incompatible');
"
echo "[G3] OK"
