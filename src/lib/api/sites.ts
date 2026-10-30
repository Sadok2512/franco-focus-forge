/** 2.0.0 — Site layer API (back 0.78.2) : /sites?bbox=... zoom-aware.
 *
 * Lazy loading : chaque pan/zoom déclenche un fetch sur la bbox visible.
 * Jamais tout d'un coup (458K cellules dans la base). Trois niveaux
 * d'agrégation serveur-side : cluster (<12), site (12-14), cell (≥15).
 */
import { z } from "zod";
import { kpiFetch } from "./project-kpi";

export const SiteFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.record(z.unknown()),
});

export const SitesResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(SiteFeatureSchema),
  aggregation: z.enum(["cluster", "site", "cell"]),
  bbox: z.array(z.number()).length(4),
  n_total_in_bbox: z.number().int(),
  n_returned: z.number().int(),
  reason: z.string().nullable().optional(),
});

export type SitesResponse = z.infer<typeof SitesResponseSchema>;

export type SitesFilters = {
  bbox: [number, number, number, number]; // lng_min, lat_min, lng_max, lat_max
  zoom: number;
  limit?: number;
  technos?: string[];
  bands?: string[];
  operators?: string[];
};

export function getSites(filters: SitesFilters, signal?: AbortSignal): Promise<SitesResponse> {
  const q = new URLSearchParams();
  q.set("bbox", filters.bbox.join(","));
  q.set("zoom", String(Math.round(filters.zoom)));
  // Keep the browser request explicit: even if the backend default changes,
  // a viewport can never pull the complete cell_ref table.
  q.set("limit", String(Math.min(2000, Math.max(1, filters.limit ?? 2000))));
  if (filters.technos?.length) q.set("techno", filters.technos.join(","));
  if (filters.bands?.length) q.set("band", filters.bands.join(","));
  if (filters.operators?.length) q.set("operator", filters.operators.join(","));
  return kpiFetch(`/sites?${q.toString()}`, SitesResponseSchema, signal);
}
