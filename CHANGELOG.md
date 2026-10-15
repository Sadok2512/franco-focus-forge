# Changelog

## 1.6.0 (minor) — bc4-front 2026-10-15 — pastilles opérateurs colorées + suppression projet (DELETE /projects/{id})

### Diagnostic (ce que 1.5.1 lisait)
- La liste projets (`src/routes/_app.projects.tsx`) rendait les colonnes « Opérateurs » et « Technologies » **uniquement** depuis `project.operators_plmn` / `project.technos_seen` (via `joinByCount`). Or le listing live `GET /projects` du `bc4-back 0.10.0` NE PORTE PAS ces champs au niveau de chaque ligne (seul `GET /projects/{id}/import` les expose, et pour TEST2 `operators_plmn={}` car `bc4-decoder 1.0.0` n'expose pas de PLMN). Résultat observé : « N/D » partout sur les 6 projets seedés B0 (Paris 2026 Q1, Lyon, Marseille, Rennes, Lille Indoor, Benchmark National), **alors même que `operators=["Orange","SFR","Bouygues","Free"]` et `technologies=["LTE","NR","EN-DC"]` sont peuplés B0**.
- Les mocks avaient des pastilles plus colorées via `OpBadge` (`src/components/bc4/AppShell.tsx:216` — bordure `border-op-*` + texte `text-op-*`) et le dot `OP_DOT = { Orange: "bg-op-orange", … }` de la Vue d'ensemble (`src/routes/_app.overview.tsx:38`). La liste projets héritée du mock Lovable rendait des pastilles pleines `bg-op-*` que la version 1.5.1 avait perdues en passant au rendu monospace `operatorsLabel` (string joined par `· `).

### Ajouté
- Composant chip partagé `OperatorChip` dans `src/features/projects/shared.tsx` : pastille pleine couleur **alignée sur les variables `--op-*` déjà présentes dans `src/styles.css`** et sur le `OP_DOT` de la Vue d'ensemble — `bg-op-orange` (Orange), `bg-op-sfr` (SFR, rouge), `bg-op-bouygues` (Bouygues, bleu), `bg-op-free` (Free, gris foncé/noir), `text-white` pour contraste. Un libellé **inconnu** (ex. PLMN brut `20801` fallback B1-ingest, ou un nouvel opérateur non reconnu) tombe sur une pastille `slate` neutre + `title` « libellé non résolu » — règle dure « jamais inventer une couleur depuis une clé non reconnue ». Le composant est réutilisé par la liste projets ET par l'accordéon détail (`ProjectRowDetails.tsx`) pour la cohérence visuelle — zéro duplication.
- Composant badge partagé `TechBadge` dans `src/features/projects/shared.tsx` : rendu sobre bordé coloré par techno (`LTE` → primaire, `NR` → bleu Bouygues, `EN-DC` → orange, `UMTS`/`GSM` → neutre muted). Même règle : techno inconnue → neutre, pas d'invention.
- Nouveaux helpers `selectOperatorLabels(project)` / `selectTechLabels(project)` dans `src/features/projects/shared.tsx` : préfèrent les champs **B0** (`project.operators` / `project.technologies` qui portent déjà les libellés), fallback sur les clés `operators_plmn` / `technos_seen` triées par count desc. Les deux sources vides → `[]` → la UI rend « N/D ». La UI expose **toujours** la clé telle quelle (PLMN brut si c'est tout ce qu'on a côté back) — l'écart « PLMN→opérateur » reste explicite.
- Action « Supprimer le projet » dans le menu kebab `...` de chaque ligne (`src/routes/_app.projects.tsx`) : `DropdownMenu` shadcn (`src/components/ui/dropdown-menu.tsx`) avec un seul item destructif (icône `Trash2` + classe `text-destructive`). Un clic ouvre une **confirmation inline** `DeleteProjectDialog` (nouveau composant `src/features/projects/DeleteProjectDialog.tsx`, bâti sur `AlertDialog` shadcn/radix) — jamais `window.confirm`. La modale liste explicitement les cascades supprimées (fichiers NMF, événements, points, observations RRC — alignement sur FK CASCADE côté DB du `bc4-back 0.10.0`).
- Adaptateur `deleteProject(projectId): Promise<void>` dans `src/lib/api/projects.ts`, re-exporté via `client.ts` : `DELETE /projects/{id}` avec `Authorization: Bearer` (centralisé par `apiFetch`), schéma réponse `z.unknown()` (204 No Content, pas de corps). Branche mock cohérente : `deleteProjectMock(id)` dans `src/mocks/projects.ts` qui (a) supprime du LS `bc4.mock.projects.v1` les projets créés en session, (b) masque les projets seedés via un second LS `bc4.mock.projects.hidden.v1` sans toucher aux fixtures `PROJECTS` (qui alimentent Overview/Dict/KPI), (c) renvoie `false` + le site d'appel lève `ApiHttpError(404, "Projet introuvable")` pour aligner le comportement sur l'API réelle. Les erreurs 401/réseau/4xx-5xx remontent telles quelles via `toUserMessage`.
- Mutation côté UI (`useMutation` TanStack Query) qui invalide la query `["projects"]` sur succès → la ligne disparaît du listing après refetch ; notification discrète 4 s en bas à droite (« Projet « X » supprimé. ») en remplacement d'un toast sonner (non monté dans l'app). L'action « Ajouter des logs » existante (`ProjectRowNmfAction`) reste intacte.
- `scripts/g2_smoke_api.sh` étendu d'un cas **(g) 1.6.0** : (g.1) `DELETE /projects/id-inconnu` → attend **HTTP 404** (classe `ApiHttpError`) ; (g.2) `POST /projects` (projet smoke) → `DELETE /projects/{id}` → attend **HTTP 204 No Content** → `GET /projects` → vérifie que l'id est **absent** (prouve l'effet de bord DB + l'invalidation que la UI exerce côté cache React Query).

