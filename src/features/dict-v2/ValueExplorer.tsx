import { rrcRequestMessage } from "./request-recovery";
// bc4-front — Panneau droit du Dict v2 : filtres (chips comparables à
// /kpi), segmenté opérateur|bande|les deux, un graphe par paramètre
// coché, verdict + chips, tableau commun avec export CSV.

import { useCallback, useEffect, useMemo, useState } from "react";
import { GroupedValueTable } from "./GroupedValueTable";
import type { EChartsOption } from "echarts";
import { Chart } from "@/components/bc4/Chart";
import type {
  DictTreeResponse,
  DictDistributionResponse,
  DistributionBlock,
  GroupByMode,
} from "@/lib/api/dict-v2";
import { discriminatorChips, groupKeyColor, groupKeyLabel, originLabel } from "./types";

export function ValueExplorer({
  distribution,
  groupBy,
  onGroupByChange,
  isLoading,
  error,
  selectedKeys,
  catalog,
  filtered = false,
  onRetry,
}: {
  distribution: DictDistributionResponse | null;
  groupBy: GroupByMode;
  onGroupByChange: (m: GroupByMode) => void;
  isLoading: boolean;
  error: unknown;
  selectedKeys: string[];
  catalog?: DictTreeResponse | null;
  filtered?: boolean;
  onRetry?: () => void;
}) {
  const blocks = distribution?.blocks ?? [];

  return (
    <section className="flex min-w-0 flex-col gap-3 p-1" data-testid="dict-value-explorer">
      <header className="flex flex-wrap items-start justify-end gap-3">
        <SegGroupBy value={groupBy} onChange={onGroupByChange} />
      </header>

      {error ? (
        <div className="rounded-md border border-sev-bad/40 bg-sev-bad/10 p-3 text-xs text-sev-bad">
          <span role="alert">{rrcRequestMessage(error)}</span>
          {onRetry && (
            <button
              className="rrc-control ml-2"
              aria-label="Réessayer les résultats"
              onClick={onRetry}
            >
              Réessayer
            </button>
          )}
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

      {selectedKeys.length > 0 && !isLoading && !error && blocks.length === 0 && (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Aucune valeur pour les filtres appliqués. Les paramètres cochés sont conservés.
        </p>
      )}
      {blocks.length > 0 && blocks.every((block) => !block.values.length) && (
        <p role="status" className="rrc-context-notice">
          Valeurs non fournies par l’API pour cette sélection.
        </p>
      )}
      <div className="rrc-data-layout">
        {blocks.length > 0 && (
          <div className="rrc-charts" data-testid="dict-charts" data-chart-count={blocks.length}>
            {blocks.map((b) => (
              <ChartCard key={b.param_key} block={b} groupBy={groupBy} filtered={filtered} />
            ))}
          </div>
        )}

        {blocks.length > 0 && (
          <GroupedValueTable blocks={blocks} groupBy={groupBy} catalog={catalog ?? null} />
        )}
      </div>
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
    <div
      className="inline-flex overflow-hidden rounded-md border"
      role="group"
      aria-label="Comparer par"
    >
      {opts.map((o, i) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          data-testid={`dict-groupby-${o.v}`}
          className={`${i > 0 ? "border-l" : ""} px-3 py-1.5 text-xs font-medium ${
            value === o.v
              ? "bg-accent/40 text-accent-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
          aria-pressed={value === o.v}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChartCard({
  block,
  groupBy,
  filtered,
}: {
  block: DistributionBlock;
  groupBy: GroupByMode;
  filtered: boolean;
}) {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const build = useCallback(
    (c: { fg: string; muted: string; border: string }): EChartsOption => {
      if (dark) c = { fg: "#edf3fc", muted: "#b1c2d9", border: "#34445b" };
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
        itemStyle: {
          color: keyMap.get(k)!,
          borderRadius: [2, 2, 0, 0] as [number, number, number, number],
        },
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
    [block, groupBy, dark],
  );

  const verdictBadge = {
    IDENTIQUE: "bg-muted text-foreground",
    DIFFERENT: "bg-accent/40 text-accent-foreground",
    NON_COMPARE: "bg-muted text-foreground",
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
            {block.distinct_values} valeur{block.distinct_values > 1 ? "s" : ""} · n=
            {block.n_total}
          </div>
        </div>
      </div>
      {empty ? (
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          {block.n_total > 0
            ? "Distribution indisponible : l’API renvoie une population non nulle sans valeurs."
            : "0 occurrence dans ce périmètre"}
        </div>
      ) : (
        <Chart
          key={dark ? "dark" : "light"}
          title={block.display_name}
          build={build}
          height={220}
          exportName={`dict_${block.display_name.replace(/[^a-z0-9]+/gi, "_")}`}
        />
      )}
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        {filtered ? (
          <span className="text-muted-foreground">Comparaison : N/D pour la sélection filtrée</span>
        ) : (
          <>
            <span className={`rounded px-1.5 py-0.5 font-semibold ${verdictBadge}`}>
              {block.verdict}
            </span>
            <span className="text-muted-foreground">{block.comparability}</span>
          </>
        )}
        {chips.map((c) => (
          <span
            key={c}
            className="rounded bg-accent/40 px-1 py-0.5 font-mono text-[10px] text-accent-foreground"
          >
            {c}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {originLabel(block.origin)}
        </span>
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
