import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { getKpiCatalog, getOverview, getProjects } from "@/lib/api/client";
import { type Operator } from "@/lib/api/schemas";
import { useFilters } from "@/lib/filters";
import { Chart } from "@/components/bc4/Chart";
import { RadioMap } from "@/components/bc4/RadioMap";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { Logo, OP_VAR } from "@/components/bc4/AppShell";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/bc4/States";

export const Route = createFileRoute("/_app/overview")({
  head: () => ({ meta: [
    { title: "Vue d'ensemble — BC4" },
    { name: "description", content: "Tableau de bord radio : volume de mesures, KPI, carte de couverture et comparaison opérateurs." },
    { property: "og:title", content: "Vue d'ensemble — BC4" },
    { property: "og:description", content: "Tableau de bord radio : volume de mesures, KPI, carte de couverture et comparaison opérateurs." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Overview,
});

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const OP_DOT: Record<Operator, string> = { Orange: "bg-op-orange", SFR: "bg-op-sfr", Bouygues: "bg-op-bouygues", Free: "bg-op-free" };
const fmt = (v: number | null, d = 1) => (v == null ? "N/D" : v.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const fmtDate = (d: string) => d.split("-").reverse().join("/");

function Spark({ values, kind, tone }: { values: number[]; kind: "bar" | "line"; tone: "primary" | "good" | "accent" }) {
  const cls = tone === "good" ? "text-sev-good" : tone === "accent" ? "text-op-bouygues" : "text-primary";
  if (!values.length) return null;
  const max = Math.max(...values), min = Math.min(...values), w = 70, h = 28;
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
  return (
    <svg width={w} height={h} className={cls} aria-hidden>
      {kind === "bar"
        ? values.map((v, i) => <rect key={i} x={i * (w / values.length)} width={w / values.length - 1.5} y={y(v)} height={h - y(v)} fill="currentColor" opacity={0.8} />)
        : <polyline fill="none" stroke="currentColor" strokeWidth={1.6} points={values.map((v, i) => `${(i / (values.length - 1)) * w},${y(v)}`).join(" ")} />}
    </svg>
  );
}

function KpiCard({ label, value, unit, delta, good, spark }: { label: string; value: string; unit?: string; delta?: string; good?: boolean; spark?: React.ReactNode }) {
  return (
    <div className="panel flex items-end justify-between gap-2 px-4 py-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="num mt-1 text-2xl font-bold">
          {value}{unit && <span className="ml-1 text-lg">{unit}</span>}
          {delta && <span className={`ml-2 rounded px-1 align-middle text-[10px] font-semibold ${good ? "bg-sev-good/15 text-sev-good" : "bg-destructive/10 text-destructive"}`}>{delta}</span>}
        </p>
      </div>
      {spark}
    </div>
  );
}

function FieldSelect({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><p className="mb-1 text-[11px] text-muted-foreground">{label}</p>{children}</div>;
}
function StaticBox({ children }: { children: React.ReactNode }) {
  return <div className="flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-card px-2.5 text-xs">{children}<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></div>;
}

function Overview() {
  const { filters, set } = useFilters();
  const [selected, setSelected] = useState<string | null>(null);
  const [layer, setLayer] = useState<"map" | "sat">("map");
  const projects = useQuery({ queryKey: ["projects"], queryFn: ({ signal }) => getProjects(signal) });
  const kpi = useQuery({ queryKey: ["kpi"], queryFn: ({ signal }) => getKpiCatalog(signal) });
  const q = useQuery({
    queryKey: ["overview", filters], enabled: !!filters.project, placeholderData: keepPreviousData,
    queryFn: ({ signal }) => getOverview(filters, signal),
  });
  const d = q.data;
  const p = d?.project;

  const opShare = useMemo(() => {
    const tot = d?.points.length ?? 0;
    return (d?.byOperator ?? []).map((o) => ({ op: o.operator, pct: tot ? Math.round((o.samples / tot) * 100) : 0 }));
  }, [d]);
  const trendVals = useMemo(() => (d?.trend ?? []).map((t) => {
    const v = Object.values(t.series).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }).slice(-12), [d]);
  const sites = useMemo(() => new Set(d?.points.map((x) => x.site)).size, [d]);
  const sel = d?.points.find((x) => x.id === selected);

  const donut = useCallback(() => ({
    series: [{
      type: "pie" as const, radius: ["58%", "85%"], label: { show: false }, itemStyle: { borderColor: css("--card"), borderWidth: 2 },
      data: opShare.map((o) => ({ name: o.op, value: o.pct, itemStyle: { color: css(OP_VAR[o.op]) } })),
    }],
  }), [opShare]);
  const trend = useCallback((c: { muted: string; border: string }) => ({
    grid: { left: 40, right: 10, top: 10, bottom: 50 },
    tooltip: { trigger: "axis" as const },
    legend: { bottom: 0, icon: "circle", itemWidth: 8, textStyle: { color: c.muted, fontSize: 11 } },
    xAxis: { type: "category" as const, data: d?.trend.map((t) => t.day.slice(8, 10) + "/" + t.day.slice(5, 7)) ?? [], axisLabel: { color: c.muted, fontSize: 10 }, axisLine: { lineStyle: { color: c.border } } },
    yAxis: { type: "value" as const, name: "Mbps", nameLocation: "middle" as const, nameGap: 30, axisLabel: { color: c.muted, fontSize: 10 }, splitLine: { lineStyle: { color: c.border } } },
    series: (p?.operators ?? []).map((op) => ({
      name: op, type: "line" as const, smooth: true, symbolSize: 4, connectNulls: false,
      lineStyle: { width: 1.6, color: css(OP_VAR[op]) }, itemStyle: { color: css(OP_VAR[op]) },
      data: d?.trend.map((t) => t.series[op] ?? null) ?? [],
    })),
  }), [d, p]);

  if (!filters.project || (q.isPending && !d)) return <div className="grid gap-3 p-4">{[0, 1, 2].map((i) => <LoadingSkeleton key={i} className="h-40" />)}</div>;
  if (q.isError) return <ErrorState message="Impossible de charger la vue d'ensemble." onRetry={() => q.refetch()} />;
  if (!d || !p) return null;

  const dl = d.kpis.find((k) => k.key === "dl_nr")?.value ?? d.kpis.find((k) => k.key === "dl_lte")?.value ?? null;
  const lat = d.kpis.find((k) => k.key === "latency")?.value ?? null;

  return (
    <div className="space-y-3 p-4">
      <div className="panel flex flex-wrap items-end gap-3 px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-md border px-2 py-1">
          <span className="rounded bg-nav px-1.5 py-1 text-[10px] text-nav-foreground"><Logo className="text-xs" /></span>
          <div className="relative">
            <select aria-label="Projet" value={p.id} onChange={(e) => set({ project: e.target.value, op: undefined, tech: undefined, band: undefined, dep: undefined, svc: undefined })}
              className="appearance-none bg-transparent pr-5 text-xs font-semibold">
              {projects.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-0.5 h-3.5 w-3.5" />
            <p className="num text-[10px] text-muted-foreground">{fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}</p>
          </div>
        </div>
        <FieldSelect label="Opérateurs"><MultiSelect label="Opérateurs" options={p.operators} value={filters.op ?? []} onChange={(v) => set({ op: v })} /></FieldSelect>
        <FieldSelect label="Service"><MultiSelect label="Service" options={p.services} value={filters.svc ?? []} onChange={(v) => set({ svc: v })} /></FieldSelect>
        <FieldSelect label="Technologie"><MultiSelect label="Technologie" options={p.technologies} value={filters.tech ?? []} onChange={(v) => set({ tech: v })} /></FieldSelect>
        <FieldSelect label="Bande"><MultiSelect label="Bande" options={p.bands} value={filters.band ?? []} onChange={(v) => set({ band: v })} /></FieldSelect>
        <FieldSelect label="Géographie"><StaticBox>{p.geography.split(" (")[0]} &gt; Tous</StaticBox></FieldSelect>
        <FieldSelect label="Période"><StaticBox><span className="num">{fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}</span></StaticBox></FieldSelect>
        <button onClick={() => set({ op: undefined, tech: undefined, svc: undefined, band: undefined, dep: undefined })}
          className="ml-auto h-8 rounded-md border border-primary px-4 text-xs font-semibold text-primary hover:bg-accent">Réinitialiser</button>
      </div>

      {d.points.length === 0 ? <div className="panel"><EmptyState title="Aucune mesure">Ce projet est en cours de traitement ou aucun point ne correspond aux filtres.</EmptyState></div> : (
      <div className="grid gap-3 xl:grid-cols-[260px_1fr_400px]">
        <div className="flex flex-col gap-3">
          <KpiCard label="Volume de mesures" value={p.captures >= 1e6 ? `${(p.captures / 1e6).toFixed(1).replace(".", ",")} M` : `${Math.round(p.captures / 1e3)} k`} delta="+12%" good spark={<Spark kind="bar" tone="primary" values={trendVals} />} />
          <KpiCard label="RRC Success Rate" value={kpi.data ? fmt(kpi.data.kpi.value) : "N/D"} unit="%" delta="+0,3 pt" good spark={<Spark kind="line" tone="good" values={trendVals} />} />
          <KpiCard label="Throughput DL (médian)" value={fmt(dl)} unit="Mbps" delta="-18%" spark={<Spark kind="bar" tone="primary" values={trendVals} />} />
          <KpiCard label="Latence (médiane)" value={fmt(lat, 0)} unit="ms" delta="-12%" good spark={<Spark kind="line" tone="accent" values={trendVals} />} />
          <KpiCard label="Sites mesurés" value={sites.toLocaleString("fr-FR")} />
        </div>

        <div className="panel relative min-h-[460px] overflow-hidden">
          <div className="absolute left-3 top-3 z-10 flex rounded-md border bg-card p-0.5 shadow-sm">
            {(["map", "sat"] as const).map((k) => (
              <button key={k} onClick={() => setLayer(k)} className={`rounded px-3 py-1 text-xs font-semibold ${layer === k ? "bg-primary text-primary-foreground" : ""}`}>{k === "map" ? "Carte" : "Satellite"}</button>
            ))}
          </div>
          <RadioMap points={d.points} metric="rsrp" center={p.center} selectedId={selected} onSelect={setSelected} />
          {sel && (
            <div className="absolute left-1/2 top-24 z-10 w-48 rounded-md border bg-card p-2.5 text-[11px] shadow-lg">
              <p className="font-semibold">Site : {sel.site}</p>
              <p>Opérateur : {sel.operator}</p><p>Techno : {sel.tech}</p><p>Bande : {sel.band}</p>
              <p>RSRP : {sel.rsrp == null ? "N/D" : `${fmt(sel.rsrp)} dBm`}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <section className="panel p-4">
            <h3 className="text-sm font-semibold">Répartition des mesures</h3>
            <div className="mt-2 flex items-center gap-4">
              <div className="relative w-40 shrink-0">
                <MiniChart build={donut} height={160} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="num text-lg font-bold">{(p.captures / 1e6).toFixed(1).replace(".", ",")} M</span>
                  <span className="text-[10px] text-muted-foreground">mesures</span>
                </div>
              </div>
              <ul className="flex-1 space-y-2 text-xs">
                {opShare.map((o) => (
                  <li key={o.op} className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${OP_DOT[o.op]}`} />{o.op}</span>
                    <span className="num font-semibold">{o.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <Chart title="Évolution temporelle — Throughput DL" build={trend} height={230} exportName="evolution_dl" />
        </div>
      </div>
      )}
    </div>
  );
}

/** Chart without header chrome (donut). */
function MiniChart({ build, height }: { build: Parameters<typeof Chart>[0]["build"]; height: number }) {
  return <div className="[&_section]:border-0 [&_section]:shadow-none [&_header]:hidden"><Chart title="Répartition" build={build} height={height} exportName="repartition" /></div>;
}