### Corrigé
- Liste projets : colonnes « Opérateurs » / « Technologies » lisent désormais `selectOperatorLabels(p)` / `selectTechLabels(p)` **en priorité sur les champs B0** (`project.operators` / `project.technologies` qui portent les labels Orange/SFR/LTE/NR/… en clair), avec fallback sur les clés `operators_plmn` / `technos_seen` seulement si B0 vide. Résultat : Paris 2026 Q1 affiche 4 pastilles pleines (Orange, SFR, Bouygues, Free) + 3 badges technos (LTE, NR, EN-DC) — plus de « N/D » partout. Les projets live créés via ingest (ex. TEST2) dont `operators`=[] ET `operators_plmn={}` restent en « N/D » (comportement correct, pas une invention).
- Filtres déroulants « Opérateur » / « Technologie » : la logique `rows` utilise maintenant les **labels effectifs** (`selectOperatorLabels` / `selectTechLabels`) et non `p.operators.includes(...)` + `p.technologies.includes(...)`. Un projet dont la seule source est `operators_plmn` (clés PLMN brutes) ne matche pas « Orange » tant que la table `PLMN→opérateur` n'est pas câblée côté back — explicitement, pas par oubli.
- Accordéon détail (`src/features/projects/ProjectRowDetails.tsx`) : utilise désormais `OperatorChip` + `TechBadge` partagés (au lieu de son `Badge` local supprimé) pour un rendu cohérent avec la liste. Les counts restent affichés en police mono à côté de la chip (pas noyés dans la pastille).

### Écarts restants
- **PLMN non résolu en libellé opérateur** (hérité 1.5.1) : le `bc4-back 0.10.0` n'expose toujours pas de table `PLMN→opérateur`. La source canonique d'affichage côté UI est actuellement **le champ B0 `project.operators`** (déjà peuplé pour les projets seedés). Dès que `bc4-back` enrichira chaque entrée `operators_plmn` d'un `label` (ou exposera un endpoint `/reference/operators`), ajouter un helper `plmnToOperator(plmn)` dans `src/lib/api/schemas.ts` et le câbler dans `selectOperatorLabels` + `OperatorChip` ; côté chip la couleur s'alimentera automatiquement puisqu'elle est indexée par label connu. Lot « back enrichit operators_plmn » reste ouvert.
- Le listing `GET /projects` live n'embarque toujours pas `operators_plmn` / `technos_seen` au niveau ligne : le fallback B1-ingest reste donc inutilisé en pratique sur le listing (seul l'accordéon tape `GET /projects/{id}/import` pour les détails avec counts). Dès que le listing les expose, les deux sources alimenteront la UI sans changement de code (fallback automatique).

### Gardes (à lancer à la main)
```
export VITE_BC4_API_BASE=http://localhost:8000
export BC4_ADMIN_EMAIL=demo@demo.com
export BC4_ADMIN_PASSWORD=demo
scripts/g1_build.sh         # lint + tsc + build (couvre DeleteProjectDialog + chip component)
scripts/g2_smoke_api.sh     # bout-en-bout + (g) 1.6.0 : DELETE /projects/{id} (404 + 204 + absent après)
scripts/g5_diff_scope.sh    # scope : src/lib/api/* + features/projects/* + routes + mocks
```

## 1.5.1 (patch) — bc4-front 2026-10-15 — colonnes Opérateurs/Technologies peuplées + accordéon détail d'ingestion

