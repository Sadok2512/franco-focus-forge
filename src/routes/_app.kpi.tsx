import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { getKpiCatalog } from "@/lib/api/client";
import { OPERATORS } from "@/lib/api/schemas";
import { Chart } from "@/components/bc4/Chart";
import { OP_VAR } from "@/components/bc4/AppShell";
import { LoadingSkeleton } from "@/components/bc4/States";

export const Route = createFileRoute("/_app/kpi")({
  head: () => ({ meta: [
    { title: "KPI Analytics — BC4" },
    { name: "description", content: "Catalogue KPI radio : accessibilité, rétention, mobilité, débit et comparaison par opérateur." },
    { property: "og:title", content: "KPI Analytics — BC4" },
    { property: "og:description", content: "Catalogue KPI radio : accessibilité, rétention, mobilité, débit et comparaison par opérateur." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: KpiPage,
});

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fr = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function KpiPage() {
  const q = useQuery({ queryKey: ["kpi"], queryFn: ({ signal }) => getKpiCatalog(signal) });
  const [open, setOpen] = useState<string>("Accessibilité");
  const [tab, setTab] = useState("Vue d'ensemble");
  const k = q.data?.kpi;

  const bars = useCallback((c: { muted: string; border: string }) => ({
    grid: { left: 40, right: 10, top: 24, bottom: 28 },
    xAxis: { type: "category" as const, data: [...OPERATORS], axisLabel: { color: c.muted, fontSize: 11 }, axisLine: { lineStyle: { color: c.border } } },
    yAxis: { type: "value" as const, min: 90, max: 100, axisLabel: { color: c.muted, fontSize: 10, formatter: "{value}%" }, splitLine: { lineStyle: { color: c.border } } },
    series: [{ type: "bar" as const, barWidth: "62%", label: { show: true, position: "top" as const, fontSize: 11, fontWeight: "bold" as const, formatter: (p: { value?: unknown }) => `${fr(Number(p.value))} %` },
      data: OPERATORS.map((o) => ({ value: k?.byOp[o] ?? 0, itemStyle: { color: css(OP_VAR[o]) } })) }],
  }), [k]);
  const lines = useCallback((c: { muted: string; border: string }) => {
    const days = Array.from({ length: 30 }, (_, i) => `${String((i % 28) + 1).padStart(2, "0")}/${String(Math.floor(i / 10) + 1).padStart(2, "0")}`);
    return {
      grid: { left: 40, right: 10, top: 14, bottom: 46 },
      tooltip: { trigger: "axis" as const },
      legend: { bottom: 0, icon: "circle", itemWidth: 8, textStyle: { color: c.muted, fontSize: 11 } },
      xAxis: { type: "category" as const, data: days, axisLabel: { color: c.muted, fontSize: 10 }, axisLine: { lineStyle: { color: c.border } } },
      yAxis: { type: "value" as const, min: 90, max: 100, axisLabel: { color: c.muted, fontSize: 10, formatter: "{value}%" }, splitLine: { lineStyle: { color: c.border } } },
      series: OPERATORS.map((o, j) => ({ name: o, type: "line" as const, symbolSize: 3, lineStyle: { width: 1.4, color: css(OP_VAR[o]) }, itemStyle: { color: css(OP_VAR[o]) },
        data: days.map((_, i) => +((k?.byOp[o] ?? 97) + Math.sin(i * 0.9 + j) * 0.5).toFixed(2)) })),
    };
  }, [k]);

  if (!q.data || !k) return <div className="p-4"><LoadingSkeleton className="h-96" /></div>;

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[250px_1fr]">
      <aside className="panel p-3">
        <h2 className="text-sm font-bold">Catalogue KPI</h2>
        <label className="relative mt-2 block">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input placeholder="Rechercher un KPI…" className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-2 text-xs" />
        </label>
        <ul className="mt-3 space-y-0.5">
          {q.data.catalog.map((g) => (
            <li key={g.group}>
              <button onClick={() => setOpen((o) => (o === g.group ? "" : g.group))} className="flex w-full items-center gap-1 rounded px-1 py-1.5 text-xs font-semibold hover:bg-muted">
                {open === g.group ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{g.group}
              </button>
              {open === g.group && g.items.map((it) => (
                <p key={it} className={`rounded py-1.5 pl-6 text-xs ${it === k.name ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`}>{it}</p>
              ))}
            </li>
          ))}
        </ul>
      </aside>

      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">{k.name}</h1>
          <span className="rounded bg-sev-good/15 px-1.5 py-0.5 text-[10px] font-bold text-sev-good">KPI</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{k.description}</p>
        <div className="mt-4 flex gap-1 border-b">
          {["Vue d'ensemble", "Comparaison", "Tendances", "Géographie", "Distribution", "Données détaillées"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2 text-xs font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{t}</button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 divide-x rounded-md border md:grid-cols-5">
          <div className="p-3"><p className="text-[11px] text-muted-foreground">Valeur globale</p><p className="num text-2xl font-bold">{fr(k.value)} % <span className="rounded bg-sev-good/15 px-1 text-[10px] text-sev-good">+{fr(k.delta)} pt</span></p></div>
          <div className="p-3"><p className="text-[11px] text-muted-foreground">Échantillons</p><p className="num mt-1 text-sm font-semibold">{(k.samples / 1e6).toFixed(1).replace(".", ",")} M</p></div>
          <div className="p-3"><p className="text-[11px] text-muted-foreground">Technologies</p><p className="mt-1 text-sm font-semibold">{k.techs}</p></div>
          <div className="p-3"><p className="text-[11px] text-muted-foreground">Unité</p><p className="mt-1 text-sm font-semibold">{k.unit}</p></div>
          <div className="p-3"><p className="text-[11px] text-muted-foreground">Période</p><p className="num mt-1 text-sm font-semibold">01/01/2026 – 31/03/2026</p></div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <Chart title="Comparaison par opérateur" build={bars} height={260} exportName="kpi_operateurs" />
          <Chart title="Évolution temporelle" build={lines} height={260} exportName="kpi_evolution" />
        </div>
      </section>
    </div>
  );
}
