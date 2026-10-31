export const MAP_METRIC_MIME = "application/x-bc4-map-metric";
export type MapMetric = { kind: "kpi" | "metric"; code: string; label: string; unit: string };

export function readMapMetric(raw: string): MapMetric | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    if (
      (item["kind"] !== "kpi" && item["kind"] !== "metric") ||
      typeof item["code"] !== "string" ||
      !item["code"].trim() ||
      typeof item["label"] !== "string" ||
      typeof item["unit"] !== "string"
    )
      return null;
    return { kind: item["kind"], code: item["code"], label: item["label"], unit: item["unit"] };
  } catch {
    return null;
  }
}

export function addMapMetric(current: MapMetric[], added: MapMetric, base: MapMetric): MapMetric[] {
  if (
    (added.kind === base.kind && added.code === base.code) ||
    current.some((m) => m.kind === added.kind && m.code === added.code)
  )
    return current;
  return [...current, added];
}
