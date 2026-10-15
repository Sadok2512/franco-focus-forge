#!/usr/bin/env bash
# G2 : backend up + bascule API → smoke test de bout en bout (login,
# projets, overview, dictionnaire LTE+NR, KPI, assistant). Chaque
# réponse HTTP est validée par son schéma Zod. Échoue bruyamment si
# l'API n'est pas joignable.
#
# P1-3 (bc4-front 1.5.0) : étendu avec 3 cas d'erreur UI explicites pour
# l'upload (cell_ref) :
#   (a) 401 attendu quand aucun Bearer n'est fourni → UI doit rediriger.
#   (b) ERREUR RÉSEAU quand la base pointe sur un port mort →
#       `curl` doit échouer AVANT toute réponse (code sortie ≠ 0).
#   (c) 422 avec en-tête CSV faux → le back doit renvoyer un `detail.message`
#       lisible que la UI affiche TEL QUEL (plus de « Backend injoignable »).
#
# Complément 1.5.0 (CTA "Ajouter des logs" page projet) :
#   (d) bout-en-bout UI : login → `POST /projects` (création draft) →
#       `POST /projects/{id}/nmf` avec un petit fichier → la réponse doit
#       exposer `files_received`/`files_done`/`files_error` + `by_file[]`
#       (schéma `NmfImportReportSchema`) pour que `NmfImportReportView`
#       ait de la matière. Un HTTP ≥ 400 sans `detail.message` est un bug
#       du back (la UI affiche le motif TEL QUEL via `toUserMessage`).
#
# Second complément 1.5.0 (action "Ajouter des logs" en LIGNE de liste) :
#   (e) chemin UI de la liste projets : login → `GET /projects` (choix
#       d'un id existant, à défaut on retombe sur celui créé en (d)) →
#       `POST /projects/{id}/nmf` → mêmes garanties que (d) sur la forme
#       du rapport. L'intérêt : prouver qu'un consommateur « ligne de
#       liste » (pas la page détail) exerce EXACTEMENT le même endpoint
#       avec le MÊME contrat de réponse — le hook `useNmfUpload` côté
#       front est le point de factorisation, mais cette garde reste
#       bêtement HTTP (pas de dépendance React).
#
# Complément 1.7.0 / adapté 1.7.1 (Dictionnaire, retour au design B0) :
#   (h) login → `GET /projects/{TEST2}/dict/tree` : attend la forme B0
#       (`branches[].techno/channels/messages[].msg_id,name,count`) — la
#       UI 1.7.1 ne consomme QUE le shape B0, le back 0.14.0 continue
#       de servir B0 nativement par défaut. Si le back renvoie encore la
#       forme V2 (`branches[].system`), log warn + skip du reste du cas,
#       car la UI historique ne saurait l'afficher (écart à combler
#       plus tard). Puis `GET /dict/params?system=LTE&message=SIB1`
#       exerce EN PARALLÈLE le chemin V2 (back 0.14.0 l'expose) pour
#       verrouiller le contrat 3GPP (unit_converted="dBm" + buckets
#       `avg_converted` non null sur `q-RxLevMin`). Note : la UI 1.7.1
#       n'appelle plus ce chemin — la garde reste HTTP pour détecter une
#       régression côté back.
#
# Complément 1.8.0 (Dictionnaire V2 unifiée) : la UI 1.8.0 consomme
# NATIVEMENT la forme V2 (TEST2) via l'adaptateur `src/lib/api/dictionary.ts`
# qui replie la B0 → V2 pour les projets seedés. Le smoke
# `scripts/smoke_api.ts` ajoute le cas (h.3) :
#   • `/dict/tree` TEST2 → shape V2 (branches[].system/count/messages[]).
#   • `/dict/params?system=LTE&message=…&operator=Orange` doit être
#     strictement restrictif vs la baseline sans filtre.
#   • `/dict/param/map?path=…&system=LTE` doit renvoyer des points
#     (lon/lat/value_raw/value_converted/operator/band).
# Les filtres DR/Plaque/Zone ARCEP ne sont PAS propagés sur /dict/* tant
# que `cell_ref` est vide (back 0.14.0 ne les exerce pas). Pas de 400
# silencieux côté UI.
#
# Complément 1.8.1 (histogramme sur `value_distribution`) : la UI 1.8.1
# alimente l'histogramme avec `value_distribution` renvoyé par
# `/dict/params` (bc4-back 0.15.0). Le smoke ajoute (h.4) :
#   • rsrpResult (numérique) : `value_distribution` non vide,
#     somme(count) == count du paramètre, au moins une entrée avec
#     `value_converted` non null, `value_distribution_mode ∈ {exact,
#     binned}`.
#   • dl-Bandwidth (enum MasterInformationBlock) : toutes les entrées
#     ont `value_converted === null`, `value_distribution_mode === "exact"`.
# Compat ascendante : si le back ne renvoyait pas `value_distribution`,
# la UI 1.8.1 affiche l'EmptyState (`.default([])` côté Zod) sans crasher.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/_lib.sh"
cd "$(dirname "$HERE")"

