# BC1 — upload du référentiel cellulaire par le proxy

## Verdict

PASS sur pile jetable `bc1-cell-ref-upload-*`. Le fichier réel
`/home/devmat/ref_cell_4G5G.csv` traverse le proxy, l'import se termine et sa
ligne apparaît dans l'historique. Une coupure forcée affiche le statut HTTP et
la raison. Aucune action n'a été faite en production.

SemVer : front **PATCH** ; numéro attribué par BC3. Aucun changement back.

## Cause mesurée

- Le runtime de production est Bun (`Dockerfile.v2:3` et `Dockerfile.v2:24`).
- Avant ce lot, `src/server.ts:116` appelait `fetch(target, init)` sans valeur
  `timeout`. Bun appliquait donc son délai d'inactivité par défaut de 300 s.
  L'API ne produit ses en-têtes qu'après l'ingestion synchrone ; cela explique
  la coupure BC3 vers 308 s.
- Ce n'était ni une limite de corps, ni un buffering Nitro : le multipart était
  déjà transmis par `request.body` avec `duplex: "half"` (désormais
  `src/server.ts:125-127`).
- La limite effective reste celle de l'API : 256 Mio dans
  `app/services/cell_ref_ingest.py:100`, lus par blocs de 1 Mio aux lignes
  `452-463`.

Correctif : délai Bun d'une heure uniquement pour les POST
`/api/reference/cell/upload` et `/api/settings/cell-ref/upload`
(`src/server.ts:17-23,129-137`). Les autres routes conservent leur délai normal.
Une expiration remonte un JSON 504 structuré (`src/lib/upstream-unavailable.ts:42-53`).

## Preuve fichier et import réel

Commandes :

```sh
stat -c 'FILE_BYTES=%s' /home/devmat/ref_cell_4G5G.csv
python3 -c "print('FILE_LINES='+str(sum(1 for _ in open('/home/devmat/ref_cell_4G5G.csv','rb'))))"
```

Résultat : `134128653` octets et `459548` lignes, en-tête compris.

L'import a été envoyé à
`http://bc1-cell-ref-upload-front:5173/api/reference/cell/upload` depuis la pile
jetable. La commande d'essai lit l'identité jetable depuis les variables du
conteneur, garde le jeton en mémoire et ne l'affiche jamais :

```sh
docker exec -i bc1-cell-ref-upload-api python - <<'PY'
# httpx.Client -> POST /api/auth/login, puis multipart du fichier témoin vers
# le proxy front, enfin GET /api/reference/cell/imports ; seuls les compteurs
# non sensibles sont imprimés.
PY
```

Sortie :

```text
UPLOAD_HTTP_STATUS=200
UPLOAD_ELAPSED_S=97.790
UPLOAD_ROWS_READ=459547
UPLOAD_ROWS_LOADED=457845
UPLOAD_ROWS_REJECTED=1702
HISTORY={"filename":"ref_cell_4G5G.csv","rows_loaded":457845,"rows_read":459547,"rows_rejected":1702,"status":"completed"}
```

Les rejets appartiennent au rapport métier normal de ce fichier ; le statut de
l'import est bien `completed`.

## Interface et gardes

- La barre reste visible pendant l'envoi puis indique explicitement le
  traitement serveur après 100 % (`CellularReferencePanel.tsx:282-304`).
- Une erreur conserve le statut et la raison, par exemple
  `HTTP 504 — Le proxy a interrompu…`.
- Après succès, l'historique et le résumé actifs sont réellement rechargés
  avant la fin de la mutation (`CellularReferencePanel.tsx:218-226`).

Commande navigateur :

```sh
playwright test --config audit/bc1-cell-ref-upload/playwright.config.cjs
```

Résultat : `3 passed` : historique `completed`, progression visible, coupure
504 forcée avec statut et raison. Captures :

- `history-completed.png`
- `processing-visible.png`
- `forced-cutoff-error.png`

Commande tests ciblés :

```sh
node node_modules/vitest/vitest.mjs run \
  src/test/proxy-compression.test.ts \
  src/test/upstream-unavailable.test.ts \
  src/test/cell-reference-upload.test.tsx
```

Résultat : `3` fichiers, `22` tests, tous PASS. ESLint ciblé : exit 0.
Build de production Vite : exit 0.

## Exécutions non nulles déclarées

- API vide sans identité admin : exit 1 attendu du garde de seed ; pile relancée
  avec une identité jetable générée et jamais affichée. VERDICT : fermé.
- `requests` absent dans l'image API : exit 1 ; preuve rejouée avec `httpx`
  présent. VERDICT : fermé.
- Deux premiers lancements Playwright : exit 1 (résolution du paquet puis chemin
  navigateur), et un essai d'assertion trop strict : exit 1. Configuration et
  contrat JSON corrigés, résultat final `3 passed`. VERDICT : fermé.
- Un lancement Vitest avec `node_modules` monté en lecture seule : exit 1
  (`.vite-temp` non inscriptible) ; relancé avec le montage adapté, `22 passed`.
  VERDICT : fermé.
- Le `tsc --noEmit` global reste exit 2 sur des erreurs préexistantes hors lot
  (cartes/fixtures). Le build de production et les contrôles ciblés passent.
  VERDICT : écart global déclaré ouvert, sans erreur issue des fichiers du lot.
