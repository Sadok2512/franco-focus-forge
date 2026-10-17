# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Dictionnaire RRC (C1) — commandes manuelles
```
bun install
bun run dev                     # http://localhost:8080/rrc (demo.ingenieur / bc4-demo)
npm run lint && npm run typecheck && npm run build   # G1
npx vitest run src/test/provenance.test.tsx           # G2
npx vitest run src/test/nr-branch.test.tsx            # G3
npx vitest run src/test/conversion.test.tsx           # G4
```
Projet A : « Paris 2026 Q1 » (LTE + NR). Projet B : « Rennes LTE (sans NR) ».

## Contrat back ↔ front — `bun run contract:check` (1.16.2+)

Les routes `/projects/{id}/kpi/{catalog,filters,{code}}` (bc4-back 0.40.0+)
ne sont **pas typées dans `/openapi.json`** (handlers FastAPI sans
`response_model`). On vérifie donc la cohérence contrat **sur la réponse
live** du back, pas sur une diff JSON Schema statique.

```sh
# Depuis le container front (BC4_API_BASE accède au back via le réseau compose) :
docker exec -w /app -e BC4_API_BASE=http://api:8000 bc4-front-1 bun run contract:check

# Depuis l'hôte (bun installé, back exposé sur :8000) :
BC4_API_BASE=http://localhost:8000 bun run contract:check

# Projet custom :
BC4_PROJECT_ID=134af70a06eb bun run contract:check    # TEST2
```

Le script :

1. Vérifie que les 3 routes GET `/projects/{project_id}/kpi/*` sont
   déclarées dans `/openapi.json` du back.
2. Logge admin, GET live chaque route, puis `safeParse` la réponse
   contre les schémas Zod de `src/lib/api/project-kpi-schemas.ts`.
3. Exit code : `0` = PASS, `1` = FAIL (diff Zod lisible : chemin,
   message), `2` = infrastructure (back injoignable).

**À lancer à la main avant chaque lot** qui touche au contrat
back ↔ front. Pas de CI — un désalignement se détecte avant le push,
en live, pas en pipeline.

## Synchronisation

Ce dépôt est tenu en synchronisation continue avec le projet Lovable : les
modifications faites dans Lovable arrivent ici automatiquement, et celles
poussées ici remontent dans Lovable.
