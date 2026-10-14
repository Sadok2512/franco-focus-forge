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
