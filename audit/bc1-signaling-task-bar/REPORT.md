# BC1 — P0 Restore Signaling Timeline Task Bar

## ROOT_CAUSE

`616a208` a remplacé le chargement complet initial de
`/signaling/events` par `/signaling/timeline`, puis a désactivé la requête de
détail tant que la fenêtre visible couvre toute la capture
(`shouldLoadTimelineDetail()`). Le rendu des barres n'avait pas été supprimé,
mais l'overview ne renvoyait que `state_events` RRC/UE : les événements
`task_run` portant `attrs.track=dl|ul`, `t_rel_s` et `t_rel_end_s` ne
parvenaient donc plus au composant ECharts.

Audit en lecture seule de Test_6, capture `a4b0c321c52e` :

```sh
docker exec -i bc4-api-1 python - <<'PY'
# GET paginé /projects/43e81a34a073/signaling/events?view=rf&from_s=0&to_s=5000
# puis Counter(lane), Counter(attrs.track) et intervalles positifs
PY
```

Résultat : `23 398` événements RF en cinq pages ; `69` événements
`services/dl/HTTP_DL` possèdent une durée positive. Les données existaient :
la régression était le contrat incomplet de l'overview.

## LAST_WORKING_COMMIT

`70d32ce2768a7495736fb40e1949dbff42591fac`, parent immédiat de
`616a2088d2987333d79b91b3ed4b1dc45ca1fda5`. L'implémentation visuelle des
Task Bars avait été introduite et corrigée dans `1cc8443` ; elle existe encore
dans `RfTimeline.tsx` et n'a pas été redessinée.

## FIX_COMMIT

- Back : `83786b9b676945cbb01b79fab4a18b9d68067954` — ajoute à l'overview les
  seuls intervalles matérialisés DL/UL dans le champ additif `task_events`.
- Front : `6b229ed8a741efb2cdbf484b03bf696da77368b5` — fusionne états, tâches
  d'overview et détails de fenêtre par `id`, le détail remplaçant le doublon.

Le back est justifié : sans ce champ léger, le front doit recharger les
`23 398` événements complets pour dessiner `69` barres, ce qui annulerait le
lot de latence `616a208`. Aucun schéma SQL ni backfill n'est ajouté.

## TEST_RESULTS

```sh
docker run --rm -v <back-worktree>:/app -w /app \
  -e BC4_DSN=postgresql+psycopg://test:test@127.0.0.1:1/test \
  -e BC4_JWT_SECRET=test-only-secret bc4-api:0.118.2 \
  pytest -q tests/test_signaling_materialized.py
```

Résultat : `5 passed`, exit 0, aucun SKIP.

```sh
npm test -- --run src/test/signaling-timeline-loading.test.ts \
  src/test/signaling-time-window.test.ts src/test/signaling-cursor.test.ts \
  src/test/G55-front-contract.test.ts
npm run typecheck
```

Résultat : quatre fichiers, `32 passed`, puis typecheck exit 0, aucun SKIP.

Pile jetable : dump `bc4_2026-10-31_0200.dump` restauré dans
`bc1-taskbar-db`, API `0.118.3` sur `:9183`, front `1.126.12` sur `:5183`.
Par le proxy avec `Accept-Encoding: gzip` :

| Capture | task_events | Durées positives | Ordre canonique | TTFB |
|---|---:|---:|---|---:|
| `a4b0c321c52e` | 69 | 69 | oui | 0,462 s |
| `ecffb18dbd7f` | 3 | 3 | oui | 0,038 s |
| `daa2b1df250d` | 3 | 3 | oui | 0,040 s |

Playwright jetable : fenêtre complète `0–4857,889 s`, reset `0–30 s`, pan
`30–60 s`, clic sur la barre sélectionnant `HTTP_DL`, sélection nettoyée au
pan, réponses timeline/détail gzip, aucune erreur API ou console.

## SCREENSHOT

- `/home/devmat/BC4/audit/bc1-signaling-task-bar/disposable/taskbar-zoom-0-30.png`
- `/home/devmat/BC4/audit/bc1-signaling-task-bar/disposable/taskbar-selected.png`
- Rapport machine :
  `/home/devmat/BC4/audit/bc1-signaling-task-bar/disposable/report.json`

## Versions et verdict avant déploiement

- Front : **1.126.12 PATCH**.
- Back : **0.118.3 PATCH**, champ HTTP additif uniquement.
- VERDICT : pile jetable PASS, prêt pour déploiement sous DEPLOY_LOCK.
