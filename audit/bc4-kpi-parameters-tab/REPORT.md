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

## Rebase post-0.104.0

Le lot a été rebasé sans `--skip` sur les deux `main` courants :

```text
back  aa7b08e  (inclut ec39f82 / garde catalogue 0.104.0)
front a4c3255  (post bc1/proxy-compression)
```

La CLI fusionnée conserve intégralement le chemin protégé par
`guard_bc3_deploy_lock` et ajoute les alias `--from/--to` aux options
`--from-version/--version`. Le mode par défaut et `--prepare-only` ne créent
aucune session SQL. `prepare_analytics_minor` ne produit que l'artefact disque.

Preuves sur le réseau et la base jetables `bc4a4-kpi-net` / `bc4a4-db` :

```text
sans DEPLOY_LOCK       exit 1, rows 1 -> 1, version active 0.0.0  PASS
holder=BC4             exit 1, rows 1 -> 1, version active 0.0.0  PASS
holder=BC3 --activate  exit 0, rows 1 -> 2, version active 2.57.0 PASS
--from/--to prepare    exit 0, rows 2 -> 2                       PASS
tests garde            7/7                                      PASS
tests back ciblés      12/12                                    PASS
tests front ciblés      8/8                                     PASS
```

La régénération de 2.57.0 conserve le SHA-256 pré-rebase :

```text
6e26c529d20253f1998e0687f7e3b9bbabd36b9d24f762cca51478a509d76c7f
```

La pile `bc4a4-*` a ensuite été détruite. Aucun réseau, port, DSN, secret ou
conteneur de production n'a été utilisé.

Les contrôles globaux restent non verts pour des dettes hors lot, sans SKIP :
`typecheck` exit 2 (10 erreurs opérateurs/fixtures existantes) et ESLint
global exit 1 (2 839 erreurs historiques, principalement anciens audits).

## Commits back

```text
c278c98 feat(catalog): classify KPI Analytics leaves
f1c43eb fix(catalog): support ordered Analytics rollout
18c4777 fix(catalog): enrich cached Analytics leaves
f27578b fix(catalog): remove unsupported Analytics series
```

- `c278c98` introduit le contrat `analytics_tab`, la préparation 2.57.0 et la
  CLI fusionnée avec le garde 0.104.0.
- `f1c43eb` permet le déploiement du code avant activation du catalogue.
- `18c4777` enrichit en mémoire les payloads cache anciens, sans écriture
  persistée.
- `f27578b` encode les 61 décisions `visible=false`, la règle de contenu et
  le garde d'exposition des feuilles.

L'activation de 2.57.0 en production reste exclusivement à BC3.

## Audit cartes — cohérence Map / Signaling / KPI Analytics

Audit de lecture réalisé sur le front servi en `1.124.0`, projet Test_6
`43e81a34a073`, capture `a4b0c321c52e`. Les captures ont été obtenues avec
un JWT éphémère généré dans le conteneur API, sans lecture ni essai de mot de
passe ; le navigateur n'a effectué que des lectures.

### Inventaire des implémentations et couches

| Page | Composition réelle | Bibliothèque | Couches propres à la page |
|---|---|---|---|
| Map | `src/features/map/MapWorkspacePage.tsx` → `KpiMapOSM workspace` → `NetworkMapChrome`, `SitesLayer`, `DriveRsrpLayer` | MapLibre GL v6 | fonds OSM/satellite, sites, cellules/secteurs GEOREF, labels, couverture Drive RSRP, liens RSRP → cellule serveuse prouvée |
| Signaling | `SignalMap` dans `src/features/signaling/SignalingPage.tsx:740` → `KpiMapOSM workspace`, avec `DriveRsrpLayer` | MapLibre GL v6 | trajet GPS, marqueurs d'événements, point sélectionné, couverture Drive RSRP, liens serveurs prouvés, plus sites/cellules partagés |
| KPI Analytics | `MetricMap` dans `src/features/kpi/MetricsWorkspace.tsx:180` → `KpiMapOSM` **sans** `workspace` | MapLibre GL v6 | points `metrics-v3` colorés par valeur et légende min/max ; sites/cellules via le petit `SitesLayerControls`, sans chrome partagé |

Le socle cartographique est donc déjà commun (`KpiMapOSM`), mais son contrat
d'outils ne l'est pas : `KpiMapOSM.tsx:101-117` choisit
`NetworkMapChrome` seulement avec `workspace=true`, sinon
`SitesLayerControls`. Map et Signaling passent `workspace`; KPI ne le passe
pas (`MetricsWorkspace.tsx:246-263`).

### Matrice des outils réellement disponibles

`✓` présent, `—` absent, `partiel` présent avec une autre sémantique que son
libellé attendu.

