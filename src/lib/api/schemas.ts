import { z } from "zod";

export const OPERATORS = ["Orange", "SFR", "Bouygues", "Free"] as const;
export const TECHNOLOGIES = ["LTE", "NR", "EN-DC"] as const;
export const SERVICES = ["Data", "SMS", "Voice"] as const;

export const OperatorSchema = z.enum(OPERATORS);
export const TechSchema = z.enum(TECHNOLOGIES);
export const ServiceSchema = z.enum(SERVICES);
export type Operator = z.infer<typeof OperatorSchema>;
export type Tech = z.infer<typeof TechSchema>;
export type Service = z.infer<typeof ServiceSchema>;

// Champs d'ingestion ajoutés en 1.5.1 : exposés par le back sur `/projects`
// et `/projects/{id}` lorsqu'un NMF a été ingéré. Tous sont `.optional()`
// pour rester compatibles avec les fixtures héritées B0 qui ne les ont
// pas, et `.nullable()` pour respecter la règle « null → N/D » (jamais 0).
//
// Pourquoi `operators_plmn` et pas `operators` (enum) ? Les PLMN (`20801`,
// `20810`…) viennent BRUTS du décodeur `bc4-decoder 1.0.0`. On n'invente
// aucun libellé Orange/SFR tant qu'une table de référence PLMN→opérateur
// n'est pas câblée côté back (écart déclaré au CHANGELOG). Idem
// `technos_seen` : clés `LTE`/`UMTS`/`NR` strings, pas un enum fermé —
// le back peut renvoyer `UMTS` (hors enum front historique).
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  geography: z.string(),
  center: z.tuple([z.number(), z.number()]),
  operators: z.array(OperatorSchema),
  technologies: z.array(TechSchema),
  services: z.array(ServiceSchema),
  bands: z.array(z.string()),
  departements: z.array(z.string()),
  periodStart: z.string(),
  periodEnd: z.string(),
  captures: z.number().int(),
  importedAt: z.string(),
  status: z.enum(["ready", "processing", "failed"]),
  operators_plmn: z.record(z.string(), z.number().int()).nullable().optional(),
  technos_seen: z.record(z.string(), z.number().int()).nullable().optional(),
  n_captures_ingest: z.number().int().nullable().optional(),
  n_events_ingest: z.number().int().nullable().optional(),
  gps_coverage_pct: z.number().nullable().optional(),
  status_ingest: z.enum(["draft", "importing", "ready", "error"]).nullable().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const FilterContextSchema = z.object({
  project: z.string().optional(),
  op: z.array(OperatorSchema).optional(),
  tech: z.array(TechSchema).optional(),
  svc: z.array(ServiceSchema).optional(),
  band: z.array(z.string()).optional(),
  dep: z.array(z.string()).optional(),
  // Zone ARCEP (bc4-back 0.7.1) — dimension orthogonale à la géo (jamais
  // dans `/geo/tree`). Les 11 libellés viennent de `/reference/cell/summary`.
  // La clé `"N/D"` cible les cellules dont `cat_arcep_code` est NULL.
  arcep: z.array(z.string()).optional(),
  // 1.8.0 (Dict) — DR et Plaque viennent de `cell_ref` (dimension
  // cellulaire, orthogonale à la géo). Tant que `cell_ref` est vide,
  // les filtres restent présents dans l'URL/UI mais grisés visuellement
  // et NON propagés en query string. Pas de 400 silencieux.
  dr: z.array(z.string()).optional(),
  plaque: z.array(z.string()).optional(),
  metric: z.enum(["dl", "rsrp", "sinr", "latency"]).optional(),
});
export type FilterContext = z.infer<typeof FilterContextSchema>;

export const SourceReferenceSchema = z.object({
  label: z.string(),
  population: z.string(),
  sampleCount: z.number().int(),
  missingCount: z.number().int(),
  demo: z.literal(true),
});
export type SourceReference = z.infer<typeof SourceReferenceSchema>;

export const MetricValueSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string(),
  value: z.number().nullable(),
  sampleCount: z.number().int(),
  missingCount: z.number().int(),
});
export type MetricValue = z.infer<typeof MetricValueSchema>;

export const MeasurementPointSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  operator: OperatorSchema,
  tech: TechSchema,
  service: ServiceSchema,
  band: z.string(),
  dep: z.string(),
  site: z.string(),
  ts: z.string(),
  dl: z.number().nullable(),
  rsrp: z.number().nullable(),
  sinr: z.number().nullable(),
  latency: z.number().nullable(),
});
export type MeasurementPoint = z.infer<typeof MeasurementPointSchema>;

export const ApiErrorSchema = z.object({ code: z.string(), message: z.string() });
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type MetricKey = "dl" | "rsrp" | "sinr" | "latency";
export const METRICS: Record<
  MetricKey,
  { label: string; unit: string; thresholds: [number, number, number]; higherIsBetter: boolean }
> = {
  dl: { label: "Débit DL", unit: "Mbit/s", thresholds: [10, 50, 150], higherIsBetter: true },
  rsrp: {
    label: "RSRP / SS-RSRP",
    unit: "dBm",
    thresholds: [-110, -100, -90],
    higherIsBetter: true,
  },
  sinr: { label: "SINR", unit: "dB", thresholds: [0, 10, 20], higherIsBetter: true },
  latency: { label: "Latence", unit: "ms", thresholds: [30, 50, 80], higherIsBetter: false },
};

export type Severity = "good" | "fair" | "poor" | "bad";
export function severityOf(metric: MetricKey, v: number): Severity {
  const m = METRICS[metric];
  const [a, b, c] = m.thresholds;
  if (m.higherIsBetter) return v >= c ? "good" : v >= b ? "fair" : v >= a ? "poor" : "bad";
  return v <= a ? "good" : v <= b ? "fair" : v <= c ? "poor" : "bad";
}