### Ajouté
- Colonne « Opérateurs » de la liste projets (`src/routes/_app.projects.tsx`) peuplée depuis `project.operators_plmn` (dict `{PLMN: n_events}`) renvoyé par `GET /projects` et `GET /projects/{id}` : clés jointes par `· ` (ex. `20801 · 20810`), triées par count décroissant. Dict vide ou absent → « N/D », jamais `0`, jamais de libellé opérateur inventé — **PLMN BRUTS tant que la table de référence PLMN→opérateur n'est pas câblée côté back** (écart hérité, voir « Écarts restants »).
- Colonne « Technologies » de la liste projets peuplée depuis `project.technos_seen` (dict `{techno: n_events}`) : clés `LTE`/`UMTS`/`NR` ordonnées par count décroissant, jointes par `· ` (ex. `LTE · UMTS`). Vide → « N/D ».
- Accordéon par ligne (`src/features/projects/ProjectRowDetails.tsx`) : chevron à gauche de chaque ligne (`aria-expanded`/`aria-controls`) qui déplie un détail d'ingestion LAZY. Contenu : (a) totaux `n_captures_ingest` / `n_events_ingest` / `gps_coverage_pct` formatés via `nd`/`ndPct` (null → « N/D », jamais `0 %`) ; (b) technos en badges `techno: count` ; (c) opérateurs en badges `PLMN: count` (ou « N/D (le décodeur `bc4-decoder 1.0.0` n'expose pas de PLMN) » si dict vide) ; (d) tableau des fichiers importés (`by_file[]` : filename, status, n_captures, n_events, n_gps, decoder_version, error_msg) chargé via `getImportReport(projectId)` SEULEMENT à l'ouverture (`useQuery({ enabled: open })`, pas de requête tant que la ligne est fermée). Un fichier `status: "error"` affiche son `error_msg` TEL QUEL — jamais avalé.
- Nouvel adaptateur `getImportReport(projectId)` dans `src/lib/api/projects.ts` (exposé via `client.ts`) : `GET /projects/{id}/import`, réponse validée strictement par `NmfImportReportSchema` existant. Branche mock cohérente : `findImportReportMock(id)` dans `src/mocks/projects.ts` renvoie un rapport canné dérivé de l'overlay d'ingestion seedé — la UI vit sans back.
- Enrichissement du mock `src/mocks/projects.ts` : table `INGEST_OVERLAYS` explicite par projet seedé (`idf-t3-2026`, `lyon-drive-2026`, `marseille-5g-2026`, `rennes-lte-2026`, `lille-indoor-2026`, `national-2026`), avec `operators_plmn` en PLMN BRUTS (`20801`/`20810`/`20820`/`20815`), `technos_seen`, `n_captures_ingest`, `n_events_ingest`, `gps_coverage_pct` (incluant un cas `null` « indoor pur » pour Tests Indoor — règle dure « null jamais 0 »), `status_ingest`, et un `by_file[]` cohérent (incluant un fichier `status: "error"` pour Tests Indoor avec `error_msg` « ASN.1: footer tronqué (checksum invalide) » — exerce la propagation UI).
- Helpers formatters mutualisés dans `src/features/projects/shared.tsx` : `joinByCount(dict)` → clés triées par count décroissant jointes par `· ` ou « N/D » si vide, et `sortByCountDesc(dict)` → entrées triées pour les badges.
- Smoke test `scripts/g2_smoke_api.sh` étendu d'un cas **(f) 1.5.1** : `GET /projects` → sélection d'un id → `GET /projects/{id}/import` → vérifie que la réponse respecte `NmfImportReportSchema` (mêmes clés que (d)/(e)) **ET** qu'au moins un projet renvoie `n_events > 0` ET `technos_seen` non vide (prouve que l'accordéon aura de la matière à afficher). Un back frais sans ingestion réelle n'échoue pas — note de rejouer après un vrai upload.

### Corrigé
- Extension du schéma Zod `ProjectSchema` (`src/lib/api/schemas.ts`) : ajout des clés d'ingestion `operators_plmn` / `technos_seen` / `n_captures_ingest` / `n_events_ingest` / `gps_coverage_pct` / `status_ingest`, toutes `.nullable().optional()` pour (a) rester compatibles avec les fixtures B0 héritées qui ne les exposent pas (pas de régression de parse), (b) respecter la règle « null → N/D » centralisée dans `shared.tsx` (`nd` / `ndPct`). `operators_plmn` et `technos_seen` sont `Record<string, number>` — pas d'enum `Operator`/`Tech` fermé car le back peut renvoyer des clés hors enum historique (ex. `UMTS` observé sur TEST2 sur un vrai log `bc4-decoder 1.0.0`).

