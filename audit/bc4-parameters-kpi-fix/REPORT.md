# BC4 — `parameters-kpi-fix`

## Périmètre et isolation

- Branche `bc4/parameters-kpi-fix`, rebasée sur le merge `5ca2777`
  (front 1.126.0).
- Pile exclusivement jetable : réseau `bc4a4-parameters-net`, base
  `bc4a4-db`, API `bc4a4-api:9182`, front `bc4a4-front:9183`.
- Base restaurée depuis `exports/bc4_2026-10-30_0200.dump`; compte, partage
  Test_6 et JWT créés dans cette copie uniquement.
- Aucun appel à `:5174`, `bc4_default`, au DSN ou aux secrets de production.
- SemVer déclaré : front **PATCH** ; BC3 attribue le numéro.

## Catalogue KPI Test_6

Commande exécutée contre la pile jetable (le JWT n'est jamais affiché) :

```sh
BC4A4_TOKEN=$(docker exec bc4a4-api python -c \
  "from app.config import settings; from app.services.auth import create_token; print(create_token(user_id='adm-adef708afd30',role='admin',ttl_min=30,secret=settings.jwt_secret)[0])")
curl -fsS -H "Authorization: Bearer $BC4A4_TOKEN" \
  http://127.0.0.1:9182/projects/43e81a34a073/kpi/catalog | \
python3 -c "import json,sys; d=json.load(sys.stdin); rows=[k for t in d['tree'] for f in t['families'] for k in f['kpis']]; print(sum(k.get('analytics_tab')=='kpi' for k in rows))"
```

Sortie : `105`, exit 0. Le rendu après affiche
`KPI catalogue — 105 · 0/8 sélectionnés` et les feuilles avec une recherche
vide. Le `0/8` historique était le nombre sélectionné sur la limite, pas le
nombre de feuilles disponibles.

## Parameters

La sonde `scripts/parameters_kpi_fix_evidence.mjs` sélectionne
`dl-Bandwidth` et mesure le DOM :

```text
PHY · 1 paramètre                    title identique
dl-Bandwidth · LTE · 4 valeurs       title identique
rightEdgeDelta Orange / Free         [0, 0]
chevron + icône + libellé alignés    true
```

Le mode compact est un prop opt-in passé seulement depuis KPI Analytics.
RRC Dictionary ne reçoit pas ce prop.

Captures :

- `before/parameters.png` : libellés concaténés, icônes/lignes séparées et
  valeurs opérateurs décalées ;
- `after/parameters.png` : libellés avec séparateurs, une ligne par niveau,
  troncature/infobulle et bords droits Orange/Free alignés.

## KPI-04 — `capture_id`

Commande baseline sur l'image 1.126.0 :

```sh
BC4_FRONT_BASE=http://127.0.0.1:9183 \
node scripts/parameters_kpi_fix_evidence.mjs before
```

Sortie : `METRIC_REQUESTS=3 DUPLICATE_CAPTURE_ID=2`, `VERDICT=FAIL`, exit 1.
Les deux `/metrics/table` avaient deux occurrences ; `/metrics/series` en
avait une dans ce scénario.

Même commande sur l'image du lot avec `after` :

```text
METRIC_REQUESTS=3 DUPLICATE_CAPTURE_ID=0
VERDICT=PASS
```

Les trois URL exactes et leur nombre d'occurrences sont conservées dans les
deux `report.json`.

## KPI-07 — WebGL

La sonde ouvre réellement la carte RSRP, attend son canvas puis sépare les
messages avant/après screenshot :

```text
WEBGL_WARNINGS_BEFORE_SCREENSHOT=0
WEBGL_MAP_BEFORE_SCREENSHOT=4
WEBGL_MAP_AFTER_SCREENSHOT=4
```

Les quatre messages sont ceux du pilote Chromium headless
`GPU stall due to ReadPixels`; le quatrième porte explicitement
`this message will no longer repeat`. Il n'y a aucun `console.warn` de
l'application, aucune exception page et aucun message supplémentaire causé
par le screenshot. Un essai mesuré avec le contexte WebGL `desynchronized`
a donné le même résultat et n'a donc pas été conservé. Verdict : diagnostic
navigateur auto-borné, pas de masquage de console ni de modification risquée
du composant partagé.

## RRC Dictionary inchangée

```sh
python3 - <<'PY'
import json
b=json.load(open('audit/bc4-parameters-kpi-fix/before/report.json'))
a=json.load(open('audit/bc4-parameters-kpi-fix/after/report.json'))
print(b['rrcSignature']==a['rrcSignature'])
PY
```

Sortie : `True`, `VERDICT=PASS`. Dans les deux images : même titre, mêmes
onglets `Paramètres / Raw parameter / Templates` et même placeholder.
Captures : `before/rrc.png` et `after/rrc.png`.

## Tests et build

```sh
npm test -- --run src/test/rrc-grouped-table.test.tsx \
  src/test/metrics-query-contract.test.ts \
  src/test/kpi-catalog-sidebar.test.tsx \
  src/test/metric-map-view.test.tsx
# 4 fichiers, 22 tests PASS, exit 0

npx eslint <fichiers du lot>
# exit 0

python3 /home/devmat/BC4/scripts/_guard_G36_disk.py
# verdict=PASS, exit 0

docker build -f Dockerfile.v2 -t bc4a4-front:parameters-kpi-fix .
# exit 0
```

Le typecheck global sort avec `exit 2` sur les erreurs préexistantes listées
hors lot (opérateurs typés, fixtures, contrat voisinages et config Vite) ;
aucune erreur ne vise les fichiers modifiés par ce lot.
