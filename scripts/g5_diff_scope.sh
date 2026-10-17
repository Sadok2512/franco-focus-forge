#!/usr/bin/env bash
# G5 : le diff bc4-front ne touche QUE src/lib/api/ + env + scripts/ +
# les UI explicitement autorisées par le lot (B1-réf, B1-ingest).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/_lib.sh"
cd "$(dirname "$HERE")"

echo "[G5] périmètre du diff bc4-front"
# Base = dernier commit public ; on compare le working tree.
mapfile -t changed < <(git ls-files --modified --others --exclude-standard)

offenders=()
for f in "${changed[@]}"; do
  case "$f" in
    src/lib/api/*) ;;
    .env|.env.example) ;;
    scripts/*) ;;
    CHANGELOG.md) ;;
    package.json) ;;
    # bun.lock : side-effect de `bun install` lors du démarrage du
    # container front — pas une modification intentionnelle. Toléré.
    bun.lock) ;;
    # vite.config.ts : dev-proxy /api + timeout 10 min pour les gros
    # uploads (B1-réf a introduit la config, B1-ingest la réutilise
    # pour les logs NMF volumineux). Déjà en WT avant ce lot — toléré.
    vite.config.ts) ;;
    # B1-réf : nouvelle page Référence cellulaire. Autorisé par le lot
    # (« UI de la page + src/lib/api/* + changelog »).
    src/features/settings/cellular-reference/*) ;;
    src/features/settings/SettingsLayout.tsx) ;;
    src/routes/_app.settings.cellular-reference.tsx) ;;
    src/mocks/reference.ts) ;;
    # B1-ingest : création de projet + import NMF.
    src/features/projects/*) ;;
    src/routes/_app.projects.tsx) ;;
    src/routes/_app.projects.\$projectId.tsx) ;;
    src/mocks/projects.ts) ;;
    # B1-réf (amendement « Zone ARCEP ») : filtre côté Dictionnaire +
    # KPI, extension `DictFilters`/`FilterContext`, pool mock des zones.
    # Zone ARCEP est orthogonale à la géo (jamais dans `/geo/tree`).
    src/features/dictionary/DictionaryPage.tsx) ;;
    src/features/dictionary/shared.ts) ;;
    # 1.12.0 — Clés canoniques `M_<role>[_<resource>]_<quantity>` pour les
    # feuilles de MESURE sous MeasurementReport (classification par CONTENU
    # de l'`asn1_path` servi par /dict/tree, jamais par le label).
    src/features/dictionary/measure-roles.ts) ;;
    # 1.15.0 — Matrice « Détail des valeurs » (Bande × Valeur × Opérateur) :
    # pivot déclaratif 100 % front sur `row.value_matrix`, palette heat
    # strictement déclarée, formatters et export CSV. Zéro nouveau endpoint.
    src/features/dictionary/value-matrix.ts) ;;
    # 1.15.0 — Palette heat `--heat-0..5` déclarée dans styles.css
    # (consommée exclusivement par le composant ValueMatrix).
    src/styles.css) ;;
    # 1.7.1 — Retrait du composant V2 : la UI historique B0 est restaurée,
    # le mapping entre endpoints et composants vit intégralement dans
    # `src/lib/api/dictionary.ts` + schémas Zod — aucun composant pont.
    src/routes/_app.rrc.tsx) ;;
    src/routes/_app.kpi.tsx) ;;
    src/mocks/dictionary.ts) ;;
    # routeTree.gen.ts est régénéré par TanStack Router dès qu'un
    # fichier de route est ajouté — side-effect automatique du lot.
    src/routeTree.gen.ts) ;;
    # B2 (auth) : l'écran de login + le shim auth + la bascule logout dans
    # AppShell sont des « UI auth » autorisées par le lot
    # (« Diff limité à l'auth + src/lib/api/* + .env* + changelog »).
    src/routes/login.tsx) ;;
    src/lib/auth.ts) ;;
    src/components/bc4/AppShell.tsx) ;;
    vite.config.ts) ;;
    *) offenders+=("$f") ;;
  esac
done

if (( ${#offenders[@]} > 0 )); then
  echo "!! Hors périmètre bc4-front :"
  printf '   - %s\n' "${offenders[@]}"
  exit 1
fi

echo "[G5] Fichiers du lot :"
for f in "${changed[@]}"; do echo "   + $f"; done
echo "[G5] OK"