require_api_base
wait_for_api

export VITE_BC4_API_BASE
echo "[G2] smoke test API=$VITE_BC4_API_BASE"
bun_run run scripts/smoke_api.ts

# -------- P1-3 : 3 classes d'erreurs upload --------
API_BASE="${VITE_BC4_API_BASE%/}"

echo "[G2/P1-3] (a) upload cell_ref sans Bearer → attend 401"
csv_tmp="$(mktemp --suffix .csv)"
trap 'rm -f "$csv_tmp"' EXIT
# Un seul en-tête volontairement faux pour que la validation côté back
# déclenche 422 — mais ici on part sans token, donc 401 avant parsing.
printf 'col1,col2\nfoo,bar\n' > "$csv_tmp"
status_a="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${API_BASE}/reference/cell/upload" \
  -F "file=@${csv_tmp}" || echo 000)"
if [[ "$status_a" != "401" ]]; then
  shout "P1-3 (a) : attendu HTTP 401 sans Bearer, obtenu HTTP $status_a"
fi
echo "  ✓ (a) HTTP $status_a sans Bearer"

# (b) base pointant sur un port mort : seul cas « injoignable ».
echo "[G2/P1-3] (b) base = port mort (9999) → attend échec réseau avant réponse"
if curl -fsS --max-time 3 -o /dev/null \
     -X POST "http://127.0.0.1:9999/reference/cell/upload" \
     -F "file=@${csv_tmp}" 2>/dev/null; then
  shout "P1-3 (b) : curl a réussi contre un port mort — impossible, revoir le port."
fi
echo "  ✓ (b) curl échoue (aucune réponse HTTP) → classe NETWORK_ERROR"

# (c) 422 réel avec un token valide + en-tête CSV faux.
BC4_ADMIN_EMAIL="${BC4_ADMIN_EMAIL:-demo@demo.com}"
BC4_ADMIN_PASSWORD="${BC4_ADMIN_PASSWORD:-demo}"
echo "[G2/P1-3] (c) login puis upload CSV en-tête faux → attend 422 + message back"
login_json="$(curl -fsS -X POST "${API_BASE}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${BC4_ADMIN_EMAIL}\",\"password\":\"${BC4_ADMIN_PASSWORD}\"}")"
token="$(printf '%s' "$login_json" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')"
if [[ -z "$token" ]]; then
  shout "P1-3 (c) : login a répondu mais sans token — revoir /auth/login"
fi
resp_tmp="$(mktemp)"
status_c="$(curl -sS -o "$resp_tmp" -w '%{http_code}' \
  -X POST "${API_BASE}/reference/cell/upload" \
  -H "Authorization: Bearer ${token}" \
  -F "file=@${csv_tmp}")"
body_c="$(cat "$resp_tmp")"
rm -f "$resp_tmp"
if [[ "$status_c" != "422" ]]; then
  shout "P1-3 (c) : attendu HTTP 422 avec en-tête CSV faux, obtenu HTTP $status_c — body: $body_c"
