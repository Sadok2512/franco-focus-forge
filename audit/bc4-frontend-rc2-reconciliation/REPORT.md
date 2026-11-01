# BC4 — Frontend RC2 reconciliation

Date UTC: 2026-11-01

## Lignée vérifiée

```bash
git rev-parse main origin/main github/main
# 27b96f9f069b9eb2b4290020b86613c6f7ad0f7a
# 27b96f9f069b9eb2b4290020b86613c6f7ad0f7a
# a6e885e2784dc797658af366612cfdc683ab0e55

git merge-base 27b96f9 7457a118
# 1276330...

git log --reverse --format='%h %s' 27b96f9..f88a272
# 9a48623 Changes
# 0ebee67 Changes
# 284223d Changes
# 648f452 Changes
# f88a272 Removed legend titles
```

Le `github/main` observé pendant le lot avait déjà avancé jusqu'à `a6e885e`; la
réconciliation reste volontairement bornée aux cinq commits explicitement
demandés, de `9a48623` à `f88a272`. Aucun des 17 commits postérieurs à
`f88a272` n'a été incorporé implicitement.

## Audit des cinq commits GitHub déclarés

Commande complète:

```bash
git show --stat --oneline 9a48623 0ebee67 284223d 648f452 f88a272
git show --format=fuller --no-ext-diff --no-renames 27b96f9..f88a272 -- \
  src/features/kpi/NetworkMapChrome.tsx
git diff --stat 27b96f9..f88a272
# 1 file changed, 4 insertions(+), 5 deletions(-)
```

| Commit | Contenu réel | Décision |
|---|---|---|
| `9a48623` | retire le titre `Technology` de la légende | écarté: régression de lisibilité |
| `0ebee67` | retire le titre `Bands` | écarté: régression de lisibilité |
| `284223d` | retire le titre `Symbols` | écarté: régression de lisibilité |
| `648f452` | retire la prop et le rendu `LegendRow.title` | écarté: rend irréversibles les trois suppressions précédentes |
| `f88a272` | merge des quatre changements précédents | aucun autre correctif à porter |

Ces commits ne corrigent ni build, ni typecheck, ni test. Ils suppriment les
libellés interactifs de `NetworkMapChrome`, en conflit direct avec la légende
déployée 1.126.14 et avec l'exigence de préserver Legend.

## Réconciliation

Branche: `bc4/frontend-rc2-reconciliation`, créée depuis `7457a118`.

```text
4d97d76 Merge production frontend into Superstream RC2
0b3f38b Fix KPI Analytics workspace lifecycle
2122307 Fix frontend audit blockers
f984152 Reconcile KPI map data ownership
8f27bc6 Remove stale KPI map popup state
```

Conflits résolus:

- `CHANGELOG.md`: conservation intégrale des entrées RC2, production et KPI.
- `package.json`: version candidate PATCH `1.128.1`.
- `_app.map.tsx`: route RC2 conservée pour la navigation `AnalysisScope` et la
  non-régression Map; arbre de routes régénéré par le build.
- `MetricsWorkspace.tsx`: conservation des réglages Workspace/Graph/Table/
  Legend, suppression du second propriétaire `DriveRsrpLayer` qui provoquait
  deux appels identiques à `/metrics/map`.
- `ProjectPage.tsx`: réducteur typé corrigé en effaçant explicitement
  `analysis_scope`, `capture_id`, `superstream_id` et `scope_revision` lors de
  l'ouverture KPI en mode projet simple.
- `abd3c81a` n'est qu'un commit de preuves du précédent audit: les preuves ont
  été régénérées sur la branche réconciliée au lieu de transporter ses fichiers.

## Tests statiques

```bash
npm run typecheck
# exit 0, 0 erreur

BC2_METRICS_AUDIT=/home/devmat/BC4/audit/front-bc1-metrics-contract-0.88.0 npm test
# Test Files 114 passed (114)
# Tests 521 passed (521)
# exit 0, aucun SKIP

npm run test:g55
# Test Files 1 passed (1)
# Tests 4 passed (4)

python3 /home/devmat/BC4/scripts/_guard_G36_disk.py \
  --path /home/devmat/BC4 --min-free-gib 20
# free_gib=89.59 threshold_gib=20 verdict=PASS

npm run build
# built, exit 0
```

## Backend RC2 et Playwright jetable

Pile: réseau/base/API/front `bc4a4-kpi-blockers-*`, ports loopback
`9382/9383`. Le candidat `bc4-back:rc2-0.120.0-54a5bb4` a appliqué uniquement
sur la copie jetable:

```text
0079_probable_cell_links -> 0080_superstream_ss01
/health: version=0.120.0, catalogue=2.60.0
CRUD=PASS ANALYSIS_SCOPE_NAV=PASS IF_MATCH=PASS
```

Map Serving, `cell_rsrp@lte-type-0`:

- Test_6 / `a4b0c321c52e`: 4 935 points, 4 436 liés; initial 0,
  sélection 1 probable pointillé, remplacement 1, désélection 0, point non lié
  0; exactement un appel `/metrics/map`, HTTP 200.
- ikea.2 / `ecffb18dbd7f`: 199 points, 199 liés; initial 0, sélection 1 proven
  plein, remplacement 1, désélection 0; exactement un appel `/metrics/map`,
  HTTP 200.
- Les erreurs de console restantes du banc Map proviennent exclusivement des
  tuiles publiques OSM aux zooms 21/22 (CORS/réseau), pas des API applicatives.

Task Bar:

- 69 tâches;
- fenêtre complète `0–4857.889 s`, zoom `0–30 s`, scroll `30–60 s`;
- sélection `HTTP_DL`, sélection nettoyée après changement de fenêtre;
- API gzip HTTP 200, aucune erreur API ou console.

KPI Workspace:

- 4 935 points;
- Sidebar restaurée;
- layouts 1/2/3/Auto = 1/2/3/2 panneaux;
- ordre Graph/Table conservé;
- un seul appel `/metrics/map` après réconciliation;
- aucun échec API ou console applicative.

Captures et rapports:

- `/home/devmat/BC4/audit/bc4-frontend-rc2-reconciliation/kpi/`
- `/home/devmat/BC4/audit/bc4-frontend-rc2-reconciliation/map-rc2-back/`
- `/home/devmat/BC4/audit/bc4-frontend-rc2-reconciliation/taskbar-rc2-back/`
- `/home/devmat/BC4/audit/bc4-frontend-rc2-reconciliation/superstream-rc2-back/`

## Verdict

`PASS`: la branche réconcilie RC2 avec la production 1.126.14 et les correctifs
KPI utiles, sans incorporer la suppression de légende de GitHub, sans merge
vers `main`, sans push et sans déploiement.
