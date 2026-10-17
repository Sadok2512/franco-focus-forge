// bc4-front — Panneau droit du Dict v2 : filtres (chips comparables à
// /kpi), segmenté opérateur|bande|les deux, un graphe par paramètre
// coché, verdict + chips, tableau commun avec export CSV.

import { useCallback, useMemo } from "react";
import type { EChartsOption } from "echarts";
import { Chart } from "@/components/bc4/Chart";
import type {
  DictDistributionResponse,
  DistributionBlock,
  GroupByMode,
} from "@/lib/api/dict-v2";
import {
  discriminatorChips,
  groupKeyColor,
  groupKeyLabel,
  originLabel,
} from "./types";

export function ValueExplorer({
  distribution,
  groupBy,
  onGroupByChange,
  isLoading,
  error,
  selectedKeys,
}: {
  distribution: DictDistributionResponse | null;
  groupBy: GroupByMode;
  onGroupByChange: (m: GroupByMode) => void;
  isLoading: boolean;
  error: unknown;
  selectedKeys: string[];
}) {
  const blocks = distribution?.blocks ?? [];
  const groupByText =
    groupBy === "operator" ? "opérateur" : groupBy === "band" ? "bande" : "opérateur × bande";
  const selText =
    blocks.length > 0
      ? `${blocks.map((b) => b.display_name).join("  ·  ")}   —   comparé par ${groupByText}`
      : "—";

  return (
    <section className="panel flex flex-col gap-3 p-4" data-testid="dict-value-explorer">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Distribution des valeurs</h2>
          <p className="text-xs text-muted-foreground" data-testid="dict-selected-text">
            {selText}
          </p>
        </div>
        <SegGroupBy value={groupBy} onChange={onGroupByChange} />
      </header>

      {error ? (
        <div className="rounded-md border border-sev-bad/40 bg-sev-bad/10 p-3 text-xs text-sev-bad">
          {errorMessage(error)}
        </div>
      ) : null}

      {!selectedKeys.length && (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          Cochez un paramètre dans l'arbre pour voir la distribution de ses valeurs.
        </div>
      )}

      {selectedKeys.length > 0 && isLoading && (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          Chargement…
        </div>
      )}

      {blocks.length > 0 && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}
          data-testid="dict-charts"
        >
          {blocks.map((b) => (
            <ChartCard key={b.param_key} block={b} groupBy={groupBy} />
          ))}
        </div>
      )}

      {blocks.length > 0 && <ValueTable blocks={blocks} groupBy={groupBy} />}
    </section>
  );
}