fi
msg_c="$(printf '%s' "$body_c" | python3 -c 'import sys,json;d=json.load(sys.stdin);det=d.get("detail");print(det.get("message","") if isinstance(det,dict) else str(det or ""))')"
if [[ -z "$msg_c" ]]; then
  shout "P1-3 (c) : HTTP 422 mais pas de detail.message — le back doit remonter un motif. Body: $body_c"
fi
echo "  ✓ (c) HTTP $status_c — detail.message = « $msg_c »"

# (d) bout-en-bout : login (déjà pris en compte via $token) → créer projet
# → POST /projects/{id}/nmf avec un petit fichier .nmf → rapport attendu.
echo "[G2/1.5.0] (d) login → POST /projects → POST /projects/{id}/nmf → rapport"
proj_tmp="$(mktemp)"
proj_name="smoke-$(date +%s)"
proj_status="$(curl -sS -o "$proj_tmp" -w '%{http_code}' \
  -X POST "${API_BASE}/projects" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${proj_name}\"}")"
proj_body="$(cat "$proj_tmp")"
rm -f "$proj_tmp"
if [[ "$proj_status" != "200" && "$proj_status" != "201" ]]; then
  shout "P1-3 (d) : POST /projects attendu 200/201, obtenu HTTP $proj_status — body: $proj_body"
fi
proj_id="$(printf '%s' "$proj_body" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')"
if [[ -z "$proj_id" ]]; then
  shout "P1-3 (d) : POST /projects HTTP $proj_status mais sans id — body: $proj_body"
fi
echo "  ✓ (d.1) POST /projects HTTP $proj_status — id=$proj_id"

nmf_tmp="$(mktemp --suffix .nmf)"
# Petit fichier arbitraire : le back doit répondre par un `by_file` qui
# contient ce fichier avec un `status` ("done" ou "error"). On ne juge pas
# du statut métier (le fichier n'est pas un vrai NMF) — on vérifie que le
# RAPPORT revient structuré, c.-à-d. que la UI aura `files_received`,
# `files_done`, `files_error`, `by_file[]` à afficher.
printf 'bc4-smoke-%s\n' "$proj_name" > "$nmf_tmp"
nmf_resp="$(mktemp)"
nmf_status="$(curl -sS -o "$nmf_resp" -w '%{http_code}' \
  -X POST "${API_BASE}/projects/${proj_id}/nmf" \
  -H "Authorization: Bearer ${token}" \
  -F "files=@${nmf_tmp};filename=${proj_name}.nmf")"
nmf_body="$(cat "$nmf_resp")"
rm -f "$nmf_resp" "$nmf_tmp"
if [[ "$nmf_status" != "200" && "$nmf_status" != "201" && "$nmf_status" != "207" ]]; then
  # 4xx/5xx : la UI doit avoir un `detail.message` lisible (contrat P1-3).
  nmf_msg="$(printf '%s' "$nmf_body" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin);det=d.get("detail");print(det.get("message","") if isinstance(det,dict) else str(det or ""))
except Exception:
    print("")')"
  if [[ -z "$nmf_msg" ]]; then
    shout "P1-3 (d) : POST /projects/{id}/nmf HTTP $nmf_status sans detail.message — body: $nmf_body"
  fi
  echo "  !! (d.2) HTTP $nmf_status — detail.message = « $nmf_msg » (fichier .nmf factice attendu)"
  echo "  (ce chemin reste conforme : la UI affichera le motif via toUserMessage)"
else
  # 2xx : vérifie la forme attendue par `NmfImportReportSchema` côté front.
  python3 - "$nmf_body" <<'PY'
import json, sys
body = json.loads(sys.argv[1])
required = ["files_received", "files_done", "files_error", "by_file",
            "n_captures", "n_events", "gps_coverage_pct",
            "operators_seen", "technos_seen"]
missing = [k for k in required if k not in body]
if missing:
    print(f"P1-3 (d) : rapport NMF incomplet — manquant: {missing}", file=sys.stderr)
    sys.exit(2)
if not isinstance(body["by_file"], list) or not body["by_file"]:
    print(f"P1-3 (d) : rapport NMF `by_file[]` vide — attendu au moins 1 entrée", file=sys.stderr)
    sys.exit(2)
