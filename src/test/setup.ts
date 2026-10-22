import "@testing-library/jest-dom/vitest";

// Les tests portent sur les fixtures : le `.env` local peut pointer
// VITE_BC4_DATA=api vers une VM réelle, ce qui rendrait les adaptateurs
// mock inaccessibles. Forcé ici (accès dynamique à import.meta.env).
(import.meta as unknown as { env: Record<string, string> }).env.VITE_BC4_DATA = "mock";


Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
