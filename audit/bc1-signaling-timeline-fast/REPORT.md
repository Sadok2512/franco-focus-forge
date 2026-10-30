# BC1 — signaling-timeline-fast

## Verdict

PASS sur pile jetable. La vue d'ensemble RF de toute la capture vient d'un
seul appel `/signaling/timeline?bucket_s=10`; les événements détaillés ne sont
demandés qu'après réduction de la fenêtre visible. SemVer déclaré : front
PATCH et back PATCH ; BC3 attribue les numéros.

## Mesures au volume de Test_6

Capture : projet `43e81a34a073`, capture `a4b0c321c52e`.

Commande avant, puis après, sur la même URL dans le même conteneur API (la
base et l'API sont redémarrées avant chaque mesure) :

```bash
URL='http://127.0.0.1:8000/projects/43e81a34a073/signaling/timeline?capture_id=a4b0c321c52e&bucket_s=10'
curl -sS -H "Authorization: Bearer $TOKEN" -o /tmp/timeline.json \
  -w 'status=%{http_code} starttransfer=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download} url=%{url_effective}\n' "$URL"
```

```text
BEFORE status=200 starttransfer=41.872320s total=41.873752s bytes=47415
BEFORE_CONTENT total=22939 buckets=486 state_events=0
AFTER status=200 starttransfer=0.493179s total=0.495037s bytes=262126
AFTER_CONTENT total=23398 buckets=486 state_events=264 t_rel_end_s=4857.889000000003 bucket_sum=23398
```

Commande après par le chemin navigateur jetable, à froid et compressé :

```bash
URL='http://127.0.0.1:15174/api/projects/43e81a34a073/signaling/timeline?capture_id=a4b0c321c52e&bucket_s=10'
curl --fail-with-body --compressed -sS -H "Authorization: Bearer $TOKEN" \
  -H 'Accept-Encoding: gzip' -o /tmp/timeline-proxy.json \
  -w 'status=%{http_code} starttransfer=%{time_starttransfer}s total=%{time_total}s bytes_wire=%{size_download} url=%{url_effective}\n' "$URL"
```

```text
status=200 starttransfer=0.425048s total=0.427149s bytes_wire=16618
PROXY_CONTENT total=23398 buckets=486 states=264
```

Fenêtre visible témoin :

```bash
URL='http://127.0.0.1:15174/api/projects/43e81a34a073/signaling/events?capture_id=a4b0c321c52e&view=rf&from_s=120&to_s=150&limit=5000'
curl --fail-with-body --compressed -sS -H "Authorization: Bearer $TOKEN" \
  -H 'Accept-Encoding: gzip' -o /tmp/events-window.json \
  -w 'status=%{http_code} starttransfer=%{time_starttransfer}s total=%{time_total}s bytes_wire=%{size_download} url=%{url_effective}\n' "$URL"
```

```text
status=200 starttransfer=0.130432s total=0.132694s bytes_wire=5078
PROXY_DETAIL_CONTENT total=122 returned=122 truncated=False
```

Contrôle par le contenu :

```sql
WITH active AS (
  SELECT generation FROM signaling_materialized_capture
  WHERE project_id='43e81a34a073' AND capture_id='a4b0c321c52e'
)
SELECT count(*) AS rf_events,
 count(*) FILTER (WHERE upper(coalesce(attrs->>'track','')) IN ('RRC_STATE','UE_STATE')) AS state_events,
 count(*) FILTER (WHERE t_rel_s IS NULL) AS missing_time
FROM signaling_materialized_event, active
WHERE project_id='43e81a34a073' AND capture_id='a4b0c321c52e'
 AND view='rf' AND signaling_materialized_event.generation=active.generation;
```

Résultat : `23398 | 264 | 0`, identique au total des seaux et aux états de
la réponse.

## Gardes

```bash
npm test -- --run src/test/G55-front-contract.test.ts src/test/signaling-name-tag-click.test.tsx src/test/signaling-timeline-loading.test.ts
# Test Files 3 passed; Tests 9 passed

python -m pytest -q tests/test_signaling_materialized.py tests/test_signaling_lean.py
# 6 passed

npm run build
# exit 0
```

Le `npm run typecheck` global sort avec code 2 sur des erreurs préexistantes
hors des fichiers Signaling modifiés (AssistantMap, MetricGraphCard, clients
dictionary/fixtures, overview et vite.config). Le build de production et les
tests ciblés passent. `ruff` est absent de l'image et de l'hôte (exit 127,
VERDICT=UNAVAILABLE) ; `compileall` passe.

## Captures

- `/home/devmat/BC4/audit/bc1-signaling-timeline-fast-overview.png` : capture
  entière, 486 seaux et pistes RRC/UE affichées sans appel détaillé.
- `/home/devmat/BC4/audit/bc1-signaling-timeline-fast-detail.png` : fenêtre
  0–30 s après zoom, événements détaillés chargés.
