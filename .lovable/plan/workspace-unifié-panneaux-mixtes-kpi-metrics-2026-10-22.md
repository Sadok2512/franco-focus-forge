# Workspace unifié — panneaux mixtes (KPI + Metrics)

## Objectif
Un onglet = un Workspace contenant une liste libre de panneaux de types différents (Chronogram, Histogram, Table, Map, Series Task Time, KPI, Timeline/Events), tous avec le même en-tête et le même menu Chart Settings KPI. Aucune donnée inventée, aucun nouveau système de graphiques.

## Ce que l'utilisateur verra
1. **Barre du haut épurée** : plus de View / Overlay / Export CSV / Fullscreen au-dessus des graphiques Metrics. Reste : `+ Add panel`, Layout (1/2/3/Auto), Sync Time, ⚙ Réglages.
2. **En-tête identique pour chaque panneau** : numéro, nom (double-clic pour renommer, conservé), sous-titre techno · catégorie · unité, puis ⓘ Info, ⤓ Export, ⛶ Plein écran, ⋮ Chart Settings.
3. **Chart Settings (menu KPI réutilisé)** : changer le type du panneau sans perdre métriques, filtres, nom ni fenêtre temporelle. Types impossibles grisés avec la raison (ex. « Map : aucune donnée GPS »). Configure X/Y, Grouping (Population filtrée, Opérateur, Bande, Opérateur + Bande), Statistique — seulement si compatibles.
4. **+ Add panel** : sélecteur des 7 types ; ajout aussi depuis le Metrics Catalogue (clic ou glisser). Les panneaux existants restent.
5. **Disposition** : glisser-déposer pour déplacer, redimensionner (largeur 1–3 colonnes, hauteur), dupliquer, supprimer, replier/déplier, plein écran. Cartes, tableaux et timelines peuvent prendre toute la ligne.
6. **Sync Time ON/OFF** : zoom et intervalle communs aux panneaux temporels (Chronogram, Series, Timeline, KPI temporels) ; Map et Table non forcées.
7. **Réglages ⚙** : réglages déjà livrés (Tableaux + Graphiques) appliqués à tous les panneaux ; un réglage propre à un panneau reste prioritaire.
8. **Persistance** : tout est restauré après rechargement ; les anciens Workspaces (liste de KPI + overlay) sont convertis automatiquement en panneaux KPI / Overlay.

## Livraison par étapes (chaque étape testée avant la suivante)
- **Étape 1** : modèle de panneau + migration + renderer commun + en-tête unifié + suppression des contrôles du haut + Add panel (7 types) + changement de type + renommage + dupliquer/supprimer + persistance.
- **Étape 2** : glisser-déposer, redimensionnement, replier, layouts, ajout depuis le catalogue.
- **Étape 3** : Sync Time, réglages par panneau prioritaires, tests d'acceptation complets.

## Limites honnêtes
- Map et Timeline ne s'affichent que si la VM fournit GPS / états ; sinon message clair dans le panneau, sans masquer les autres.
- Avec la VM qui renvoie 401, la vérification visuelle se fera sur les données de test.

## Détails techniques
- `src/features/kpi/workspace-panels.ts` : `PanelType`, `WorkspacePanel { id, title, type, source: "kpi"|"metric", codes, settings, layout { col, w, h, collapsed } }`, `migrateTab(old)`, encode/decode étendu (version `v:2`) dans `workspace-tabs.ts` ; ancien format lu tel quel.
- `PanelFrame.tsx` (en-tête commun, actions, plein écran via `requestFullscreen`, export CSV délégué au renderer via ref) et `PanelRenderer.tsx` qui choisit le composant existant : `KpiGraphCard`, `MetricGraphCard`, `KpiDataTable`/table Metrics, `KpiMeasurementMap`/`MetricMap`, `TaskScatter`, `Chronogram`, `KpiOverlayCard`.
- `capabilities(panel, data)` : retourne les types disponibles + raison d'indisponibilité ; utilisé pour griser le menu `VisualizationItems`/`KpiChartSettings` réutilisé.
- Drag & drop natif HTML5 (déjà utilisé pour les onglets), resize par poignée → `layout.w/h`.
- Sync Time : état `timeWindow` au niveau du Workspace transmis aux renderers temporels via `dataZoom` ECharts ; local, jamais clé de requête.
- Requêtes et services API inchangés ; erreurs isolées par panneau (error boundary par panneau).
- Tests Vitest : migration ancien → nouveau, ajout de types mixtes, changement de type conserve codes/nom, renommage persistant, dupliquer/supprimer, capabilities (Map indisponible sans GPS), erreur API isolée.
- i18n fr/en pour toutes les nouvelles chaînes ; règle AGENTS.md mise à jour.
