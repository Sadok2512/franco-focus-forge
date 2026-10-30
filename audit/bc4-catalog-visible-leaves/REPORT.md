# BC4 — catalog-visible-leaves

## Périmètre et isolation

- Branche front : `bc4/catalog-visible-leaves`, worktree `front-a4`.
- Branche back : `bc4/catalog-visible-leaves`, worktree `back-a4`.
- Pile : `bc4a4-net`, `bc4a4-db`, `bc4a4-api`, `bc4a4-front`.
- API/front : `127.0.0.1:9182` / `127.0.0.1:9183`.
- Projet/capture : `43e81a34a073` / `a4b0c321c52e`.
- Dump identifié par contenu : `bc4_2026-10-30_0200.dump` contient Test_6.
- Aucune activation : la ligne courante de la base jetable reste `2.56.2`.
  L'API de preuve reçoit un override **mémoire** vers l'artefact 2.59.0.

Commande de contrôle après les preuves :

```sh
docker exec bc4a4-db psql -U bc4a4 -d bc4a4 -Atc \
  "SELECT version FROM catalog_release WHERE is_current=TRUE;"
# 2.56.2 ; EXIT=0 ; VERDICT: catalog DB unchanged (no activation)
```

## Artefact catalogue

```sh
BC4_DSN=postgresql+psycopg://bc4a4:***@127.0.0.1:9192/bc4a4 \
BC4_JWT_SECRET=*** ../bc4-back/.venv/bin/python \
  scripts/catalog/bootstrap_catalog_release.py --to 2.59.0 --from 2.58.0 \
  --transform visible-leaves --prepare-only
sha256sum app/kpi/catalog_release/catalog_2.59.0.json
# unmasked=61 ; database_write=FALSE
# 724c28eecde461965acf27bb92e1fb25dafdd0f55c2c8785a3252b5c4f64946d
```

La comparaison Python par `node_id` et `(code,event)` donne : feuilles
2.58.0 = 7713, feuilles 2.59.0 = 7713, perdues = 0, ajoutées = 0,
décisions changées = 61, `visible_series_supported` = 61, VERDICT PASS.

La liste exhaustive avec ancienne raison, nouvelle décision et statut HTTP
est dans `supported-61.tsv` (61 lignes, sha256
`b970c0c3c6c2a98c1e31dc192fa9dfb707b72f86a476c0424be8a5e29b262cea`).

## Arbre visible et G51

Commande de comptage sur la réponse 2.59.0 de Test_6 :

```sh
GET http://127.0.0.1:9182/projects/43e81a34a073/metrics
# leaves_total=7867
# leaves_selectable=297
# leaves_unavailable=7570
# Column not in decoder schema=6448
# No observations in project=274
```

Le compteur affiché par l'onglet est donc `Metrics · 297`, dérivé de
`nodes[node_type=leaf && selectable=true]`. Le front n'embarque aucune liste
de codes ni règle fondée sur un libellé.

```sh
BC4_FRONT_BASE=http://127.0.0.1:9183 \
BC4_API_CONTAINER=bc4a4-api BC4_PROJECT_ID=43e81a34a073 \
BC4_CAPTURE_ID=a4b0c321c52e BC4_AUDIT_EMAIL=bc4a4-test@local.invalid \
node scripts/kpi_leaf_422_guard.mjs \
  audit/bc4-catalog-visible-leaves/g51-visible-leaves.json
# LEAVES=283 STATUS={"200":283} FAILURES=0 VERDICT=PASS ; EXIT=0
```

Les 297 nœuds sélectionnables correspondent à 283 codes uniques. La jointure
des 61 décisions 2.59.0 avec G51 donne : présents = 61, HTTP 200 = 61,
manquants = 0, non-200 = 0, VERDICT PASS.

## Captures et non-régression RRC

```sh
BC4_FRONT_BASE=http://127.0.0.1:9183 BC4_API_CONTAINER=bc4a4-api \
node scripts/catalog_visible_leaves_evidence.mjs current
# CATALOG=2.59.0 TAB=Metrics · 297 DEFAULT=false ENABLED=true
# LEAF=rachi_rach_result SELECTABLE=true VERDICT=PASS ; EXIT=0
```

- `current/metrics-available-only.png` : interrupteur désactivé.
- `current/metrics-with-unavailable.png` : interrupteur activé, feuilles
  indisponibles grisées avec le design existant.
- `current/supported-leaf-open.png` : une des 61 feuilles ouverte.
- `baseline/rrc.png` : front 1.119.0 avant le lot.
- `current/rrc.png` : front du lot.

Contrat DOM RRC comparé par commande Python : titre `Paramètres RRC`, onglets
`Paramètres`, `Raw parameter`, `Templates`, même placeholder de recherche et
un onglet Templates dans les deux versions ; égalité stricte, VERDICT PASS,
EXIT=0. Le diff Git ne touche aucun composant RRC.

## Tests, build et sorties non nulles

```sh
python3 /home/devmat/BC4/scripts/_guard_G36_disk.py
# free_gib=185.66 threshold_gib=20 verdict=PASS ; EXIT=0

BC4_DSN=postgresql+psycopg://bc4a4:***@127.0.0.1:9192/bc4a4 \
BC4_JWT_SECRET=*** ../bc4-back/.venv/bin/pytest -q \
  tests/test_catalog_activation_guard.py tests/test_catalog_visible_leaves.py \
  tests/test_kpi_categorical_metrics.py
# 11 passed ; EXIT=0 ; VERDICT=PASS

npm test -- --run src/test/metrics-catalog-v6.test.tsx
# 3 passed ; EXIT=0 ; VERDICT=PASS

docker build -t bc4a4-api:dplus .
docker build -f Dockerfile.v2 -t bc4a4-front:dplus .
# EXIT=0 pour les deux builds
```

Sorties non nulles déclarées :

- `npm ci` : EXIT=1, car le dépôt utilise `bun.lock` sans `package-lock.json`.
  VERDICT : commande inadaptée ; le build de référence utilise bien
  `bun install --frozen-lockfile` et passe.
- `npm run typecheck` avec la résolution npm hors lock : EXIT=2 sur des erreurs
  préexistantes hors lot. VERDICT : non probant ; build Bun figé PASS.
- `bun test ...` direct : EXIT=1, mauvais runner sans jsdom. Puis
  `bun run test ...` dans l'image : EXIT=1 sur le double chargement Zod connu
  sous Bun/Vitest. VERDICT : harness Bun non probant ; Vitest Node ciblé PASS.
- Les premiers essais Playwright ont échoué sur synchronisation/sélecteur.
  VERDICT : harness corrigé ; exécution finale et assertions PASS.

SemVer déclaré : catalogue **MINOR 2.59.0**, front **MINOR**, back proposé
**MINOR** ; numéros applicatifs attribués par BC3.
