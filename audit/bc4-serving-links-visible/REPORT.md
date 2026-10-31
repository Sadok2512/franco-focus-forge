# BC4 — liens serving visibles

Date UTC : 2026-10-31  
Branche : `bc4/serving-links-visible`  
SemVer déclaré : front **PATCH 1.126.9**, après la base 1.126.8 de BC3

## Diagnostic public, lecture seule

Le navigateur piloté n'effectue que le login puis des navigations/GET sur
`http://185.248.33.125:5174`. Il ne touche ni Docker ni la base de production.
Le mot de passe est lu depuis un fichier `0600` et n'est jamais affiché.

```sh
BC4_FRONT_BASE=http://185.248.33.125:5174 \
BC4_AUDIT_EMAIL=admin@bc4.local \
BC4_AUDIT_PASSWORD_FILE=/home/devmat/BC4/.secrets/admin_pw \
node scripts/serving_links_public_audit.mjs
# exit 0
```

La production est passée de 1.126.7 à 1.126.8 pendant la passation BC3 ; le
second relevé public, conservé ici, affiche donc 1.126.8. Le comportement et
les expressions MapLibre observés restent ceux de 1.126.7.

| capture | carte | réponse reçue | contenu serving reçu | couche montée avant clic | interrupteurs |
|---|---|---|---:|---|---|
| `a4b0c321c52e` | Map | `/metrics/table`, 200, 4 935 points | 1 exact + 4 435 `probable_serving_*` | oui, mais 1 serving consommé | 3/3 ON |
| `a4b0c321c52e` | Signaling | `/metrics/table`, 200, 4 935 points | 1 exact + 4 435 `probable_serving_*` | oui, mais 1 serving consommé | 3/3 ON |
| `a4b0c321c52e` | KPI | `/metrics/map`, 200, 4 935 points | 1 exact + 4 435 `probable_serving_*` | oui, mais 1 serving consommé | 3/3 ON |
| `ecffb18dbd7f` | Map | `/metrics/table`, 200, 199 points | 199 exacts | oui, 199 | 3/3 ON |
| `ecffb18dbd7f` | Signaling | `/metrics/table`, 200, 199 points | 199 exacts | oui, 199 | 3/3 ON |
| `ecffb18dbd7f` | KPI | `/metrics/map`, 200, 199 points | 199 exacts | oui, 199 | 3/3 ON |

Les champs exacts n'ont pas de propriété littérale `confidence` dans ces
réponses : `serving_cell_source=chi_previous_seq_cell_ref_exact` constitue la
preuve `proven`. Sur la grande capture, les candidats sont explicitement
séparés sous `probable_serving_cell_ref_id`, `probable_serving_cell_lat/lng`,
PCI, site et distance ; ils constituent la preuve `probable`.

Les lignes ne sont pas conditionnées au clic : les couches sont déjà visibles
et MapLibre déclare des segments rendus avant clic. En revanche la production
les dessine à 1,5 px / opacité 0,55, en bleu sombre ; après sélection seulement,
la ligne choisie passe à 3 px / opacité 1. Les captures *before-click* montrent
que ces 199 lignes exactes ne sont pas lisibles sur le fond.

Rapport machine :
[`public-before/report.json`](public-before/report.json).
Captures avant clic :
[`Map a4`](public-before/a4b0c321c52e-map-before-click.png),
[`Signaling a4`](public-before/a4b0c321c52e-signaling-before-click.png),
[`KPI a4`](public-before/a4b0c321c52e-kpi-before-click.png),
[`Map proven`](public-before/ecffb18dbd7f-map-before-click.png),
[`Signaling proven`](public-before/ecffb18dbd7f-signaling-before-click.png),
[`KPI proven`](public-before/ecffb18dbd7f-kpi-before-click.png).

## Cause

Deux défauts se cumulent :

1. `src/lib/api/metrics-schemas.ts:294-341` ne déclarait que
   `serving_cell_*`. Zod supprimait donc les huit champs
   `probable_serving_*` du back 0.118.1.