### Écarts restants
- **PLMN non résolu en libellé opérateur** (hérité) : la UI affiche les clés PLMN brutes (`20801`, `20810`, …) car le back ne fournit pas de table de référence PLMN→opérateur. Dès que `bc4-back` expose une table (ou que `operators_plmn` enrichit chaque entrée d'un `label`), ajouter un helper `plmnToOperator(plmn)` dans `src/lib/api/schemas.ts` et le câbler côté `joinByCount` + `ProjectRowDetails`. Zéro deviner côté front en attendant — on ne mappe pas « 20801 → Orange » sans source de vérité serveur.
- Le listing `GET /projects` courant du bc4-back 0.7.1 n'embarque pas encore `operators_plmn`/`technos_seen` au niveau de chaque ligne : la UI affiche « N/D » pour ces projets et déplie l'accordéon pour lire `GET /projects/{id}/import` à la demande. Dès que le listing les expose, les colonnes s'alimentent sans changement UI.

### Gardes (à lancer à la main)
```
export VITE_BC4_API_BASE=http://localhost:8000
export BC4_ADMIN_EMAIL=demo@demo.com
export BC4_ADMIN_PASSWORD=demo
scripts/g1_build.sh         # lint + tsc + build (couvre ProjectRowDetails + schémas étendus)
scripts/g2_smoke_api.sh     # bout-en-bout + (f) 1.5.1 : GET /projects/{id}/import
scripts/g5_diff_scope.sh    # scope : src/lib/api/* + features/projects/* + routes + mocks
```

## 1.5.0 (minor) — bc4-front 2026-10-15 — P1-3 câblage upload API + erreurs explicites

### Corrigé
- Correctif : upload `cell_ref` + NMF câblés sur l'API réelle (Bearer JWT, progression XHR), erreurs 401 / réseau / 4xx-5xx distinguées via trois classes typées (`ApiUnauthenticatedError`, `ApiNetworkError`, `ApiHttpError` avec `detail`) centralisées dans `src/lib/api/http.ts` + `toUserMessage(err)` ; le `message` du back est désormais affiché TEL QUEL (ex. `HTTP 422 — En-tête CSV non conforme`), plus de « Backend injoignable » générique. `apiOrMock` ne bascule plus silencieusement en mock sur erreur réseau en mode `api`. `VITE_BC4_API_BASE` documenté dans `.env.example` (modes `/api`, hôte, container-to-container) ; note explicite : toute modif impose un redémarrage/rebuild Vite.
- Correctif : page détail projet affiche désormais un CTA visible « Ajouter des logs » (bouton primaire `src/features/projects/ProjectPage.tsx`) qui scrolle vers la section d'import et déclenche le picker `.nmf` du `NmfImportPanel` déjà monté (aucune réécriture du composant d'ingest, `id="nmf-files"` relayé). Flux « créer projet → ajouter logs → choisir fichier » rétabli : la soumission reste pilotée par `NmfImportPanel` (`uploadNmfFiles` du `client.ts`, Bearer JWT, progression XHR, `toUserMessage` pour 401/réseau/4xx-5xx, rapport `NmfImportReportView` avec `null`→N/D). `scripts/g2_smoke_api.sh` étendu d'un cas (d) bout-en-bout login → `POST /projects` → `POST /projects/{id}/nmf` qui attend `status`+`by_file[]` du rapport.
- Ajouté : second point d'entrée « Ajouter des logs » directement dans la colonne Actions de la liste projets (`src/routes/_app.projects.tsx`, à côté d'« Ouvrir ») — ouvre le picker multi-fichiers `.nmf` et poste sur `/projects/{id}/nmf` sans quitter l'écran. La mécanique d'upload (progression XHR cumulée, réconciliation `by_file`, classification `toUserMessage` 401/réseau/4xx-5xx) est factorisée dans un nouveau hook `src/features/projects/useNmfUpload.ts` consommé par les DEUX entrées (page détail et ligne de liste) — zéro duplication de `NmfImportPanel`. Pendant l'envoi la ligne affiche « Statut : Traitement » + percent cumulé (string explicite, pas un code brut) ; après succès « Captures » prend `n_captures` du rapport (jamais `n_events`) et le statut dérive de `files_error > 0` (`error` + premier `by_file[].error_msg`) ou retombe sur le `status` du projet rafraîchi via refetch de `GET /projects` ; après échec HTTP la ligne revient à son état précédent avec un badge d'erreur `toUserMessage` (jamais de reset silencieux). `scripts/g2_smoke_api.sh` étendu d'un cas (e) bout-en-bout login → `GET /projects` → sélection d'un id → `POST /projects/{id}/nmf` qui vérifie la MÊME forme de `NmfImportReportSchema` que (d).

## 1.4.1 (patch) — bc4-front 2026-10-15 — amendement B1-réf (filtre Zone ARCEP)

### Ajouté
- Ajouté : filtre `Zone ARCEP` dans Dictionnaire et KPI, 11 valeurs + N/D, chargées depuis `/reference/cell/summary.arcep_breakdown`.

## 1.4.0 (minor) — bc4-front 2026-10-15 — Login JWT + session (B2, Agent BC1)

### Ajouté
- Zod `src/lib/api/auth-schemas.ts` 1:1 avec `app/schemas/auth.py` de
  bc4-back 0.7.0 : `AppUserRoleSchema`, `PublicUserSchema`,
  `LoginRequestSchema`, `LoginResponseSchema`.
