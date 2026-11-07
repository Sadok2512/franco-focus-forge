export type GraphAnalysisMode = "timeline" | "histogram" | "cdf" | "percentile";
export type DistributionMode = "histogram" | "cdf" | "percentile";
export type HistogramYMode = "count" | "percentage";
export type CdfDirection = "cdf" | "ccdf";
export type BinMode = "auto" | "width" | "count";

export type DistributionSettings = {
  modes: Record<DistributionMode, boolean>;
  range: { auto: boolean; min: number | null; max: number | null };
  bins: { mode: BinMode; width: number; count: number };
  histogram: { yMode: HistogramYMode; opacity: number };
  cdf: { direction: CdfDirection; color: string; width: number };
  percentiles: { values: number[]; color: string };
};

export type DistributionPoint = { x: number; y: number };
export type HistogramRow = { x: number; x0: number; x1: number } & Record<string, number>;
export type DistributionPopulation = {
  min: number;
  max: number;
  included: number;
  excluded: number;
  total: number;
  binCount: number;
  binWidth: number;
};
export type HistogramResult = { rows: HistogramRow[]; population: DistributionPopulation | null };

export const DEFAULT_DISTRIBUTION_SETTINGS: DistributionSettings = {
  modes: { histogram: true, cdf: false, percentile: false },
  range: { auto: true, min: null, max: null },
  bins: { mode: "auto", width: 5, count: 20 },
  histogram: { yMode: "count", opacity: 0.72 },
  cdf: { direction: "cdf", color: "#7c3aed", width: 2 },
  percentiles: { values: [10, 50, 90], color: "#dc2626" },
};

/** Preserve each independent representation toggle exactly as selected. */
export function normalizeDistributionModes(
  modes: DistributionSettings["modes"],
): DistributionSettings["modes"] {
  return { ...modes };
}

export function toggleDistributionMode(
  modes: DistributionSettings["modes"],
  mode: DistributionMode,
): DistributionSettings["modes"] {
  return { ...modes, [mode]: !modes[mode] };
}

const finiteSorted = (values: readonly number[]) =>
  values
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b);

/** R-7 linear quantile, deterministic for the same ordered population. */
export function quantile(values: readonly number[], percentile: number): number | null {
  const sorted = finiteSorted(values);
  if (!sorted.length || !Number.isFinite(percentile)) return null;
  const position = (sorted.length - 1) * (Math.min(100, Math.max(0, percentile)) / 100);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

export function cdfPoints(
  values: readonly number[],
  direction: CdfDirection = "cdf",
): DistributionPoint[] {
  const sorted = finiteSorted(values);
  const result: DistributionPoint[] = [];
  let firstAtValue = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const value = sorted[index]!;
    if (sorted[index + 1] === value) continue;
    const cumulative = ((index + 1) / sorted.length) * 100;
    result.push({
      x: value,
      y: direction === "cdf" ? cumulative : ((sorted.length - firstAtValue) / sorted.length) * 100,
    });
    firstAtValue = index + 1;
  }
  return result;
}

/** Complete percentile curve retained for exports/backward compatibility. */
export function percentilePoints(values: readonly number[]): DistributionPoint[] {
  const sorted = finiteSorted(values);
  if (sorted.length === 1) return [{ x: 100, y: sorted[0]! }];
  return sorted.map((value, index) => ({
    x: (index / Math.max(1, sorted.length - 1)) * 100,
    y: value,
  }));
}

export function filterDistributionValues(
  values: readonly number[],
  range: DistributionSettings["range"],
): number[] {
  const finite = values.filter(Number.isFinite);
  if (range.auto || range.min === null || range.max === null || range.min >= range.max)
    return finite;
  return finite.filter((value) => value >= range.min! && value <= range.max!);
}

export function histogramResult(
  series: ReadonlyArray<{ code: string; values: readonly number[] }>,
  settings: DistributionSettings = DEFAULT_DISTRIBUTION_SETTINGS,
): HistogramResult {
  const allRaw = series.flatMap((item) => item.values.filter(Number.isFinite));
  if (!allRaw.length) return { rows: [], population: null };
  const dataMin = Math.min(...allRaw);
  const dataMax = Math.max(...allRaw);
  const custom =
    !settings.range.auto &&
    settings.range.min !== null &&
    settings.range.max !== null &&
    settings.range.min < settings.range.max;
  const min = custom ? settings.range.min! : dataMin;
  const max = custom ? settings.range.max! : dataMax;
  const includedValues = allRaw.filter((value) => value >= min && value <= max);
  const span = max - min;
  let binCount: number;
  if (span === 0) binCount = 1;
  else if (settings.bins.mode === "width")
    binCount = Math.max(
      1,
      Math.min(200, Math.ceil(span / Math.max(0.000001, settings.bins.width))),
    );
  else if (settings.bins.mode === "count")
    binCount = Math.max(1, Math.min(200, Math.round(settings.bins.count)));
  else binCount = Math.min(60, Math.max(5, Math.ceil(Math.sqrt(includedValues.length))));
  const width = span === 0 ? 1 : span / binCount;
  const rows = Array.from({ length: binCount }, (_, index) => ({
    x: span === 0 ? min : min + (index + 0.5) * width,
    x0: span === 0 ? min - 0.5 : min + index * width,
    x1: span === 0 ? max + 0.5 : index === binCount - 1 ? max : min + (index + 1) * width,
  })) as HistogramRow[];
  for (const item of series) {
    const values = item.values.filter(
      (value) => Number.isFinite(value) && value >= min && value <= max,
    );
    for (const row of rows) {
      row[`${item.code}__count`] = 0;
      row[`${item.code}__percentage`] = 0;
      row[item.code] = 0;
    }
    for (const value of values) {
      const index = span === 0 ? 0 : Math.min(binCount - 1, Math.floor((value - min) / width));
      const row = rows[index]!;
      row[`${item.code}__count`] = (row[`${item.code}__count`] ?? 0) + 1;
      row[item.code] = row[`${item.code}__count`]!;
    }
    for (const row of rows)
      row[`${item.code}__percentage`] = values.length
        ? ((row[`${item.code}__count`] ?? 0) / values.length) * 100
        : 0;
  }
  return {
    rows,
    population: {
      min,
      max,
      included: includedValues.length,
      excluded: allRaw.length - includedValues.length,
      total: allRaw.length,
      binCount,
      binWidth: width,
    },
  };
}

export function histogramRows(
  series: ReadonlyArray<{ code: string; values: readonly number[] }>,
  settings: DistributionSettings = DEFAULT_DISTRIBUTION_SETTINGS,
): HistogramRow[] {
  return histogramResult(series, settings).rows;
}

export function axisDecimals(unit: string, min: number, max: number): number {
  const normalized = unit.trim().toLowerCase();
  if (["db", "dbm", "%", "mbit/s", "mbps"].includes(normalized)) return 0;
  const span = Math.abs(max - min);
  if (span >= 20) return 0;
  if (span >= 2) return 1;
  return 2;
}

export function formatDistributionTick(
  value: number,
  unit: string,
  min: number,
  max: number,
): string {
  const digits = axisDecimals(unit, min, max);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(
    Number(value.toFixed(Math.min(8, digits + 2))),
  );
}
