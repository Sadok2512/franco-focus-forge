# Rapport BC4 — `bc4/kpi-parameters-tab`

## Périmètre livré

- KPI Analytics conserve le design existant et expose `KPI`, `Metrics` et
  `Parameters`.
- La partition ne lit jamais le libellé : elle exige `analytics_tab` fourni
  par l'API. Le back prépare d'abord le catalogue MINOR `2.57.0` depuis
  `2.56.2`; BC3 reste responsable de la numérotation finale.
- `Parameters` réutilise les composants de RRC Dictionary et masque seulement
  `Templates` dans KPI Analytics. RRC Dictionary conserve ses trois vues.
- Les deux pages partagent `dictTreeQuery`, donc exactement les mêmes clés
  React Query pour `/dict/v2/tree`.
- Toute requête de série porte `max_points=2000`; les réponses 422 sont rendues
  sans retry automatique.
- Aucune migration, activation de catalogue, seed ou action de production n'a
  été exécutée.

## Audit catalogue et dictionnaire

Commande avant, sur `:5174` / Test_6 :

```bash
BC4_FRONT_BASE=http://127.0.0.1:5174 \
  node scripts/kpi_parameters_audit.mjs \
  audit/bc4-kpi-parameters-tab/audit-live-2.56.2.json
```

Résultat attaché : 197 feuilles `/kpi/catalog` (47 `Calculated KPI`, 58
`Counter`, 92 `Measured metric`) et 7 867 feuilles `/metrics`. La release
2.56.2 ne porte `analytics_tab` sur aucune de ces 7 867 feuilles : elles sont
toutes ambiguës et toutes listées avec leurs champs de contenu dans le JSON.
L'ancien ensemble contient 8 064 identités préfixées par leur source.

Création déterministe du champ manquant, sans connexion DB :

```bash
python3 scripts/catalog/bootstrap_catalog_release.py \
  --version 2.57.0 --from-version 2.56.2 --prepare-only
```

Commande après, sur le back du lot :

```bash
BC4_FRONT_BASE=http://127.0.0.1:5175 \
  node scripts/kpi_parameters_audit.mjs \
  audit/bc4-kpi-parameters-tab/audit-after-local.json
```

Résultat attaché : KPI 105, Metrics 7 959, union 8 064, uniques 8 064,
manquantes 0, doublons 0, ambiguïtés 0. Le même audit compte 579 paramètres
agrégés, 799 feuilles message, 6 564 feuilles Raw et 1 101 clés distinctes
dans chacune des deux vues du dictionnaire.

Les composants et routes réutilisés sont détaillés dans `AUDIT.md`.

## Preuves UI et réseau

Les captures concernent Test_6 (`43e81a34a073`) et la capture
`a4b0c321c52e` :

- `before/rrc.png`, obtenu sur `:5174` avant modification ;
- `after/rrc.png`, obtenu sur `:5175`, avec RRC Dictionary et `Templates`
  inchangés ;
- `after/tab-kpi.png`, `tab-metrics.png`, `tab-parameters.png` ;
- `after/leaf-kpi.png`, `leaf-metrics.png`, `leaf-parameters.png` ;
- `after/parameters-raw.png`.

Commande de preuve :

```bash
BC4_FRONT_BASE=http://127.0.0.1:5175 \
  node scripts/kpi_parameters_evidence.mjs
```

`after/network.json` établit, lors d'une navigation SPA depuis RRC Dictionary :

- ouverture KPI : 0 appel `/dict/v2/tree` ;
- ouverture Metrics : 0 appel `/dict/v2/tree` ;
- ouverture Parameters : 0 appel `/dict/v2/tree` grâce au cache partagé ;
- premier passage à Raw parameter : 1 appel
  `/dict/v2/tree?view=raw` ;
- la feuille Metrics ouverte appelle `/metrics/series` avec
  `max_points=2000` et reçoit 200.

Contrôle exhaustif des feuilles Metrics résolubles en séries :

```bash
BC4_FRONT_BASE=http://127.0.0.1:5175 \
  node scripts/kpi_leaf_422_guard.mjs \
  audit/bc4-kpi-parameters-tab/metrics-leaves-max-points-2000.json
```

Ce replay historique a trouvé 283 codes : 222 réponses 200 et 61 réponses
422. Ces 61 réponses ne sont plus admises. La correction et son replay final
sont documentés dans `CORRECTION.md` : 222 codes encore affichés, tous en 200,
aucun 422.

## Validation

Back ciblé dans l'image officielle :

```bash
pytest -q tests/test_catalog_analytics_tab.py \
  tests/test_catalog_cache.py tests/test_api_lean.py
```

Exit 0 : 11 tests passés. `compileall` et `git diff --check` : exit 0. Ruff
n'est installé ni sur l'hôte ni dans l'image ; les tentatives ont donc eu un
exit non nul et le verdict Ruff est NON EXÉCUTABLE, pas PASS.

Front ciblé :

```bash
npm test -- --run \
  src/test/kpi-parameters-classification.test.ts \
  src/test/kpi-parameters-ui.test.tsx \
  src/test/kpi-max-points.test.ts \
  src/test/bc2-catalog-v22.test.tsx
```

Exit 0 : 4 fichiers, 12 tests passés. `npm run build` : exit 0. Le lint ciblé
des fichiers modifiés : 0 erreur et 2 avertissements Fast Refresh déjà
présents dans `MetricGraphCard.tsx`. Prettier ciblé et `git diff --check` :
exit 0.

Contrôles globaux, tous signalés sans SKIP :

- `npm test -- --run` : exit 1, 84 fichiers passés, 3 en échec ; 417 tests
  passés et 2 en échec. Les trois écarts baseline sont le garde
  `BC2_METRICS_AUDIT`, le contrat historique opérateur inconnu et le mock de
  mot de passe Settings ; aucun ne touche ce lot.
- `npm run typecheck` : exit 2, 10 erreurs baseline dans AssistantMap, client,
  dictionary, fixtures, mocks/assistant et overview ; aucune erreur dans un
  fichier modifié par ce lot.
- `npm run lint -- --max-warnings=0` : exit 1, 2 948 problèmes globaux
  (2 890 erreurs, 58 avertissements), majoritairement Prettier hors lot.

## Commits back livrés avant le front

```text
8391386 [BC4] feat(catalog): classify KPI Analytics leaves
9f43e72 [BC4] fix(catalog): support ordered Analytics rollout
a99f649 [BC4] fix(catalog): enrich cached Analytics leaves
```

Le troisième commit enrichit en mémoire les anciennes entrées du cache Metrics
et ne modifie aucune donnée persistée.
