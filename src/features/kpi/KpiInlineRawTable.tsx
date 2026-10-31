import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getKpiCaptures } from "@/lib/api/kpi-timeseries";
import { KpiRawDataTable } from "./KpiRawDataTable";

/** Raw observations of one temporal KPI inside its own panel; picks the richest capture when none is active. */
export function KpiInlineRawTable({
  projectId,
  captureId,
  onCaptureChange,
  code,
  label,
  unit,
}: {
  projectId: string;
  captureId: string | undefined;
  onCaptureChange: (id: string) => void;
  code: string;
  label: string;
  unit: string | null;
}) {
  const captures = useQuery({
    queryKey: ["kpi-captures", projectId, code],
    queryFn: ({ signal }) => getKpiCaptures(projectId, code, signal),
    enabled: !captureId,
  });
  useEffect(() => {
    const sorted = [...(captures.data ?? [])].sort((a, b) => b.n_observations - a.n_observations);
    const first = sorted[0]?.capture_id;
    if (!captureId && first) onCaptureChange(first);
  }, [captureId, captures.data, onCaptureChange]);
  return (
    <div className="kpi-inline-raw-table" data-testid="kpi-inline-raw-table">
      <KpiRawDataTable
        projectId={projectId}
        captureId={captureId}
        metrics={[{ code, label, unit }]}
      />
    </div>
  );
}
