# BC1 — upload asynchrone du référentiel cellulaire

## Verdict

PASS sur pile jetable `bc1-cellref-upload-*`. Aucune action en production.
SemVer : back **PATCH**, front **PATCH** ; numéros attribués par BC3.

Le fichier réel `/home/devmat/ref_cell_4G5G.csv` traverse le proxy, reçoit un
job HTTP 202, termine avec `457845` lignes chargées et apparaît dans
« Historique des imports ». Une coupure 504 forcée affiche le statut et la
raison dans l'interface.

## Cause exacte

Deux attentes se cumulaient :

- `src/server.ts` appelait le `fetch` Bun du proxy sans délai spécifique. Bun
  coupe une socket inactive vers 300 s pendant l'attente des en-têtes amont.
- Le handler 0.116.0 faisait `blob = await file.read()` à
  `app/routes/settings_cell_ref.py:324`, puis importait tout le CSV avant de
  répondre : buffering complet du multipart dans l'API et traitement
  synchrone. Le proxy n'avait donc aucun en-tête à transmettre durant l'import.

Le corps n'était pas limité par Nitro : il était déjà relayé comme
`ReadableStream` avec `duplex: "half"`. La limite métier était et reste
`MAX_BODY_BYTES = 256 * 1024 * 1024` dans
`app/services/cell_ref_ingest.py:100`.

Commande de localisation de l'ancien buffering :

```sh
git show 6e17ac4:app/routes/settings_cell_ref.py | nl -ba \
  | rg 'await file.read|def upload|@router.post'
```

Résultat pertinent : `324  blob = await file.read()`.

## Correctif

- `POST /settings/cell-ref/upload` spoule le flux par blocs sous la limite
  256 Mio, écrit une ligne `reference_import` `queued`, puis répond `202` avec
  `job_id` dès que le fichier est durable.
- Le worker existant prend le job, sous le verrou advisory
  `cell_ref:reimport`, et appelle le même `ingest_csv_stream` que
  `reimport_cell_reference`. Un job `running` interrompu est repris par son
  fichier persistant et le même identifiant d'import.
- `GET /settings/cell-ref/jobs/{job_id}` expose l'état, une progression de
  phase, les compteurs et l'erreur structurée.
- Le front suit ce job, affiche envoi/attente/résultat, remonte statut + raison
  en échec, puis invalide l'historique et le résumé.
- Le proxy conserve le multipart en flux et applique son délai d'une heure
  seulement aux deux routes d'upload. L'API demeure l'autorité sur 256 Mio.

## Preuve réelle par le proxy

Commandes non sensibles (l'identité jetable est lue du conteneur et le jeton
n'est jamais imprimé) :

```sh
df -h /home/devmat/BC4
stat -c 'FILE_BYTES=%s FILE=%n' /home/devmat/ref_cell_4G5G.csv
wc -l /home/devmat/ref_cell_4G5G.csv

curl -sS -o /tmp/bc1-cellref-job-accepted.json \
  -w 'UPLOAD_HTTP=%{http_code} UPLOAD_SECONDS=%{time_total} \
TTFB=%{time_starttransfer} REQUEST_BYTES=%{size_upload} \
RESPONSE_BYTES=%{size_download}\n' \
  -H "Authorization: Bearer $token" \
  -F 'file=@/home/devmat/ref_cell_4G5G.csv;type=text/csv' \
  http://127.0.0.1:9274/api/settings/cell-ref/upload
```

Sortie :

```text
FILE_BYTES=134128653 FILE=/home/devmat/ref_cell_4G5G.csv
459548 /home/devmat/ref_cell_4G5G.csv
UPLOAD_HTTP=202 UPLOAD_SECONDS=0.762152 TTFB=0.004191
REQUEST_BYTES=134128846 RESPONSE_BYTES=103
```

Contrôle terminal par l'API puis directement en base :

```sh
curl -fsS -H "Authorization: Bearer $token" \
  "http://127.0.0.1:9274/api/settings/cell-ref/jobs/$job_id"
docker exec bc1-cellref-upload-db psql -U bc4 -d bc1_cellref_upload -Atc \
  "SELECT status,rows_read,rows_loaded,rows_rejected
   FROM reference_import WHERE id='$job_id'; SELECT count(*) FROM cell_ref;"
```

Résultat :

```text
status=completed progress_percent=100 rows_read=459547
rows_loaded=457845 rows_rejected=1702
completed|459547|457845|1702
457845
```

`GET /api/reference/cell/imports` contient le même `job_id`, le statut
`completed` et les mêmes compteurs : la nouvelle ligne est visible dans
l'historique.

## Interface, tests et captures

```sh
npx playwright test audit/bc1-cell-ref-upload/e2e.spec.cjs \
  --grep 'completed import|forced proxy cutoff' --reporter=line
```

Résultat : `2 passed (5.6s)`. La seconde preuve intercepte le POST avec une
504 structurée ; l'écran affiche `HTTP 504` et la raison. Captures :

- `history-completed.png`
- `forced-cutoff-error.png`

```sh
npx vitest run src/test/cell-reference-upload.test.tsx \
  src/test/proxy-compression.test.ts src/test/upstream-unavailable.test.ts
npm run build
docker exec bc1-cellref-upload-api pytest -q \
  tests/test_cell_ref_jobs.py tests/test_cell_ref_channels.py
```

Résultats : front `3` fichiers / `22` tests PASS, build production PASS ; back
`5 passed`. Les tests back couvrent succès, erreur de validation persistée et
compatibilité des canaux du référentiel.

## Exécutions non nulles déclarées

- `python`: exit 127 sur l'hôte ; `python3 -m compileall` puis tests Docker
  PASS. VERDICT : outillage fermé.
- Première API avec `BC4_ENV=test`: démarrage refusé par la configuration ;
  relancée en environnement jetable development. VERDICT : fermé.
- Premier poll limité à 60 s : exit 124 pendant un job toujours `running` ;
  le poll suivant a observé `completed`. VERDICT : fermé par le résultat et la
  base.
- Premier Playwright : exit 1 car `@playwright/test` n'est pas installé ; le
  script utilise le paquet présent `playwright/test`, puis `2 passed`.
  VERDICT : fermé.
- Le typecheck global reste exit 2 sur des erreurs préexistantes hors lot ;
  aucun diagnostic ne vise les fichiers de ce lot, tests ciblés et build PASS.
  VERDICT : écart global déclaré ouvert.
