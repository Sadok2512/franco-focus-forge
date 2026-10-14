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
});
export type Project = z.infer<typeof ProjectSchema>;

export const FilterContextSchema = z.object({
  project: z.string().optional(),
  op: z.array(OperatorSchema).optional(),
  tech: z.array(TechSchema).optional(),
  svc: z.array(ServiceSchema).optional(),
  band: z.array(z.string()).optional(),
  dep: z.array(z.string()).optional(),
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
