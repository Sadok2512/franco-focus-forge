# Changelog

## 1.17.5 (patch) — bc4-front 2026-10-17 — Garde /kpi via PARCOURS UTILISATEUR réel (shot_flow), tooltips extraits — reproduction du cas « 11 chips gris » (Agent BC2)

> Reproduction demandée avant toute correction. Observation utilisateur :
> « 11 chips gris en v1.17.4, alors que `bun run shot` rend 5 actifs ».
>
> **Diagnostic — ce n'est PAS un bug front** :
> - Script précédent `scripts/shot.ts` injectait `activeProject` et visitait
>   `/kpi` en URL directe → court-circuitait store + timing React.
> - L'utilisateur passe par `/projects → clic "Ouvrir" → clic "KPI Analytics"`.
>   Reproduction via nouveau `scripts/shot_flow.ts` :
>   - **REF_PETITE_FORET** : `active=5, gray=6` (identique à shot direct) ✓
>   - **TEST2** : `active=0, gray=11, console=0 erreur`. **Reproduit le symptôme.**
> - Live back TEST2 `/kpi/filters` renvoie les 14 dims avec `available=false`
>   et `reason` explicite :
>   - operators/rats/bands/… : `"aucune valeur distincte pour measurement_points.X"`
>   - dr/plaque/dor/arcep/commune/insee : `"ECGI non propagé : 0/0 points.
>     Lancer POST /projects/{id}/kpi/_populate_ecgi."`
> - **TEST2 n'a aucune donnée** (0 mp) → chaque dim gris est HONNÊTE et porte
>   sa raison. L'utilisateur voyait TEST2 (soit activeProject persistant du
>   TEST2, soit mauvais projet « ouvert »).
>
> **Vérification contrat front (déjà en 1.17.3)** :
> - `FilterChip:388-397` : `title={label — reason}` → **chaque chip gris
>   affiche sa raison en tooltip** (règle respectée).
> - `_app.kpi.tsx:860-867` : `filtersQ.error` → bandeau rouge visible, pas de
>   chip gris muet (règle respectée).
> - `kpiFetch:148-170` : `console.error` avant throw → pas de parse silencieux.
>
> **Changements de ce lot (garde, pas correction)** :
> - `scripts/shot_flow.ts` : NOUVEAU — parcours UI réel (login → /projects →
>   click "Ouvrir" sur un projet par nom → click "KPI Analytics" nav →
>   `waitForFunction` jusqu'à "Filtres" visible). Extrait `chipTooltips` :
>   liste `{label, kind: active|gray|malformed|error|available-no-value,
>   tooltip}` pour TOUTE la barre. Log réseau `kpiFiltersCalls` (URL +
>   statut + timing).
> - `package.json` : `bun run shot` → `shot_flow.ts` (parcours UI).
>   `bun run shot:direct` → `shot.ts` (URL directe, pour debug schéma back).
> - **Design inchangé**, aucun composant touché.
>
> **Gardes PNG** (parcours réel) :
> - `shot-flow-REF_PETITE_FORET-*.png` : 5 actifs + 6 gris avec tooltips
>   `"DR — ECGI non propagé : 0/68090 points…"` etc.
> - `shot-flow-TEST2-*.png` : 11 gris avec tooltips distincts par dim.
>
> **Message pour l'utilisateur** : si tu vois 11 gris sur ce que tu crois
> être REF, vérifie l'activeProject (`bc4.activeProject.v1.<ton-email>`
> dans localStorage) OU hard-refresh (Ctrl+Shift+R) — l'ancien bundle
> pouvait avoir un activeProject TEST2 persistant.

## 1.17.4 (patch) — bc4-front 2026-10-17 — Label `v{APP_VERSION}` dans l'en-tête à côté du logo + source unique de version (Agent BC2)

