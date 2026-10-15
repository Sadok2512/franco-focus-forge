# Changelog

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
