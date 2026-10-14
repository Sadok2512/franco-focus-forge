import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { getOverview } from "@/lib/api/client";
import { METRICS, type MetricKey, type MetricValue, type Operator } from "@/lib/api/schemas";
import { useFilters } from "@/lib/filters";
import { Chart } from "@/components/bc4/Chart";
import { RadioMap } from "@/components/bc4/RadioMap";
import { DemoBadge, EmptyState, ErrorState, LoadingSkeleton, PartialWarning } from "@/components/bc4/States";

export const Route = createFileRoute("/_app/overview")({
  head: () => ({ meta: [
    { title: "Overview — BC4" }, { name: "description", content: "Vue d'ensemble radio : KPI, carte des mesures et comparaison opérateurs." },
    { property: "og:title", content: "Overview — BC4" }, { property: "og:description", content: "Vue d'ensemble radio : KPI, carte des mesures et comparaison opérateurs." },
  ] }),
  component: Overview,
});

const OP_VAR: Record<Operator, string> = { Orange: "--op-orange", SFR: "--op-sfr", Bouygues: "--op-bouygues", Free: "--op-free" };
const OP_DOT: Record<Operator, string> = { Orange: "bg-op-orange", SFR: "bg-op-sfr", Bouygues: "bg-op-bouygues", Free: "bg-op-free" };
const opColor = (o: Operator) => getComputedStyle(document.documentElement).getPropertyValue(OP_VAR[o]).trim();
const fmt = (v: number | null, d = 1) => (v == null ? "N/D" : v.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }));

function MetricCard({ m }: { m: MetricValue }) {
  return (
    <div className="border-b px-3 py-2.5 last:border-0">
      <p className="text-[11px] text-muted-foreground">{m.label}</p>
      <p className="num mt-0.5 font-mono text-xl font-semibold">
        {fmt(m.value)} <span className="text-xs font-normal text-muted-foreground">{m.value == null ? "" : m.unit}</span>
      </p>
      <p className="num font-mono text-[10px] text-muted-foreground">
        n = {m.sampleCount.toLocaleString("fr-FR")}{m.missingCount > 0 && ` · ${m.missingCount} manquants`}
      </p>
    </div>
  );
}

