import type { KpiTimeSeries } from "@/lib/api/kpi-timeseries";

export function mapFeatures(data: KpiTimeSeries | undefined) {
  return (data?.status === "AVAILABLE" && data.evidence.result_id ? data.points : [])
    .filter(
      (p) =>
        p.latitude != null &&
        p.longitude != null &&
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude) &&
        Math.abs(p.latitude) <= 90 &&
        Math.abs(p.longitude) <= 180,
    )
    .map((p) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [p.longitude!, p.latitude!] as [number, number],
      },
      properties: {
        value: p.value,
        seq: p.seq,
        capture_id: data!.capture_id,
        result_id: data!.evidence.result_id,
        unit: data!.y_axis.unit ?? "",
        file: p.nmf_file ?? "—",
      },
    }));
}
