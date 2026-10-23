# KPI Analytics — vrais panneaux multiples par onglet

## Constat actuel
Aujourd'hui, un onglet ne mémorise pas des « panneaux » : il garde seulement deux listes, celle des KPI cochés et celle des métriques cochées. Les cartes sont recréées à partir de ces listes, et le grand tableau des métriques n'est qu'un mode on/off qui remplace les graphes. C'est pour ça que « Table » remplace le graphe, et que l'ajout d'un élément fait tout recharger, voire laisse un écran blanc.

## Ce qui change pour vous
- Chaque onglet contient une vraie liste de panneaux (Graph, Table, Map). Chacun a sa propre identité, ses KPI, son type et ses réglages.
- Le menu ⋮ d'un KPI du catalogue propose : Add as Graph, Add as Table, Add as Map (si le KPI est géolocalisable), Add to existing Graph, Add to existing Table.
- Le menu ⋮ d'un panneau propose : Switch to Graph / Table / Map (seul ce panneau change), Fermer, Export, Plein écran.
- Ajouter un panneau ne touche jamais les autres : ils restent visibles, sans recharger. Le nouveau panneau apparaît tout de suite avec un fondu et un léger agrandissement (environ 180 ms, désactivé si l'ordinateur demande moins d'animations), et un cercle de chargement au centre.
- Pendant une mise à jour, le graphe précédent reste affiché sous un léger voile avec le cercle, seulement si ses données restent valables. Sinon, le panneau montre un chargement simple.
- Une erreur dans un panneau affiche un message et « Retry » dans ce panneau seulement.
- Changer d'onglet puis revenir conserve les panneaux, leurs réglages et l'ordre.
- Mise en page Auto / 1 / 2 / 3 colonnes conservée. Un tableau large peut prendre deux colonnes. Une carte garde ses proportions.

## Étapes (une version à valider par étape)
1. **Modèle de panneaux** : nouveau type de panneau dans l'onglet, migration automatique des onglets existants (chaque KPI ou métrique coché devient un panneau Graph), sauvegarde dans le lien comme aujourd'hui. Reproduction et correction de l'écran blanc.
2. **Add / Switch** : nouveaux menus ⋮ du catalogue et des panneaux. Le grand tableau des métriques devient un panneau Table comme les autres.
3. **Chargement local** : voile et cercle par panneau, une requête par panneau, protection contre les réponses en retard quand on ajoute vite plusieurs KPI.
4. **Map et multi-KPI** : panneau Map par KPI géolocalisable (sinon un message clair, jamais de points GPS inventés). Plusieurs KPI dans un Graph (unités compatibles seulement) ou dans un Table (seulement avec une clé commune réelle).
5. **Vérifications** : scénarios G1–G16 rejoués dans le navigateur avec une réponse volontairement ralentie, captures Graph + Graph + Table + Map, et les trois tailles d'écran.

## Limites
- Les vérifications dans le navigateur se font sur les données de démo : les vraies données BC4 ne sont pas joignables d'ici.
- Aucun changement côté serveur, formules ou catalogue.
- Rien n'est publié sans votre validation.

## Détails techniques
- `workspace-tabs.ts` : `panels: { id, type: "graph"|"table"|"map", codes: string[], settings, span, order }[]`. `codes`/`metricCodes` sont dérivés pour la compatibilité, et `encodeTabs`/`decodeTabs` migrent l'ancien format.
- Clés React = `panel.id`, jamais un index. Clés de requête par panneau : projet, capture, KPI, filtres appliqués, agrégation.
- `metricsTablePane`, `paneRequest` et `cardViewRequest` sont supprimés au profit des actions sur les panneaux.
- `placeholderData: keepPreviousData` seulement si les filtres sont inchangés, avec l'overlay `ChartSpinner` en mode voile.
- Tests vitest pour les règles : ajouter n'enlève rien, Switch ne touche qu'un panneau, migration des anciens onglets, onglets conservés.