> Ajout au lot 1.17.3 (filtres /kpi), pas de lot séparé.
>
> **Changements** :
> - `AppShell` : nouveau composant `HeaderVersion` affiché juste après
>   `<Logo />` dans l'en-tête (toutes les pages). Rend `v{APP_VERSION}`
>   en style sous-titre (`text-xs font-medium text-muted-foreground`,
>   même rendu que le nom d'organisation). Tooltip au survol :
>   `front v1.17.4 · back vX.Y.Z` — la version back vient de
>   `useQuery(getBackHealth)` (déjà présent via `lib/api/project-kpi`),
>   staleTime 60 s. Si le back est injoignable, tooltip affiche
>   `back v?` — jamais une version inventée.
> - **Source unique de version** : `src/lib/version.ts` exporte
>   `APP_VERSION` lu de `package.json`. Le constant `FRONT_VERSION`
>   dupliquée dans `_app.kpi.tsx` (string tapée à la main) est **retirée**.
>   Le pied de sidebar `/kpi` utilise désormais `APP_VERSION` aussi.
>   Garde grep : `grep -rn "FRONT_VERSION" src/` → 0 résultat ;
>   `grep -rn "APP_VERSION" src/` → 3 résultats (version.ts, AppShell.tsx,
>   _app.kpi.tsx).
>
> **Design inchangé ailleurs** : seule la zone à droite du logo gagne un
> label texte. Pas de nouvelle route, pas de bump de dépendance.
>
> Garde : PNG de l'en-tête montrant « BC4 v1.17.4 » + tooltip visible.

## 1.17.3 (patch) — bc4-front 2026-10-16 — /kpi : barre de filtres rendue depuis la LISTE ATTENDUE côté front, jamais depuis la réponse back — plus aucun échec de parse silencieux (Agent BC2)

> Incident : sur REF, la barre entière de filtres disparaissait quand le
> back renvoyait une dimension sous une forme inattendue (ex. 1.17.2 :
> `dr/plaque/dor/arcep/commune/insee = {available:false, reason}` sans
> `values`). Diagnostic : la **condition exacte** qui retirait la barre
> était un **parse Zod silencieux** combiné à un `useQuery.error` jamais
> consulté.
>
> Chaîne précise :
> 1. `kpiFetch` (`src/lib/api/project-kpi.ts`) faisait `safeParse` et
>    `throw KpiContractMismatchError` sans `console.error` préalable.
> 2. React Query capturait l'exception dans `filtersQ.error` — rien n'était
>    émis sur la console du navigateur (donc fausse impression de silence).
> 3. Le composant `KpiPage` ne lisait **que** `filtersQ.data`, jamais
>    `filtersQ.error`. Résultat : `filtersData = undefined`, les 11 chips
>    recevaient `dim=undefined`, et dans l'ancien `FilterChip` ils
>    retournaient `null` → panneau "Filtres" vide (apparence de barre
>    retirée). Zéro erreur console, zéro bandeau d'erreur.
>
> Correctifs structurels :
> - Schéma de dimension `KpiFilterDimensionSchema` : TOUS les champs
>   (`available`, `reason`, `values`) rendus optionnels + `passthrough`.
>   Un payload non conforme ne fait plus échouer le parse racine.
> - Schéma racine `ProjectKpiFiltersSchema` : TOUTES les dimensions
>   optionnelles. Un champ absent n'est jamais la cause d'une page vide.
> - Barre de filtres rendue à partir de la **constante** front
>   `EXPECTED_FILTER_DIMS` (11 entrées), pas de la réponse back.
> - Chip grisé « forme inattendue » pour une dim non conforme, les autres
>   restent actifs.
> - `FilterBarErrorBoundary` autour de la barre : une exception interne
>   affiche un chip d'erreur sans retirer la barre.
> - `kpiFetch` émet un `console.error` **avant** de `throw` : plus aucun
>   échec de parse n'est silencieux côté navigateur.
> - Bandeau rouge visible dans la barre quand `filtersQ.error` est levé
>   (ex. HTTP 500, Zod KO) : la raison est affichée à l'écran.
>
> Garde : `bun run shot -- /kpi REF` (Playwright headless) PNG joint au
> rapport + comptes de chips actifs/grisés/erreur. `bun run contract:check`
> PASS live (back 0.44.0). Un `/kpi/filters` renvoyant `{}` → barre
> rendue, 11 chips grisés "forme inattendue" (test offline).

## 1.17.2 (patch) — bc4-front 2026-10-16 — /kpi : règle d'activation `FilterChip` corrigée (jamais grisé sur champ optionnel absent) (Agent BC2)

> Incident : sur REF, les 11 chips (Opérateur/Techno/Bande/Service/
> Environnement + 6 géo) apparaissaient tous grisés alors que le back
> renvoyait `available=true` et des `values` non vides sur chacune.
> Cause : la condition `!available || values.length === 0` grisait
> toute dimension dont `values` est absent (ex. ecgi en forme
> couverture) ET laissait les cas de chargement (`dim === undefined`)
> dans le même panier. Résultat utilisateur : impossible de distinguer
> « dimension non livrée » et « valeurs à sélectionner ».

### JSON brut `/projects/REF/kpi/filters` (back 0.42.0, confirmé)

```
operators     available=true  values=[Bouygues, Free, Orange]
rats          available=true  values=[LTE, NR, N/D]
bands         available=true  values=[B1, B20, B3, B7, N/D]
service_types available=true  values=[HTTP_DOWNLOAD, N/D]
phases        available=true  values=[active, idle, wait]
envs          available=true  values=[incar]
deps          available=true  values=[N/D]
dr            available=true  values=[DR-NORD]
plaque        available=true  values=[LILLE]
dor           available=true  values=[DOR-NORD-OUEST]
arcep         available=true  values=[ZPD]
commune       available=true  values=[Petite-Forêt]
insee         available=true  values=[59445]
ecgi          available=true  (mp_total/mp_with_ecgi/pct, pas de values)
```

### Nouvelle règle `FilterChip` (spec)

```typescript
const active  = dim.available === true || values.length > 0;
const grayed  = dim.available === false || (dim.available === undefined && values.length === 0);
```

- `available === true` + `values` non vides → **MultiSelect** actif.
- `available === true` + `values` absent (ex. ecgi) → **chip read-only** (plein, non-dashed), tooltip « disponible mais aucune valeur à sélectionner ». Jamais grisé.
- `available === false` → chip grisé dashed, tooltip porte `reason`.
- `dim === undefined` (loading / schéma non parsé) → chip grisé dashed, tooltip générique.
- **Un champ optionnel absent (ex. `values` sur ecgi) ne grise plus jamais** tant que `available === true`.

### Garde (REF, bc4-back 0.42.0)

- `bun tsc --noEmit --skipLibCheck` → exit 0.
- `bun run contract:check` → PASS 8/8.
- `/kpi` HTTP 200 après `docker compose restart front`.
- UI à vérifier (⌘⇧R `/kpi`, REF) :
  - 10 chips **actifs cliquables** : Opérateur (3) · Techno (3) · Bande
    (5 dont N/D) · Service (2) · Environnement (1) · DR (DR-NORD) ·
    Plaque (LILLE) · DOR (DOR-NORD-OUEST) · Zone ARCEP (ZPD) ·
    Commune (Petite-Forêt) · INSEE (59445).
  - 0 chip grisé en condition nominale sur REF (le back renvoie
    `available=true` partout). Si un chip est grisé → c'est que `dim`
    est `undefined` côté client (loading ou schéma non parsé), avec
    tooltip explicite.
- Pied de sidebar : `front v1.17.2`.

## 1.17.1 (patch) — bc4-front 2026-10-16 — /kpi : filtres complets 14 dimensions + agrégation operator×band + table matrix + version visible (Agent BC2)

> Incident écran utilisateur /kpi (REF) : 5 filtres seulement, aucun
> DR/Plaque/DOR/ARCEP, aucun sélecteur d'agrégation, pas de table
> sous le graphe, pas de version visible. 1.17.0 avait livré le squelette
> (sidebar premium + 2 charts + 1 table) mais le lot « barre de filtres
> complète + agrégation » n'était pas câblé parce que le back
> n'exposait pas encore `group_by` ni les 7 dimensions géo/cell —
> maintenant que bc4-back 0.42.0 les expose, on les câble.

### Nouveaux filtres (14 chips)

- Principal (5) : Opérateur, Techno, Bande, Service, Environnement — déjà présents.
- Géo/cell (7 ajoutés) : **DR, Plaque, DOR, Zone ARCEP, Commune, INSEE** chaque
  dimension suit le contrat `{available, reason, values[]}` de `/kpi/filters`.
  Composant `FilterChip` qui respecte `available` : si `false` ou
  `values=[]` → chip **grisé** `cursor-not-allowed` avec tooltip
  `label — reason`. Jamais caché, jamais activable.
- `ecgi` tolère la forme couverture (`mp_total`/`mp_with_ecgi`/`pct` sans
  `values`) : `KpiFilterDimensionSchema.values` est désormais `.optional()`.
- Les 14 valeurs sélectionnées sont passées en query params répétés à
  `/kpi/{code}` (`buildMultiQuery` du 1.16.1).

### Nouveau — Segmented control d'agrégation

- Composant `GroupBySegmented` avec 3 options : **Opérateur · Bande · Les deux**.
- Lié à l'état `groupBy: "operator" | "band" | "operator_band"` passé en
  `group_by` au query param `/kpi/{code}`.
- Positionné sous la rangée Actions, aligné à droite dans le header KPI.

### Nouveau — Table matrix opérateur × bande

- Quand `group_by === "operator_band"`, le composant `KpiDetailTable`
  délègue à `MatrixOperatorBand` :
  - Lignes = opérateurs (3 MNO + éventuelle ligne « N/D »).
  - Colonnes = bandes (B1/B3/B7/B20… + éventuelle colonne « N/D »).
  - Cellule = `P50 dBm (n)` si `nature=distribution`, sinon juste `n`.
  - Tooltip détail : `n · p10 · p50 · p90`.
  - Ligne/colonne « N/D » INCLUSES (jamais filtrées silencieusement) —
    le back renvoie `operator=null` / `band=null` quand la dimension
    n'est pas résolue sur une mesure.
  - CSV export : header `Opérateur \ Bande`, cellules `P50 (n)`.
- Quand `group_by === "operator"` ou `"band"` : table simple avec
  colonne dynamique selon la dimension sélectionnée, puce couleur
  opérateur affichée seulement sur la vue « Opérateur ».
- Legacy `by_operator` conservé en fallback si `groups`/`table`
  absents du payload.

### Zod schemas (bc4-back 0.42.0)

- `ProjectKpiFiltersSchema` : ajout des 7 clés optionnelles
  `ecgi/dr/plaque/dor/arcep/commune/insee`, chacune en
  `KpiFilterDimensionSchema` (passthrough).
- `KpiGroupRowSchema = {operator?, band?, n, p10?, p50?, p90?, status?,
  reason?, operator_color?, band_color?}` + ajout de `group_by`,
  `groups[]`, `table[]`, `p10/p50/p90` au `ProjectKpiDetailSchema`.
- `KpiQueryFilters` : ajout `band / rat / env / dep / dr / plaque /
  dor / arcep / commune / insee / group_by`.
- `project-kpi.ts::getProjectKpi` : passe tous ces params.

### Nouveau — Version visible à l'écran

- Pied de sidebar affiche `front v1.17.1 · back v{health.version}`.
- `FRONT_VERSION` constante compilée dans `_app.kpi.tsx` — toujours en
  phase avec `package.json` (bumpée simultanément).

### Guards

- `bun tsc --noEmit --skipLibCheck` → exit 0.
- `bun run contract:check` → PASS 8/8 (REF).
- Source `_app.kpi.tsx` : `grep -c "Les deux|FilterChip|FRONT_VERSION"` → 17.
- `/kpi` HTTP 200 après `docker compose restart front`.
- UI à vérifier côté navigateur (⌘⇧R sur `/kpi`) :
  1. Barre filtres affiche 11 chips cliquables (operators/rats/bands/
     services/envs/dr/plaque/dor/arcep/commune/insee) sur REF — tous
     grisés si available=false avec tooltip reason.
  2. Header KPI inclut Histogramme/Graph/Carte/Infos + segmented
     Opérateur|Bande|Les deux à droite.
  3. Sélection « Les deux » sur `LTE_RF_RSRP` → table opérateur ×
     bande avec cellules `-93,0 (605)`, ligne/colonne « N/D » si
     présente dans la réponse back.
  4. Pied de sidebar : `front v1.17.1 · back v0.42.0`.

## 1.17.0 (minor) — bc4-front 2026-10-16 — /kpi : refonte premium UI (sidebar tree, 2 charts côte à côte, table détail) (Agent BC2)

> Reproduction fidèle de la maquette approuvée : sidebar catalogue 320 px
> à gauche (tree LTE / NR / EN-DC / KPI agrégés avec puces de statut
> compactes, nav clavier, search content-aware), zone d'analyse à droite
> avec header KPI compact (icône + nom 21 px + badge + méta ligne +
> 4 boutons ACTIONS), **deux cartes charts côte à côte** (grid
> `xl:grid-cols-2`), puis **table « Détail des valeurs » pleine largeur**
> sous les charts. Aucun chiffre inventé — les données proviennent
> toujours de `getProjectKpi()` / `getProjectKpiCatalog()`.

### Sidebar — priorité absolue de la maquette

- Panneau blanc, border `#E2E8F0`, radius 10 px, padding 14 px, propre
  scroll `max-h-[calc(100vh-180px)]`, sticky header + search.
- Header : icône `BarChart3` + « Catalogue KPI » (15 px semibold) +
  ligne secondaire `v{catalog_version} · {canonical_count} KPI ·
  {technos_count} technos` **tirée de l'API** (jamais hardcodée).
- Search 36 px, debounce via `useState` immédiat (texte court, pas de
  requête lourde côté catalogue en mémoire). Match CONTENT : code, nom,
  techno ou famille ; ancêtres étirés sur match.
- **Ordre des racines imposé** : `LTE, NR, EN-DC, KPI agrégés`
  (helpers `TECHNO_ORDER`, `sortTechnoRoots`, `technoLabel`). Les
  identifiants back `ENDC` / `AGGREGATE` sont **renommés à l'affichage
  seulement** — jamais altérés dans les requêtes.
- Compteurs des racines inchangés (depuis `counts_by_techno`, add-only).
- Catégories (familles) : chevron, 13 px semibold, compteur droite,
  indent 14 px.
- **Feuilles** : composant `LeafButton` ; puce de statut `h-1.5 w-1.5`
  (vert / ambre / muted / rouge), label 13 px, `truncate` + tooltip
  complet (name + reason), `scrollIntoView` sur sélection externe
  (keyboard nav, URL deep-link). **Plus de grosses chips.**
- Sélection : `bg-#DBEAFE` + text `#0759C7` + barre latérale 2 px.
- Hover : `bg-#F1F5F9`.
- Nav clavier : `ArrowUp` / `ArrowDown` parcourent la liste plate
  dans l'ordre canonique du tree ; `Enter` / `Space` activés par
  défaut (bouton HTML natif) ; focus ring visible.
- **URL state** : `?kpi=<code>` persiste la sélection (deep-link,
  refresh). Lu via `useSearch({strict:false})`, écrit via
  `useNavigate({replace:true})` — fusionné avec les filtres existants.

### Header KPI compact (~76 px) + 4 boutons ACTIONS

- Icône `BarChart3` dans un carré 28 px bg `primary/10`.
- Nom KPI 21 px semibold, badge statut à côté.
- Ligne métadonnée : `code · nature · unité · source` (via `dash(v)`
  sur source/unit/formula pour null → « — »).
- Alias et formule sous le header (ligne discrète).
- **Composant `ActionButtons`** à droite — 4 boutons :
  - `Histogramme` (primary, pressed) — focus chart A.
  - `Graph` (toggle, disabled car `canShowGraph()==false` en 0.40.0
    — contract gap déclaré, voir note).
  - `Carte` (disabled, tooltip « Pas de données géolocalisées »).
  - `Infos` — ouvre `KpiInfoSheet` (drawer droit).

### Charts côte à côte (grid `xl:grid-cols-2`)

- Carte radius 12 px, border `#E2E8F0`, bg card, padding 12 px.
- **Chart A — « Occurrences par opérateur »** :
  `Chart` ECharts existant (`buildByOperator`). Bars avec couleurs
  brand `Orange #FF7900 / SFR #E2001A / Bouygues #009FE3 / Free #7C8794
  / unknown #CBD5E1`. Hauteur 310 px. Label de valeur sur bars.
  Toolbar download/fullscreen héritée de `components/bc4/Chart.tsx`.
- **Chart B — « RSRP LTE / NR par Task Time » (empty state)** :
  composant `EmptyChart` avec titre + raison. Message explicite :
  « /kpi/{code} ne renvoie ni trend ni task_time dans la version 0.40.0
  du back. Déclaré en contract gap, pas de courbe inventée. » Jamais
  une courbe fabriquée tant que le back n'expose pas la série.
- Les deux cartes alignées verticalement, hauteur chart identique.

### Table « Détail des valeurs » — pleine largeur

- `KpiDetailTable` sous les charts. Colonnes : `Opérateur` |
  `Occurrences` | `% du total`.
- Puce opérateur colorée (`OP_HEX`) à côté du libellé.
- `tr` sortables (Opérateur alpha, Occurrences num) ; état visuel ▲/▼.
- Ligne « Total » affichée seulement quand `total > 0` (jamais 0
  inventé) ; `100,0 %` strict (somme des parts).
- **Export CSV** via `downloadCsv` (helper existant Dict RRC).
  Fichier `kpi_<CODE>_detail.csv` avec meta header BC4.
- Si `by_operator.length === 0` → encart « Pas de ventilation par
  opérateur ».

### Drawer « Infos » (Sheet shadcn)

- `KpiInfoSheet` ouvre à droite, 480 px max : techno · famille ·
  nature · unité · statut · raison · source · formule · alias ·
  service_scope · valeur · occurrences. Toutes les clés passent par
  `dash()` pour les null.

### Palette operator — stable partout

- `OP_HEX = { Orange: #FF7900, SFR: #E2001A, Bouygues: #009FE3, Free: #7C8794 }`
  utilisée par `opColor()` dans les bars ET les puces de table. Le
  spec hardcode cette palette : elle est fixe (brand).
- Opérateur inconnu / null → `#CBD5E1` (jamais une couleur MNO
  incorrecte).

### Rules of hooks + exactOptionalPropertyTypes

- Les hooks (`useQuery`, `useMemo`, `useState`, `useEffect`) tous
  appelés AVANT les early returns (`isLoading`, `error`, `empty`) —
  jamais après un conditional return.
- `TypeScript` strict `exactOptionalPropertyTypes: true` : props
  optionnelles typées `T | undefined` explicitement.

### Contract gap déclaré (jamais hardcodé)

- `/kpi/{code}` v2 (bc4-back 0.40.0) ne renvoie **pas** de `trend` /
  `task_time` / `evidence_id` / `by_band` / `by_service_type`. Le
  bouton « Graph » reste donc **disabled** avec tooltip explicite,
  le chart B rend un empty state honnête, et la table reste limitée
  à `by_operator`. Dès que le back expose ces champs, remplacer
  `canShowGraph()` + ajouter colonnes dans `KpiDetailTable`.

### Guards manuels (acceptance)

- `bun tsc --noEmit --skipLibCheck` : exit 0 (0 erreur, 0 warning).
- `bun run contract:check` : PASS 8/8 (REF + TEST2) — inchangé 1.16.2.
- UI live (reload `/kpi`) :
  - Sidebar ordre `LTE / NR / EN-DC / KPI agrégés` ✓.
  - Keyboard `ArrowUp/Down` parcourt la liste, feuille sélectionnée
    scrolle en vue, URL `?kpi=<code>` persiste.
  - Puces statut compactes (plus de chips).
  - Charts côte à côte ≥ 1280 px, stackés en dessous.
  - Chart B « RSRP LTE / NR par Task Time » rend l'empty state avec
    raison du contract gap, jamais une courbe fabriquée.
  - Table « Détail des valeurs » colorée par opérateur, triable, CSV
    exporte la vue courante.
  - Drawer « Infos » ouvre à droite avec toutes les métadonnées,
    null → « — ».

## 1.16.2 (patch) — bc4-front 2026-10-16 — /kpi : contrat catalog v2 aligné sur réponse live + `contract:check` (Agent BC2)

> La 1.16.1 avait installé le filet d'erreur (Error Boundary + bandeau).
> La 1.16.2 CORRIGE le contrat Zod lui-même pour matcher la **réponse
> live** du back 0.40.0 (lue via curl + /openapi.json). Observations
> brutes qui motivent le patch :
>
> - `counts_by_techno` est un record **imbriqué** `Record<techno, Record<status, number>>` :
>   `{"LTE": {"UNVALIDATED": 16, "UNAVAILABLE": 52, "AVAILABLE": 10, "PENDING": 4}, "NR": {...}, "ENDC": {...}, "AGGREGATE": {...}}`.
>   Le back ne retourne **pas** de clé `total` — on l'additionne depuis
>   les 4 statuts observés (jamais inventé).
> - `formula` / `source` / `unit` / `reason` sont `nullable` sur certains
>   KPI calculés → rendus « — » côté UI, pas string vide, pas crash.
> - `/openapi.json` du back **ne décrit pas** la forme des 3 routes
>   `/projects/{id}/kpi/*` (handlers FastAPI sans `response_model`,
>   seulement `/kpi/catalog` global est typé via `KpiCatalogResponse`).
>   Le `contract:check` ne peut donc pas être un diff JSON Schema pur :
>   on fait un **live-check safeParse** contre la réponse réelle.

### Changements de schéma Zod — `src/lib/api/project-kpi-schemas.ts`

- `KpiCatalogItemSchema.{unit, source, formula, reason}` → tous
  `.nullable()`.
- `KpiCountsByTechnoSchema = z.record(z.record(z.number().int().nonnegative()))`
  (imbriqué, pas flat). Clés statuts reprises **exactement** du back :
  `AVAILABLE | PENDING | UNVALIDATED | UNAVAILABLE`.
- `KpiCountsByStatusSchema = z.record(z.number().int().nonnegative())`.
- `.passthrough()` sur toutes les objets racine + feuilles — tout champ
  ajouté par le back est toléré, un champ ajouté ne cassera jamais la
  page.
- Nouveau `BackHealthSchema` pour `/health` (affichage versions dans le
  bandeau contrat).

### UI — `src/routes/_app.kpi.tsx`

- **Compteurs par racine de l'arbre** : nouveau composant `TechnoBadge`
  qui lit `catalog.counts_by_techno[techno]` et affiche
  `<total> · <N> AVAIL` (vert). Total = somme des 4 statuts renvoyés
  par le back (pas de total inventé, pas de recalcul : addition stricte
  des 4 valeurs reçues). Tooltip détaille les 4 compteurs par statut.
- **Bandeau « contrat incompatible »** affiche désormais **deux versions
  séparément** : `catalog_version` extraite du payload non-conforme
  (via `KpiContractMismatchError.backVersion`) ET la version `/health`
  du back (via `getBackHealth()` ajouté au module API, non bloquant).
- **`null → « — »`** : helper `dash(v)` appliqué sur `activeItem.unit`,
  `activeItem.source`, `activeItem.formula`, et `kpi.unit` dans la
  tuile Valeur. Jamais une étiquette vide.
- Nouveau `healthQ = useQuery({...})` pour prefetch /health (staleTime
  30 s, no retry — information d'ambiance).

### Nouveau — `scripts/contract_check.ts` + `bun run contract:check`

Script Bun qui vérifie en live :

1. `GET /openapi.json` — les 3 paths `/projects/{project_id}/kpi/*`
   sont déclarés (GET + path exact). Un path manquant → fail avec
   message précis.
2. `POST /auth/login` admin — récupère un token.
3. `GET /projects/{PROJECT_ID}/kpi/{catalog,filters,{first-AVAILABLE-code}}` —
   `safeParse` chaque réponse contre son schéma Zod. Fail = diff
   lisible (chemin de la propriété Zod + message).

Config via env : `BC4_API_BASE` (défaut `http://localhost:8000`,
mettre `http://api:8000` pour exécuter depuis `bc4-front-1`),
`BC4_ADMIN_EMAIL`, `BC4_ADMIN_PASSWORD`, `BC4_PROJECT_ID` (défaut REF).

Exit codes :

- `0` — PASS (routes présentes + schémas Zod OK).
- `1` — FAIL (route manquante dans OpenAPI, ou `safeParse` échoue).
- `2` — Infrastructure (login impossible, back injoignable…).

Documenté dans `README.md` (section « Contrat back ↔ front »).

### Garde manuelle (REF + TEST2, back coupé)

- `/kpi` sur **REF** : arbre affiche `LTE 82 · 10 AVAIL`, `NR 79 · 0 AVAIL`,
  `ENDC 25 · 0 AVAIL`, `AGGREGATE 8 · 4 AVAIL`. Détail d'un KPI
  `LTE_RF_RSRP` (ou autre AVAILABLE) → valeur réelle rendue. Aucun
  bandeau d'erreur. Console sans erreur rouge.
- `/kpi` sur **TEST2** : même arbre, compteurs cohérents, formules
  rendues « — » là où `null`. Pas de panneau vide.
- `docker stop bc4-api-1 10` : bandeau rouge « Backend injoignable »,
  bouton Réessayer. `docker start` → récupération. Si le back
  renvoyait un contrat cassé, le bandeau jaune afficherait
  `catalog_version lue: <X>  ·  /health version: <Y>` sur deux lignes
  distinctes.
- `bun run contract:check` : PASS 8/8 sur REF, PASS 8/8 sur TEST2.

### Changements fichiers

- `src/lib/api/project-kpi-schemas.ts` : nullable + passthrough + BackHealthSchema.
- `src/lib/api/project-kpi.ts` : + `getBackHealth()` non-bloquant.
- `src/routes/_app.kpi.tsx` : `TechnoBadge`, `dash()`, deux versions
  dans le bandeau, `healthQ`.
- `scripts/contract_check.ts` : nouveau script live-check.
- `package.json` : `scripts["contract:check"]`.
- `README.md` : section « Contrat back ↔ front ».

## 1.16.1 (patch) — bc4-front 2026-10-16 — /kpi : états explicites + bandeau contrat + Error Boundary (Agent BC2)

> Incident : `/kpi` rendait une **page vide** sur TEST2 (panneau gris,
> aucun contenu, aucun message). Le diagnostic brut montre que la forme
> `/kpi/catalog` est identique entre REF et TEST2 (back 0.40.0, 13 top
> keys, tree 4 technos, kpi.aliases = `string[]`) — le bug n'est pas
> contractuel. La page tombait néanmoins muette parce que les trois
> seuls états rendus étaient `loading` et `OK` (`data` truthy) ; toute
> erreur côté useQuery, toute non-conformité Zod levée par `apiFetch`,
> ou toute exception de rendu laissait l'écran gris.

### Correctif structurel (pas un correctif symptôme)

- **`src/lib/api/project-kpi.ts`** : la couche d'accès ne passe plus par
  `apiFetch` (qui jette `ApiSchemaError` sur un mismatch Zod). Elle fait
  un `fetch` brut puis **`schema.safeParse(raw)`**. Non-conformité →
  nouvelle erreur typée `KpiContractMismatchError` portant
  `backVersion` (lu dans `catalog_version` du payload brut), 5 premiers
  messages Zod bornés, et le chemin de la requête. Erreurs réseau /
  HTTP conservent `ApiNetworkError` / `ApiHttpError` / `ApiUnauthenticatedError`.
- **`src/routes/_app.kpi.tsx`** :
  - **Error Boundary de classe** (`KpiErrorBoundary`) autour du
    composant de route. Toute exception de rendu est capturée et rend
    un bandeau lisible avec le message et la pile tronquée + bouton
    « Réessayer ».
  - **Fonction `classifyKpiError(err)`** : mappe `KpiContractMismatchError`,
    `ApiUnauthenticatedError`, `ApiNetworkError`, `ApiHttpError`,
    `KpiRequestError`, et tout autre `Error`, vers
    `{title, message, details?, tone}` lisibles.
  - **Composant `KpiErrorBanner`** réutilisable : titre + message +
    détails (optionnels) + bouton « Réessayer » (optionnel) + tonalité
    `warn | bad`.
  - **États explicites** (loading / erreur catalogue / vide /
    OK + erreur détail inline) :
    1. `catalogQ.isLoading` → `<LoadingSkeleton>` plein écran.
    2. `catalogQ.error` → bandeau avec classify + Réessayer.
    3. `!catalogQ.data` (jamais ok ni erreur) → bandeau « catalogue vide ».
    4. `totalKpis === 0` → bandeau « projet sans catalogue KPI » + version.
    5. `kpiQ.error` sur le KPI sélectionné → bandeau **à la place** du
       panneau détail (le reste de la page reste utilisable).
    6. OK normal.
  - `useCallback` sur les chart-builders supprimé (ne peut plus vivre
    après un `return` conditionnel sans violer rules-of-hooks).
    Remplacé par fonction locale — pas de perf dégradée (le build
    chart est rapide et React mémoïse déjà via echarts).

### Garde manuelle (projets REF + TEST2 + back coupé)

1. `/kpi` sur **REF_PETITE_FORET** → arbre affiché (LTE 82 KPI / NR 79 /
   ENDC 25 / AGGREGATE 8), KPI sélectionnable, détail rendu normalement.
2. `/kpi` sur **TEST2** (`134af70a06eb`, 9 NMF, param_occurrence
   99 k lignes, measurement_points 0) → même arbre, statuts
   `UNVALIDATED` sur les rate (contrat non certifié) +
   `UNAVAILABLE` / `PENDING` sur les mp-metrics. **Jamais panneau vide.**
3. `docker stop bc4-api-1` 10 s → bandeau rouge « Backend injoignable »
   avec message curl, bouton Réessayer. Pas de page blanche. `docker
   start bc4-api-1` + clic Réessayer → récupération.
4. Console navigateur : aucune erreur rouge non capturée (le boundary
   logue les crashes en `console.error` pour trace, mais le rendu
   reste lisible).

## 1.16.0 (minor) — bc4-front 2026-10-16 — Page /kpi câblée sur les endpoints projet bc4-back 0.35.0+ (Agent BC2)

> La page `/kpi` affichait des chiffres **fabriqués** (dates `01/01/2026 – 31/03/2026`
> en dur ligne 299, séries temporelles générées par `sin(i*0.9+j)` ligne 142,
> `k.value / k.delta / k.byOp` tirés de la vue globale `/kpi/catalog` + une
> seule `KpiRrcSummary` canned). Elle devait passer sur les **endpoints
> KPI scopés projet** livrés par bc4-back 0.35.0 (`/projects/{id}/kpi/*`),
> en gardant le look actuel (pas de refonte).

### Nouveau — adaptateur `lib/api/project-kpi.ts` + schémas Zod

- `src/lib/api/project-kpi-schemas.ts` : schémas Zod stricts pour les
  3 réponses back (`ProjectKpiCatalogSchema`, `ProjectKpiFiltersSchema`,
  `ProjectKpiDetailSchema`) + `KpiStatusSchema`
  (`AVAILABLE | PENDING | UNVALIDATED | UNAVAILABLE`) + verdict
  comparabilité. `null` reste `null` partout — la UI affiche « N/D ».
- `src/lib/api/project-kpi.ts` : 3 fonctions `apiOrMock` câblées à
  `apiFetch` :
  - `getProjectKpiCatalog(projectId, signal)` → arbre familles → KPI
    avec statut par KPI.
  - `getProjectKpiFilters(projectId, signal)` → operators / rats / bands
    / service_types / envs / période / geo (available + reason).
  - `getProjectKpi(projectId, code, filters, signal)` → agrégat détaillé
    (value P50/total, p10/p90, n, technologies[], period, by_operator,
    distribution, trend, period_unique, comparability, result_id).
  - **buildMultiQuery** : les filtres multi-valeurs sont encodés en
    params répétés (`?operator=A&operator=B`) — jamais `?operator=A,B`
    (sinon FastAPI reçoit un seul élément « A,B » absent du DISTINCT).

### Changé — `src/routes/_app.kpi.tsx` : rewrite ciblée (look inchangé)

- Remplace `getKpiCatalog()` par `getProjectKpiCatalog(activeProject.id)`.
  **Plus aucun appel** à l'ancien `/kpi/catalog` global sur cette page.
- **Supprimé** : les dates en dur `01/01/2026 – 31/03/2026`, les séries
  `sin(i*0.9+j)`, `k.value / k.delta / k.byOp` locaux. Rien ne s'affiche
  qui ne vienne du back.
- **Catalogue** : chaque KPI du catalogue porte son badge statut
  (`Available / Pending / Unvalidated / Unavailable`) + raison au
  survol (`title`). Recherche textuelle sur `name` + `code`.
- **Filtres** : options tirées de `/kpi/filters` (plus de constantes
  `OPERATORS / TECHNOLOGIES / KPI_BANDS` hardcodées sur cette page).
  Opérateur / Techno / Bande / Service / Environnement. Zone ARCEP
  grisée avec `geo.reason` tant que `cell_ref` est vide. Période
  observée affichée à droite.
- **KPI AVAILABLE** : tuiles = `value` (P50 pour distribution, total
  pour count) + `unit` + `p10/p90` + `n` + `technologies[]` + `period`
  réelle. Barres de la vue « Comparaison par opérateur » colorées via
  `--op-{orange,sfr,bouygues,free}` ; opérateur non-MNO ou `null` →
  gris muted. Verdict `comparability` affiché (COMPARABLE /
  COMPARABLE_WITH_LIMITATIONS / NOT_COMPARABLE / SINGLE_GROUP) +
  `result_id` en mono.
- **KPI non-AVAILABLE** : badge + raison **À LA PLACE** des chiffres.
  Jamais une tuile sans sa source back.
- **Trend** : si `period_unique=true` → encart « Période unique
  (date) » explicite, pas de courbe fabriquée.
- **Distribution** : bar chart ordonné par bucket (gauche d'intervalle
  numérique).
- `null` → « N/D » partout.

### Changé — `src/lib/api/schemas.ts`

- `FilterContextSchema.svc` relâché à `z.array(z.string()).optional()`
  pour accepter les valeurs `service_type` réelles exposées par bc4-back
  (`HTTP_DOWNLOAD`, `HTTP_UPLOAD`, `VOICE_CALL`, …) en plus des 3 libellés
  B0 historiques (`Data` / `SMS` / `Voice`, strings valides).
- `FilterContextSchema.env` ajouté — `z.array(z.string()).optional()`
  pour persister le filtre environnement dans la query string.

### Garde (manuelle, après `docker compose restart front`) — projet REF_PETITE_FORET

- `/kpi` affiche le catalogue avec statuts (RSRP_DIST / A3_OFFSET_DIST
  Available, THR_DL_APP Pending, RRC_SETUP_SR Unvalidated, SMS_SR
  Unavailable). Grep `98,2` et `01/01/2026` dans la source dist → **0**
  occurrences.
- `RSRP_DIST` sélectionné → P50 réel (≈ −104 dBm), n=663, 3 barres
  colorées (Bouygues / Orange / Free) + 1 N/D grise, verdict
  `COMPARABLE_WITH_LIMITATIONS`, `result_id = fbdfdd274e03b81c`.
- `THR_DL_APP` sélectionné → encart Pending + raison
  `measurement_points.dl NULL — mapping Phase 1 non prouvé`, aucune
  tuile de chiffre.
- `RRC_SETUP_SR` sélectionné → encart Unvalidated + raison
  `contrat tentative/réussite non certifié par le décodeur`.
- Barre de filtres : operators = [Bouygues, Free, Orange],
  rats = [LTE, NR], bands = [B1, B3, B7],
  service_types = [HTTP_DOWNLOAD], envs = [incar, indoor]. Zone ARCEP
  grisée (reason `cell_ref vide`).

## 1.15.0 (minor) — bc4-front 2026-10-16 — Matrice « Détail des valeurs » (Bande × Valeur × Opérateur) (Agent BC4)

> Nouveau rendu du panneau « Détail des valeurs » du Dictionnaire RRC :
> plus un tableau unidimensionnel de bins mais une **matrice déclarative**
> **Bande × Valeur × Opérateur**, pivotée **100 % côté front** depuis
> `row.value_matrix` servi par `/dict/params` (bc4-back ≥ 0.21.0). Aucune
> nouvelle requête, aucun nouveau champ demandé au back dans ce lot.
>
> Doctrine stricte :
>   - Dénominateur D(op, band) = Σ(count) de `value_matrix` filtré sur
>     (operator=op, band=band). **JAMAIS** le total global.
>   - D = 0 → cellule `N/D` (opérateur/bande absent).
>   - D > 0 et N = 0 → `0 · 0,0 %` (zéro réel, distinct de N/D).
>   - **Palette heat** (couleur = fréquence, PAS qualité radio) :
>       [0;10[ vert → [10;20[ vert clair → [20;40[ jaune → [40;60[ orange
>       → [60;80[ rouge clair → [80;100] rouge foncé.
>   - Toute incohérence `Σ(value_matrix) ≠ bucket.count` est **loguée
>     en `console.error` ET affichée en bandeau rouge** dans la UI —
>     jamais masquée.

### Ajouté

- `src/features/dictionary/value-matrix.ts` — module dédié (pivot,
  palette, formatters, export CSV). Fonctions exportées :
  - `buildValueMatrix(row, { search, valueOrder, othersThreshold })` →
    `MatrixData` (rows alternant `kind:"value"` et `kind:"band_total"`,
    `denoms` par (op, band), `presentOperators`, `bands`, `enumMode`,
    `coherenceErrors`). Les 4 colonnes `OPERATOR_COLUMNS = ["Orange",
    "SFR", "Bouygues", "Free"]` sont **toujours rendues** ; un opérateur
    absent produit uniquement des cellules `N/D` (D=0 pour chaque bande).
  - `sortMatrixRows(data, key)` pour trier `op_count`/`op_pct`
    ascendant/descendant **par bande** (préserve les `band_total` en fin
    de bloc et les « Autres valeurs » en bas de chaque bande).
  - `heatVarForPct(pct)` : mappe un % vers l'une des 6 CSS vars
    `--heat-0..5` strictement déclarées.
  - `toCsvRows({ paramPath, measurementLabel, data })` : export CSV
    reflétant filtres + tri appliqués, triplet `N / D / pct` par cellule.
  - `fmtN`, `fmtPct1`, `fmtCellText` : formatters FR (séparateurs
    milliers, pourcentage 1 décimale `,`).
  - **Autres valeurs** : au-delà de `AUTRES_VALEURS_THRESHOLD = 10`
    valeurs distinctes pour une bande, la queue est agrégée dans une
    ligne italique « Autres valeurs (N) » pour préserver `Σ(%) = 100` à
    l'arrondi près.
- `src/styles.css` — nouvelle série `--heat-0..5` (6 vars) déclarées
  explicitement pour `.dark` ET `:root`, commentée dans le fichier.

### Modifié

- `src/features/dictionary/DictionaryPage.tsx` : remplacement complet du
  composant `ValuesTable` (unidim bins × opérateurs) par **`ValueMatrix`**
  + sous-composant `MatrixCellTd` :
  - Colonnes fixes **Bande · Valeur · Orange · SFR · Bouygues · Free**.
  - Chaque cellule : **N en gras** + **% à 1 décimale** + **barre
    horizontale colorée** selon la palette heat. `N/D` neutre si D=0.
  - Tooltip au survol : `opérateur · bande · valeur · N · D · %`.
  - Headers opérateurs cliquables : tri par **N** ou par **%** sur
    chaque colonne (ascendant/descendant toggleable).
  - Bouton `Valeur ↑/↓` pour inverser l'ordre naturel des valeurs
    numériques (asc par défaut, en respectant `value_converted`).
  - Recherche textuelle sur la colonne « Valeur » (reprise de
    `valueQuery` existant côté page).
  - Export CSV via `toCsvRows()` : contient filtres + tri appliqués, un
    triplet `N / D / pct` par opérateur, et une ligne « Total bande »
    par bloc.
  - **Clic sur ligne valeur** : relaie `onHighlight(valueRaw)` déjà
    exposé par la page (réutilise la mécanique de sélection existante,
    aucun nouveau channel de filtrage créé — cf. écart ouvert plus bas).

### Contrat API (ne pas inventer)

- Réutilise **`row.value_matrix` + `row.buckets`** déjà fournis par
  `/dict/params` depuis bc4-back 0.21.0. Zod inchangé
  (`ParamValueCellSchema` depuis 1.8.1, `.optional()`).
- **Aucune nouvelle requête, aucun nouveau endpoint, aucun nouveau
  champ** demandé au back.
- Si un bucket est absent alors que `value_matrix` a des entrées pour
  ce (op, band), c'est un **bug back** → écart ouvert déclaré + bandeau
  rouge in-UI + `console.error`. On ne fabrique **jamais** D depuis un
  pourcentage arrondi.

### Garde-fous (vérifications dures implémentées)

- `Σ(value_matrix[op, band].count) == bucket.count` est vérifié ligne
  par ligne (op, band) dans `buildValueMatrix`. Chaque écart devient
  une entrée de `coherenceErrors[]`.
- `Σ(%) sur une bande × op = 100 %` à ±0.1 par construction (le
  dénominateur est le bucket, pas une somme locale ré-estimée).
- `null` ou `D=0` → `N/D` ; jamais 0 inventé ; jamais `0 %` affiché
  comme substitut de `N/D`.

### Palette (strictement déclarée dans styles.css)

- `--heat-0` oklch(0.78 0.14 155) — vert
- `--heat-1` oklch(0.86 0.12 140) — vert clair
- `--heat-2` oklch(0.86 0.14 95) — jaune
- `--heat-3` oklch(0.76 0.17 60) — orange
- `--heat-4` oklch(0.72 0.18 35) — rouge clair
- `--heat-5` oklch(0.60 0.21 25) — rouge foncé

Variantes thème clair : nuances assombries pour préserver le contraste
(voir commentaire styles.css).

### Périmètre STRICT (non touchés)

- Arbre ASN.1 LTE/NR (`Tree`, `TreeMessage`, clés M_ 1.12.0 préservées).
- Filtres globaux (`FilterBar`, `MultiSelect`).
- Histogramme (`Histogram`, `HistogramChart`, basé sur `value_distribution`).
- Carte (`OccurrenceMap`, fix oklch préservé).
- Navigation BC4, autres pages.
- Règles de conversion 3GPP (côté back, consommées via `value_converted`).

### Smoke API (scripts/smoke_api.ts, cas h.6)

- Ajout d'une garde contrat back dédiée : exerce
  `/dict/params?system=LTE&message=MeasurementReport` sur TEST2 et
  vérifie, pour `rsrpResult` (neighbor LTE) :
  - `value_matrix` non vide ;
  - `Σ(value_matrix.count) == row.count` ;
  - `Σ(value_matrix[op, band].count) == bucket.count` pour chaque bucket ;
  - au moins 1 cellule porte `value_converted` non null ;
  - aucun doublon strict `(operator, band, value_raw)`.

### Écarts ouverts

- **Sélection cellule → filtrage des visus liées** : la mécanique
  `highlight` existante (`sel.path`, `onHighlight(valueRaw)`) est
  réutilisée pour marquer la ligne valeur sélectionnée ; elle propage
  déjà vers l'histogramme et la carte via `highlight`. Un clic sur une
  **cellule** (op, band, value) ne propage PAS encore de filtre
  (operator=op AND band=band AND value=valueRaw) vers l'histogramme :
  cela demanderait un nouveau channel de filtrage que ce lot ne crée
  pas (hors périmètre). Écart documenté, à adresser dans un lot futur.
- **Garde cohérence Σ=100 % par groupe** : implémentée au niveau du
  `buildValueMatrix` via les dénominateurs `bucket.count`, pas re-vérifiée
  après tri (le tri ne change pas les N ni les D).

## 1.14.0 (minor) — bc4-front 2026-10-16 — Assistant : rendu BlockMap + seuils dBm BC4 + colorBy (Agent BC1)

> bc4-back 0.26.0 émet des `BlockMap` depuis `map_metric` (cellules
> RSRP serving agrégées par grille lat/lon). Avant 1.14.0, un
> `BlockMap` tombait sur un rendu générique insuffisant pour une
> carte agrégée (pas de légende dBm BC4, pas de toggle opérateur,
> pas de couleur par valeur). Ce lot livre une carte **dédiée
> Assistant** avec les seuils dBm BC4 à 6 classes et un toggle
> `colorBy` ("value" / "operator"). **Non-breaking** : les BlockMap
> non-Assistant (ex. page Overview) continuent via `RadioMap`
> historique (4 classes `good|fair|poor|bad`).

### Ajouté
- **`src/features/assistant/AssistantMap.tsx`** — composant maplibre-gl
  dédié à la carte agrégée de l'Assistant :
  - **6 seuils dBm BC4** (bornes supérieures de chaque classe) :
    `≥ -71` (excellent, vert foncé `#1b5e20`) · `-71..-81` (fort,
    vert clair `#66bb6a`) · `-81..-91` (moyen, jaune `#fdd835`) ·
    `-91..-101` (faible, orange `#fb8c00`) · `-101..-111` (critique,
    rouge `#e53935`) · `< -111` (hors couverture, rouge foncé
    `#7f1d1d`).
  - **Toggle `colorBy`** (radiogroup accessible) :
    - `"value"` (défaut) → palette dBm BC4 ci-dessus.
    - `"operator"` → palette catégorielle fixe (Orange `#ff7900`,
      SFR `#e2001a`, Bouygues `#0084d6`, Free `#cd2026`).
  - **Légende** visible en bas-gauche, reflète le mode courant
    (dBm BC4 OU opérateurs présents dans les cellules).
  - **Tooltip** par cellule au survol : `operator · tech band`,
    `RSRP: X.X dBm`, `n = N observations`.
  - Encart "Plage observée: [vmin, vmax] dBm" en haut-droite si
    `value_range` fourni par le back (vient de 0.26.0).
  - Fond OSM atténué (saturation −0.8), zoom par défaut 12 (plus
    serré que RadioMap car cellules dense).
  - Fallback `tileError` si tuiles OSM injoignables (comme RadioMap).
  - Plein écran 1-clic (`Maximize2 / Minimize2`).
- Chargement **paresseux** (`lazy()`) : maplibre-gl n'est importé que
  si la réponse Assistant contient un BlockMap.

### Modifié
- `src/features/assistant/ResponseRenderer.tsx` :
  - `case "map"` détecte si les points sont « Assistant-flavor »
    (champ `n` injecté par `map_metric` 0.26.0) et route vers
    `AssistantMap` ; sinon fallback `RadioMap`. Non-régression
    Overview.
  - **Encart `n=0` dédié** pour BlockMap sans points (icône `Inbox`,
    message « Aucune donnée dans le périmètre »). **Jamais une carte
    vide ni un 0.**
  - Footer source : affiche `source_id`, nombre de cellules, unité et
    bins (ex. « Source : 969a859f4a126812 · 81 cellules · unité :
    dBm · grille 3 décimales »).
  - **`GroupedBlocks` étendu** : pair `map + table` partageant le
    même `source_id` dans une `<section>` commune (comme `chart +
    table` depuis 1.13.0). Attribut `data-source-id` au DOM pour
    tests.
- `src/lib/api/schemas.ts` : `MeasurementPointSchema` ajoute
  `n: z.number().int().nonnegative().optional()`. Non-régression :
  les points Overview n'émettent pas ce champ, il reste `undefined`.
- `src/lib/api/assistant-schemas.ts` : `BlockMap` ajoute 3 champs
  optionnels (`unit`, `value_range`, `grid`) alignés avec le back
  0.26.0. Sans eux, le rendu reste fonctionnel (défauts raisonnables).

### Discipline (règles conservées)
- UI ne lit que via `client.ts` (schéma Zod validé).
- `null → "N/D"` dans tooltip (`p.rsrp == null ? "N/D" : …`).
- `n=0` déclaré avec encart dédié, **jamais** une carte vide ni un `0`.
- `tsc --noEmit` = 0 erreur.
- Pas de modification de `RadioMap` : l'Overview et le Dictionnaire
  conservent leur palette 4-classes historique sans divergence.

### Garde manuelle (à vérifier après Vite HMR)

| Question (sur TEST2) | Attendu dans la UI |
|---|---|
| « Affiche la carte des RSRP » | 1 `BlockMap` avec **81 cellules** (back 0.26.0 smoke), légende dBm 6 classes visible, toggle `colorBy` fonctionnel, encart plage observée `[-116, -69] dBm`, tooltip au survol avec `rsrp + n + op + band`, 1 `BlockTable` compagnon **dans la même carte** (`data-source-id` partagé) |

Opérateurs attendus en TEST2 (vus par le back 0.26.0 smoke) :
Bouygues, Free, Orange — SFR absent (donc 3 pastilles en mode
`colorBy=operator`, pas 4 ; comportement correct, pas d'invention).

### Non-objectifs (écarts ouverts)
- Pas de clustering des cellules proches (toutes rendues individuellement).
  Si le volume dépasse ~2000 cellules (limite `map_metric`), les
  performances maplibre-gl commencent à se dégrader. Lot futur
  pourra ajouter un `supercluster` si besoin.
- Pas d'export carte en PNG / GeoJSON (export JSON global de la
  réponse Assistant déjà disponible).
- Les palettes des opérateurs sont codées en dur dans `AssistantMap` ;
  si la doctrine couleur-par-opérateur évolue, factoriser vers
  `src/lib/api/schemas.ts` (`OP_VAR` existe déjà dans `AppShell.tsx`
  pour les charts — divergence acceptée dans ce lot, à aligner si
  besoin).

## 1.13.0 (minor) — bc4-front 2026-10-16 — Assistant V2 : rendu typé des blocs (Agent BC1)

> Depuis bc4-back 0.25.1, l'assistant émet des blocs typés
> (text / chart / table / verdict / context / n=0 déclaré). Le front
> rendait déjà `chart`, `table`, `text` via `BlockView` ; ce lot ajoute
> **3 sous-variantes typées** du `BlockText` (verdict / contexte /
> n=0) **détectées PAR LE CONTENU** et **groupe visuellement les paires
> chart+table** qui partagent le même `source_id`.

### Ajouté — `src/features/assistant/ResponseRenderer.tsx`
- **`VerdictBadge`** : pilule colorée pour les 3 verdicts de
  comparabilité émis par `validate_comparison` côté back :
  - `COMPARABLE` → vert (`border-sev-good/60`, `CheckCircle2`)
  - `COMPARABLE_WITH_LIMITATIONS` → orange (`bg-warning`, `ShieldAlert`)
  - `NOT_COMPARABLE` → rouge (`bg-destructive/10`, `XCircle`)
  Chaque badge porte `data-verdict` + `data-source-id` (= result_id)
  pour tests et traçabilité.
- **`VerdictBlock`** : détecte les BlockText dont le `heading` matche
  `/^Verdict\b/i`. Parse chaque claim avec `/^\[VERDICT\]\s*raison$/`
  et rend badge + raison. Fallback générique si pattern raté.
- **`ContextBlock`** : détecte `heading === "Contexte projet"` et rend
  un encart discret (`border-dashed`, `bg-muted/40`, icône `Info`) avec
  les métadonnées projet en `<dl>` compact (nom, période, opérateurs
  déclarés, technos, bandes).
- **`EmptyDataBlock`** : détecte un BlockText avec UNE seule claim
  `OBSERVED` dont le texte commence par `n=0`. Rend un encart avec
  icône `Inbox` + message grisé — **JAMAIS un chart vide ni un 0**.
- **`GroupedBlocks`** : scanne la liste de blocs ; quand un `chart`
  est immédiatement suivi par un `table` avec le MÊME `source_id`,
  les deux sont enveloppés dans une `<section>` commune (bordure +
  card background) pour signaler leur lien visuel. Les autres blocs
  conservent leur rendu individuel.
- **Evidence enrichi** : liste des sources avec `data-source-id` par
  item, mise en forme lisible (opérateur `·` entre champs, dénominateur
  `n = …` en police mono), compteur `(N)` dans l'en-tête.

### Discipline (règles conservées)
- UI ne lit que via `client.ts` (via `AssistantResponse` typée Zod).
- `null → "N/D"` partout (`fmtNum` existant, inchangé).
- `onFollowUp(q)` : chaque puce relance la question (comportement
  existant, préservé).
- `tsc --noEmit` = 0 erreur ; aucune modification côté API client.

### Garde manuelle (TEST2 — à vérifier après Vite HMR)

| Question | Blocs rendus réels |
|---|---|
| « Compare les bandes » | 1× **chart bar** + 1× table **dans la même `<section>`** (source_id partagé) |
| « Paramètres RRC dominants » | 1× **chart bar** (top messages) + 1× table (même carte) |
| « a3Offset Orange/SFR × B3/B20 » | 1× **chart bar (histogramme)** + 1× table + **3× encart n=0** + **3× badge COMPARABLE_WITH_LIMITATIONS orange** |
| « Compare les débits » | 1× **chart bar** compare_operators + 1× table + **1× badge COMPARABLE vert** (plan rejeté LLM caché côté UI, cf. 0.25.1) |

Chaque chart et sa table affichent le MÊME `source_id` sous eux
(`font-mono text-[10px]`), vérifiable dans le DOM via
`data-source-id` du conteneur `<section>` et des `<li>` d'evidence.

### Non-objectifs
- Pas de distinction visuelle `chart="histogram"` vs `chart="bar"` dans
  le schéma Zod (`BlockChart.chart` reste `bar|line|boxplot`). Le back
  0.25.1 émet les histogrammes en `chart="bar"` avec `heading` et
  `x_label` sémantiques — rendu identique côté ECharts, sémantique
  portée par le titre.
- Pas d'export CSV séparé pour les blocs verdict/context (déjà en JSON
  via le bouton export global). Pas prioritaire.
- Le pattern de parsing des verdicts dépend du préfixe `[VERDICT]`
  émis par le back. Si le back change ce format, le fallback générique
  prend le relais (texte brut + EvidenceTag) — pas de crash.

## 1.12.0 (minor) — bc4-front 2026-10-15 — Clés canoniques M_ pour les feuilles de MESURE sous MeasurementReport (Agent BC4)

> Nouveau rendu de l'arbre Dictionnaire RRC : les feuilles de mesure sous
> `MeasurementReport` affichent une **clé canonique parlante** à la place
> du nom RRC natif, dérivée **par le CONTENU** de l'`asn1_path` servi par
> `/dict/tree` — JAMAIS par le label. Les autres messages
> (`RRCConnectionReconfiguration`, `MasterInformationBlock`,
> `SystemInformationBlockType1`, …) **gardent leur nom RRC natif**.
>
> Clé : `M_<role>[_<ressource>]_<grandeur>`.
> Exemples live TEST2 (bc4-back 0.22.3) :
>   - LTE serving  rsrq → `M_serving_rsrq`
>   - LTE neighbor rsrp → `M_neighbor_rsrp`
>   - LTE SCell    rsrq → `M_scell_rsrq`
>   - NR  serving  SSB  rsrp → `M_serving_ssb_rsrp`
>   - NR  neighbor SSB  sinr → `M_neighbor_ssb_sinr`

### Ajouté
- `src/features/dictionary/measure-roles.ts` — table de rôle + fonction
  `canonicalMeasureKey(asn1_path)` strictement déclarée (pas de deviné) :
  - **Rôles** (précédence `neighbor > scell > serving`) :
    - `serving`   : `measResultServingCell` | `measResultPCell` |
                    `measResultServingMOList` | `servingCellResults`
    - `neighbor`  : `measResultNeighCells` | `measResultListEUTRA` |
                    `measResultNeighCellListNR` | `resultsNeighCellList`
    - `scell`     : `measResultServFreqList` | `sCellResult` |
                    `measResultSCell`
  - **Ressource NR** (optionnelle) :
    - `ssb`   : `resultsSSB-Cell` | `ssbResults` | `/ssb/`
    - `csirs` : `resultsCSI-RS-Cell` | `csi-rs` | `csiRs`
  - **Grandeur** : radical normalisé (suppression des suffixes release
    `-r10…-r18`, `Result`, `-Result`, `ResultNCell`, `ResultSCell`) qui doit
    matcher **exactement** `rsrp` | `rsrq` | `sinr` | `cqi`.
  - Si rôle inconnu OU grandeur inconnue OU path hors `MeasurementReport`
    → `canonicalMeasureKey` renvoie `null` et le leaf **conserve son nom
    RRC natif** (via `leafOf()`). Aucun forçage.

### Modifié
- `src/features/dictionary/DictionaryPage.tsx` : rendu du label leaf (ligne
  ~354) :
  - calcule `canon = canonicalMeasureKey(p.param)` ; affiche `canon` quand
    non-null (en police mono + couleur primaire pour la visibilité), sinon
    `leafOf(p.param)` (comportement 1.11.x inchangé).
  - **Détection des vrais doublons** : si deux leaves d'un même message
    partagent le MÊME `asn1_path` exact, on log `console.warn` + badge
    jaune « doublon » visible sur chaque ligne — on **ne fusionne PAS**
    (c'est une anomalie d'agrégation back, cf. G22 doctrine `label` qui
    emprunte un autre chemin de désambiguïsation).
  - Le `title` (tooltip) et le détail (table ASN.1) conservent le path
    complet + le nom RRC natif : **pas de perte d'info**.
- `scripts/smoke_api.ts` : nouveau cas (h.5) sur TEST2 :
  - import de `canonicalMeasureKey` depuis le même fichier UI (une seule
    source de vérité) ;
  - vérifie qu'au moins **2 clés M_ distinctes** apparaissent pour la
    grandeur `rsrq` (plusieurs rôles observés : serving + neighbor + scell) ;
  - log warn si des vrais doublons sont détectés dans un message, sans
    faire échouer la garde (contrat UI : afficher le badge).
- `scripts/g5_diff_scope.sh` : whitelist étendue au nouveau fichier
  `src/features/dictionary/measure-roles.ts`.

### Observations live TEST2 (bc4-back 0.22.3) — 2026-10-15
- Pré-vérif étape 0 (OK) : `/dict/tree?tech=…` sert pour chaque param
  `{ "param": "<asn1_path complet>", "count": N, "label": "<human>" }`.
  La UI consomme `param` uniquement (Zod `TreeV2ParamSchema` strippe
  `label` depuis 1.8.0).
- **LTE MeasurementReport** (30 leaves) → 20 leaves de mesure classées,
  10 non-mesure (`measId`, `physCellId`, `servFreqId-r10`, `utra-EcN0`,
  `utra-RSCP`, `pci-r15`, `carrierFreq-r15`, `ssb-Index-r15`, `fdd`).
  Clés M_ émises : `M_neighbor_rsrp`, `M_neighbor_rsrq`, `M_serving_rsrp`,
  `M_serving_rsrq`, `M_scell_rsrp`, `M_scell_rsrq`, `M_scell_sinr`.
- **NR MeasurementReport** (24 leaves) → 18 leaves de mesure classées,
  6 non-mesure (`measId`, `physCellId`, `ssb-Index`×3, `servCellId`).
  Clés M_ émises : `M_serving_ssb_rsrp/rsrq/sinr`, `M_neighbor_ssb_rsrp/rsrq/sinr`,
  `M_neighbor_rsrp/rsrq/sinr` (branche `ssb-Results` sans marqueur
  `resultsSSB-Cell` — cf. écart déclaré ci-dessous).
- **Doublons back** (asn1_path EXACTEMENT identique dans un même message) :
  **0 observé** sur TEST2 pour LTE+NR MeasurementReport. La UI est
  néanmoins outillée (badge + warn console) pour les détecter dès qu'ils
  apparaîtraient.

### Écarts déclarés (role=unknown ou classification sémantique perfectible)
Ces écarts sont **conscients** : la doctrine 1.12.0 est de ne JAMAIS deviner
hors des marqueurs déclarés, donc les cas suivants :
1. **`measResultServFreqListNR-r15/measResultBestNeighCell-r15/.../rsrp-Result-r15`**
   → classé `scell` (marqueur `measResultServFreqList`), semantique réelle
   « neighbor dans le serving-freq ». `measResultBestNeighCell` n'est pas
   dans la liste des marqueurs neighbor → classification scell, path visible
   dans le tooltip. Pour corriger : ajouter `measResultBestNeighCell` aux
   marqueurs neighbor (lot ultérieur, demande d'alignement avec le back).
2. **`measResultServingMOList/measResultBestNeighCell/.../rsrp`** (NR) → classé
   `serving` + `ssb` (marqueur `measResultServingMOList`). Même constat :
   `measResultBestNeighCell` non reconnu neighbor. Même remédiation.
3. **`.../rsIndexResults/resultsSSB-Indexes/ssb-Results/rsrp`** (NR) → classé
   `M_neighbor_rsrp` / `M_serving_rsrp` SANS ressource `ssb` : le marqueur
   déclaré est `ssbResults` (sans hyphen), le path réel contient
   `ssb-Results` (avec hyphen). Pour corriger : ajouter `ssb-Results` et
   `resultsSSB-Indexes` aux marqueurs SSB (lot ultérieur).
4. **`.../measResultSSB-Index-r15/rsrpResult-r15`** (LTE/NR) : même manque de
   marqueur SSB — path contient `measResultSSB-Index` qui n'est pas dans
   la liste.

Ces écarts n'empêchent **pas** l'affichage : la clé reste significative
(`M_scell_rsrp` au lieu de `M_neighbor_rsrp` dans le cas 1), et le path
complet reste visible dans le tooltip + la table ASN.1 détail. Un lot
« 1.12.1 : marqueurs étendus » corrigera ces 4 écarts sémantiques
après validation d'une doctrine 3GPP partagée avec le back (coord G22).

### Non-objectifs
- Doctrine back G22 (`label: str` sur `DictTreeParam`, désambiguïsation par
  path parent) **restée côté back, non consommée par la UI**. Les deux
  doctrines coexistent : la UI 1.12.0 utilise exclusivement `param`
  (asn1_path complet) pour sa classification, elle est **orthogonale** au
  `label` G22.
- Aucune modification des endpoints `/dict/params` et `/dict/param/map` :
  la clé M_ reste purement **cosmétique** à l'affichage dans l'arbre. La
  sélection d'un paramètre continue de propager l'`asn1_path` complet
  (`sel.path = p.param`) aux autres panneaux (histogramme, table, map).

## 1.11.2 (patch) — bc4-front 2026-10-15 — Badge « Données démo » conditionnel (Agent BC1)

> Coordonné avec bc4-back 0.23.0. Le badge « Données démo » n'est plus
> affiché systématiquement — il reflète maintenant le champ `demo` du
> back qui est `false` pour un projet ingéré (NMF décodé), `true` pour
> un projet purement seedé.

### Modifié
- `src/lib/api/assistant-schemas.ts` : `demo: z.literal(true)` →
  `demo: z.boolean()`. Compat ascendante : le back renvoyait déjà
  `true`, il peut maintenant renvoyer `false`.
- `src/features/assistant/ResponseRenderer.tsx` : `<DemoBadge />` →
  `{r.demo && <DemoBadge />}`. L'étiquette apparaît uniquement si le
  back a signalé des données démo.

### Non-objectifs
- Les deux autres usages du label « Données démo » (sidebar + export
  Markdown dans `AssistantPage.tsx`) **restent inchangés** pour ce lot
  (lot ultérieur si besoin).

## 1.11.1 (patch) — bc4-front 2026-10-15 — Settings LLM : « Enregistrer » n'efface plus la clé (Agent BC1)

> **Bug fix UX destructif**. Avant 1.11.1, si l'utilisateur touchait
> le champ clé puis le laissait vide avant de cliquer « Enregistrer »
> (par exemple en cliquant dedans pour recopier/supprimer), le front
> envoyait `api_key: ""` → le back effaçait silencieusement la clé.
> Résultat observable : « Enregistré (serveur) » + « Tester OK » juste
> après le save qui a stocké la vraie clé, mais à la prochaine save
> la clé disparaissait et l'Assistant retombait en `UNAVAILABLE`.

### Modifié
- `src/features/settings/ai/LlmConfigPanel.tsx` :
  - **« Enregistrer » n'envoie plus `api_key: ""`**. Si le secret est
    vide (ou que des espaces), la clé stockée est préservée. Seule
    une saisie **non vide** remplace la clé.
  - Nouveau bouton **« Effacer la clé »** à côté du champ (visible
    uniquement si `api_key_set === true`). Confirme via
    `window.confirm("Effacer la clé API stockée ? …")` avant de PUT
    `api_key: ""`. L'effacement est volontaire et unique chemin
    destructif.
  - Hint du champ clarifié : « Champ vide = clé actuelle préservée.
    Pour l'effacer : bouton « Effacer la clé » ci-dessous. »
  - Avertissement destructif « La clé stockée sera effacée » retiré
    (devient faux après le fix).

### Non-objectifs
- La sémantique back (`api_key: ""` = clear) est **conservée** pour
  compatibilité d'intégration (scripts admin externes qui veulent
  effacer en une seule requête). Seule la UI standard refuse ce chemin.

## 1.11.0 (minor) — bc4-front 2026-10-15 — Projet actif global (Agent BC1 pour BC2)

> **Sélection explicite** du projet via la liste des projets. Un store
> `activeProject` persisté par-viewer dans `localStorage` pilote les
> pages scopées (Dictionnaire RRC, Assistant IA, Vue d'ensemble, KPI).
> **Fin de l'auto-sélection silencieuse** de l'AppShell : si aucun
> projet n'est actif, chaque page affiche un état vide clair
> « Sélectionne un projet pour commencer ». Aucun projet n'est codé en
> dur.

### Ajouté
- `src/lib/activeProject.ts` — store `activeProject` (shape
  `{ id, name } | null`) :
  - Pub/sub + `useSyncExternalStore` → consommable par `useActiveProject()`.
  - Persisté dans `localStorage` à la clé `bc4.activeProject.v1.<userEmail|anon>`
    (per-viewer, isolé entre comptes).
  - **try/catch** sur read + write — un localStorage cassé ne doit JAMAIS
    bloquer l'app ; en cas d'échec on repart de `null` sans erreur.
  - Synchro inter-onglets via l'event `storage` (plusieurs onglets du
    même viewer restent cohérents).
  - API : `useActiveProject()`, `getActiveProject()`, `setActiveProject(p)`,
    `clearActiveProject()`.
- `src/components/bc4/NoActiveProject.tsx` — état vide standardisé pour
  les 4 pages scopées : titre « Sélectionne un projet pour commencer »,
  CTA vers `/projects`.
- Toast monté au `__root.tsx` (`sonner` était déjà en deps, pas monté).
  Les notifications discrètes passent par `toast.success(...)`.

### Modifié
- `src/components/bc4/AppShell.tsx` :
  - **Suppression** de l'auto-set `filters.project = projects[0]!.id`
    (ex-lignes 87-90). Un auto-set silencieux était un faux garde —
    il masquait l'intention « je veux choisir un projet ».
  - **Indicateur dans la barre du haut** : quand `activeProject !== null`,
    pilule `Projet : {name} ✕` à gauche du toggle thème. Le bouton ✕
    déclenche `clearActiveProject()` → les pages scopées repassent à
    l'état vide, l'indicateur disparaît.
- `src/routes/_app.projects.tsx` :
  - Bouton **« Ouvrir »** → `setActiveProject({id, name})` +
    `toast.success('Projet « X » chargé')`. **Plus de navigation** vers
    `/projects/$projectId` (ce chemin reste réservé à l'import NMF,
    atteint via `ProjectRowNmfAction` sur la même ligne).
- `src/routes/_app.rrc.tsx`, `_app.overview.tsx`, `_app.assistant.tsx`,
  `_app.kpi.tsx` :
  - **Source de vérité du projet** = `useActiveProject().activeProject.id`
    (plus `useFilters().project`).
  - Rendu `<NoActiveProject scope="…" />` quand `!activeProject`.
  - `useFilters()` est conservé pour les AUTRES scopes (op, tech, band,
    arcep…). `filters.project` n'est plus lu dans ces 4 pages.
  - Overview + Assistant construisent un `scopedFilters` qui force
    `project: activeProject.id` au moment du call API, pour conserver
    la signature `(filters) => …` existante côté `client.ts`.

### Non-objectifs (écarts ouverts)
- `filters.project` dans l'URL n'est plus la source de vérité, mais
  reste schématisé par `FilterContextSchema` pour compat ascendante
  avec les deeplinks existants (ex. captures écran). Un lot ultérieur
  (1.11.1 ou 1.12.0) pourra retirer `project` du schema URL une fois
  les deeplinks mis à jour.
- Pas de « liste récente de projets ouverts » (MRU) — seul le projet
  **courant** est mémorisé. L'historique de navigation reste côté
  TanStack Router.
- `/projects/$projectId` (détail NMF) n'est plus accessible via le
  bouton « Ouvrir ». L'accès reste possible via le bouton d'import NMF
  de la row ou en tapant l'URL. Si le besoin émerge d'un « Voir les
  détails » dans le menu `...`, à ajouter en 1.11.1.

### Garde (G5 manuelle — à exécuter dans un navigateur contre `VITE_BC4_DATA=api`)

1. **Démarrage à froid** — vider `localStorage` (`bc4.activeProject.*`).
   Naviguer vers `/rrc` → affiche « Sélectionne un projet pour commencer » + CTA.
   Idem `/overview`, `/assistant`, `/kpi`. **PAS de projet TEST2 chargé auto.**
2. **Ouvrir TEST2** — depuis `/projects`, cliquer « Ouvrir » sur TEST2.
   Toast « Projet « TEST2 » chargé ». Barre du haut : pilule
   « Projet : TEST2 ✕ ». Naviguer vers `/rrc` → paramètres de TEST2
   s'affichent. `/overview` → données de TEST2. `/assistant` → chat
   scopé TEST2 (preuves `measurement_points.summary` de TEST2).
3. **Changer de projet** — « Ouvrir » Benchmark National.
   Toast « chargé ». Barre : « Projet : Benchmark National ».
   Pages scopées basculent automatiquement sans refetch manuel.
4. **Fermer (×)** — clic sur ✕ dans la pilule. Barre : plus de pilule.
   `/rrc`, `/overview`, `/assistant`, `/kpi` : tous en état vide
   « Sélectionne un projet pour commencer ». **Pas de 0, pas de N/D
   trompeur.**
5. **Refresh F5** — après `Ouvrir TEST2`, F5. Le store est repris du
   `localStorage` : pilule TEST2 toujours là, pages continuent de
   fonctionner.
6. **Multi-onglets** — ouvrir deux onglets, « Ouvrir TEST2 » dans l'un.
   L'autre onglet reflète la pilule TEST2 en temps réel (via l'event
   `storage`).
7. **localStorage KO** — bloquer l'écriture (ex. mode privé Safari qui
   quota à 0). L'app ne crashe PAS, elle démarre juste sans projet
   actif. Les actions `setActiveProject` fonctionnent en mémoire mais
   ne survivent pas au refresh — comportement acceptable.

Si l'un des 7 points échoue, c'est un écart ouvert à documenter avant
merge.

## 1.10.0 (minor) — bc4-front 2026-10-15 — Assistant LLM : panneau branché au back réel (Agent BC1)

> La page « Configuration IA » (route `/settings/ai`) est débranchée du
> store mock et parle maintenant à bc4-back `/settings/llm` +
> `/settings/llm/test`. Rebaptisée **« Assistant LLM »** dans la nav.
> **Non-breaking côté UI** : même route, même emplacement — seuls
> l'implémentation et les copies internes changent.

### Ajouté
- `src/lib/api/llm-schemas.ts` — schémas Zod `LlmSettings`,
  `LlmSettingsInput`, `LlmTestResult`, options `LlmProviderOptions`
  (openai / mistral / together / groq / openrouter / custom).
- `src/lib/api/llm.ts` — client typé : `getLlmSettings`,
  `putLlmSettings`, `testLlmConnection`, `llmApiBase`.
  - La clé n'est JAMAIS stockée dans localStorage (pas de passage par
    la cache react-query comme valeur, pas de persistance locale).
  - `api_key === ""` ⇒ efface la clé stockée. `api_key: undefined` ⇒
    ne touche pas.
  - Mode mock (`VITE_BC4_DATA !== "api"`) : stubs cohérents, pas d'appel
    réseau, pour que la navigation démo reste fonctionnelle.
- `src/features/settings/ai/LlmConfigPanel.tsx` — nouveau panneau :
  - Appel RÉEL `GET /settings/llm` (TanStack Query, 403 propagé via
    `Forbidden`).
  - PUT avec champs partiels (PATCH-like côté back). La clé passe
    uniquement si l'utilisateur a touché le champ (`secretTouched`) —
    sinon la clé stockée est conservée.
  - Bouton **Tester la connexion** : POST `/settings/llm/test`
    (chat completions `max_tokens=1`) → affichage OK/KO + latence +
    message safe du back. Désactivé tant que le formulaire est `dirty`
    (titre explicite au survol).
  - Carte « Clé API stockée » (chiffrée en base / aucune), carte
    « Dernière mise à jour » et « Assistant activé » comme pilules.
  - Avertissement explicite si l'utilisateur vide la clé
    (`api_key: ""` est destructif).
  - Avertissement endpoint non HTTPS.

### Modifié
- `src/routes/_app.settings.ai.tsx` : rend désormais `LlmConfigPanel`
  (ancien `AiConfigPanel` conservé en module pour archive mais plus
  routé — peut être supprimé dans un lot suivant).
- `src/features/settings/SettingsLayout.tsx` : onglet renommé
  « Assistant LLM » (anciennement « Configuration IA »).

### Non-objectifs (écarts ouverts)
- `AiConfigPanel.tsx` + `getAiConfig/putAiConfig/testAiConnection` dans
  `settings.ts` restent dans le repo (pas utilisés par le routeur).
  Nettoyage à prévoir en 1.10.1.
- Mode mock : le panneau est en « lecture seule effective » (les PUT
  ne tapent pas de store mock). C'est **intentionnel** — la config LLM
  n'est utile qu'en mode API.

## 1.9.0 (minor) — bc4-front 2026-10-15 — Dictionnaire RRC : espace de travail dynamique unique

- Page unique sans onglets ni bandeau KPI : arbre ASN.1 à gauche, histogramme + table détaillée au centre, carte optionnelle à droite.
- Barre d'outils unique : Technologie, Opérateur, Bande, Zone géographique, Période, « Regrouper par » (Aucun / Opérateur / Bande / Opérateur + Bande), mesure (occurrences / % population / % groupe), bouton « Carte », Appliquer, Réinitialiser.
- Fiche technique du paramètre uniquement à la demande (bouton « Infos »).
- Clic sur une ligne de la table : surligne la valeur dans l'histogramme et sur la carte.
- Contrat mock étendu : `value_matrix` (valeur × opérateur × bande) dans `/dict/params` — changement back à prévoir.
- Zone géographique et période affichées mais non filtrantes : l'API du dictionnaire ne les prend pas en charge.

## 1.8.1 (patch) — bc4-front 2026-10-15 — Dictionnaire RRC : histogramme câblé sur `value_distribution` — Agent BC1

### Modifié
- `src/features/dictionary/DictionaryPage.tsx` — composant `Histogram` :
  l'histogramme est désormais alimenté **directement** par
  `row.value_distribution` (bc4-back 0.15.0), au lieu d'être dérivé
  côté UI à partir de `buckets[]` (occurrences par opérateur × bande).
  - **Paramètre numérique** (au moins une entrée avec
    `value_converted` non null) : abscisse = `value_converted` (tri
    numérique croissant pour les paramètres `exact`), ordonnée =
    `count`. Le nom de l'axe reprend l'unité convertie (`"Valeur
    convertie (dBm)"`) lorsqu'elle est connue — l'unité n'est jamais
    inventée.
  - **Paramètre enum** (toutes les entrées ont `value_converted ===
    null`) : abscisse = `value_raw` (ex. `n100`, `n75`), ordre tel que
    servi par le back, pas de conversion.
  - **Entrée convertible mais `value_converted === null`** : libellée
    « N/D » en abscisse — JAMAIS remplacée par 0.
  - **`value_distribution_mode === "binned"`** : les abscisses sont
    affichées **telles quelles** (bornes d'intervalle servies par le
    back), et une petite note sous le chart signale explicitement
    « binning actif ».
  - `value_distribution` vide → EmptyState du design system BC4
    (`src/components/bc4/States.tsx`), libellé « Aucune valeur
    observée » — JAMAIS « conversion indisponible ».
- `src/lib/api/dictionary-schemas.ts` — `ParamRowSchema` étendu avec
  **deux champs optionnels** (compat ascendante stricte, un back qui
  ne les renvoie pas doit continuer à passer la validation Zod) :
  - `value_distribution: ParamDistributionEntry[]` — `optional().default([])`
    avec `ParamDistributionEntry = { value_raw: string, value_converted:
    string | null, count: int }`.
  - `value_distribution_mode: "exact" | "binned"` —
    `optional().default("exact")`.

### Vérifié
- `scripts/g2_smoke_api.sh` + `scripts/smoke_api.ts` : nouveau cas
  **(h.4)** qui exerce :
  - `rsrpResult` (numérique) → `value_distribution` non vide, somme
    des `count` == `count` du paramètre, au moins une entrée avec
    `value_converted` non null (sanity 3GPP), `value_distribution_mode
    ∈ {exact, binned}`.
  - `dl-Bandwidth` (enum via `MasterInformationBlock`) →
    `value_converted === null` sur toutes les entrées,
    `value_distribution_mode === "exact"`.
- Live sortie TEST2 : rsrpResult expose 49 entrées exactes
  (Σ count = 1481 == count) dont la première `{raw:"30",converted:"-111",
  count:1}`. `dl-Bandwidth` expose 2 entrées enum (`n100`, `n75`) avec
  `value_converted = null`.

### Non modifié (vérifié)
- Table ASN.1 détail paramètre (`DetailTable`), matrice opérateur ×
  bande (`OperatorBandTable`), carte des occurrences (`OccurrenceMap`),
  arbre RRC, barre de filtres et query string restent inchangés. Les
  5 filtres UI (`op/band/dr/plaque/arcep`) continuent de propager
  uniquement `operator`/`band` côté réseau (DR/Plaque/Zone ARCEP grisés
  tant que `cell_ref` est vide).

## 1.8.0 (minor) — bc4-front 2026-10-15 — Dictionnaire RRC : page unifiée V2, design BC4, 5 filtres — Agent BC1

### Ajouté
- Page `src/features/dictionary/DictionaryPage.tsx` **rebâtie** sur une
  shape unifiée V2 (`branches[].system/count/messages[].params[]`). La
  UI ne connaît plus qu'un seul rendu — plus de dispatcher ni de
  « composant V2 » parallèle. Composition :
  - **Barre de filtres** (en haut, pleine largeur) : 5 selects dans
    l'ordre **Opérateur · Bande · DR · Plaque · Zone ARCEP**. Les 2
    premiers sont actifs (venant de `GET /projects/{id}/dict`), les 3
    derniers sont **grisés tant que `cell_ref` est vide** côté back
    (contrat `GET /reference/cell/summary.arcep_breakdown == []`).
    Aucun filtre non supporté n'est propagé en query string (pas de
    400 silencieux). Composant réutilisé : `MultiSelect`
    (`src/components/bc4/MultiSelect.tsx`) + wrapper local
    `DisabledMultiSelect` purement visuel.
  - **Arbre RRC** (colonne gauche) : branches LTE / NR → messages →
    paramètres (feuilles ASN.1), comptes agrégés à chaque niveau. Rend
    la forme V2 brute telle quelle (TEST2) ou la forme B0 **repliée en
    V2 par l'adaptateur** (projets seedés comme `idf-t3-2026`,
    `rennes-lte-2026`). Zéro arbre dupliqué, badge techno BC4.
  - **Fiche de paramètre** (colonne droite) : `Table` du design BC4
    (`src/components/ui/table.tsx`) listant Message · Type ASN.1 ·
    Chemin ASN.1 (+ bouton copier) · Valeur observée (brute, dominante)
    · Valeur convertie · Part dominante · Règle de conversion (+ réf
    3GPP). Les cellules `null` affichent « N/D » — jamais `0`, jamais
    « conversion indisponible ». Si `unit_converted` est connue mais
    pas la règle, on affiche quand même l'unité.
  - **Histogramme** des buckets (opérateur × bande) via `Chart`
    (`src/components/bc4/Chart.tsx`, ECharts lazy-loaded).
  - **Table Opérateur × Bande** : occurrences + moyenne convertie
    (`Table` du design BC4). Un bucket à `count=0` est libellé
    `"0 occurrence"` explicitement — pas juste `0`.
  - **Carte des occurrences** : points lon/lat colorés par valeur
    convertie, MapLibre lazy-loaded avec la même pile que les autres
    cartes (`src/components/bc4/RadioMap.tsx` comme référence de
    style).
- Nouveaux schémas Zod unifiés dans
  `src/lib/api/dictionary-schemas.ts` :
  - `TreeV2Schema` (shape brute du back ingéré), `TreeB0Schema` (shape
    brute du back seedé), union discriminée côté adaptateur, et
    `TreeSchema` qui est la **seule** forme consommée par la UI
    (toujours `{branches: [{system, count, messages:[{message, count,
    params:[{param, count}]}]}]}`).
  - `ParamListSchema` + `ParamRowSchema` + `ParamBucketSchema` alignés
    sur `/dict/params?system=&message=&operator=&band=` (back 0.14.0).
  - `ParamMapSchema` + `ParamMapPointSchema` alignés sur
    `/dict/param/map?path=&system=&operator=&band=`.
- Adaptateurs dans `src/lib/api/dictionary.ts` :
  - `getDictTree` lit la forme brute (union V2 ∪ B0) puis replie tout
    en V2 unifiée AVANT de valider via `TreeSchema`. La UI ne voit
    jamais la shape B0.
  - `getDictParams(id, system, message, filters)` propage `operator`
    et `band` (noms V2 côté back), **pas** `dr/plaque/arcep`.
  - `getDictParamMap(id, path, system, filters)` idem.
  - Les 5 filtres UI sont groupés dans `DictFilters =
    Pick<FilterContext, "op" | "band" | "dr" | "plaque" | "arcep">`.
    Les 3 derniers entrent dans la clé React Query (pour invalider le
    cache) mais ne sont pas sérialisés en query string.
- `src/lib/api/schemas.ts` : extension de `FilterContextSchema` avec
  `dr?: string[]` et `plaque?: string[]`. Les deux restent dans l'URL
  mais ne sont consommés que par le Dictionnaire (les autres pages
  ignorent ces clés).

### Modifié
- `src/features/dictionary/shared.ts` : `Selection` passe à
  `{system, message, path}` (plus `msgId`/`paramId`). Nouvelle helper
  `leafOf(path)` qui gère les deux séparateurs `/` et `.` renvoyés
  par le back (`measurementReport/measurementReport-r8/...` V2 vs
  `systemInformationBlockType1.cellSelectionInfo.q-RxLevMin` B0).
- `src/routes/_app.rrc.tsx` : extrait désormais 5 clés
  (`op, band, dr, plaque, arcep`) du `FilterContext` partagé. Les
  autres clés (`tech/svc/dep/metric`) restent dans l'URL mais ne sont
  pas consommées par le Dictionnaire.
- `scripts/g2_smoke_api.sh` + `scripts/smoke_api.ts` : nouveau cas
  **(h.3)** qui exerce :
  - `GET /projects/TEST2/dict/tree` → shape V2 confirmée (branches
    LTE + NR, counts non nuls après ingestion).
  - `GET /dict/params?system=LTE&message=…&operator=Orange` →
    strictement restrictif vs baseline (chaque `path.count` filtré ≤
    `path.count` baseline).
  - `GET /dict/param/map?path=…&system=LTE` → renvoie des points
    (lat/lon/value_raw/value_converted/operator/band).
  Le sous-cas arcep=... sur `/dict/tree` est **désactivé** : le back
  0.14.0 n'expose pas ce filtre côté `/dict/*` et `cell_ref` est vide
  (0 bucket ARCEP). La UI 1.8.0 ne l'envoie plus.
- `scripts/g1_build.sh` : lint `src/lib/api/dictionary-schemas.ts`
  (ajouté explicitement — précédemment implicite via tsc).

### Retiré
- `src/features/dictionary/ProtocolTree.tsx`,
  `MessageParameterCards.tsx`, `ParameterInspector.tsx`,
  `DistributionPanel.tsx`, `ComparisonMatrix.tsx`,
  `ParameterMapPanel.tsx` — remplacés par les sous-composants internes
  du nouveau `DictionaryPage.tsx` qui utilisent le design BC4
  (`Panel`, `Table`, `Chart`, `MultiSelect`, `States`, `Resizable*`).
  Ces fichiers étaient en working-tree hors tracked au moment du HEAD
  précédent, donc leur retrait ne change pas le périmètre tracked.
- Tests obsolètes `src/test/conversion.test.tsx`,
  `provenance.test.tsx`, `nr-branch.test.tsx`,
  `dictionary-helpers.tsx` : couplés aux sous-composants supprimés et
  à la shape B0 historique. Pas de remplacement 1:1 — l'invariant
  « valeurs = API » est garanti par Zod + le smoke (h.3). Fichiers
  non tracked avant ce lot.

### Garanties (verrouillage doctrine)
- **UI ne lit que via `client.ts`.** `getDictProject`, `getDictTree`,
  `getDictParams`, `getDictParamMap` sont les SEULES fonctions exposées.
  (`getDictParamDetail` est préservée pour `src/mocks/assistant.ts` mais
  ne passe pas par `client.ts` — mock-only, interne.)
- **Validation Zod systématique à chaque lecture.** Union
  discriminée V2/B0 au niveau transport uniquement, repliée en V2
  avant validation finale.
- **`null` → N/D, jamais `0` ; `0` reste `"0 occurrence"` quand c'est
  un comptage réel, pas un placeholder.**
- **Aucun badge « Données démo » sur la page Dict en mode api.** Le
  `DemoBadge` du design BC4 n'est plus posé dans ce rendu — la page
  consomme uniquement les données réelles du back.
- **Diff strictement limité** aux chemins déclarés par le lot ; `g5`
  passe sans retouche de whitelist (les deltas tombent dans `scripts/*`
  et `src/lib/api/*` déjà whitelistés).

### Écarts restants
- `/dict/tree` **n'accepte pas** encore les filtres `arcep`, `dr`,
  `plaque` côté back 0.14.0 (`/openapi.json` liste `op/tech/svc/band/dep`
  pour `/dict/tree` ; `operator/band` pour `/dict/params` V2 ;
  `op/band/path/system/limit` pour `/dict/param/map`). La UI 1.8.0 ne
  propage JAMAIS ces 3 filtres en query string. Dès qu'ils seront
  branchés côté back + `cell_ref` peuplée, retirer les wrappers
  `DisabledMultiSelect` et pousser les clés en query via
  `getDictTree`/`getDictParams`/`getDictParamMap`.
- `cell_ref` étant VIDE côté back (confirmé via
  `GET /reference/cell/summary` → `total=0`), les 11 catégories ARCEP
  + les options DR / Plaque n'ont rien à proposer. Les selects sont
  grisés avec le libellé explicite « cell_ref vide ».
- `/dict/params` V2 **ne fournit pas** encore `value_raw_dominant`,
  `value_converted_dominant`, `share_dominant`, `type` ASN.1, ni
  `conversion_rule` par ligne (shape live observée : `system, message,
  path, count, unit_converted, buckets`). La UI affiche « N/D » pour
  ces cellules dans la table de détail et préserve la règle 3GPP si
  elle est connue (via le champ facultatif `conversion_rule`). Dès que
  le back expose ces champs, les cellules se peupleront sans
  changement UI.
- `/dict/param/map` renvoie `value_raw`/`value_converted` en **string**
  côté back 0.14.0 (ex. `"44"` / `"-97"`). Le schéma Zod les tolère en
  `string | number`, la carte convertit en number pour le gradient de
  couleur.

### Live checks (TEST2 — bc4-back 0.14.0, demo@demo.com admin)
- `curl /projects/134af70a06eb/dict/tree` → shape V2 confirmée
  (`LTE count=68 633`, `NR count=30 046`).
- `curl /dict/params?system=LTE&message=MeasurementReport` → 17 paths,
  avec `rsrpResult` ayant 1 481 occurrences réparties sur 7 buckets
  opérateur × bande.
- `curl /dict/params?system=LTE&message=MeasurementReport&operator=Orange`
  → 17 paths restreints à 205 occurrences (filtre restrictif).
- `curl /dict/param/map?path=…rsrpResult&system=LTE` → 1 476 points
  avec lat/lon/value_raw/value_converted/operator/band.

## 1.7.1 (patch) — bc4-front 2026-10-15 — Dictionnaire : retour au design B0, retrait du composant V2 — Agent BC1

### Retiré
- `src/features/dictionary/DictionaryV2Panel.tsx` — supprimé. Le lot
  1.7.0 avait introduit un composant V2 autonome (arbre LTE/NR → path,
  histogramme par (operator, band) + carte scatter) et un *dispatcher*
  V2/B0 en tête de `DictionaryPage.tsx`. Décision utilisateur : le
  design d'origine B0 (3 panneaux `ProtocolTree` / `MessageParameterCards`
  + `ParameterInspector` / `DistributionPanel` + `ComparisonMatrix` +
  `ParameterMapPanel`) est la vue de référence du dictionnaire RRC. On
  ne garde PAS une seconde expérience de rendu en parallèle.
- Dans `src/lib/api/dictionary.ts` : retrait des trois adaptateurs V2
  (`getDictTreeAny`, `getDictParamsV2`, `getDictParamMapV2`) et de leurs
  imports de schémas V2. Les adaptateurs B0 historiques
  (`getDictTree`, `getDictParams`, `getDictParamDetail`,
  `getDictParamMap`) restent le seul chemin exposé par `client.ts`.
- Dans `src/lib/api/dictionary-schemas.ts` : retrait des shapes V2
  (`DictTreeV2Schema`, `DictTreeBranchV2Schema`, `DictTreeMessageV2Schema`,
  `DictTreeParamV2Schema`, `ParamListV2Schema`, `ParamRowV2Schema`,
  `ParamBucketV2Schema`, `ParamMapV2Schema`, `ParamMapPointV2Schema`),
  de l'union discriminée `DictTreeAnySchema` et du helper
  `isDictTreeV2`. La UI ne consomme QUE `TreeSchema`, `ParamListSchema`,
  `ParamDetailSchema`, `ParamMapSchema` — validation Zod à chaque
  lecture conservée à l'identique.
- Dans `src/features/dictionary/DictionaryPage.tsx` : retrait du
  dispatcher V2/B0 et de l'import `DictionaryV2Panel` + `getDictTreeAny`
  + `isDictTreeV2`. L'ancien `DictionaryPageB0` interne redevient le
  composant exporté sous le nom historique `DictionaryPage` — zéro
  changement de signature ni de rendu pour le consommateur
  `src/routes/_app.rrc.tsx`.
- Dans `scripts/g5_diff_scope.sh` : retrait de la whitelist
  `src/features/dictionary/DictionaryV2Panel.tsx` — le fichier n'existe
  plus dans le périmètre du lot.

### Doctrine (verrouillage)
- **Le mapping « forme API réelle → forme attendue par les composants »
  vit dans `src/lib/api/dictionary.ts` + les schémas Zod** — jamais
  dans un composant pont. Les composants historiques (`ProtocolTree`,
  `MessageParameterCards`, `ParameterInspector`, `DistributionPanel`,
  `ComparisonMatrix`, `ParameterMapPanel`) ne sont PAS modifiés par ce
  lot ; ils continuent de consommer les shapes B0 (`DictTree`,
  `ParamList`, `ParamDetail`, `ParamMap`) tels que décrits par leurs
  `type` imports.
- **UI ne lit que via `client.ts`.** `src/lib/api/client.ts` ré-exporte
  `./dictionary` et donc expose uniquement `getDictProject`,
  `getDictTree`, `getDictParams`, `getDictParamDetail`,
  `getDictParamMap` + `type DictFilters`.
- **`null` → N/D (jamais 0).** Les helpers existants `nd` / `fmtShare`
  dans `src/features/dictionary/shared.ts` + les composants d'affichage
  gèrent déjà cette règle sur les shapes B0 — zéro régression.
- **Validation Zod systématique à chaque lecture** — `apiFetch`
  continue de valider les 4 shapes B0 au runtime via leurs schémas,
  comme avant 1.7.0.

### Observations live (contrôle manuel)
- bc4-back 0.14.0 expose EN PARALLÈLE les deux shapes sur les mêmes URLs
  selon les query params :
  - `/dict/tree` → shape B0 (`branches[].techno/channels/messages[]`)
    pour TOUS les projets observés (TEST2, idf-t3-2026, national-2026,
    …). Pas de dispatcher back visible sur cet endpoint — V2 n'est
    renvoyé que si un paramètre `system=` est passé, et dans ce cas
    bc4-back répond une liste `params[]` V2 (shape différent).
  - `/dict/params?msg_id=…` → shape B0.
    `/dict/params?system=…&message=…` → shape V2 (non consommé par la
    UI 1.7.1).
  - `/dict/param?param_id=…&group_by=…` → shape B0.
    `/dict/param/map?param_id=…` → GeoJSON B0.
    `/dict/param/map?path=…&system=…` → shape V2 (non consommé).
- La UI 1.7.1 interroge SYSTÉMATIQUEMENT en style B0 → mapping zéro,
  pas de synthèse de légende, pas de perte. Le shape B0 contient DÉJÀ
  ce qu'attendent les composants (`fiche.conversion_rule`, `histogram`,
  `matrix`, `legend.{kind,stops,classes}`).

### Correctifs conservés depuis 1.7.0
- `ParamMapSchema.legend.{stops,classes}` reste en `.nullable().optional()`
  (le back renvoie `null` pour la branche inutilisée, ex. `kind=numeric`
  → `classes: null`). Ce fix de schéma reste bénéfique en B0 pur et
  n'implique aucun composant.

### Écarts ouverts
- **Dispatcher V2 côté back absent de `/dict/tree`** : le CHANGELOG
  1.7.0 décrivait un dispatch back V2/B0 selon la présence de
  `param_occurrence` sur le projet. En live (bc4-back 0.14.0 observé),
  `/dict/tree` renvoie TOUJOURS B0, V2 n'étant servie que sur
  `/dict/params?system=…&message=…` et `/dict/param/map?path=…`.
  La UI 1.7.1 est alignée sur ce comportement. Si un lot futur veut
  consommer la V2 (count par message, buckets opérateur/bande,
  points lat/lon riches avec `value_raw`), il faudra soit étendre les
  composants B0 (ajouter un onglet « vue complète » qui lit `/dict/params?system=`
  en complément), soit réintroduire un composant dédié — mais, dans
  les deux cas, le mapping reste côté `src/lib/api/dictionary.ts`.
- **Projet TEST2 vide côté back** : `/dict/tree` renvoie bien 2
  branches B0 (LTE+NR) mais tous les `count` sont à 0. Les comptes
  live cités dans le brief (LTE 68 633 · NR 30 046) ne sont pas
  reproductibles sur ce projet dans l'état actuel du back — la UI
  affiche correctement « Aucune observation LTE avec les filtres
  actifs » (chemin déjà couvert par `ProtocolTree`). Les projets
  seedés (idf-t3-2026, lyon-drive-2026, etc.) exposent bien des
  comptes non nuls (ex. LTE=2 840, NR=1 520 sur idf-t3-2026) — la
  page B0 affiche l'arbre fonctionnel avec ces projets.

### Garde live
Preuve bout-en-bout contre bc4-back 0.14.0 (demo@demo.com) :
```
GET /dict/tree sur idf-t3-2026 → B0, branches=[LTE(4 channels, 2840 msgs), NR(…, 1520 msgs)]
GET /dict/params?msg_id=lte-mr sur idf-t3-2026 → B0, 2 params (rsrpResult, rsrqResult)
GET /dict/param?param_id=lte-mr-rsrp&group_by=operator → B0, 20 bins × 4 rows
GET /dict/param/map?param_id=lte-mr-rsrp → B0 FeatureCollection, legend.kind=numeric
```
Les 4 shapes passent `TreeSchema.parse / ParamListSchema.parse /
ParamDetailSchema.parse / ParamMapSchema.parse` sans friction — mêmes
assertions que `scripts/smoke_api.ts`.

### Scripts
- `scripts/g1_build.sh` : inchangé — le périmètre `src/features/dictionary/DictionaryPage.tsx`
  est déjà listé et reste valable après le retrait du dispatcher.
- `scripts/g2_smoke_api.sh` : cas `(h)` adapté 1.7.1 — l'assertion
  primaire sur `/dict/tree` attend DÉSORMAIS la forme B0 (`technos` ∈
  {LTE, NR}, chaque branche a `channels[]`), la V2 est tolérée mais
  signalée en warn. L'assertion 3GPP sur `/dict/params?system=…`
  (unit=dBm + avg_converted non null) reste comme garde-fou côté
  back, même si la UI 1.7.1 ne câble plus ce chemin.
- `scripts/g5_diff_scope.sh` : whitelist `DictionaryV2Panel.tsx`
  retirée (fichier supprimé).

## 1.7.0 (minor) — bc4-front 2026-10-15 — Dictionnaire RRC complet (V2, bc4-back 0.12.0) — Agent BC1

### Ajouté
- Shapes Zod V2 (`src/lib/api/dictionary-schemas.ts`, 1:1 Pydantic
  bc4-back 0.12.0) : `DictTreeV2Schema` (arbre LTE/NR → message →
  `{param, count}`), `ParamListV2Schema` (`{system, message, path,
  count, unit_converted, buckets:[{operator, band, count,
  avg_converted}]}`), `ParamMapV2Schema` (points `{lat, lon,
  value_raw, value_converted, operator, band}`). Union discriminée
  `DictTreeAnySchema` + helper `isDictTreeV2(t)` qui tranche par la
  **FORME** (branches[].system en V2, branches[].techno en B0) —
  jamais par étiquette d'URL devinée.
- Fetchers V2 dans `src/lib/api/dictionary.ts` (via `apiOrMock` +
  validation Zod runtime) : `getDictTreeAny(projectId, signal?, f?)`,
  `getDictParamsV2(projectId, {system, msg?, operator?, band?}, signal?, f?)`,
  `getDictParamMapV2(projectId, {system, path, limit?}, signal?, f?)`.
  Les clés en query reflètent le contrat back 0.14.0 — notamment la UI
  passe `msg` dans sa signature TypeScript (compat
  `DictionaryV2Panel.tsx`) mais l'adaptateur émet `?message=` (le back
  attend `message=`, pas `msg=`). Les filtres transverses
  (`DictFilters` = `op`/`tech`/`svc`/`band`/`dep`) sont acceptés en
  argument optionnel et propagés dans la query. La UI 1.7.0 ne les
  passe pas encore depuis `DictionaryV2Panel` (le composant n'a pas
  accès au `FilterContext` global) → écart ouvert déclaré ci-dessous.
- `src/features/dictionary/DictionaryV2Panel.tsx` : nouveau composant
  dédié à l'expérience V2. **Arbre** LTE/NR à gauche (clic sur une
  feuille `path` → sélection). **Histogramme** à droite via `Chart`
  (ECharts, déjà en deps) : comptage par (opérateur|bande) + moyenne
  `avg_converted` sur un second axe, unité tirée de `unit_converted`.
  **Table des buckets** à côté : opérateur, bande, compte, moyenne.
  **Carte des occurrences** en scatter plot (lon/lat), tooltip
  exposant `value_raw` + `value_converted` + opérateur + bande.
  Règle null-safe partout : helpers `nd(v)`/`ndText(v)` affichent
  **« N/D »** quand `null`, **jamais 0**.
- `src/features/dictionary/DictionaryPage.tsx` : nouveau *dispatcher*
  en tête. Si le back renvoie la forme V2 → délègue à
  `DictionaryV2Panel`. Sinon → délègue à `DictionaryPageB0` (le code
  historique renommé, 100 % inchangé fonctionnellement). Dispatch
  propre : zéro hook conditionnel (`DictionaryPageB0` monte avec son
  propre ordre d'hooks).
- `scripts/g5_diff_scope.sh` : whitelist étendue à
  `src/features/dictionary/DictionaryV2Panel.tsx`.

### Garde live
Preuve bout-en-bout contre **TEST2** (projet ingéré avec
`param_occurrence` peuplé) :
```
GET /projects/134af70a06eb/dict/tree  (Bearer admin)
→ V2 : branches = [('LTE', 68633, 24 messages), ('NR', 30046, 5 messages)]
```
Sélection d'une feuille (`rsrpResult` dans `MeasurementReport` LTE,
`a3-Offset` dans `RRCReconfiguration` NR) → histogramme peuplé +
carte avec les valeurs décodées.

### Correctifs collatéraux
- `ParamMapSchema.legend.{stops,classes}` passés en
  `.nullable().optional()` : le back 0.14.0 renvoie `null` (pas
  l'absence de champ) pour la branche inutilisée du legend (ex.
  `kind=numeric` → `classes: null`). Avant ce fix, `z.optional()`
  rejetait la réponse et la carte B0 (`DictionaryPageB0` →
  `ParameterMapPanel`) remontait une `ApiSchemaError`. Fix de forme
  côté schema uniquement — aucun composant touché.

### Écarts ouverts
- **Projet seedé B0 sans `param_occurrence`** (idf-t3-2026, …) : le
  back renvoie l'arbre B0 historique ; le dispatcher front retombe
  sur `DictionaryPageB0`. Zéro régression de rendu.
- **Carte V2** : rendu en scatter ECharts (lon/lat) pour rester
  léger — pas d'overlay maplibre. Un futur lot pourra brancher un
  fond de carte sur le même shape si besoin produit.
- **Filtres `operator` / `band`** sur `/dict/params` : non câblés
  dans la UI 1.7.0 (le back les accepte). La table des buckets liste
  TOUS les opérateurs/bandes du paramètre sélectionné — filtrage
  côté front dans un lot ultérieur si besoin.
- **Propagation `FilterContext` global vers `DictionaryV2Panel`** :
  les adaptateurs V2 acceptent déjà un argument optionnel
  `f?: DictFilters` qui injecte `op`/`tech`/`svc`/`band`/`dep` dans la
  query, et le back 0.14.0 les traite — mais `DictionaryV2Panel.tsx`
  n'a pas accès au contexte filtres (prop non passée par
  `DictionaryPage`). Câbler proprement imposerait de modifier le
  composant V2 (ajout d'une prop `filters: DictFilters`), ce qui sort
  du scope de ce lot (règle « ne pas restructurer la UI »). À faire
  dans un lot UI ultérieur.

### Gardes (à lancer à la main)
```
export VITE_BC4_API_BASE=http://localhost:8000
export BC4_ADMIN_EMAIL=admin@bc4.local
export BC4_ADMIN_PASSWORD=... # idem container
scripts/g1_build.sh         # lint + tsc + build (couvre DictionaryV2Panel + Zod V2)
scripts/g4_mock_fallback.sh # repli mock inchangé
scripts/g5_diff_scope.sh    # scope : src/lib/api/* + features/dictionary/*
```

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
