// Personal appearance preferences (localStorage — no secrets) + applying the theme.
export type Mode = "light" | "dark" | "system";
export type Density = "compact" | "comfortable";
export type Prefs = { mode: Mode; density: Density; primary_hex: string | null };
export const DEFAULT_PREFS: Prefs = { mode: "light", density: "compact", primary_hex: null };
const KEY = "bc4.appearance";
export const PALETTE = ["#1F5FD6", "#0E7490", "#047857", "#7C3AED", "#B91C1C", "#334155"];

export function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null;
    const legacy = localStorage.getItem("bc4.theme");
    return { ...DEFAULT_PREFS, ...(legacy ? { mode: legacy as Mode } : {}), ...(p ?? {}) };
  } catch { return DEFAULT_PREFS; }
}
export function writePrefs(p: Prefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
  localStorage.removeItem("bc4.theme");
  window.dispatchEvent(new Event("bc4-appearance"));
}

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}
/** Best text colour on `hex` and its ratio. */
export function onColor(hex: string) {
  const w = contrast(hex, "#FFFFFF"), k = contrast(hex, "#0B1220");
  return w >= k ? { fg: "#FFFFFF", ratio: w } : { fg: "#0B1220", ratio: k };
}

export function applyAppearance(p: Prefs, orgHex: string | null, root = document.documentElement) {
  const dark = p.mode === "dark" || (p.mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", !!dark);
  root.dataset["density"] = p.density;
  const hex = p.primary_hex ?? orgHex;
  for (const v of ["--primary", "--ring", "--primary-foreground"]) root.style.removeProperty(v);
  if (hex) {
    root.style.setProperty("--primary", hex);
    root.style.setProperty("--ring", hex);
    root.style.setProperty("--primary-foreground", onColor(hex).fg);
  }
}