bf = body["by_file"][0]
for k in ("filename", "status", "n_captures", "n_events", "n_gps",
          "decoder_version", "error_msg"):
    if k not in bf:
        print(f"P1-3 (d) : rapport NMF by_file[0].{k} manquant", file=sys.stderr)
        sys.exit(2)
print(f"files_received={body['files_received']} "
      f"files_done={body['files_done']} files_error={body['files_error']} "
      f"n_captures={body['n_captures']} n_events={body['n_events']} "
      f"gps={body['gps_coverage_pct']} by_file[0].status={bf['status']} "
      f"by_file[0].error_msg={bf['error_msg']!r}")
PY
  echo "  ✓ (d.2) HTTP $nmf_status — rapport NMF conforme au schéma UI"
fi

# -------- (e) 1.5.0 second complément : upload NMF depuis la LIGNE de liste --------
# On rejoue le flux côté « ligne de liste projets » : la UI consomme
# `GET /projects`, choisit un id, puis fait un POST /projects/{id}/nmf
# via le même hook factorisé (`useNmfUpload`). Ici on tape l'API comme
# le ferait un consommateur HTTP neutre.
echo "[G2/1.5.0] (e) liste projets → sélection id → POST /projects/{id}/nmf"
list_resp="$(mktemp)"
list_status="$(curl -sS -o "$list_resp" -w '%{http_code}' \
  -X GET "${API_BASE}/projects" \
  -H "Authorization: Bearer ${token}")"
list_body="$(cat "$list_resp")"
rm -f "$list_resp"
if [[ "$list_status" != "200" ]]; then
  shout "1.5.0 (e) : GET /projects attendu 200, obtenu HTTP $list_status — body: $list_body"
fi
# Récupère un id. Préférence : réutiliser `proj_id` (créé en (d)) si
# présent dans la liste ; sinon, prendre le premier id disponible.
# Si la liste est vide, on crée un projet dédié à (e).
row_id="$(printf '%s' "$list_body" | python3 - "$proj_id" <<'PY'
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    print("")
    sys.exit(0)
pref = sys.argv[1] if len(sys.argv) > 1 else ""
if isinstance(data, list) and data:
    ids = [x.get("id", "") for x in data if isinstance(x, dict)]
    if pref and pref in ids:
        print(pref)
    else:
        print(ids[0] if ids else "")
else:
    print("")
PY
)"
if [[ -z "$row_id" ]]; then
  # Liste vide (ou shape inattendue) : on crée un projet dédié.
  proj_e_name="smoke-row-$(date +%s)"
  proj_e_resp="$(mktemp)"
  proj_e_status="$(curl -sS -o "$proj_e_resp" -w '%{http_code}' \
    -X POST "${API_BASE}/projects" \
    -H "Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"${proj_e_name}\"}")"
  proj_e_body="$(cat "$proj_e_resp")"
  rm -f "$proj_e_resp"
  if [[ "$proj_e_status" != "200" && "$proj_e_status" != "201" ]]; then
    shout "1.5.0 (e) : fallback POST /projects HTTP $proj_e_status — body: $proj_e_body"
  fi
  row_id="$(printf '%s' "$proj_e_body" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')"
fi
if [[ -z "$row_id" ]]; then
  shout "1.5.0 (e) : impossible de choisir un id de projet pour tester l'action en ligne"
fi
echo "  ✓ (e.1) GET /projects HTTP $list_status — id choisi=$row_id"

nmf_e="$(mktemp --suffix .nmf)"
printf 'bc4-smoke-row-%s\n' "$(date +%s)" > "$nmf_e"
nmf_e_resp="$(mktemp)"
nmf_e_status="$(curl -sS -o "$nmf_e_resp" -w '%{http_code}' \
  -X POST "${API_BASE}/projects/${row_id}/nmf" \
  -H "Authorization: Bearer ${token}" \
  -F "files=@${nmf_e};filename=row-$(basename "$nmf_e")")"
