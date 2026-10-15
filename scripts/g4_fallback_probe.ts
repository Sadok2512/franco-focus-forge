// G4 : contrat `apiOrMock()` (P1-3, bc4-front ≥ 1.5.0).
//
// Avant P1-3 : toute erreur réseau tombait silencieusement en mock →
// l'utilisateur ne voyait jamais « Backend injoignable ».
//
// Après P1-3 : en mode `api`, un `ApiNetworkError` est PROPAGÉ (la UI
// l'affiche via `toUserMessage`). Seul un 501 explicitement toléré via
// `fallbackOn501: true` retombe sur le mock, et avec un `console.warn`.

import {
  ApiNetworkError,
  ApiNotImplementedError,
  apiOrMock,
} from "../src/lib/api/http";

(import.meta as unknown as { env: Record<string, string> }).env = {
  VITE_BC4_DATA: "api",
  VITE_BC4_API_BASE: "http://127.0.0.1:1",
};

// (1) ApiNetworkError doit être PROPAGÉ, pas de repli silencieux.
let networkPropagated = false;
try {
  await apiOrMock(
    async () => {
      throw new ApiNetworkError("simulé: API injoignable");
    },
    async () => ({ source: "mock" as const }),
    "g4-net",
  );
} catch (e) {
  if (e instanceof ApiNetworkError) networkPropagated = true;
}
if (!networkPropagated) {
  console.error("G4 FAIL : ApiNetworkError n'est pas propagée (regression P1-3)");
  process.exit(1);
}
console.log("  ✓ ApiNetworkError propagée en mode api — pas de repli silencieux");

// (2) 501 sans option → propagé.
let not501Fallback = false;
try {
  await apiOrMock(
    async () => {
      throw new ApiNotImplementedError("simulé: endpoint non implémenté");
    },
    async () => ({ source: "mock" as const }),
    "g4-501-noopt",
  );
} catch (e) {
  if (e instanceof ApiNotImplementedError) not501Fallback = true;
}
if (!not501Fallback) {
  console.error("G4 FAIL : 501 sans `fallbackOn501` doit être propagé");
  process.exit(1);
}
console.log("  ✓ 501 propagé par défaut");

// (3) 501 AVEC `fallbackOn501: true` → repli mock (seule tolérance).
const out = await apiOrMock(
  async () => {
    throw new ApiNotImplementedError("simulé: endpoint non implémenté");
  },
  async () => ({ source: "mock" as const }),
  "g4-501-opt",
  { fallbackOn501: true },
);
if (out.source !== "mock") {
  console.error("G4 FAIL : fallbackOn501 doit basculer sur mock");
  process.exit(1);
}
console.log("  ✓ 501 + fallbackOn501:true → repli mock explicite");
