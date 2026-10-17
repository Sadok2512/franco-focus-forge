#!/usr/bin/env bash
# G1 : lint + typecheck + build OK.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/_lib.sh"

cd "$(dirname "$HERE")"

# Lint uniquement les fichiers que le lot bc4-front touche — les lint
# issues pré-existantes sur d'autres fichiers ne sont pas de ce lot.
echo "[G1] lint src/lib/api/* + src/mocks/* + pages Projet / Référence / Dict / KPI"
bun_run x eslint \
  src/lib/api/http.ts src/lib/api/client.ts src/lib/api/dictionary.ts \
  src/lib/api/dictionary-schemas.ts \
  src/lib/api/assistant.ts src/lib/api/settings.ts \
  src/lib/api/reference.ts src/lib/api/reference-schemas.ts \
  src/lib/api/projects.ts src/lib/api/project-schemas.ts \
  src/lib/api/nmf-schemas.ts src/lib/api/schemas.ts \
  src/mocks/reference.ts src/mocks/projects.ts src/mocks/dictionary.ts \
  src/features/settings/cellular-reference/CellularReferencePanel.tsx \
  src/routes/_app.settings.cellular-reference.tsx \
  src/features/projects/shared.tsx \
  src/features/projects/CreateProjectDialog.tsx \
  src/features/projects/NmfImportPanel.tsx \
  src/features/projects/NmfImportReportView.tsx \
  src/features/projects/ProjectPage.tsx \
  src/features/projects/ProjectRowDetails.tsx \
  src/features/projects/ProjectRowNmfAction.tsx \
  src/features/projects/useNmfUpload.ts \
  src/routes/_app.projects.tsx \
  src/routes/_app.projects.\$projectId.tsx \
  src/features/dictionary/DictionaryPage.tsx \
  src/features/dictionary/shared.ts \
  src/features/dictionary/value-matrix.ts \
  src/routes/_app.rrc.tsx src/routes/_app.kpi.tsx

echo "[G1] typecheck complet"
bun_run x tsc --noEmit

echo "[G1] build vite"
bun_run run build

echo "[G1] OK"