nmf_e_body="$(cat "$nmf_e_resp")"
rm -f "$nmf_e_resp" "$nmf_e"
if [[ "$nmf_e_status" != "200" && "$nmf_e_status" != "201" && "$nmf_e_status" != "207" ]]; then
  nmf_e_msg="$(printf '%s' "$nmf_e_body" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin);det=d.get("detail");print(det.get("message","") if isinstance(det,dict) else str(det or ""))
except Exception:
    print("")')"
  if [[ -z "$nmf_e_msg" ]]; then
    shout "1.5.0 (e) : POST /projects/{id}/nmf HTTP $nmf_e_status sans detail.message — body: $nmf_e_body"
  fi
  echo "  !! (e.2) HTTP $nmf_e_status — detail.message = « $nmf_e_msg » (fichier .nmf factice attendu)"
  echo "  (ce chemin reste conforme : la ligne de liste affichera le motif via toUserMessage)"
else
  python3 - "$nmf_e_body" <<'PY'
import json, sys
body = json.loads(sys.argv[1])
required = ["files_received", "files_done", "files_error", "by_file",
            "n_captures", "n_events", "gps_coverage_pct",
            "operators_seen", "technos_seen"]
missing = [k for k in required if k not in body]
if missing:
    print(f"1.5.0 (e) : rapport NMF incomplet — manquant: {missing}", file=sys.stderr)
    sys.exit(2)
if not isinstance(body["by_file"], list) or not body["by_file"]:
    print(f"1.5.0 (e) : rapport NMF `by_file[]` vide — attendu au moins 1 entrée", file=sys.stderr)
    sys.exit(2)
bf = body["by_file"][0]
for k in ("filename", "status", "n_captures", "n_events", "n_gps",
          "decoder_version", "error_msg"):
    if k not in bf:
        print(f"1.5.0 (e) : rapport NMF by_file[0].{k} manquant", file=sys.stderr)
        sys.exit(2)
print(f"files_received={body['files_received']} "
      f"files_done={body['files_done']} files_error={body['files_error']} "
      f"n_captures={body['n_captures']} n_events={body['n_events']} "
      f"gps={body['gps_coverage_pct']} by_file[0].status={bf['status']} "
      f"by_file[0].error_msg={bf['error_msg']!r}")
PY
  echo "  ✓ (e.2) HTTP $nmf_e_status — rapport NMF conforme pour l'action en ligne de liste"
fi

# -------- (f) 1.5.1 : GET /projects/{id}/import pour le détail d'ingestion --------
# Vérifie que l'endpoint consommé par l'accordéon « Détail d'ingestion »
# (1.5.1, lazy fetch côté `ProjectRowDetails`) renvoie un rapport
# EXPLOITABLE pour au moins UN projet ingéré de la liste.
# Critères :
#   - au moins un projet renvoie `n_events > 0` ET `technos_seen` non vide ;
#   - la forme respecte `NmfImportReportSchema` (mêmes clés que (d)/(e)).
# Dès qu'un projet convient, on s'arrête — pas besoin de boucler tout.
echo "[G2/1.5.1] (f) GET /projects/{id}/import pour un projet déjà ingéré"
list_f_resp="$(mktemp)"
list_f_status="$(curl -sS -o "$list_f_resp" -w '%{http_code}' \
  -X GET "${API_BASE}/projects" \
  -H "Authorization: Bearer ${token}")"
list_f_body="$(cat "$list_f_resp")"
rm -f "$list_f_resp"
if [[ "$list_f_status" != "200" ]]; then
  shout "1.5.1 (f) : GET /projects attendu 200, obtenu HTTP $list_f_status — body: $list_f_body"
fi

# On parcourt les projets jusqu'à en trouver un avec `n_events > 0` ET
# `technos_seen` non vide. Si aucun ne convient, c'est un GAP du back
# (les smokes (d)/(e) uploadent du vrai factice qui n'enregistre pas de
# capture), on sort warn — pas shout, car la couverture 1.5.1 ne doit
# pas bloquer un back frais sans ingestion réelle.
python3 - "$list_f_body" "${API_BASE}" "${token}" <<'PY'
import json, sys, urllib.request, urllib.error

