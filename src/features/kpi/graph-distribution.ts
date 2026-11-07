export type GraphAnalysisMode = "timeline" | "histogram" | "cdf" | "percentile";

export type DistributionPoint = { x: number; y: number };

export type HistogramRow = {
  x: number;
  x0: number;
  x1: number;
} & Record<string, number>;

const finiteSorted = (values: readonly number[]) =>
  values
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b);

export function cdfPoints(values: readonly number[]): DistributionPoint[] {
  const sorted = finiteSorted(values);
  const result: DistributionPoint[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const value = sorted[index]!;
    if (sorted[index + 1] === value) continue;
    result.push({ x: value, y: ((index + 1) / sorted.length) * 100 });
  }
  return result;
}

export function percentilePoints(values: readonly number[]): DistributionPoint[] {
  const sorted = finiteSorted(values);
  if (sorted.length === 1) return [{ x: 100, y: sorted[0]! }];
  return sorted.map((value, index) => ({
    x: (index / Math.max(1, sorted.length - 1)) * 100,
    y: value,
  }));
}

export function histogramRows(
  series: ReadonlyArray<{ code: string; values: readonly number[] }>,
): HistogramRow[] {
  const all = series.flatMap((item) => item.values.filter(Number.isFinite));
  if (!all.length) return [];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const binCount = min === max ? 1 : Math.min(40, Math.max(5, Math.ceil(Math.sqrt(all.length))));
  const width = min === max ? 1 : (max - min) / binCount;
  const rows = Array.from({ length: binCount }, (_, index) => ({
    x: min === max ? min : min + (index + 0.5) * width,
    x0: min === max ? min - 0.5 : min + index * width,
    x1: min === max ? max + 0.5 : min + (index + 1) * width,
  })) as HistogramRow[];
  for (const item of series) {
    for (const row of rows) row[item.code] = 0;
    for (const value of item.values) {
      if (!Number.isFinite(value)) continue;
      const index = min === max ? 0 : Math.min(binCount - 1, Math.floor((value - min) / width));
      rows[index]![item.code] = (rows[index]![item.code] ?? 0) + 1;
    }
  }
  return rows;
}
