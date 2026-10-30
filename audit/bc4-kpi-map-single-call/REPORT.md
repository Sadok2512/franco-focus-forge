# BC4 — kpi-map-single-call

## Verdict

PASS. SemVer front déclaré : **PATCH** ; numéro attribué par BC3.

La carte KPI appelle désormais une seule fois
`GET /projects/{pid}/metrics/map`. Le préchargement démarre dès l'intention
sur l'item Map et React Query fait adopter au panneau la même promesse : aucun
second appel au montage.

## Pile et donnée témoin

Pile isolée : réseau, volume, base, API et front `bc4a4-mapcall-*`, ports
`9182/9183`, dump `exports/bc4_2026-10-30_0200.dump`. L'API témoin répond
`version=0.115.0`.

Le dump de 02:00 précédait le backfill `nmf_cell_identity`. La donnée témoin
a été remise au niveau 0.109.0 uniquement dans la base jetable, sans décode :

```sh
docker exec bc4a4-mapcall-api python -c \
  "from app.db import SessionLocal; from app.kpi.cell_identity import materialize_project; db=SessionLocal(); print(materialize_project(db,'43e81a34a073',capture_id='a4b0c321c52e')); db.close()"
# stored=58605, incomplete_identity=0

docker exec bc4a4-mapcall-db psql -U bc4a4 -d bc4a4 -Atc \
  "select count(*),count(*) filter(where cell_arfcn is null or cell_pci is null) from nmf_cell_identity where project_id='43e81a34a073' and capture_id='a4b0c321c52e';"
# 58605|0
```

Contrat back fourni, vérifié sur la pile :

```sh
python3 - <<'PY'
import requests,time,hashlib,json
b='http://127.0.0.1:9182'
t=requests.post(b+'/auth/login',json={'email':'bc4a4-mapcall@example.test','password':'bc4a4-mapcall-disposable-password'}).json()['token']
r=requests.get(b+'/projects/43e81a34a073/metrics/map',params={'capture_id':'a4b0c321c52e','codes':'cell_rsrp@lte-type-0'},headers={'Authorization':'Bearer '+t})
p=r.json()['map_points']
print(r.status_code,len(p),hashlib.sha256(json.dumps(p,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest())
PY
# 200 4935 476865ace2e55f283b9365e92067f0f41061cf14e92fdb3e12807f43e08583a2
```

## Avant / après par le même chemin

Chaque mesure part d'un navigateur neuf ; base et API sont redémarrées avant
chaque passage. Le début est le moment où le panneau Map devient visible, pas
l'attente Playwright précédant la distribution du clic.

```sh
node scripts/kpi_map_single_call_evidence.mjs before
# panelToRenderedMs=1604 renderedPoints=4935 mapRequestCount=6 VERDICT=PASS

node scripts/kpi_map_single_call_evidence.mjs after
# panelToRenderedMs=579 renderedPoints=4935 mapRequestCount=1 VERDICT=PASS
```

Les réponses détaillées (URL, octets, durée et points) sont dans
`before/report.json` et `after/report.json`. Avant : une sonde de 25 points,
puis cinq pages de 987 points. Après : une réponse de 2 665 709 octets,
4 935 points, durée réseau 1 170 ms ; le rendu depuis le panneau ouvert prend
579 ms, donc la cible `< 1 500 ms` est tenue.

Identité du contenu consommé par le front :

```sh
python3 - <<'PY'
import json
b=json.load(open('audit/bc4-kpi-map-single-call/before/report.json'))
a=json.load(open('audit/bc4-kpi-map-single-call/after/report.json'))
print(b['contentPointCount'],a['contentPointCount'],b['contentSha256']==a['contentSha256'],a['contentSha256'])
PY
# 4935 4935 True 92ad2b4d59bf6ba09544b0e9101b18c8a27c9755d944879d71fcd75fbd336979

sha256sum audit/bc4-kpi-map-single-call/{before,after}/map.png
# 7e38f7...  before/map.png
# 7e38f7...  after/map.png
```

Le hash d'écran identique confirme que le rendu n'a pas changé.

## Tests, lint et build

```sh
npm test -- --run src/test/metric-map-view.test.tsx \
  src/test/metrics-query-contract.test.ts
# 2 fichiers, 6 tests PASS, exit 0

npx eslint src/features/kpi/KpiWorkspace.tsx \
  src/features/kpi/MetricsCatalogSidebar.tsx \
  src/features/kpi/VisualizationMenu.tsx src/features/kpi/query-keys.ts \
  src/lib/api/metrics.ts src/lib/api/client.ts \
  scripts/kpi_map_single_call_evidence.mjs
# exit 0

python3 /home/devmat/BC4/scripts/_guard_G36_disk.py
# free_gib=147.68 threshold_gib=20 verdict=PASS, exit 0

docker build -f Dockerfile.v2 -t bc4a4-front:kpi-map-single-call .
# exit 0

git diff --check
# exit 0
```

## Nettoyage

```sh
docker rm -f bc4a4-mapcall-front bc4a4-mapcall-api bc4a4-mapcall-db
docker volume rm bc4a4-mapcall-dbdata
docker network rm bc4a4-mapcall-net
docker image rm bc4a4-front:kpi-map-single-call
df -h /home/devmat/BC4
# /dev/sda1 388G 236G 152G 61%
```
