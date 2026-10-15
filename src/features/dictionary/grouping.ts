// Regroupement de la distribution d'un paramètre RRC (histogramme + table).
// Calcul déclaré : somme des `count` servis par l'API (`value_matrix`,
// sinon `value_distribution`), aucune valeur inventée.
import type { ParamRow } from "@/lib/api/dictionary-schemas";

export type GroupBy = "none" | "operator" | "band" | "operator_band";
export type Measure = "count" | "pct_total" | "pct_group";

export const GROUP_LABELS: Record<GroupBy, string> = {
  none: "Aucun",
  operator: "Opérateur",
  band: "Bande",
  operator_band: "Opérateur + Bande",
};

export type ValueBin = {
  raw: string;
  /** Libellé affiché : valeur convertie si règle validée, sinon brute. */
  label: string;
  converted: string | null;
  total: number;
};

export type Series = { key: string; operator?: string | undefined; band?: string | undefined; counts: number[]; total: number };

export type Grouped = {
  bins: ValueBin[];
  series: Series[];
  /** Population filtrée totale (dénominateur « % du total »). */
  population: number;
  isEnum: boolean;
  /** false si l'API ne fournit pas le détail nécessaire au regroupement. */
  groupingSupported: boolean;
};

export function groupDistribution(row: ParamRow, groupBy: GroupBy): Grouped {
  const matrix = row.value_matrix;
  const dist = row.value_distribution ?? [];
  const source = matrix?.length
    ? matrix
    : dist.map((d) => ({ ...d, operator: "", band: "" }));
  const isEnum = source.length > 0 && source.every((e) => e.value_converted == null);

  const binMap = new Map<string, ValueBin>();
  for (const e of source) {
    const b = binMap.get(e.value_raw);
    if (b) b.total += e.count;
    else
      binMap.set(e.value_raw, {
        raw: e.value_raw,
        converted: e.value_converted,
        label: isEnum ? e.value_raw : (e.value_converted ?? "N/D"),
        total: e.count,
      });
  }
  const bins = [...binMap.values()];
  if (!isEnum) {
    const k = (b: ValueBin) => {
      const n = Number(b.converted ?? NaN);
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    };
    bins.sort((a, b) => k(a) - k(b));
  }
  const idx = new Map(bins.map((b, i) => [b.raw, i]));
  const population = bins.reduce((a, b) => a + b.total, 0);

  const groupingSupported = !!matrix?.length;
  const effective: GroupBy = groupingSupported ? groupBy : "none";
  const keyOf = (e: { operator: string; band: string }) =>
    effective === "operator"
      ? e.operator
      : effective === "band"
        ? e.band
        : effective === "operator_band"
          ? `${e.operator} · ${e.band}`
          : "Total";

  const seriesMap = new Map<string, Series>();
  for (const e of source) {
    const key = keyOf(e);
    let s = seriesMap.get(key);
    if (!s) {
      s = {
        key,
        operator: effective === "operator" || effective === "operator_band" ? e.operator : undefined,
        band: effective === "band" || effective === "operator_band" ? e.band : undefined,
        counts: bins.map(() => 0),
        total: 0,
      };
      seriesMap.set(key, s);
    }
    s.counts[idx.get(e.value_raw)!]! += e.count;
    s.total += e.count;
  }
  const series = [...seriesMap.values()].sort((a, b) => a.key.localeCompare(b.key, "fr"));
  return { bins, series, population, isEnum, groupingSupported };
}

/** Valeur affichée pour une cellule selon la mesure. `null` = dénominateur nul (N/D). */
export function measureOf(count: number, measure: Measure, population: number, groupTotal: number) {
  if (measure === "count") return count;
  const d = measure === "pct_total" ? population : groupTotal;
  return d > 0 ? +((count / d) * 100).toFixed(2) : null;
}