2. `src/features/kpi/measurement-point-popup.ts:97-127` ne construisait un
   serving qu'à partir de `serving_cell_source/serving_link_confidence` et de
   `serving_cell_lat/lng`. Les 4 435 candidats API n'atteignaient jamais la
   source GeoJSON.
3. Les styles dupliqués dans `DriveRsrpLayer.tsx:325-370` et
   `MetricsWorkspace.tsx:277-317` utilisaient 1,5 px / 0,55 ; la sélection
   seule utilisait 3 px / 1. Sur le fond cartographique, les exactes étaient
   techniquement rendues mais visuellement perdues.

## Correctif

- Le schéma conserve le contrat `probable_serving_*` de 0.118.1.
- Un candidat probable n'est utilisé que si son `cell_ref_id` et ses deux
  coordonnées API sont présents ; il reste toujours pointillé et n'est jamais
  promu en `proven`.
- Map et Signaling chargent le même `/metrics/map` que KPI. Le lourd endpoint
  table n'est lancé qu'en repli si un ancien décodage renvoie zéro point map.
- Style commun aux trois cartes : cyan/ambre/magenta, 2,75 px et opacité 0,9
  dès l'ouverture ; 5 px / 1 au clic ; autres lignes atténuées à 0,32 pendant
  la sélection ; probable pointillé `[3,2]`.
- Les trois interrupteurs restent activés par défaut et indépendants.

## Preuves jetables

Pile : réseau `bc4a4-serving-net`, base restaurée du dump
`exports/bc4_2026-10-31_0200.dump`, API 0.118.1 sur `9182`, front construit
localement sur `9183`, secret JWT généré pour le conteneur et compte de test.

Comptage direct de la réponse de la pile :

```text
a4b0c321c52e 200 4935 canonical=1 probable=4435
ecffb18dbd7f 200 199  canonical=199 probable=0
```

Audit navigateur final : chaque combinaison capture × Map/Signaling/KPI émet
exactement un `/metrics/map` 200 ; les trois interrupteurs valent `true` avant
clic. Les panneaux affichent 4 436 liens serving sur `a4b0c321c52e` (1 plein +
4 435 pointillés) et 199 pleins sur `ecffb18dbd7f`. Un clic est réussi sur les
six cartes et produit une capture distincte avec fiche + ligne renforcée.

Rapport machine :
[`disposable-after/report.json`](disposable-after/report.json).
Captures sans clic :
[`Map a4`](disposable-after/a4b0c321c52e-map-before-click.png),
[`Signaling a4`](disposable-after/a4b0c321c52e-signaling-before-click.png),
[`KPI a4`](disposable-after/a4b0c321c52e-kpi-before-click.png),
[`Map proven`](disposable-after/ecffb18dbd7f-map-before-click.png),
[`Signaling proven`](disposable-after/ecffb18dbd7f-signaling-before-click.png),
[`KPI proven`](disposable-after/ecffb18dbd7f-kpi-before-click.png).
Les six fichiers `*-after-click.png` du même dossier prouvent la fiche et la
mise en évidence.

## Vérifications

```sh
npx vitest run src/test/measurement-point-popup.test.ts \
  src/test/metrics-map-probable-serving.test.ts \
  src/test/metric-map-view.test.tsx src/test/drive-rsrp.test.ts \
  src/test/drive-rsrp-map-gps.test.tsx src/test/signaling-drive-rsrp.test.tsx
# 6 fichiers, 36 tests PASS, exit 0

npx eslint <fichiers modifiés>
# 0 erreur ; 4 avertissements Fast Refresh préexistants dans MetricsWorkspace

npm run typecheck
# 0 erreur, exit 0 (après rebase sur main 1.126.8)

python3 /home/devmat/BC4/scripts/_guard_G36_disk.py \
  --path /home/devmat/BC4 --min-free-gib 20
# free_gib=121.77 threshold_gib=20 verdict=PASS, exit 0

docker build -f Dockerfile.v2 -t bc4a4-front:serving-links-visible .
# client + SSR + Nitro PASS, exit 0
```

## Déploiement

En attente de la libération du lock BC3 et de
`/home/devmat/BC4/DEPLOY.md`. Aucune action de production ne sera effectuée
avant ces deux conditions.
