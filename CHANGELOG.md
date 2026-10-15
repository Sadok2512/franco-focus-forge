# Changelog

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
