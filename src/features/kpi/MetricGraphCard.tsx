import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts, EChartsOption } from "echarts";
import { X } from "lucide-react";
import { getMetricAggregate } from "@/lib/api/metrics";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { operatorColor } from "./workspace-model";

/** 0.65.0 (F3) — Carte de rendu d'une métrique Nemo brute.
 *
 *  Deux visualisations partagées avec les KPI :
 *   - **histogram** : p50 (ou p90) par opérateur depuis
 *     `/projects/{p}/metrics/{code}/aggregate?group_by=operator`
 *     (reuse strict de l'attribution opérateur du back).
 *   - **chronogram** : réutilise le composant `<Chronogram>` existant
 *     avec `codes=[metric_code]` ; expose la courbe temporelle sur la
 *     capture sélectionnée.
 *
 *  Jamais de valeur fabriquée : les percentiles proviennent du back
 *  (règles identiques aux KPI nmf_metric), aucune interpolation front. */
export function MetricGraphCard({
  projectId,
  code,
  label,
  unit,
  tech,
  category,
  eventCode,
  appliedFilters,
  onRemove,
}: {
  projectId: string;
  code: string;
  label: string;
  unit: string;
  tech: string;
  category: string | null | undefined;
  eventCode: string;
  appliedFilters: KpiQueryFilters;
  onRemove: () => void;
}) {
  // 0.65.0 (F3 MVP) — rendu histogramme par opérateur via /aggregate.
  // Le chronogramme reste accessible via le composant Chronogram
  // existant (vue KPI) qui sait déjà cocher une métrique Nemo.
  return (
    <article id={`metric-graph-${code}`} className="kpi-graph-card" data-metric-code={code}>
      <header className="kpi-card-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 title={label}>{label}</h3>
          </div>
          <p>
            {tech} · [{eventCode}] · {unit} · {category ?? "autres"}
          </p>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button
            className="kpi-icon"
            title="Retirer la métrique"
            aria-label={`Retirer ${label}`}
            onClick={onRemove}
          >
            <X size={15} />
          </button>
        </div>
      </header>
      <MetricAggregatePlot
        projectId={projectId}
        code={code}
        label={label}
        unit={unit}
        appliedFilters={appliedFilters}
      />
    </article>
  );
}

function MetricAggregatePlot({
  projectId,
  code,
  label,
  unit,
  appliedFilters,
}: {
  projectId: string;
  code: string;
  label: string;
  unit: string;
  appliedFilters: KpiQueryFilters;
}) {
  const query = useQuery({
    queryKey: ["metric-aggregate", projectId, code, "operator", appliedFilters],
    queryFn: ({ signal }) =>
      getMetricAggregate(projectId, code, "operator", appliedFilters, signal),
  });

  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);

  const option = useMemo<EChartsOption>(() => {
    const groups = query.data?.groups ?? [];
    const sorted = [...groups].sort((a, b) => (b.n || 0) - (a.n || 0));
    const labels = sorted.map((g) => g.operator ?? "Non attribué");
    // 1.49.1 — grouper P10/P50/P90 côte à côte : une barre pleine
    // (opérateur) pour chaque percentile. Évite les bars à hauteur 0
    // invisibles quand p50=0 (ex. BLER où la médiane est 0 par
    // définition et seul p90 porte l'info).
    const stats: Array<{ key: "p10" | "p50" | "p90"; label: string; opacity: number }> = [
      { key: "p10", label: "P10", opacity: 0.35 },
      { key: "p50", label: "P50", opacity: 0.7 },
      { key: "p90", label: "P90", opacity: 1 },
    ];
    return {
      animationDuration: 150,
      grid: { left: 58, right: 20, top: 28, bottom: 44 },
      tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
      legend: { top: 0, right: 20, itemHeight: 8, itemGap: 10, textStyle: { fontSize: 10 } },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: "#64748b", fontSize: 10 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#cbd5e1" } },
      },
      yAxis: {
        type: "value",
        name: unit,
        scale: false,
        axisLabel: { color: "#64748b", fontSize: 10 },
        splitLine: { lineStyle: { color: "#e7edf5", type: "dashed" } },
      },
      series: stats.map((s) => ({
        type: "bar" as const,
        barMaxWidth: 24,
        name: s.label,
        data: sorted.map((g) => ({
          value: g[s.key],
          itemStyle: { color: operatorColor(g.operator), opacity: s.opacity },
        })),
        label: {
          show: s.key === "p50" || s.key === "p90",
          position: "top" as const,
          fontSize: 9,
          formatter: (p: { value?: unknown }) =>
            typeof p.value === "number" ? p.value.toFixed(unit === "%" ? 1 : 2) : "—",
        },
      })),
    };
  }, [query.data, label, unit]);

  // 1.49.2 — le div hôte n'existe pas tant que query est pending (early
  // return "Chargement…"). On attend que le DOM soit prêt (data arrivée)
  // avant d'instancier ECharts. La dépendance query.data garantit que
  // l'effet re-run quand le composant passe de "loading" au vrai render.
  const ready = !query.isPending && !query.isError && !!query.data?.groups.length;
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    import("echarts")
      .then((echarts) => {
        if (disposed || !host.current) return;
        chart.current = echarts.init(host.current, undefined, { renderer: "canvas" });
        chart.current.setOption(option);
        observer = new ResizeObserver(() => chart.current?.resize());
        observer.observe(host.current);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);

  if (query.isPending) {
    return (
      <div className="kpi-chart-state animate-pulse" role="status">
        Chargement de l'agrégat…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="kpi-chart-state" role="alert">
        <strong>Agrégat indisponible</strong>
        <p>{query.error.message}</p>
      </div>
    );
  }
  if (!query.data?.groups.length) {
    return (
      <div className="kpi-chart-state" role="status">
        Aucun point retourné pour cette métrique sur ce projet.
      </div>
    );
  }
  return (
    <div
      className="kpi-plot"
      style={{ height: 235 }}
      ref={host}
      role="img"
      data-testid="metric-aggregate-plot"
      aria-label={`Histogramme ${label} par opérateur : ${query.data.groups.map((g) => `${g.operator ?? "N/D"} ${g.p50 ?? "—"} ${unit}`).join(" ; ")}`}
    />
  );
}
