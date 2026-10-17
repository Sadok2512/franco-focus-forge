// bc4-front — Types locaux + fallback colors Dict v2.
// Les couleurs opérateur préférées viennent du back
// (DistributionValueGroup.operator_color / band_color). Si le back les
// omet (compat), on applique le fallback de la spec (Orange #FF7900 /
// Bouygues #009DE0 / SFR #E2001A / Free #A0148C / N/D #9AA0A6).

import type { DictLeaf, GroupByMode } from "@/lib/api/dict-v2";

export const OP_FALLBACK: Record<string, string> = {
  Orange: "#FF7900",
  Bouygues: "#009DE0",
  SFR: "#E2001A",
  Free: "#A0148C",
};
export const BAND_FALLBACK: Record<string, string> = {
  B1: "#2f6fed",
  B3: "#15a38a",
  B7: "#d9731a",
  B20: "#7a4fd3",
};
export const ND_COLOR = "#9AA0A6";

/** Composition d'une clé de groupe lisible pour une barre d'un graphe. */
export function groupKeyLabel(
  mode: GroupByMode,
  g: { operator?: string | null | undefined; band?: string | null | undefined },
): string {
  const op = g.operator ?? "N/D";
  const band = g.band ?? "N/D";
  if (mode === "operator") return op;
  if (mode === "band") return band;
  return `${op} · ${band}`;
}

/** Couleur d'une clé de groupe — préfère la couleur envoyée par le back,
 *  retombe sur le fallback défini par la spec. */
export function groupKeyColor(
  mode: GroupByMode,
  g: {
    operator?: string | null | undefined;
    band?: string | null | undefined;
    operator_color?: string | null | undefined;
    band_color?: string | null | undefined;
  },
): string {
  if (mode === "operator") {
    return g.operator_color || OP_FALLBACK[g.operator ?? ""] || ND_COLOR;
  }
  if (mode === "band") {
    return g.band_color || BAND_FALLBACK[g.band ?? ""] || ND_COLOR;
  }
  // operator_band — on garde la teinte opérateur ; la bande sera lisible
  // via le libellé de la série (pas d'altération de la chroma).
  return g.operator_color || OP_FALLBACK[g.operator ?? ""] || ND_COLOR;
}

/** Libellé lisible d'une origine (3 valeurs : config/réseau, capacité
 *  terminal, mesure rapportée). Jamais inventé — on garde la clé si
 *  inconnue (passthrough Zod). */
export function originLabel(origin: DictLeaf["origin"] | string | null | undefined): string {
  switch (origin) {
    case "network_config":
      return "Configuration réseau";
    case "ue_capability":
      return "Capacités terminal";
    case "ue_report":
      return "Mesures rapportées";
    default:
      return origin ?? "—";
  }
}

/** Chip "key=value" pour afficher un discriminator. On ignore les clés
 *  d'origine (ex. ``inheritance``) qui ne portent pas d'info utilisateur. */
const DISCRIMINATOR_HIDDEN = new Set<string>(["inheritance"]);
export function discriminatorChips(
  d: Record<string, unknown> | null | undefined,
): string[] {
  if (!d) return [];
  return Object.entries(d)
    .filter(([k]) => !DISCRIMINATOR_HIDDEN.has(k))
    .map(([k, v]) => `${k}=${String(v)}`);
}