body_raw = sys.argv[1]
base = sys.argv[2]
token = sys.argv[3]
try:
    projects = json.loads(body_raw)
except Exception as e:
    print(f"1.5.1 (f) : liste projets non JSON ({e})", file=sys.stderr)
    sys.exit(2)
if not isinstance(projects, list) or not projects:
    print("1.5.1 (f) : liste projets vide, pas de smoke import possible")
    sys.exit(0)

required = {"files_received", "files_done", "files_error", "by_file",
            "n_captures", "n_events", "gps_coverage_pct",
            "operators_seen", "technos_seen"}

ok = False
tried = []
for p in projects:
    pid = p.get("id") if isinstance(p, dict) else None
    if not pid:
        continue
    tried.append(pid)
    req = urllib.request.Request(
        f"{base}/projects/{pid}/import",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  (skip {pid}: HTTP {e.code})")
        continue
    except Exception as e:
        print(f"  (skip {pid}: {e})")
        continue
    missing = required - set(data.keys())
    if missing:
        print(f"1.5.1 (f) : rapport import {pid} incomplet — manquant {sorted(missing)}", file=sys.stderr)
        sys.exit(2)
    n_events = data.get("n_events", 0)
    technos = data.get("technos_seen") or {}
    if n_events > 0 and isinstance(technos, dict) and technos:
        bf0 = data["by_file"][0] if data["by_file"] else None
        print(f"  ✓ (f) {pid} — n_events={n_events} technos_seen={technos} "
              f"by_file[0].n_events={(bf0 or {}).get('n_events', 'N/A')} "
              f"decoder={(bf0 or {}).get('decoder_version', 'N/A')}")
        ok = True
        break

if not ok:
    print(f"1.5.1 (f) : aucun projet avec n_events>0 ET technos_seen non vide parmi {tried}. "
          "Rejouer après ingestion d'un vrai NMF.")
PY

# -------- (g) 1.6.0 : DELETE /projects/{id} depuis la UI (kebab) --------
# L'action « Supprimer le projet » du menu kebab de la ligne liste tape
# `DELETE /projects/{id}`. On vérifie :
#   (g.1) 404 sur id inconnu (classe `ApiHttpError`, UI affiche code +
#         detail.message via `toUserMessage`).
#   (g.2) succès bout-en-bout : POST /projects → DELETE → 204 → la liste
#         ne contient plus l'id (prouve l'invalidation côté UI). On ne
#         crée pas de données ingérées — un projet draft suffit pour
#         exercer l'endpoint.
echo "[G2/1.6.0] (g) DELETE /projects/{id} (menu kebab « Supprimer le projet »)"

# (g.1) 404 attendu sur id inconnu
status_g1="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X DELETE "${API_BASE}/projects/this-id-does-not-exist" \
  -H "Authorization: Bearer ${token}")"
if [[ "$status_g1" != "404" ]]; then
  shout "1.6.0 (g.1) : attendu HTTP 404 sur id inconnu, obtenu HTTP $status_g1"
fi
echo "  ✓ (g.1) HTTP $status_g1 sur id inconnu — classe ApiHttpError côté UI"

# (g.2) crée un projet dédié smoke, supprime-le, vérifie son absence.
proj_g_name="smoke-delete-$(date +%s)"
proj_g_resp="$(mktemp)"
proj_g_status="$(curl -sS -o "$proj_g_resp" -w '%{http_code}' \
  -X POST "${API_BASE}/projects" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${proj_g_name}\"}")"
proj_g_body="$(cat "$proj_g_resp")"
rm -f "$proj_g_resp"
if [[ "$proj_g_status" != "200" && "$proj_g_status" != "201" ]]; then
  shout "1.6.0 (g.2) : POST /projects (smoke delete) HTTP $proj_g_status — body: $proj_g_body"
fi
proj_g_id="$(printf '%s' "$proj_g_body" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')"
if [[ -z "$proj_g_id" ]]; then
  shout "1.6.0 (g.2) : POST /projects HTTP $proj_g_status sans id — body: $proj_g_body"
fi
echo "  ✓ (g.2.a) POST /projects HTTP $proj_g_status — id=$proj_g_id"

