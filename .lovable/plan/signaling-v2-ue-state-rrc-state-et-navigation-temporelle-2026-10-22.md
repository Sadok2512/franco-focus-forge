# Signaling V2 — UE State, RRC State et navigation temporelle

## Résultat attendu
- Préparer une version séparée accessible sur `/signaling-v2`, sans remplacer la page stable `/signaling` ni publier en production.
- Conserver la présentation actuelle, les filtres, le tableau des messages, le détail ASN.1 et la carte.
- Placer deux pistes indépendantes de 34 px sous l’axe : **UE State**, puis **RRC State**. Garder ensuite Network Events, les tâches réellement présentes, Mobility et RF Metrics.
- Conserver la restriction Network Events : RRC Request, RRC Release et SCG uniquement.

## Navigation et curseur
- Ouvrir V2 sur **0–30 s**, avec choix **10 / 30 / 60 / 120 s / Fit** en haut à droite.
- Ajouter sous la timeline un **Time Navigator** discret : déplacement par glissement ou clic, fenêtre précédente/suivante, zoom, reset et Fit. Ajouter les poignées de redimensionnement si elles restent lisibles.
- Partager la même fenêtre entre toutes les pistes et les mesures RF, sans requêtes à chaque déplacement du curseur ou du navigateur.
- Garder le curseur rouge indépendant, glissable, avec temps exact à trois décimales, aperçu au survol et alignement sur les événements.
- Suivre un message sélectionné seulement s’il est hors de la fenêtre, sans changer sa largeur, les filtres, la pagination ou la carte.

## États et preuves
- Auditer les événements, messages et contextes réellement disponibles avant toute reconstruction.
- Afficher uniquement des intervalles dont les bornes, l’identité UE/session, la technologie et les séquences de preuve sont vérifiables. Garder **Unknown / Unproven** lorsqu’ils ne le sont pas ; ne jamais remplacer un manque de preuve par Idle.
- Prévoir UE State : Idle, LTE, LTE (4C), NR, NR (2C), avec coexistence LTE/NR en NSA lorsque prouvée.
- Exiger une définition explicite des porteuses configurées, activées ou utilisées avant d’afficher 4C/2C ; les fréquences mesurées ne suffisent pas.
- Prévoir RRC State : Idle, Connected, Unknown, en distinguant technologie et session. Ne pas fabriquer d’intervalles en associant des messages voisins.
- Les segments affichent leurs bornes réelles, durée prouvée et références de messages même lorsqu’ils sont tronqués par la fenêtre.
- Le tooltip du curseur présente seulement les états et observations prouvés, avec l’âge des mesures RF antérieures et N/D pour les valeurs manquantes.

## Limite actuelle et point d’arrêt
Le contrat public existant ne garantit pas les identités UE/session ni les preuves de configuration CA. Aucun accès authentifié aux captures VM n’est actuellement disponible pour la vérification.

Implémenter la navigation et la présentation séparée, puis livrer l’audit. Si les réponses ne prouvent pas les intervalles, laisser les pistes Unknown et préciser les données manquantes. **Toute reconstruction non encore validée reste désactivée jusqu’à examen des preuves et accord explicite.** Aucun nouveau service ni modification de la VM sans cet audit.

## Détails techniques
- Réutiliser `SignalingPage` avec un mode V2 explicite et une nouvelle route sœur ; le comportement stable reste inchangé par défaut.
- Réutiliser `TimeNavigator`, `useTimeWindow`, l’adaptateur typé `src/lib/api/client.ts` et les protections ECharts existantes.
- Centraliser la validation et la présentation des intervalles UE/RRC dans un module dédié ; ne pas modifier les événements source ni les requêtes des messages/carte.
- Ajouter toutes les nouvelles traductions en anglais et français et les métadonnées propres à la nouvelle page.

## Vérification et livraison
- Tests ciblés : preuves et bornes, sessions distinctes, CA, coexistence NSA, fenêtre par défaut et presets, synchronisation temporelle, suivi de message et non-régression du curseur.
- Vérifier la navigation et les interactions dans le navigateur à **1920×1080**, **1440×900** et **1280×800**.
- Fournir des captures à **0–30 s**, **120–150 s** et après sélection d’un message, avec statut **PASS / FAIL / NOT RUN** et distinction explicite entre fixtures de test et données VM.
- Fournir version, changelog et limites ; les états réels et les preuves CA resteront **NOT RUN** si l’accès aux captures manque.