function SegGroupBy({
  value,
  onChange,
}: {
  value: GroupByMode;
  onChange: (m: GroupByMode) => void;
}) {
  const opts: { v: GroupByMode; label: string }[] = [
    { v: "operator", label: "Opérateur" },
    { v: "band", label: "Bande" },
    { v: "operator_band", label: "Les deux" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Comparer par">
      {opts.map((o, i) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          data-testid={`dict-groupby-${o.v}`}
          className={`${i > 0 ? "border-l" : ""} px-3 py-1.5 text-xs font-medium ${
            value === o.v ? "bg-accent/40 text-accent-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
          aria-pressed={value === o.v}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChartCard({ block, groupBy }: { block: DistributionBlock; groupBy: GroupByMode }) {
  const unitPart = block.unit ? block.unit : "—";

  const build = useCallback(
    (c: { fg: string; muted: string; border: string }): EChartsOption => {
      // Clés de série (groupes), triées pour un ordre stable (Orange d'abord,
      // puis SFR, Bouygues, Free, puis N/D). Pour operator_band, tri alpha.
      const keyMap = new Map<string, string>();
      for (const v of block.values) {
        for (const g of v.groups) {
          const k = groupKeyLabel(groupBy, g);
          if (!keyMap.has(k)) keyMap.set(k, groupKeyColor(groupBy, g));
        }
      }
      const keys = Array.from(keyMap.keys()).sort(sortKey(groupBy));

      // Catégories X = valeurs (converties si dispo, label d'affichage sinon).
      // Tri numérique si parse float OK, catégoriel sinon (CHOICE).
      const xCats = sortedValues(block);

      // Chaque série (opérateur ou bande ou op·band) = une barre par valeur.
      const series = keys.map((k) => ({
        name: k,
        type: "bar" as const,
        barMaxWidth: 28,
        itemStyle: { color: keyMap.get(k)!, borderRadius: [2, 2, 0, 0] as [number, number, number, number] },
        emphasis: { focus: "series" as const },
        data: xCats.map((cat) => {
          const row = block.values.find((v) => v.value_display === cat);
          const g = row?.groups.find((g) => groupKeyLabel(groupBy, g) === k);
          return g?.n ?? null;
        }),
      }));

      return {
        grid: { left: 44, right: 12, top: 36, bottom: 32, containLabel: false },
        legend: {
          top: 0,
          textStyle: { color: c.muted, fontSize: 10 },
          itemWidth: 10,
          itemHeight: 10,
          icon: "rect",
        },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        xAxis: {
          type: "category",
          data: xCats,
          axisLine: { lineStyle: { color: c.border } },
          axisTick: { show: false },
          axisLabel: { color: c.fg, fontSize: 10 },
        },
        yAxis: {
          type: "value",
          name: "n",
          nameTextStyle: { color: c.muted, fontSize: 10 },
          splitLine: { lineStyle: { color: c.border } },
          axisLabel: { color: c.muted, fontSize: 10 },
        },
        series,
      };
    },
    [block, groupBy],
  );

  const verdictBadge = {
    IDENTIQUE: "bg-sev-good/15 text-sev-good",
    DIFFERENT: "bg-accent/40 text-accent-foreground",
    NON_COMPARE: "bg-sev-warn/15 text-sev-warn",
  }[block.verdict];

  const chips = discriminatorChips(block.discriminators);

  // Cas "0 occurrence dans ce périmètre" : feuille sans données ne doit
  // JAMAIS être masquée — on affiche l'empty state à la place du graphe.
  const empty = block.n_total === 0 || block.values.length === 0;

  return (
    <div
      className="panel flex flex-col gap-1.5 p-3"
      data-testid={`dict-chart-${block.display_name}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <b className="truncate text-sm font-semibold">{block.display_name}</b>
          <div className="text-[11px] text-muted-foreground">
            {unitPart} · {block.distinct_values} valeur{block.distinct_values > 1 ? "s" : ""} · n={block.n_total}
          </div>
        </div>
      </div>
      {empty ? (
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          0 occurrence dans ce périmètre
        </div>
      ) : (
        <Chart
          title=""
          build={build}
          height={220}
          exportName={`dict_${block.display_name.replace(/[^a-z0-9]+/gi, "_")}`}
        />
      )}
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 font-semibold ${verdictBadge}`}>{block.verdict}</span>
        <span className="text-muted-foreground">{block.comparability}</span>
        {chips.map((c) => (
          <span
            key={c}
            className="rounded bg-accent/40 px-1 py-0.5 font-mono text-[10px] text-accent-foreground"
          >
            {c}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">{originLabel(block.origin)}</span>
      </div>
    </div>
  );
}

function sortKey(mode: GroupByMode) {
  const op = ["Orange", "SFR", "Bouygues", "Free", "N/D"];
  const band = ["B1", "B3", "B7", "B20", "B28", "n78", "N/D"];
  const idx = (arr: string[], v: string | undefined) => {
    if (v === undefined) return 99;
    const i = arr.indexOf(v);
    return i < 0 ? 99 : i;
  };
  if (mode === "operator") return (a: string, b: string) => idx(op, a) - idx(op, b);
  if (mode === "band") return (a: string, b: string) => idx(band, a) - idx(band, b);
  return (a: string, b: string) => {
    const [oa, ba] = a.split(" · ");
    const [ob, bb] = b.split(" · ");
    const d = idx(op, oa) - idx(op, ob);
    return d !== 0 ? d : idx(band, ba) - idx(band, bb);
  };
}

function sortedValues(block: DistributionBlock): string[] {
  const cats = block.values.map((v) => v.value_display);
  // Tri numérique si toutes convertibles, catégoriel sinon.
  const parsed = cats.map((c) => ({ c, n: parseFloat(c) }));
  const allNum = parsed.every((x) => Number.isFinite(x.n));
  if (allNum) {
    return parsed.sort((a, b) => a.n - b.n).map((x) => x.c);
  }
  return [...cats].sort();
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Erreur chargement distribution";
}

function ValueTable({ blocks, groupBy }: { blocks: DistributionBlock[]; groupBy: GroupByMode }) {
  const { rows, keys, keyColors } = useMemo(() => buildTable(blocks, groupBy), [blocks, groupBy]);

  const onCopyCsv = useCallback(() => {
    const header = ["Paramètre", "Valeur", ...keys, "Total"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push(
        [r.param, r.value, ...keys.map((k) => r.cells[k] ?? ""), r.total].join(";"),
      );
    }
    const txt = lines.join("\n");
    navigator.clipboard
      .writeText(txt)
      .catch(() => {
        // Fallback silencieux : download .csv si clipboard refusé.
        const blob = new Blob([txt], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `dict-distribution_${new Date().toISOString().slice(0, 19)}.csv`;
        a.click();
      });
  }, [rows, keys]);

  if (!rows.length) return null;

  return (
    <div className="panel">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h3 className="text-sm font-semibold">Tableau</h3>
        <button
          type="button"
          onClick={onCopyCsv}
          className="rounded-md border bg-card px-2 py-1 text-xs font-medium hover:bg-muted"
          data-testid="dict-csv-copy"
        >
          Copier en CSV
        </button>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b">
              <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                Paramètre
              </th>
              <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                Valeur
              </th>
              {keys.map((k) => (
                <th
                  key={k}
                  className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-sm align-baseline"
                    style={{ background: keyColors[k] }}
                  />
                  {k}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-2 py-1">{r.param}</td>
                <td className="num px-2 py-1 text-right">{r.value}</td>
                {keys.map((k) => (
                  <td key={k} className="num px-2 py-1 text-right">
                    {r.cells[k] ?? "—"}
                  </td>
                ))}
                <td className="num px-2 py-1 text-right">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type TableRow = {
  id: string;
  param: string;
  value: string;
  cells: Record<string, number>;
  total: number;
};

function buildTable(blocks: DistributionBlock[], groupBy: GroupByMode) {
  const keyColors: Record<string, string> = {};
  const rows: TableRow[] = [];
  for (const b of blocks) {
    for (const v of b.values) {
      const row: TableRow = {
        id: `${b.param_key}|${v.value_display}`,
        param: b.display_name,
        value: v.value_display,
        cells: {},
        total: 0,
      };
      for (const g of v.groups) {
        const k = groupKeyLabel(groupBy, g);
        row.cells[k] = (row.cells[k] ?? 0) + g.n;
        row.total += g.n;
        if (!keyColors[k]) keyColors[k] = groupKeyColor(groupBy, g);
      }
      rows.push(row);
    }
  }
  const keys = Object.keys(keyColors).sort(sortKey(groupBy));
  return { rows, keys, keyColors };
}