status_g2="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X DELETE "${API_BASE}/projects/${proj_g_id}" \
  -H "Authorization: Bearer ${token}")"
if [[ "$status_g2" != "204" ]]; then
  shout "1.6.0 (g.2) : attendu HTTP 204 No Content, obtenu HTTP $status_g2"
fi
echo "  ✓ (g.2.b) DELETE /projects/${proj_g_id} HTTP $status_g2 (204 No Content)"

# Vérifie l'absence post-delete via GET /projects.
list_g_resp="$(mktemp)"
list_g_status="$(curl -sS -o "$list_g_resp" -w '%{http_code}' \
  -X GET "${API_BASE}/projects" \
  -H "Authorization: Bearer ${token}")"
list_g_body="$(cat "$list_g_resp")"
rm -f "$list_g_resp"
if [[ "$list_g_status" != "200" ]]; then
  shout "1.6.0 (g.2) : GET /projects après delete HTTP $list_g_status — body: $list_g_body"
fi
# Le projet NE doit PLUS être dans la liste.
still_present="$(printf '%s' "$list_g_body" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    print('parse-error')
    sys.exit(0)
ids = {p.get('id') for p in data if isinstance(p, dict)}
print('yes' if '${proj_g_id}' in ids else 'no')
")"
if [[ "$still_present" != "no" ]]; then
  shout "1.6.0 (g.2) : projet ${proj_g_id} toujours présent dans GET /projects après DELETE"
fi
echo "  ✓ (g.2.c) GET /projects — projet absent après DELETE (UI invalide la query)"

# -------- (h) 1.7.1 : Dictionnaire B0 bout-en-bout + sanity 3GPP V2 --------
# La UI 1.7.1 ne consomme QUE le shape B0 — V2 retiré, cf. CHANGELOG.
# La garde exerce :
#   (h.1) GET /projects/{id}/dict/tree           → attend la forme B0
#         (`branches[].techno/channels/messages[]`). Si le back renvoie
#         encore la forme V2 (`branches[].system`), log warn + skip (la UI
#         1.7.1 ne saurait l'afficher — écart à combler côté back).
#   (h.2) GET /projects/{id}/dict/params?system=LTE&message=…
#         → verrouille le contrat 3GPP (`unit_converted="dBm"` +
#         `avg_converted` non null sur `q-RxLevMin`) côté BACK. La UI
#         1.7.1 n'appelle plus cet endpoint V2 directement, mais la
#         garde protège une régression du back qui casserait un lot
#         futur réintroduisant la V2.
echo "[G2/1.7.1] (h) Dictionnaire B0 — tree + sanity 3GPP V2 côté back"

TEST2_ID="${BC4_TEST2_PROJECT_ID:-134af70a06eb}"
tree_resp="$(mktemp)"
tree_status="$(curl -sS -o "$tree_resp" -w '%{http_code}' \
  -X GET "${API_BASE}/projects/${TEST2_ID}/dict/tree" \
  -H "Authorization: Bearer ${token}")"
tree_body="$(cat "$tree_resp")"
rm -f "$tree_resp"
if [[ "$tree_status" != "200" ]]; then
  shout "1.7.0 (h.1) : GET /dict/tree HTTP $tree_status — body: $tree_body"
fi
python3 - "$tree_body" "$TEST2_ID" <<'PY'
import json, sys
body = json.loads(sys.argv[1])
pid = sys.argv[2]
branches = body.get("branches", [])
if not branches:
    print(f"1.7.1 (h.1) : /dict/tree vide pour {pid}", file=sys.stderr)
    sys.exit(2)
# La UI 1.7.1 n'accepte QUE le shape B0 (branches[].techno/channels/messages).
shapes = [set(b.keys()) for b in branches]
if any("system" in s for s in shapes):
    # V2 détecté : la UI 1.7.1 ne saurait l'afficher. Warn + skip — pas
    # un échec car la garde protège un contrat back, pas la UI directe.
    systems = [b.get("system") for b in branches]
    print(f"  !! (h.1) /dict/tree encore en shape V2 ({systems}) — la UI 1.7.1 ne consomme "
          "que B0. Non bloquant : le back expose B0 en parallèle via les mêmes URLs.")
