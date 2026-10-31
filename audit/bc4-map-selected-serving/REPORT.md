# BC4 — liaison serving du point sélectionné

Date UTC : 2026-10-31  
Pile : réseau `bc4a4-selected-serving`, DB restaurée dans
`bc4a4-selected-db-1`, API `0.118.2` sur `127.0.0.1:9182`, front
`1.126.11` sur `127.0.0.1:9183`.

## Cause et correctif

`DriveRsrpLayer` construisait la source GeoJSON avec tous les liens de tous
les points. `selectedSeq` ne modifiait que les propriétés de peinture. La
source est désormais vide sans sélection et contient au maximum la liaison
serving du triplet actif `project_id + capture_id + seq`.

Le clic sur le même point remet la sélection à `null`. Quand plusieurs
mesures partagent exactement le même fix GPS, le handler privilégie dans la
pile MapLibre la `seq` déjà active : le second clic désélectionne donc bien le
point au lieu de sélectionner arbitrairement une mesure superposée.

## Commandes et résultats

Tests ciblés :

```text
npm test -- --run src/test/drive-rsrp-active-serving-link.test.ts \
  src/test/drive-rsrp-link-layer-order.test.ts \
  src/test/measurement-point-popup.test.ts src/test/drive-rsrp.test.ts
Test Files 4 passed (4)
Tests 26 passed (26)
```

```text
npm run typecheck
exit=0

npm run build
exit=0
```

Comptage API (les preuves exactes utilisent `serving_cell_source` ou le
fallback `probable_serving_cell_ref_id`, comme le front) :

```text
GET /projects/43e81a34a073/metrics/map?capture_id=a4b0c321c52e&codes=cell_rsrp@lte-type-0
points=4935, serving=4436 (4435 probable + 1 proven), sans serving=499

GET /projects/43e81a34a073/metrics/map?capture_id=ecffb18dbd7f&codes=cell_rsrp@lte-type-0
points=199, serving proven=199, sans serving=0
```

Playwright (`/home/devmat/BC4/audit/bc4-map-selected-serving/
selected_link_e2e.mjs`) :

```text
Test_6 / a4b0c321c52e
initial=0
clic seq 331565 => 1 probable
clic autre point seq 169702 => 1 probable (ancienne supprimée)
second clic => 0
clic point sans serving => 0
/metrics/map = 1 appel HTTP 200

ikea.2 / ecffb18dbd7f
initial=0
clic seq 15650 => 1 proven
clic autre point seq 2701 => 1 proven (ancienne supprimée)
second clic => 0
/metrics/map = 1 appel HTTP 200

popup visible après sélection=true
erreurs JavaScript produit=0
```

Les erreurs console observées au zoom 22 sont exclusivement les refus CORS
des tuiles `tile.openstreetmap.org`; elles ne proviennent ni de l'application
ni de l'API.

Gardes jetables :

```text
python scripts/guards/run_all.py \
  --base-url http://127.0.0.1:8000 \
  --pid 43e81a34a073 --capture a4b0c321c52e --skip-g51

G18b PASS  exit=0
G24  PASS  exit=0
G24b PASS  exit=0
G32  PASS  exit=0
G56  PASS  exit=0
GUARDS VERDICT=PASS passed=5/5
```

La première restauration `pg_restore --clean` a fini avec `exit=1` uniquement
parce que l'image PostGIS précrée des extensions que `--clean` ne peut pas
supprimer dans cet ordre. `VERDICT=FAIL` pour cette commande isolée. La
restauration des tables a néanmoins continué; les comptages API, les tests
Playwright et les cinq gardes ci-dessus ont ensuite tous validé les données
restaurées sans écriture en production.