- `src/lib/api/http.ts` réécrit :
  - Session complète `{token, token_type, expires_at, user: PublicUser}`
    persistée en `localStorage`, **validée par Zod** à chaque lecture —
    une session corrompue ou expirée est purgée, pas de session
    « zombie ».
  - Toute requête API injecte **`Authorization: Bearer <token>`**.
    Plus de headers `X-Actor-*`.
  - Un **401** côté serveur → purge locale + évènement
    `bc4:unauthenticated` ; `AppShell` l'écoute et redirige
    `/login`.
  - `login(email, password)`, `logout()` (best-effort serveur + purge
    locale), `fetchMe()` (`GET /auth/me`).
- `src/lib/auth.ts` réécrit comme **shim** au-dessus de `http.ts` : la
  surface `{getSession, getActor, login, logout, setDemoRole, DEMO_USER}`
  héritée du B0 est préservée (zéro signature changée chez les
  consommateurs). Le rôle est traduit du vocabulaire FR du back
  (`admin`/`ingenieur`/`lecteur`) vers le vocabulaire Zod existant
  (`admin`/`editor`/`viewer`) via une table explicite — jamais deviné.
- `src/routes/login.tsx` : champ **« Adresse e-mail »**, hint
  pointant vers les variables d'env serveur
  `BC4_ADMIN_EMAIL` / `BC4_ADMIN_PASSWORD`.
- `src/components/bc4/AppShell.tsx` : listener `UNAUTH_EVENT` qui
  redirige vers `/login`. Le bouton logout existant appelle désormais
  `/auth/logout` via le shim.
- `scripts/smoke_api.ts` : login réel au départ via
  `BC4_ADMIN_EMAIL` / `BC4_ADMIN_PASSWORD`, puis **tous** les appels
  passent via `Authorization: Bearer <token>`.

### Modifié / retiré
- `.env`, `.env.example` : **retrait de `VITE_BC4_DEV_ACTOR`** et de
  son bootstrap. L'identité vient uniquement du login réel.
- `src/lib/api/projects.ts`, `src/lib/api/reference.ts` : les uploads
  XHR injectent `Authorization: Bearer <token>` (plus de `X-Actor-*`).
- `scripts/g1_build.sh` lint élargi aux fichiers B2.
- `scripts/g5_diff_scope.sh` whitelist étendue (login.tsx,
  auth.ts, AppShell.tsx — autorisés par le lot).

### Écarts ouverts
- **Toggle « Rôle simulé »** en haut de Paramètres (B0) devient
  no-op (le rôle vient du JWT serveur). Pour exercer un rôle
  non-admin, créer un vrai compte seedé via l'env. `setDemoRole()`
  reste exporté pour ne rien casser côté imports.
- **Pas d'écran reset mot de passe** : les comptes sont ajoutés
  par admin via seed env côté back ; lot ultérieur.
- **JWT stateless** : un logout ne révoque pas le token côté
  serveur. Déclaré au CHANGELOG bc4-back 0.7.0.

### Gardes (à lancer à la main)
```
export VITE_BC4_API_BASE=http://localhost:8000
export BC4_ADMIN_EMAIL=admin@bc4.local
export BC4_ADMIN_PASSWORD=... # idem container API
scripts/g1_build.sh         # lint + tsc + build (couvre auth)
scripts/g2_smoke_api.sh     # login réel + bout-en-bout Bearer
scripts/g3_zod_runtime.sh   # Zod runtime (inchangé)
scripts/g4_mock_fallback.sh # repli mock (inchangé)
scripts/g5_diff_scope.sh    # scope : src/lib/api/* + auth + layout + env
```

## 1.3.0 (minor) — bc4-front 2026-10-15 — B1-ingest (création projet + import NMF)

### Ajouté
- Création de projet depuis l'écran « Mes projets » : bouton
  « Nouveau projet » ouvre une boîte de dialogue (`name` requis),
  appelle `POST /projects`, puis redirige sur `/projects/{id}`. Le
  listing (`GET /projects`) est désormais la seule source — plus de
  mock résiduel pour cette route.
- Nouvelle route `/_app/projects/$projectId` (page détail projet)
  avec contrôle multi-fichiers « Importer des logs NMF » :
  sélection multiple, barre de progression **par fichier** (XHR,
  `upload.onprogress`), état par fichier (`pending → decoding →
  done | error`) et affichage brut de `error_msg` quand un fichier
  échoue (aucune erreur avalée).
- Affichage immédiat du `NmfImportReport` renvoyé par le back :
  fichiers reçus / ok / échec, captures + événements décodés,
  **couverture GPS** affichée « N/D » quand `null` — **jamais 0 %
  pour une couverture inconnue**, répartitions opérateurs vus /
  technos vues, et table détaillée par fichier (`decoder_version`
  inclus, `error_msg` affiché tel quel).
