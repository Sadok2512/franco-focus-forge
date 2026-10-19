import type { DictGeoFilters } from "@/lib/api/dict-v2";

export const GEO_KEYS = ["dor", "plaque", "arcep_zone"] as const;
export const GEO_LABELS = { dor: "DOR", plaque: "Plaque", arcep_zone: "Zone ARCEP" };
export type GeoDraft = Record<(typeof GEO_KEYS)[number], { enabled: boolean; values: string[] }>;
export function geoDraft(filters: DictGeoFilters): GeoDraft {
  return Object.fromEntries(
    GEO_KEYS.map((key) => [key, { enabled: !!filters[key]?.length, values: filters[key] ?? [] }]),
  ) as GeoDraft;
}