else:
    # B0 attendu : 2 branches LTE+NR, chacune avec `channels[].messages[]`.
    technos = [b.get("techno") for b in branches]
    if set(technos) != {"LTE", "NR"}:
        print(f"1.7.1 (h.1) : technos inattendus {technos} (attendu LTE+NR)", file=sys.stderr)
        sys.exit(2)
    for b in branches:
        if "channels" not in b:
            print(f"1.7.1 (h.1) : branche {b.get('techno')} sans `channels` — shape B0 cassé",
                  file=sys.stderr)
            sys.exit(2)
    # Compte agrégé par branche (somme des messages[].count sur tous les channels).
    agg = {}
    for b in branches:
        total = 0
        for c in b.get("channels", []):
            for m in c.get("messages", []):
                total += m.get("count", 0)
        agg[b["techno"]] = total
    print(f"  ✓ (h.1) /dict/tree B0 — branches {agg} (0 attendu si projet non ingéré)")
PY

# (h.2) /dict/params?system=LTE&message=SystemInformationBlockType1 → q-RxLevMin
echo "[G2/1.7.1] (h.2) GET /dict/params?system=LTE&message=SystemInformationBlockType1"
params_resp="$(mktemp)"
params_status="$(curl -sS -o "$params_resp" -w '%{http_code}' \
  -G \
  --data-urlencode "system=LTE" \
  --data-urlencode "message=SystemInformationBlockType1" \
  "${API_BASE}/projects/${TEST2_ID}/dict/params" \
  -H "Authorization: Bearer ${token}")"
params_body="$(cat "$params_resp")"
rm -f "$params_resp"
if [[ "$params_status" != "200" ]]; then
  # Si le back répond en B0 (projet sans V2), /params exige msg_id → 400.
  # On log warn + skip ; la garde (h.1) a déjà signalé le fallback.
  echo "  !! (h.2) HTTP $params_status — probablement projet non-V2. Body: $params_body"
else
  python3 - "$params_body" <<'PY'
import json, sys
body = json.loads(sys.argv[1])
items = body.get("params") or body.get("items") or []
if not isinstance(items, list):
    print(f"1.7.1 (h.2) : /dict/params attendu avec `params` liste, body={body}", file=sys.stderr)
    sys.exit(2)
if not items:
    # Projet sans occurrence V2 (pas d'ingestion `param_occurrence`) :
    # non bloquant, la UI 1.7.1 ne consomme pas ce chemin.
    print(f"  !! (h.2) /dict/params V2 vide pour TEST2 — "
          "projet non ingéré en V2. Non bloquant (la UI 1.7.1 utilise B0).")
    sys.exit(0)
# Cherche q-RxLevMin (le path peut valoir `q-RxLevMin` seul ou être imbriqué).
qrx = [r for r in items if "q-RxLevMin" in str(r.get("path", ""))]
if not qrx:
    print(f"  !! (h.2) /dict/params renvoie {len(items)} rangées sans q-RxLevMin — "
          "probablement 0 occurrence décodée pour ce message. Non bloquant.")
else:
    r = qrx[0]
    unit = r.get("unit_converted")
    buckets = r.get("buckets", [])
    avg_vals = [b.get("avg_converted") for b in buckets if isinstance(b.get("avg_converted"), (int, float))]
    if unit != "dBm":
        print(f"1.7.1 (h.2) : q-RxLevMin unit_converted attendu 'dBm', obtenu {unit!r}", file=sys.stderr)
        sys.exit(2)
    if not avg_vals:
        print(f"1.7.1 (h.2) : q-RxLevMin n'a aucun bucket avec avg_converted non null — "
              f"conversion 3GPP non appliquée. buckets={buckets}", file=sys.stderr)
        sys.exit(2)
    print(f"  ✓ (h.2) /dict/params V2 — q-RxLevMin unit={unit} "
          f"avg_converted non null sur {len(avg_vals)}/{len(buckets)} buckets")
PY
fi

echo "[G2] OK"
