# Rapport final BC4 — `bc4/kpi-parameters-tab`

## Périmètre

- KPI Analytics conserve le design existant et expose `KPI`, `Metrics` et
  `Parameters`.
- `Parameters` réutilise les composants RRC Dictionary ; `Templates` est
  masqué uniquement dans KPI Analytics. RRC Dictionary conserve ses trois
  vues.
- Le classement lit exclusivement `analytics_tab` du catalogue 2.57.0,
  jamais le libellé.
- Le back et le catalogue sont des changements SemVer **MINOR** ; BC3
  attribue le numéro applicatif et activera 2.57.0 en production.

## Pile de preuve isolée

Toutes les preuves finales ont été refaites sur :

```text
network       bc4a4-kpi-net
database      bc4a4-db / volume bc4a4-kpi-db-data
API           bc4a4-api / 127.0.0.1:9182
front         bc4a4-front / 127.0.0.1:9183
worker        bc4a4-worker
JWT           secret de test propre à bc4a4
catalogue     2.57.0, activé uniquement dans la copie jetable
```

La base a été restaurée depuis `exports/bc4_2026-10-29_0200.dump`, migrée
jusqu'à `0070_signaling_materialized`, puis Test_6 a été réimporté depuis les
trois témoins locaux. Résultat : projet `43e81a34a073` prêt, trois captures
sur trois, capture `a4b0c321c52e`, décodeur 1.8.2 et 363 423 enregistrements
sur cette capture. La production, `bc4_default`, le port 5174, son DSN et ses
secrets n'ont pas été utilisés.

## Comparaison des 422 BC3

Source BC3 : `/home/devmat/BC4/audit/g51-prod-0.101.0-422.tsv`.

```bash
python3 - <<'PY'
import csv,json
prod=list(csv.DictReader(open('/home/devmat/BC4/audit/g51-prod-0.101.0-422.tsv'),delimiter='\t'))
cat=json.load(open('/home/devmat/BC4/back-a4/app/kpi/catalog_release/catalog_2.57.0.json'))['analytics_series_decisions']
series={r['code'] for r in prod if r['endpoint']=='series'}
table={r['code'] for r in prod if r['endpoint']=='table'}
removed={r['code'] for r in cat if r['decision']=='removed_until_series_supported' and r['visible'] is False}
print(len(prod),len(series),len(table),len(removed),series-removed,removed-series,table<=series)
print('VERDICT', 'PASS' if series==removed and table<=series and len(cat)==61 else 'FAIL')
PY
```

Sortie : 119 lignes BC3, 61 codes uniques `/series`, 58 codes uniques
`/table`, 61 décisions catalogue, différences vides, sous-ensemble table
vrai, `VERDICT PASS`. Les trois codes 422 seulement en série sont
`cell_ch@lte-type-2`, `cell_pci@lte-type-2` et
`cell_pci@nr-type-1000`; ils dépassent `max_points=2000`. Les 58 autres ont
la raison `unknown_metric`. La liste exhaustive code + event + raison +
décision est dans `catalog-2.57.0-decisions.json`.

## Comptages et partition

```bash
BC4_FRONT_BASE=http://127.0.0.1:9183 \
BC4_API_CONTAINER=bc4a4-api \
BC4_PROJECT_ID=43e81a34a073 \
node scripts/kpi_parameters_audit.mjs \
  audit/bc4-kpi-parameters-tab/audit-bc4a4-9183.json
```

```text
ancien ensemble           7 987
KPI                         105
Metrics                   7 882
union                     7 987
uniques                   7 987
perdues                       0
doublons                      0
analytics_tab manquant        0
```

Les KPI sont 47 `Calculated KPI` + 58 `Counter`. Les 92 anciennes feuilles
`Measured metric` rejoignent Metrics. Les 27 ambiguïtés structurelles
résiduelles sont listées dans `catalog-2.57.0-decisions.json` et classées
Metrics par la règle catalogue.

Parameters contient 579 paramètres catalogue, 799 feuilles message, 6 564
feuilles Raw et 1 101 clés distinctes dans chacune des vues catalogue/raw.

## Zéro feuille affichée en 422

```bash
BC4_FRONT_BASE=http://127.0.0.1:9183 \
BC4_API_CONTAINER=bc4a4-api \
BC4_PROJECT_ID=43e81a34a073 \
BC4_CAPTURE_ID=a4b0c321c52e \
node scripts/kpi_leaf_422_guard.mjs \
  audit/bc4-kpi-parameters-tab/metrics-leaves-bc4a4-9183.json
```

```text
LEAVES=222 STATUS={"200":222} FAILURES=0 VERDICT=PASS
```

Chaque requête porte `max_points=2000`; seul HTTP 200 est accepté.

## Captures et réseau

La baseline RRC (`de529ff`) et le front du lot ont été servis successivement
sur le même port jetable 9183 et la même base :

- `before-bc4a4/rrc.png` ;
- `bc4a4-after/rrc.png` ;
- `bc4a4-after/tab-kpi.png`, `tab-metrics.png`, `tab-parameters.png` ;
- `bc4a4-after/leaf-kpi.png`, `leaf-metrics.png`,
  `leaf-parameters.png` ;
- `bc4a4-after/parameters-raw.png`.

```bash
BC4_FRONT_BASE=http://127.0.0.1:9183 \
BC4_API_CONTAINER=bc4a4-api \
BC4_PROJECT_ID=43e81a34a073 \
BC4_CAPTURE_ID=a4b0c321c52e \
node scripts/kpi_parameters_evidence.mjs bc4a4-after
```

`bc4a4-after/network.json`, après chargement RRC Dictionary :

```text
KPI             0 nouvel appel, 0 /dict/v2/tree
Metrics         0 nouvel appel, 0 /dict/v2/tree
Parameters      0 nouvel appel, 0 /dict/v2/tree
Raw parameter   1 nouvel appel, 1 /dict/v2/tree?view=raw
```

La vue catalogue est réutilisée depuis le cache React Query partagé ; Raw est
chargé une fois à sa première ouverture.

## Tests et contrôles

```text
front ciblé      4 fichiers, 8 tests, exit 0
back ciblé       12 tests, exit 0
Prettier ciblé   PASS
ESLint ciblé     PASS
git diff --check PASS
```

Les contrôles globaux restent non verts pour des dettes hors lot, sans SKIP :
`typecheck` exit 2 (10 erreurs opérateurs/fixtures existantes) et ESLint
global exit 1 (2 839 erreurs historiques, principalement anciens audits).

## Commits back

```text
8391386 feat(catalog): classify KPI Analytics leaves
9f43e72 fix(catalog): support ordered Analytics rollout
a99f649 fix(catalog): enrich cached Analytics leaves
8d452b1 fix(catalog): remove unsupported Analytics series
```

- `8391386` introduit le contrat `analytics_tab` et la préparation 2.57.0.
- `9f43e72` permet le déploiement du code avant activation du catalogue.
- `a99f649` enrichit en mémoire les payloads cache anciens, sans écriture
  persistée.
- `8d452b1` encode les 61 décisions `visible=false`, la règle de contenu et
  le garde d'exposition des feuilles.

L'activation de 2.57.0 en production reste exclusivement à BC3.
