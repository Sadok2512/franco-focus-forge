import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getMetrics } from "@/lib/api/client";
import { MetricsCatalogSidebar } from "@/features/kpi/MetricsCatalogSidebar";
import { MetricGraphCard } from "@/features/kpi/MetricGraphCard";
import { parseMetricSelection } from "@/features/kpi/metric-selection";

/** Metric section of Signaling View: catalogue on the left, one graph card per selected metric for the active capture. */
export function SignalingMetricsSection({
  projectId,
  captureId,
}: {
  projectId: string;
  captureId: string | undefined;
}) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const catalog = useQuery({
    queryKey: ["metrics-catalog", projectId],
    queryFn: ({ signal }) => getMetrics(projectId, signal),
  });
  const infoByCode = useMemo(() => {
    const m = new Map<string, NonNullable<typeof catalog.data>["metrics"][number]>();
    for (const info of catalog.data?.metrics ?? []) m.set(info.code, info);
    return m;
  }, [catalog.data]);
  const toggle = (code: string) =>
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  return (
    <section
      className="signaling-pane flex h-full min-h-0 gap-2 rounded-lg border bg-card p-2"
      aria-label={t("signalingV2.metrics")}
      data-testid="signaling-metrics-section"
    >
      <div className="w-64 shrink-0 overflow-auto border-r pr-2">
        <MetricsCatalogSidebar
          projectId={projectId}
          selected={selected}
          onToggle={toggle}
          searchRef={searchRef}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-auto">
        {selected.length === 0 ? (
          <p role="status" className="p-3 text-sm text-muted-foreground">
            {t("signalingV2.metricsEmpty")}
          </p>
        ) : (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
            {selected.map((full) => {
              const parsed = parseMetricSelection(full);
              const info = infoByCode.get(full) ?? infoByCode.get(parsed?.code ?? "");
              return (
                <MetricGraphCard
                  key={full}
                  projectId={projectId}
                  code={full}
                  label={info?.label ?? full}
                  unit={info?.unit ?? ""}
                  tech={info?.tech ?? ""}
                  category={info?.category_label ?? null}
                  eventCode={info?.event_code ?? parsed?.code ?? full}
                  appliedFilters={{ capture_id: captureId }}
                  onRemove={() => toggle(full)}
                  view="graph"
                  syncId={captureId ? `signaling-metrics-${captureId}` : undefined}
                  eventsCaptureId={captureId}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
