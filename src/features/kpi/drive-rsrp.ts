import type { ProjectKpiCatalog, KpiCatalogItem } from "@/lib/api/project-kpi-schemas";

/** RSRP coverage classes (dBm, lower bound inclusive). Presentation only. */
export const RSRP_CLASSES = [
  { id: "excellent", min: -80, color: "#16a34a" },
  { id: "good", min: -90, color: "#84cc16" },
  { id: "fair", min: -100, color: "#facc15" },
  { id: "poor", min: -110, color: "#f97316" },
  { id: "bad", min: -Infinity, color: "#dc2626" },
] as const;

/** Serving-cell RSRP metric code (same series as the Signaling RF timeline). */
export const RSRP_METRIC = "cell_rsrp";

/** Metrics-table selection for the PCell RSRP (the API expects `code@cell`). */
export const RSRP_SELECTION = `${RSRP_METRIC}@0`;

/** True for map points of the PCell RSRP, whether the API echoes the bare code or the selection. */
export function isRsrpPointCode(code: string): boolean {
  return code === RSRP_METRIC || code === RSRP_SELECTION;
}

export type RsrpClassId = (typeof RSRP_CLASSES)[number]["id"];

/** Class of a measured value; null/non-finite stays null (never coerced). */
export function rsrpClass(value: number | null | undefined): RsrpClassId | null {
  if (value == null || !Number.isFinite(value)) return null;
  return RSRP_CLASSES.find((c) => value >= c.min)!.id;
}

/** First RSRP KPI exposed by the project catalogue (LTE first, available first). */
export function findRsrpKpi(catalog: ProjectKpiCatalog | undefined): KpiCatalogItem | null {
  const items = (catalog?.tree ?? []).flatMap((techno) =>
    techno.families.flatMap((f) => f.kpis.map((k) => ({ k, lte: /lte|4g/i.test(techno.techno) }))),
  );
  const rsrp = items.filter(({ k }) => /rsrp/i.test(`${k.code} ${k.name}`));
  rsrp.sort(
    (a, b) =>
      Number(b.k.available !== false) - Number(a.k.available !== false) ||
      Number(b.lte) - Number(a.lte),
  );
  return rsrp[0]?.k ?? null;
}
