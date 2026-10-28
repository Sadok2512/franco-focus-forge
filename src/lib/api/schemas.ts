import { z } from "zod";
import { NmfImportJobSchema } from "./nmf-schemas";

export const OPERATORS = ["Orange", "SFR", "Bouygues", "Free"] as const;
export const TECHNOLOGIES = ["LTE", "NR", "EN-DC"] as const;
export const SERVICES = ["Data", "SMS", "Voice"] as const;

export const OperatorSchema = z.enum(OPERATORS);
export const TechSchema = z.enum(TECHNOLOGIES);
export const ServiceSchema = z.enum(SERVICES);
export type Operator = z.infer<typeof OperatorSchema>;
export type Tech = z.infer<typeof TechSchema>;
export type Service = z.infer<typeof ServiceSchema>;

// Helpers de reconnaissance catalogue. Un NMF réel peut exposer un PLMN,
// une techno ou un service hors catalogue (ex. `PLMN 208-08`). Le back ne
// renomme ni ne supprime la valeur, et le front doit l'afficher telle
// quelle en gris, avec un tooltip explicitant la non-présence au catalogue.
export const isKnownOperator = (value: string): value is Operator =>
  (OPERATORS as readonly string[]).includes(value);
export const isKnownTech = (value: string): value is Tech =>
  (TECHNOLOGIES as readonly string[]).includes(value);
export const isKnownService = (value: string): value is Service =>
  (SERVICES as readonly string[]).includes(value);

// Tooltip déterministe pour les valeurs non cataloguées. Format figé pour
// permettre les tests de non-régression. Le libellé passe tel quel (ex.
// "PLMN 208-08" déjà formaté par l'ingest).
export const uncatalogedTooltip = (kind: "operator" | "tech" | "service", value: string): string => {
  const catalog = kind === "operator" ? "opérateurs" : kind === "tech" ? "technologies" : "services";
  return `${value} détecté dans les logs, non présent dans le catalogue des ${catalog}`;
};

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
  owner_id: z.string(),
  visibility: z.enum(["private", "public"]),
  parse_decode_level: z.enum(["light", "deep"]),
  parse_binning_mode: z.enum(["temporal", "spatial"]),
  parse_temporal_resolution: z.enum(["native", "1ms", "10ms", "100ms", "1s"]).nullable(),
  parse_spatial_bin_m: z
    .union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)])
    .nullable(),
  name: z.string(),
  geography: z.string(),
  center: z.tuple([z.number(), z.number()]),
  // Alimentés par l'ingestion : un NMF peut contenir un PLMN non catalogué,
  // une techno ou un service hors liste. On accepte la chaîne brute ici ;
  // la composante d'affichage utilise `isKnownOperator`/`isKnownTech`/
  // `isKnownService` pour la griser avec `uncatalogedTooltip`.
  operators: z.array(z.string()),
  technologies: z.array(z.string()),
  services: z.array(z.string()),
  bands: z.array(z.string()),
  departements: z.array(z.string()),
  periodStart: z.string(),
  periodEnd: z.string(),
  captures: z.number().int(),
  // Nombre de fichiers NMF décodés ; distinct des captures dans ces fichiers.
  n_files: z.number().int().nonnegative().nullable().optional(),
  import_job: NmfImportJobSchema.nullable().optional(),
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
  rrc_message: z.string().optional(),
  project: z.string().optional(),
  op: z.array(z.string()).optional(),
  // tech relâché à `string[]` (même règle que `op` et `svc`) pour accepter
  // les technos non cataloguées remontées par l'ingestion.
  tech: z.array(z.string()).optional(),
  // bc4-front 1.16.0 — `svc` est relâché à `string[]` pour accepter les
  // valeurs service_type réelles exposées par bc4-back 0.35.0+
  // (`HTTP_DOWNLOAD`, `HTTP_UPLOAD`, `VOICE_CALL`, …) en plus des 3
  // libellés historiques fixtures. Les routes qui attendaient `Service`
  // (B0) restent compatibles : "Data" / "SMS" / "Voice" sont des strings.
  svc: z.array(z.string()).optional(),
  // bc4-front 1.16.0 — Environnement de capture (indoor / incar / outdoor…)
  // tiré de `nmf_file.env` + `measurement_points.env` via /kpi/filters.
  env: z.array(z.string()).optional(),
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
  dor: z.array(z.string()).optional(),
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
  // Alimentés par l'ingestion → `string` ouvert (cf. Project.operators).
  operator: z.string(),
  tech: z.string(),
  service: z.string(),
  band: z.string(),
  dep: z.string(),
  site: z.string(),
  ts: z.string(),
  dl: z.number().nullable(),
  rsrp: z.number().nullable(),
  sinr: z.number().nullable(),
  latency: z.number().nullable(),
  // 1.14.0 — champ optionnel ajouté pour les cellules agrégées
  // (BlockMap retourné par `map_metric` 0.26.0). Overview + Dict
  // n'émettent pas ce champ ; `undefined` par défaut, pas de régression.
  n: z.number().int().nonnegative().optional(),
});
export type MeasurementPoint = z.infer<typeof MeasurementPointSchema>;

// Real ingested observations may have no GPS or attribution. Keep them in
// overview populations; only the map excludes observations without coordinates.
export const OverviewPointSchema = MeasurementPointSchema.extend({
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  operator: z.string().nullable(),
  tech: z.string().nullable(),
  service: z.string().nullable(),
  band: z.string().nullable(),
  dep: z.string().nullable(),
  site: z.string().nullable(),
});
export type OverviewPoint = z.infer<typeof OverviewPointSchema>;

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