function Overview() {
  const { filters, set } = useFilters();
  const metric: MetricKey = filters.metric ?? "dl";
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["overview", filters], enabled: !!filters.project,
    queryFn: ({ signal }) => getOverview(filters, signal), placeholderData: keepPreviousData,
  });
  const d = q.data;

  const donut = useCallback((c: { fg: string; muted: string }) => ({
    tooltip: { trigger: "item" as const, formatter: "{b}: {c} mesures ({d} %)" },
    legend: { bottom: 0, textStyle: { color: c.muted, fontSize: 11 } },
    series: [{ type: "pie" as const, radius: ["52%", "76%"], top: -20, label: { show: false },
      data: (d?.byOperator ?? []).map((o) => ({ name: o.operator, value: o.samples, itemStyle: { color: opColor(o.operator) } })) }],
  }), [d]);

  const bars = useCallback((c: { fg: string; muted: string; border: string }) => ({
    grid: { left: 64, right: 16, top: 8, bottom: 28 },
    tooltip: { trigger: "axis" as const },
    xAxis: { type: "value" as const, name: METRICS[metric].unit, nameLocation: "middle" as const, nameGap: 20, axisLabel: { color: c.muted, fontSize: 10 }, splitLine: { lineStyle: { color: c.border } } },
    yAxis: { type: "category" as const, data: (d?.byOperator ?? []).map((o) => o.operator), axisLabel: { color: c.fg, fontSize: 11 } },
    series: [{ type: "bar" as const, barWidth: 14,
      data: (d?.byOperator ?? []).map((o) => ({ value: o[metric], itemStyle: { color: opColor(o.operator) } })) }],
  }), [d, metric]);

  const trend = useCallback((c: { fg: string; muted: string; border: string }) => ({
    grid: { left: 52, right: 16, top: 30, bottom: 30 },
    tooltip: { trigger: "axis" as const, valueFormatter: (v: unknown) => (v == null ? "N/D" : `${v} ${METRICS[metric].unit}`) },
    legend: { top: 0, textStyle: { color: c.muted, fontSize: 11 } },
    xAxis: { type: "category" as const, data: (d?.trend ?? []).map((t) => t.day.slice(5)), axisLabel: { color: c.muted, fontSize: 10 } },
    yAxis: { type: "value" as const, name: METRICS[metric].unit, scale: true, axisLabel: { color: c.muted, fontSize: 10 }, splitLine: { lineStyle: { color: c.border } }, nameTextStyle: { color: c.muted } },
    series: (d?.project.operators ?? []).map((op) => ({
      name: op, type: "line" as const, showSymbol: false, connectNulls: false, lineStyle: { width: 1.6 }, itemStyle: { color: opColor(op) },
      data: (d?.trend ?? []).map((t) => t.series[op] ?? null),
    })),
  }), [d, metric]);

  const tableRows = useMemo(() => {
    if (!d) return [];
    const pts = [...d.points].filter((p) => p[metric] != null)
      .sort((a, b) => ((a[metric] as number) - (b[metric] as number)) * (METRICS[metric].higherIsBetter ? 1 : -1));
    const sel = selected ? d.points.find((p) => p.id === selected) : undefined;
    const top = pts.slice(0, 50);
    return sel && !top.includes(sel) ? [sel, ...top] : top;
  }, [d, metric, selected]);

  const exportCsv = () => {
    if (!d) return;
    const head = `# BC4 export — ${d.project.name} — filtres ${JSON.stringify(filters)} — ${new Date().toISOString()} — DONNÉES DÉMO\n`;
    const cols = ["id", "operator", "tech", "band", "dep", "site", "ts", "lat", "lng", "dl", "rsrp", "sinr", "latency"] as const;
    const body = d.points.map((p) => cols.map((c) => p[c] ?? "").join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([head + cols.join(";") + "\n" + body], { type: "text/csv" }));
    a.download = `bc4_${d.project.id}_points.csv`; a.click();
  };

  if (q.isError) return <div className="p-6"><ErrorState message="La vue d'ensemble n'a pas pu être chargée." onRetry={() => q.refetch()} /></div>;
  if (!d) return <div className="grid h-[calc(100vh-110px)] gap-3 p-3 lg:grid-cols-[22%_1fr_26%]"><LoadingSkeleton /><LoadingSkeleton /><LoadingSkeleton /></div>;
  if (!d.points.length) return <div className="p-6"><EmptyState title="Aucune mesure">{d.project.status === "processing" ? "Import en cours de traitement : aucune mesure décodée disponible." : "Aucune mesure ne correspond aux filtres actifs. Élargissez la sélection."}</EmptyState></div>;

  const missingPct = d.source.missingCount / d.points.length;

  return (
    <div className={`space-y-3 p-3 transition-opacity duration-150 ${q.isFetching ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold">{d.project.name}</h1>
        <DemoBadge />
        <div className="ml-auto flex items-center gap-1 rounded-md border bg-card p-0.5" role="radiogroup" aria-label="Métrique carte">
          {(Object.keys(METRICS) as MetricKey[]).map((k) => (
            <button key={k} role="radio" aria-checked={metric === k} onClick={() => set({ metric: k })}
              className={`rounded px-2 py-1 text-xs transition-colors duration-150 ${metric === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{METRICS[k].label}</button>
          ))}
        </div>
      </div>
      {missingPct > 0.03 && <PartialWarning>{Math.round(missingPct * 100)} % des points n'ont pas de valeur {METRICS[metric].label} — affichés « N/D », jamais remplacés par zéro.</PartialWarning>}

      <div className="grid gap-3 lg:h-[560px] lg:grid-cols-[22%_1fr_26%]">
        <aside className="panel overflow-auto" aria-label="KPI">
          <p className="panel-title border-b px-3 py-2">Indicateurs clés</p>
          {d.kpis.map((m) => <MetricCard key={m.key} m={m} />)}
        </aside>
        <div className="panel h-[420px] overflow-hidden lg:h-auto">
          <RadioMap points={d.points} metric={metric} center={d.project.center} selectedId={selected} onSelect={setSelected} />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <Chart title="Part des mesures par opérateur" subtitle={`Part d'échantillons, pas part de marché · n = ${d.points.length}`} build={donut} height={190} exportName="bc4_part_mesures" />
          <Chart title={`${METRICS[metric].label} moyen par opérateur`} subtitle={`Unité : ${METRICS[metric].unit}`} build={bars} height={170} exportName="bc4_operateurs" />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <Chart title={`Tendance journalière — ${METRICS[metric].label}`} subtitle={`Moyenne par jour et opérateur · ${d.source.label}`} build={trend} height={260} exportName="bc4_tendance" />
        <section className="panel flex flex-col" aria-label="Table d'investigation">
          <header className="flex items-center justify-between border-b px-3 py-2">
            <div><h3 className="text-xs font-semibold">Investigation — 50 points les plus dégradés</h3>
              <p className="text-[11px] text-muted-foreground">Cliquer une ligne la sélectionne sur la carte</p></div>
            <button onClick={exportCsv} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted"><Download className="h-3 w-3" /> CSV</button>
          </header>
          <div className="h-[240px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr><th className="px-2 py-1.5 text-left font-medium">Opérateur</th><th className="px-2 py-1.5 text-left font-medium">Techno</th><th className="px-2 py-1.5 text-left font-medium">Bande</th>
                  <th className="px-2 py-1.5 text-left font-medium">Site</th><th className="px-2 py-1.5 text-right font-medium">{METRICS[metric].label} ({METRICS[metric].unit})</th></tr>
              </thead>
              <tbody>
                {tableRows.map((p) => (
                  <tr key={p.id} onClick={() => setSelected(p.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(p.id)}
                    aria-selected={selected === p.id} className={`cursor-pointer border-b ${selected === p.id ? "bg-accent" : "hover:bg-muted/60"}`}>
                    <td className="px-2 py-1"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${OP_DOT[p.operator]}`} />{p.operator}</td>
                    <td className="px-2 py-1 font-mono">{p.tech}</td><td className="px-2 py-1 font-mono">{p.band}</td>
                    <td className="px-2 py-1 font-mono">{p.site}</td>
                    <td className="num px-2 py-1 text-right font-mono">{fmt(p[metric])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="border-t px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
            Source : {d.source.label} · {d.source.population} · {d.source.sampleCount} valides · {d.source.missingCount} N/D
          </footer>
        </section>
      </div>
    </div>
  );
}