| Outil | Map | Signaling | KPI Analytics |
|---|:---:|:---:|:---:|
| Sites / Cells | ✓ / ✓ | ✓ / ✓ | ✓ / ✓, dans le panneau compact |
| filtres 4G, 5G NR, LTE, bandes, opérateurs | ✓ | ✓ | ✓ |
| recherche site/cellule/PCI/coordonnées | ✓ | ✓ | — |
| plein écran | ✓ | ✓ | ✓ |
| zoom + / − | ✓ | ✓ | ✓, contrôle MapLibre standard |
| « me localiser » | partiel | partiel | — |
| mesure de distance | ✓ | ✓ | — |
| tracé de surface | ✓ | ✓ | — |
| sélection | ✓ | ✓ | partiel : popup point/site/cellule seulement |
| barre basse Sites / Cells / zoom / échelle | ✓ | ✓ | — |
| choix du fond cartographique | ✓ | ✓ | — |

Le bouton à icône `LocateFixed` de Map/Signaling recentre sur le centre fourni
par la page (`onRecenter`/`flyTo`) ; il n'appelle pas l'API de géolocalisation
du navigateur. Il ne faut donc pas le présenter comme une localisation de
l'utilisateur tant que `navigator.geolocation` n'est pas câblé.

### Légendes et réglages visuels

- Map et Signaling ont la légende réseau de `NetworkMapChrome.tsx:205-237` :
  technologies, bandes actives, couleurs opérateur et symboles site/secteur.
  `BeamDisplayControls` règle la taille et l'intensité des secteurs.
- KPI Analytics a seulement la légende de métrique
  `MetricsWorkspace.tsx:256-262`, une rampe fixe de cinq couleurs entre le
  minimum et le maximum des points. Le rayon des points est codé en dur à
  `3` et l'opacité à `0.86` (`MetricsWorkspace.tsx:161-175`) : aucun réglage
  de couleur ou de taille des points n'est exposé. Les réglages de beam du
  panneau Sites ne modifient pas les points de mesure.
- La capture KPI prise douze secondes après l'ouverture du workspace montre
  `mapCards=1`, `busy=1`, `legend=0` : la carte entière est conditionnée par
  la fin de `/metrics` (`MetricsWorkspace.tsx:277-284`). Tant que cette requête
  attend, ni fond, ni cellules, ni légende ne sont montés. C'est la cause
  directe du rendu vide observé, indépendamment du contenu de `cell_ref`.

