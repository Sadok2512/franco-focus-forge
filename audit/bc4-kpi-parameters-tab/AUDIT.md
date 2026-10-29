# Audit avant implémentation — KPI / Metrics / Parameters

Projet : Test_6 (`43e81a34a073`). La commande ne journalise jamais le JWT :

```bash
BC4_FRONT_BASE=http://127.0.0.1:5174 \
  node scripts/kpi_parameters_audit.mjs \
  audit/bc4-kpi-parameters-tab/audit-live-2.56.2.json
```

La sortie complète, notamment la liste des feuilles ambiguës par `node_id`,
`metric_id`, `selection`, `event` et `source_column`, est jointe dans
`audit-live-2.56.2.json`.

## Verdict catalogue

- `/kpi/catalog` : 197 feuilles. Le champ `nature` donne 47
  `Calculated KPI`, 58 `Counter`, 92 `Measured metric`.
- `/metrics` release 2.56.2 : 7 867 feuilles, 7 867 `node_id` uniques,
  zéro `analytics_tab`.
- Ancien ensemble, identités préfixées par leur source : 8 064 feuilles.
  Partition cible : 105 KPI et 7 959 Metrics, somme 8 064.
- Ambiguïtés initiales : les 7 867 feuilles `/metrics`, toutes listées dans
  le JSON joint. Aucun libellé n'est utilisé pour les départager.

Le champ manque donc bien à la release 2.56.2. Le lot back prépare 2.57.0
MINOR via :

```bash
python3 scripts/catalog/bootstrap_catalog_release.py \
  --version 2.57.0 --from-version 2.56.2 --prepare-only
```

Cette commande crée/valide l'artefact sans ouvrir de connexion DB. L'activation,
non exécutée dans ce lot, reste une commande distincte.

## Réutilisation RRC Dictionary

Composants réutilisés sans copie de rendu : `TreePanel`, `CatalogTree`,
`RawTreeView`, `ValueExplorer`, `GroupedValueTable`, `SelectedParameterInfo`.
`TreePanel` garde `Templates` par défaut ; KPI Analytics lui passe seulement
`showTemplates=false`.

Routes appelées :

- `GET /projects/{id}/dict/v2/tree?view=catalog|raw` ;
- `GET /projects/{id}/dict/v2/distribution` ;
- `GET /projects/{id}/dict/v2/param/{param_key}`.

La commande jointe compte 579 paramètres agrégés, 799 feuilles message en vue
Paramètres, 6 564 feuilles Raw, et 1 101 clés distinctes dans chaque vue. Les
deux pages utilisent `dictTreeQuery`, donc la clé React Query est identique.