- Nouveaux schémas Zod `src/lib/api/nmf-schemas.ts` (1:1 Pydantic
  `NmfImportReport` + `NmfFileEntry`, `error_msg` et
  `decoder_version` nullables) et `src/lib/api/project-schemas.ts`
  (`CreateProjectRequestSchema` + `ProjectIngestViewSchema` : vue
  d'ingestion renvoyée par `POST /projects`, résumés `operators /
  technos / n_captures / n_events / gps_coverage_pct` nullables
  — tant qu'aucun NMF n'a été ingéré, la UI affiche « N/D »).
- Adaptateur `src/lib/api/projects.ts` : `createProject(name)` et
  `uploadNmfFiles(projectId, files, { onFileProgress })`. En mode
  `api`, chaque réponse est validée par Zod ; une forme non conforme
  lève immédiatement, aucun rendu silencieux. En mode `mock`,
  `src/mocks/projects.ts` fournit un projet canné et un rapport NMF
  canné (incluant un fichier en erreur et une couverture GPS `null`)
  pour exercer la UI sans backend.
- `src/features/projects/` : composants `CreateProjectDialog`,
  `NmfImportPanel` (progression + statut par fichier),
  `NmfImportReportView` (rendu complet du rapport), `ProjectPage`
  (orchestration), `shared.tsx` (helpers `nd`/`ndPct`/`fmtBytes` —
  règle null-safe centralisée).
- Smoke test (`scripts/smoke_api.ts`) étendu à `POST /projects` et
  `POST /projects/{id}/nmf` via un helper `hitOr501` qui **tolère un
  501** (endpoint bc4-back pas encore implémenté, écart ouvert) tout
  en levant bruyamment sur toute autre erreur.
- `package.json` bumped de `1.0.0` (incohérent avec le CHANGELOG) à
  `1.3.0`.

### Modifié
- `src/routes/_app.projects.tsx` : bouton « Nouveau projet » câblé
  sur la mutation `createProject` + dialogue de création ; action
  « Ouvrir » redirige maintenant sur `/projects/$projectId` (au lieu
  de `/overview?project=...`) pour atterrir sur l'écran d'ingestion.
- `src/lib/api/client.ts` : `getProjects` / `getProject` fusionnent
  les projets créés en mock avec les seeds de démonstration (via
  `src/mocks/projects.ts` persisté en `localStorage`), de sorte que
  la liste reflète les créations locales en mode `mock`. Les routes
  HTTP restent inchangées en mode `api`.
- `scripts/g1_build.sh` étendu : lint des nouveaux fichiers Projets
  + mocks + routes.
- `scripts/g5_diff_scope.sh` étendu : scope autorisé étendu à
  `src/features/projects/*`, `src/mocks/projects.ts`,
  `src/routes/_app.projects.$projectId.tsx`, `package.json`.

### Écarts ouverts
- **Deux vues de projet** : `GET /projects/{id}` renvoie la vue
  historique `Project` (status `ready|processing|failed`) tandis
  que `POST /projects` renvoie `ProjectIngestView` (status
  `draft|importing|ready|error`). La UI après création redirige
  sur `/projects/{id}` et appelle `GET /projects/{id}` — le back
  mappe actuellement `draft → processing` pour conserver la
  compatibilité de l'écran liste. À consolider côté bc4-back si
  un besoin de cycle de vie fin se présente.
- **Tolérance 501 côté smoke** : le helper `hitOr501` reste en
  place par précaution (si bc4-back désactive temporairement ces
  routes pendant une migration, le smoke ne casse pas sur un
  écart déclaré). Toute autre erreur HTTP reste bruyante.
- **Formulaire de création minimaliste** : seul `name` est envoyé.
  Les autres propriétés (`geography`, périmètre temporel, bandes,
  opérateurs) sont inférées côté back à partir des logs NMF importés
  — la UI affiche « À définir après le premier import NMF » tant que
  l'ingest n'a pas tourné.
- **Taille maximum de l'envoi** non plafonnée côté UI : c'est le
  back qui arbitre (le proxy Vite est déjà configuré avec un
  `timeout` 10 min).
- **Historique d'imports NMF par projet** : non exposé en B1-ingest
  (le CHANGELOG historique se limite au dernier rapport affiché).
  À ajouter si un besoin produit se présente.
- **Annulation granulaire** : le signal d'abort annule l'ensemble
  de l'envoi XHR, pas un seul fichier. Les fichiers restés en
  `pending` au moment de l'erreur basculent `error` avec le message
  réseau — aucun fichier n'est laissé en limbo.

### Gardes (à lancer à la main)
```
export VITE_BC4_API_BASE=http://localhost:8000
scripts/g1_build.sh         # lint + tsc + build (couvre les nouveaux fichiers B1-ingest)
scripts/g2_smoke_api.sh     # smoke bout-en-bout, inclut /projects (POST) + /projects/{id}/nmf (POST)
scripts/g5_diff_scope.sh    # périmètre : src/lib/api/* + features/projects + mocks/projects + routes projets + package.json
```

## 1.2.0 (minor) — bc4-front 2026-10-15 — Écran de référence cellulaire (B1-réf)

### Ajouté
- Nouvel onglet « Référence cellulaire » dans Paramètres
  (`/settings/cellular-reference`) : sélecteur de fichier CSV →
  `POST /reference/cell/upload` en multipart. L'upload XHR
  expose une barre de progression continue (loaded / total /
  pourcentage), le bouton est désactivé pendant l'envoi, les erreurs
  réseau sont affichées explicitement, aucune troncature silencieuse.
- Affichage immédiat de l'`ImportReport` : lignes lues / chargées /
  rejetées, rejets par motif, cellules distinctes (ECI/NCI),
  répartition 4G/5G, état de fonctionnement.
- `bands_unmapped` **mis en évidence comme écart ouvert** quand il est
  non vide (alerte rouge, liste des bandes et comptes) — jamais
  masqué derrière un 0.
- Historique des imports sous le formulaire (`GET /reference/cell/imports`)
  et résumé base (`GET /reference/cell/summary`) regroupé par
  RAT / bande 3GPP / DOR / DR. `null` → affiché **« N/D »**, jamais 0.
- Adaptateur `src/lib/api/reference.ts` + Zod 1:1
  `src/lib/api/reference-schemas.ts` (ImportReport, ReferenceImportEntry,
  CellSummary). Mode `mock` renvoie un `ImportReport` canné pour que
  l'écran vive sans backend. En mode `api`, chaque réponse est validée
  par son schéma Zod ; une forme non conforme lève immédiatement.
- Smoke test (`scripts/smoke_api.ts`) étendu aux routes
  `/reference/cell/imports` et `/reference/cell/summary`.

### Écarts ouverts
- Pas de résumé serveur par `cell_class` ni par `coverage` en B1-réf
  (ces colonnes sont stockées mais pas regroupées côté API). À ajouter
  si un besoin produit se présente.
- L'écran reste dans l'onglet « Paramètres » : la mutualisation avec
  un onglet « Référence » dédié hors Paramètres est reportée.

### Gardes (à lancer à la main)
```
export VITE_BC4_API_BASE=http://localhost:8000
scripts/g1_build.sh         # lint + tsc + build (couvre les nouveaux fichiers)
scripts/g2_smoke_api.sh     # smoke bout-en-bout, inclut /reference/cell/*
scripts/g5_diff_scope.sh    # périmètre : src/lib/api/* + page référence + layout tab
```

## 1.1.0 (minor) — bc4-front 2026-10-15 — Bascule front → API (client HTTP)

### Ajouté
- `src/lib/api/http.ts` : couche transport unique. Lit `VITE_BC4_API_BASE`
  et `VITE_BC4_DATA` depuis l'environnement Vite, parse chaque réponse
  via le schéma Zod existant, mappe les erreurs backend
  `{code, message}` sur la forme `ApiError` déjà attendue par la UI.
  Expose `apiFetch`, `apiOrMock`, `buildQuery`, `login`, `logout`,
  `getSession`, `setSession`, `ApiHttpError`, `ApiNotImplementedError`.
- Sélecteur de source `VITE_BC4_DATA = "api" | "mock"` (défaut `mock`).
  En mode `api`, chaque fonction d'adaptateur appelle le backend puis
  valide via Zod ; en cas de panne réseau, repli automatique sur mock
  avec un `console.warn` **bruyant** (jamais silencieux).
- Session HTTP : `/auth/login` stocke `{login, role, token}` en
  `localStorage` ; les headers `X-Actor-Login` / `X-Actor-Role` sont
  renvoyés sur chaque appel protégé. Pré-amorçage par
  `VITE_BC4_DEV_ACTOR=login:role` tant qu'il n'y a pas d'écran de
  login (écart déclaré).
- Scripts gardes `scripts/g1_build.sh`, `g2_smoke_api.sh`,
  `g3_zod_runtime.sh`, `g4_mock_fallback.sh`, `g5_diff_scope.sh` +
  `smoke_api.ts` qui rejoue tous les endpoints de la démo contre le
  backend réel et valide chaque réponse via Zod.
- `.env.example` documente `VITE_BC4_DATA`, `VITE_BC4_API_BASE`,
  `VITE_BC4_DEV_ACTOR`.

### Modifié
- `src/lib/api/client.ts`, `dictionary.ts`, `assistant.ts`, `settings.ts` :
  chaque fonction publique dispatche entre API et mock via
  `apiOrMock`, en préservant **strictement** sa signature et son type
  de retour. Les routes HTTP et query params sont dérivés du
  `/openapi.json` du backend (jamais devinés).
- Validation Zod systématique au runtime : une réponse non conforme à
  son schéma lève immédiatement, pas de rendu silencieux.

### Écarts ouverts
- **Mutations admin lourdes** (`createUser`, `patchUser`,
  `postGeoImport`, `createKpi`, `patchKpi`, `putAiConfig`,
  `testAiConnection`, `putAppearance`, `putOrganization`,
  `resetPassword`, `appendMessages`) : backend B0 renvoie 501 ; en
  mode `api` ces fonctions tombent silencieusement sur le mock local
  tant que B2 n'implémente pas la persistance serveur. Les GET sont
  servis par la DB.
- **Scénarios Assistant** : B0 backend renvoie un scénario neutre
  (`b0_sample_count`) ; les scénarios complets (`rrc_success`,
  `nr_bands`, `endc`, etc.) sont fournis par le mock quand
  `VITE_BC4_DATA=mock`. En mode `api`, l'assistant renvoie un
  résumé minimal issu de la DB.
- **Historique conversations** : backend renvoie `[]` (MOCK-ONLY côté
  schéma Zod). Le store `localStorage` reste la source d'historique
  jusqu'à ce qu'un backend conversationnel soit disponible.
- **Login** : backend B0 accepte n'importe quel mot de passe non vide
  pour un compte seedé actif (hash en base reporté à B2). Le front
  dispose d'une fonction `login(login, password)` prête à être
  câblée sur un écran de login dédié ; en attendant, un acteur par
  défaut peut être pré-amorcé via `VITE_BC4_DEV_ACTOR`.

### Gardes (à lancer à la main)
```
export VITE_BC4_API_BASE=http://localhost:8000
scripts/g1_build.sh         # lint src/lib/api + tsc + build vite
scripts/g2_smoke_api.sh     # smoke bout-en-bout, Zod runtime
scripts/g3_zod_runtime.sh   # G2 + test négatif (schéma faux doit lever)
scripts/g4_mock_fallback.sh # build mock + repli apiOrMock sur NETWORK_ERROR
scripts/g5_diff_scope.sh    # diff limité à src/lib/api + env + scripts
```

## 1.0.0 (major)
- Page Paramètres / Administration avec 7 sous-onglets à URL partageable : Utilisateurs, Géographie, Catalogue KPI, Configuration IA, Apparence, Organisation, À propos & Version.
- Matrice de permissions centralisée (Administrateur / Éditeur / Lecteur) appliquée aussi dans l'API mock ; rôle simulé pour la démonstration.
- Import géographique CSV/XLSX avec mapping de colonnes, validation (doublons, coordonnées, cohérence parent-enfant), rapport d'erreurs et référentiels versionnés.
- Catalogue KPI versionné : formule stockée en texte non exécutable, historique, duplication, archivage.
- Configuration IA sans stockage de secret, test de connexion explicitement simulé ; l'Assistant affiche « Service non activé » si l'IA est désactivée.
- Apparence : clair/sombre/système, densité, couleur principale avec contrôle de contraste ; thème d'organisation.
- Organisation : nom, logo, visibilité dans la barre supérieure et sur les exports CSV.
- Version affichée lue depuis package.json ; nouveautés lues depuis ce changelog.

## 0.2.0 (minor)
- Assistant IA standalone page: history (search, rename, delete, per-project storage), composer with stop/retry, structured response renderer (tables, bar/line/boxplot charts, maps), evidence labels, analysis panel with shared filters, report export.
- Mock POST /projects/{id}/assistant + mock-only history methods; 6 scenarios + empty/error/cancelled.
- Tests: src/test/assistant.test.ts (G2–G6).

## [0.1.0] — 2026-10-14 — CHANGE_TYPE: minor (initial feature release, bc4-front)
### Added
- C1 Dictionnaire RRC LTE + NR : explorateur de protocole (arbre ASN.1 dérivé des `path` retournés, recherche par contenu, clavier), cartes de paramètres, inspecteur (conversion 3GPP issue de `conversion_rule`), distribution, matrice opérateur/bande (CSV), carte GeoJSON.
- Adaptateur mock `src/lib/api/dictionary.ts` respectant les contrats §6 (validation Zod), fixtures déterministes `src/mocks/dictionary.ts`, projet LTE seul « Rennes LTE (sans NR) ».
- Gardes G2 (provenance), G3 (branche NR), G4 (conversion).
### Open gaps
- Filtres géographie hiérarchique (Plaque > DR > Département > Site) et période : seul le département est filtrable ; période unique affichée.
- Chargement/erreur de l'arbre partagés LTE/NR (un seul endpoint `dict/tree`) ; l'état vide est bien distinct par branche.
- Plan indoor : aucune ressource validée → « Plan indoor indisponible ».
