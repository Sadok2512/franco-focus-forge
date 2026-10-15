import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useCallback, useState } from "react";
import { getCellArcepZones, getKpiCatalog } from "@/lib/api/client";
import { OPERATORS, TECHNOLOGIES, type Operator, type Tech } from "@/lib/api/schemas";
import { Chart } from "@/components/bc4/Chart";
import { OP_VAR } from "@/components/bc4/AppShell";
import { LoadingSkeleton } from "@/components/bc4/States";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { useFilters } from "@/lib/filters";

export const Route = createFileRoute("/_app/kpi")({
  head: () => ({
    meta: [
      { title: "KPI Analytics — BC4" },
      {
        name: "description",
        content:
          "Catalogue KPI radio : accessibilité, rétention, mobilité, débit et comparaison par opérateur.",
      },
      { property: "og:title", content: "KPI Analytics — BC4" },
      {
        property: "og:description",
        content:
          "Catalogue KPI radio : accessibilité, rétention, mobilité, débit et comparaison par opérateur.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KpiPage,
});

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fr = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Bandes de référence proposées côté KPI : union stable des bandes projets
// (le KPI est transverse — un projet unique ne limite pas les options).
const KPI_BANDS = ["B3", "B7", "B20", "B28", "B1", "n78", "n28", "n1"] as const;

function KpiPage() {
  const q = useQuery({ queryKey: ["kpi"], queryFn: ({ signal }) => getKpiCatalog(signal) });
  const [open, setOpen] = useState<string>("Accessibilité");
  const [tab, setTab] = useState("Vue d'ensemble");
  const k = q.data?.kpi;

  const { filters, set: setFilters } = useFilters();
  // Zone ARCEP (bc4-back 0.7.1) : options chargées depuis
  // `/reference/cell/summary.arcep_breakdown` via l'adaptateur `client.ts`.
  // Pas d'appel réseau direct ici. Jamais hardcodées côté UI.
  const arcepZonesQ = useQuery({
    queryKey: ["reference", "cell", "arcep-zones"],
    queryFn: ({ signal }) => getCellArcepZones(signal),
    staleTime: 5 * 60_000,
  });
  const activeCount = (["op", "tech", "band", "arcep"] as const).reduce(
    (a, kf) => a + (filters[kf]?.length ?? 0),
    0,
  );

  // Opérateurs visibles : restriction par filtre `op` (sous-ensemble). Vide =
  // tous. Le filtre restreint ainsi les résultats affichés dans le KPI.
  const visibleOps =
    filters.op && filters.op.length ? OPERATORS.filter((o) => filters.op!.includes(o)) : OPERATORS;

  const bars = useCallback(
    (c: { muted: string; border: string }) => ({
      grid: { left: 40, right: 10, top: 24, bottom: 28 },
      xAxis: {
        type: "category" as const,
        data: [...visibleOps],
        axisLabel: { color: c.muted, fontSize: 11 },
        axisLine: { lineStyle: { color: c.border } },
      },
      yAxis: {
        type: "value" as const,
        min: 90,
        max: 100,
        axisLabel: { color: c.muted, fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: c.border } },
      },
      series: [
        {
          type: "bar" as const,
          barWidth: "62%",
          label: {
            show: true,
            position: "top" as const,
            fontSize: 11,
            fontWeight: "bold" as const,
            formatter: (p: { value?: unknown }) => `${fr(Number(p.value))} %`,
          },
          data: visibleOps.map((o) => ({
            value: k?.byOp[o] ?? 0,
            itemStyle: { color: css(OP_VAR[o]) },
          })),
        },
      ],
    }),
    [k, visibleOps],
  );
  const lines = useCallback(
    (c: { muted: string; border: string }) => {
      const days = Array.from(
        { length: 30 },
        (_, i) =>
          `${String((i % 28) + 1).padStart(2, "0")}/${String(Math.floor(i / 10) + 1).padStart(2, "0")}`,
      );
      return {
        grid: { left: 40, right: 10, top: 14, bottom: 46 },
        tooltip: { trigger: "axis" as const },
        legend: {
          bottom: 0,
          icon: "circle",
          itemWidth: 8,
          textStyle: { color: c.muted, fontSize: 11 },
        },
        xAxis: {
          type: "category" as const,
          data: days,
          axisLabel: { color: c.muted, fontSize: 10 },
          axisLine: { lineStyle: { color: c.border } },
        },
        yAxis: {
          type: "value" as const,
          min: 90,
          max: 100,
          axisLabel: { color: c.muted, fontSize: 10, formatter: "{value}%" },
          splitLine: { lineStyle: { color: c.border } },
        },
        series: visibleOps.map((o, j) => ({
          name: o,
          type: "line" as const,
          symbolSize: 3,
          lineStyle: { width: 1.4, color: css(OP_VAR[o]) },
          itemStyle: { color: css(OP_VAR[o]) },
          data: days.map((_, i) => +((k?.byOp[o] ?? 97) + Math.sin(i * 0.9 + j) * 0.5).toFixed(2)),
        })),
      };
    },
    [k, visibleOps],
  );

  if (!q.data || !k)
    return (
      <div className="p-4">
        <LoadingSkeleton className="h-96" />
      </div>
    );

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Filtres transverses au KPI : opérateur / techno / bande / Zone ARCEP
          — même composant/même ergonomie que la page Dictionnaire. La Zone
          ARCEP est strictement orthogonale à la géo (jamais dans /geo/tree). */}
      <div className="panel flex flex-wrap items-center gap-1.5 px-2 py-1.5">
        <h2 className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filtres
        </h2>
        <MultiSelect
          label="Opérateur"
          options={OPERATORS}
          value={(filters.op ?? []) as Operator[]}
          onChange={(v) => setFilters({ op: v })}
        />
        <MultiSelect
          label="Techno"
          options={TECHNOLOGIES}
          value={(filters.tech ?? []) as Tech[]}
          onChange={(v) => setFilters({ tech: v })}
        />
        <MultiSelect
          label="Bande"
          options={KPI_BANDS}
          value={filters.band ?? []}
          onChange={(v) => setFilters({ band: v })}
        />
        <MultiSelect
          label="Zone ARCEP"
          options={arcepZonesQ.data ?? []}
          value={filters.arcep ?? []}
          onChange={(v) => setFilters({ arcep: v })}
        />
        {activeCount > 0 && (
          <button
            onClick={() =>
              setFilters({
                op: undefined,
                tech: undefined,
                band: undefined,
                arcep: undefined,
              })
            }
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-primary hover:bg-muted"
          >
            <X className="h-3 w-3" /> Effacer ({activeCount})
          </button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-[250px_1fr]">
        <aside className="panel p-3">
          <h2 className="text-sm font-bold">Catalogue KPI</h2>
          <label className="relative mt-2 block">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Rechercher un KPI…"
              className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-2 text-xs"
            />
          </label>
          <ul className="mt-3 space-y-0.5">
            {q.data.catalog.map((g) => (
              <li key={g.group}>
                <button
                  onClick={() => setOpen((o) => (o === g.group ? "" : g.group))}
                  className="flex w-full items-center gap-1 rounded px-1 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  {open === g.group ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  {g.group}
                </button>
                {open === g.group &&
                  g.items.map((it) => (
                    <p
                      key={it}
                      className={`rounded py-1.5 pl-6 text-xs ${it === k.name ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`}
                    >
                      {it}
                    </p>
                  ))}
              </li>
            ))}
          </ul>
        </aside>

        <section className="panel p-5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{k.name}</h1>
            <span className="rounded bg-sev-good/15 px-1.5 py-0.5 text-[10px] font-bold text-sev-good">
              KPI
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{k.description}</p>
          <div className="mt-4 flex gap-1 border-b">
            {[
              "Vue d'ensemble",
              "Comparaison",
              "Tendances",
              "Géographie",
              "Distribution",
              "Données détaillées",
            ].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-3 py-2 text-xs font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 divide-x rounded-md border md:grid-cols-5">
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Valeur globale</p>
              <p className="num text-2xl font-bold">
                {fr(k.value)} %{" "}
                <span className="rounded bg-sev-good/15 px-1 text-[10px] text-sev-good">
                  +{fr(k.delta)} pt
                </span>
              </p>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Échantillons</p>
              <p className="num mt-1 text-sm font-semibold">
                {(k.samples / 1e6).toFixed(1).replace(".", ",")} M
              </p>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Technologies</p>
              <p className="mt-1 text-sm font-semibold">{k.techs}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Unité</p>
              <p className="mt-1 text-sm font-semibold">{k.unit}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">Période</p>
              <p className="num mt-1 text-sm font-semibold">01/01/2026 – 31/03/2026</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <Chart
              title="Comparaison par opérateur"
              build={bars}
              height={260}
              exportName="kpi_operateurs"
            />
            <Chart
              title="Évolution temporelle"
              build={lines}
              height={260}
              exportName="kpi_evolution"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
