# Correction BC4 — feuilles 422 et classement 2.57.0

## Décision sur les 61 codes

Le replay initial a trouvé 61 codes en 422 : 3 avec
`categorical_transitions_exceed_max_points` et 58 avec `unknown_metric`.
Aucun 422 n'est désormais accepté. Les 61 décisions sont inscrites dans
`catalog_2.57.0.json`, champ `analytics_series_decisions`, avec `code`,
`event`, raison originale, `visible=false` et décision
`removed_until_series_supported`.

La liste exhaustive et directement vérifiable est jointe dans
`catalog-2.57.0-decisions.json`. Commande :

```bash
python3 scripts/catalog/audit_analytics_release.py \
  --version 2.57.0 \
  --output ../front-a4/audit/bc4-kpi-parameters-tab/catalog-2.57.0-decisions.json
```

Les 61 codes suppriment 77 nœuds dans l'arbre Test_6, car certains codes sont
présents sous plusieurs branches. C'est nécessaire : `/metrics/series`
consomme le code sans discriminateur d'événement.

## Règle par contenu

`bootstrap_catalog_release.py` écrit les champs suivants sur chaque feuille :

- `analytics_tab=kpi` et `analytics_classification=computed_from_events` si
  `analytics_computation=event_derived` ;
- `analytics_tab=metrics` et `analytics_classification=message_measurement`
  si le champ structurel `event` est présent ;
- sinon `analytics_tab=metrics` et
  `analytics_classification=ambiguous_defaults_to_metrics`.

Le champ `label` n'est jamais lu. La règle elle-même et la liste résiduelle
sont sérialisées dans `analytics_classification_policy`.

Commande catalogue :

```bash
python3 scripts/catalog/bootstrap_catalog_release.py \
  --version 2.57.0 --from-version 2.56.2 --prepare-only
```

Sortie : `kpi=0 metrics=7713 residual_ambiguous=27 series_removed=61`.
Les 7 713 feuilles baked 2.56.2 sont des champs bruts ; les KPI calculés sont
les 105 feuilles calculées/compteurs de `/kpi/catalog`.

Ambiguïtés résiduelles, classées Metrics par fallback :

```text
lf_capture_device_battery_charge
lf_capture_device_battery_status
lf_capture_device_battery_temperature
lf_capture_device_device_battery_current
lf_capture_device_device_battery_voltage
lf_capture_device_device_cpu_temperature
lf_capture_file_decode_level
lf_capture_file_decoder_version
lf_capture_file_device_name
lf_capture_file_file_format_version
lf_capture_file_file_size
lf_capture_file_log_file_name
lf_capture_file_measurement_id
lf_capture_file_measurement_start
lf_capture_file_project_id
lf_capture_file_session_id
lf_capture_file_unit_id
lf_capture_identity_subscriber_identity
lf_capture_script_number_of_commands_in_test_script
lf_capture_script_test_script_file
lf_capture_script_test_script_repeats
lf_capture_script_test_script_version
lf_capture_task_command_duration
lf_capture_task_test_script_command_arguments
lf_capture_task_test_script_command_index
lf_capture_task_test_script_command_name
lf_capture_task_test_script_command_result
```

## Preuves Test_6 par `:5174`

```bash
BC4_FRONT_BASE=http://127.0.0.1:5174 \
  node scripts/kpi_parameters_audit.mjs \
  audit/bc4-kpi-parameters-tab/audit-after-correction-5174.json
```

Exit 0 : KPI 105, Metrics 7 882, union 7 987, uniques 7 987, champ manquant
0, ambiguïté d'API 0.

```bash
BC4_FRONT_BASE=http://127.0.0.1:5174 \
  node scripts/kpi_leaf_422_guard.mjs \
  audit/bc4-kpi-parameters-tab/metrics-leaves-after-correction-5174.json
```

Exit 0, VERDICT PASS : 225 feuilles affichées et sélectionnables, 222 codes
uniques testés, 222 réponses 200, 0 réponse 422 et 0 échec. Le script énumère
désormais directement `nodes[]` et n'accepte plus que 200.

```bash
BC4_FRONT_BASE=http://127.0.0.1:5174 \
  node scripts/kpi_parameters_evidence.mjs after-correction-5174
```

Les captures des trois onglets et d'une feuille par onglet sont jointes sous
`after-correction-5174/`. `network.json` prouve notamment la série
`cell_rsrp@lte-type-0` en 200 avec `max_points=2000`.

## SemVer back et commits existants

Type SemVer back : **MINOR**, numéro final attribué par BC3. Le catalogue est
le MINOR **2.57.0**.

- `8391386` ajoute le premier contrat `analytics_tab`, prépare 2.57.0,
  l'expose dans les schémas/routes et ajoute les tests/changelogs.
- `9f43e72` rend le code déployable avant l'activation 2.57.0 en donnant le
  fallback Metrics aux releases antérieures sur la construction à froid.
- `a99f649` enrichit en mémoire les payloads déjà présents dans le cache, sans
  mutation persistée, afin que le rollout ordonné ne renvoie pas `null`.

La correction courante remplace le classement initial trop général de
`8391386` par la règle de contenu et ajoute les décisions de visibilité.