Commande de capture KPI bornée (`page.waitForTimeout(12000)` avant lecture de
l'état) :

```text
timeout 60s node --input-type=module <script Playwright de l'audit>
{
  "legend": 0,
  "mapCards": 1,
  "busy": 1,
  "alerts": [],
  "pageErrors": []
}
VERDICT_RC=0
```

Captures et empreintes (`sha256sum audit/bc4-kpi-parameters-tab/maps-audit/*.png`) :

```text
15557d3cfacd6103dc68ba90a2577a45fd8bfab79002106c6b601738fcc51330  kpi-analytics.png
8c0e7daeb4fe1771f7d321fe3066dd0282070102e3bace60a97fa9d65b90a716  map-page.png
24d4ed6f583f3bee8b927ea6c72028e69fd6716167ba75b0fac78dde218ba6c2  signaling.png
```

### Cellules et liens point → cellule

Le constat historique « `cell_ref` est vide depuis la purge » est **fermé**
pour l'état audité. Requête exécutée dans une transaction read-only :

```sql
BEGIN READ ONLY;
SELECT count(*) AS cell_ref_rows,
       count(*) FILTER (WHERE geom IS NOT NULL) AS cell_ref_with_geom
FROM cell_ref;
COMMIT;
```

```text
cell_ref_rows=458211
cell_ref_with_geom=457845
VERDICT=FERMÉ — le référentiel n'est plus vide.
```

La capture Map montre des sites et secteurs réels ; la capture Signaling
montre également les compteurs Sites/Cells. La carte KPI n'atteint pas le
montage de `SitesLayer`, donc son absence de cellules ne prouve pas une absence
de données.

Un lien exact existe déjà dans `DriveRsrpLayer.tsx:174-202` et est utilisé par
Map et Signaling. Le back construit dans `app/kpi/metrics_v3.py:892-953` les
champs `serving_cell_id`, `serving_cell_seq`, `serving_cell_ref_id`,
`serving_site_id/name`, `serving_cell_lat/lng` et
`serving_cell_source=chi_previous_seq_cell_ref_exact`. La preuve est stricte :
dernier CHI LTE précédent dans **la même capture**, ordre canonique par `seq`,
puis égalité exacte `CHI Cell ID = cell_ref.eci`; aucune proximité ou PCI seul.
Le schéma front accepte déjà ces champs dans
`src/lib/api/metrics-schemas.ts:294-311`.

Ce lien n'est pas réutilisé par la couche KPI `metrics-v3` :
`metricMapFeatures()` ne conserve que `tooltip`, `code` et `value`
(`MetricsWorkspace.tsx:136-150`). C'est un écart front fermé par le code, pas
un manque du contrat serving.

Les identités voisines observées existent aussi :

```sql
BEGIN READ ONLY;
SELECT count(*) AS observed_identity_rows,
       count(*) FILTER (
         WHERE cell_arfcn IS NOT NULL AND cell_pci IS NOT NULL
       ) AS with_arfcn_pci,
       count(DISTINCT (system, cell_arfcn, cell_pci)) FILTER (
         WHERE cell_arfcn IS NOT NULL AND cell_pci IS NOT NULL
       ) AS physical_identities
FROM nmf_cell_identity
WHERE project_id = '43e81a34a073'
  AND capture_id = 'a4b0c321c52e';
COMMIT;
```

```text
observed_identity_rows=58605
with_arfcn_pci=58605
physical_identities=479
```

En revanche, le contrat `map_points` ne fournit aucune liste de voisines ni
d'ancre NR avec `cell_ref_id` et géométrie. `nmf_cell_identity` prouve
`(system, ARFCN, PCI)` au `seq`, mais ne suffit pas à choisir sans ambiguïté
une ligne géographique de `cell_ref`. Manquent donc, pour tracer ces liens :

- une association back prouvée et versionnée mesure → cellule voisine réelle ;
- une association back prouvée vers l'ancre NR ;
- pour chaque cible, son identifiant de référence, sa géométrie et la règle de
  preuve ;
- l'exposition de ces cibles dans `map_points` sans approximation par distance.

### Gravité, cause et taille estimée

| Écart | Gravité | Cause par le contenu | Taille estimée |
|---|---|---|---|
| Carte KPI vide et cellules invisibles pendant le chargement | Haute | `MetricMap` n'est monté qu'après la réponse complète `/metrics`; la capture reste `aria-busy` sans fond ni outils | M |
| Outils différents dans KPI | Haute | KPI appelle `KpiMapOSM` sans `workspace`, donc reçoit `SitesLayerControls` au lieu de `NetworkMapChrome` | M |
| Légende/réglage des points KPI incomplets | Moyenne | rampe et rayon codés en dur, aucun état partagé de présentation des mesures | S–M |
| Lien serving absent de KPI | Haute | le back l'envoie déjà, mais `metricMapFeatures()` supprime les champs et aucune couche de lignes n'est installée | M |
| Liens voisins et ancre NR absents | Haute | identité radio observée disponible, mais aucune association géographique prouvée dans le contrat back | L |
| « Me localiser » ambigu | Moyenne | recentrage métier, aucune géolocalisation navigateur | S |

Les tailles sont relatives : S = adaptation locale, M = plusieurs composants
front et gardes, L = contrat back + front + migration/rattrapage éventuel.

### Architecture proposée

Conserver un seul moteur et rendre son contrat explicite :

```text
SharedNetworkMap (MapLibre + sources de base)
├── NetworkMapChrome (toujours identique sur les trois pages)
├── SitesCellsLayer (sites, secteurs, labels, filtres et sélection)
├── slots de légendes/couches métier
│   ├── Map : DriveRsrpLayer + ServingLinks
│   ├── Signaling : trajet + événements + sélection + DriveRsrpLayer
│   └── KPI : MetricPointsLayer + MetricLegend + ServingLinks
└── état partagé de présentation (fond, sites/cells, techno, bandes,
    recherche, plein écran, zoom, mesure, sélection, taille/intensité)
```

`KpiMapOSM` peut devenir ce `SharedNetworkMap` sans nouvelle bibliothèque ni
refonte visuelle. La première étape est de faire utiliser `workspace`/le chrome
commun à `MetricMap`, tout en gardant sa légende métrique dans un slot. La
seconde est d'extraire `ServingLinks` de `DriveRsrpLayer` afin de le réutiliser
sur la couche KPI. Les couches Signaling et KPI restent spécifiques et ne
doivent jamais polluer les requêtes ou sélections des autres pages.

### Incidents de commande déclarés

- Première requête SQL : `exit 1`, identifiant alphanumérique mal échappé ;
  aucune écriture. VERDICT : commande invalide, corrigée avec un heredoc SQL.
- Deuxième requête SQL : `exit != 0`, colonne `arfcn` inexistante ; transaction
  read-only annulée. VERDICT : schéma relevé via `information_schema`, colonne
  correcte `cell_arfcn`, contrôle final PASS.
- Première capture KPI : `exit 1`, locator Playwright ambigu entre plusieurs
  feuilles RSRP. VERDICT : automatisation invalide, aucun impact applicatif.
- Deuxième capture KPI : délai atteint en attendant une légende jamais montée.
  VERDICT : écart reproduit. La capture finale utilise le contrat URL du
  workspace et se termine avec `VERDICT_RC=0`.
