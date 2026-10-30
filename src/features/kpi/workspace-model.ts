import i18n from "@/lib/i18n";
import type {
  KpiCatalogItem,
  KpiQueryFilters,
  ProjectKpiCatalog,
  ProjectKpiDetail,
  ProjectKpiFilters,
} from "@/lib/api/project-kpi-schemas";
import { OP_FALLBACK } from "@/features/dict-v2/types";

export const MAX_GRAPHS = Math.max(
  1,
  Math.min(16, Number(import.meta.env["VITE_KPI_MAX_GRAPHS"]) || 8),
);
export type Entry = { techno: string; family: string; item: KpiCatalogItem };

/** Partition owned by the API catalog. Labels, codes, families and units never
 * decide an Analytics tab. The Zod contract rejects missing values first. */
export function classifyKpiCatalog(catalog: ProjectKpiCatalog) {
  const pick = (tab: "kpi" | "metrics"): ProjectKpiCatalog => {
    const tree = catalog.tree
      .map((technology) => ({
        ...technology,
        families: technology.families
          .map((family) => ({
            ...family,
            kpis: family.kpis.filter((item) => item.analytics_tab === tab),
          }))
          .filter((family) => family.kpis.length > 0),
      }))
      .filter((technology) => technology.families.length > 0);
    const items = tree.flatMap((technology) =>
      technology.families.flatMap((family) => family.kpis),
    );
    const statuses = [...new Set(items.map((item) => item.status))];
    return {
      ...catalog,
      tree,
      counts_by_status: Object.fromEntries(
        statuses.map((status) => [status, items.filter((item) => item.status === status).length]),
      ),
      counts_by_techno: Object.fromEntries(
        tree.map((technology) => {
          const technologyItems = technology.families.flatMap((family) => family.kpis);
          return [
            technology.techno,
            Object.fromEntries(
              statuses.map((status) => [
                status,
                technologyItems.filter((item) => item.status === status).length,
              ]),
            ),
          ];
        }),
      ),
    };
  };
  return { kpi: pick("kpi"), metrics: pick("metrics") };
}
export type Statistic = "value" | "p10" | "p50" | "p90";
export const STAT_LABELS: Record<Statistic, string> = {
  get value() {
    return i18n.t("kpi.6e8f3132d8e2");
  },
  p10: "P10",
  p50: "P50",
  p90: "P90",
};
export const techLabel = (value: string) =>
  ({ ENDC: "EN-DC", AGGREGATE: i18n.t("kpi.5dcc75c368f9") })[value] ?? value;
export const operatorColor = (operator: string | null | undefined) =>
  OP_FALLBACK[operator ?? ""] ?? "#CBD5E1";
export const numberValue = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
export const textValue = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
export const formatValue = (v: unknown) =>
  numberValue(v)?.toLocaleString(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB", {
    maximumFractionDigits: 3,
  }) ?? "—";
export function catalogEntries(catalog: ProjectKpiCatalog): Entry[] {
  const seen = new Set<string>();
  return catalog.tree.flatMap((t) =>
    t.families.flatMap((f) =>
      f.kpis.flatMap((item) => {
        if (seen.has(item.code)) return [];
        seen.add(item.code);
        return [{ techno: t.techno, family: f.family, item }];
      }),
    ),
  );
}
export function matchesEntry(entry: Entry, needle: string) {
  return [
    entry.techno,
    techLabel(entry.techno),
    entry.family,
    ...Object.values(entry.item).flatMap((v) =>
      typeof v === "string" ? [v] : Array.isArray(v) ? v : [],
    ),
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(needle.trim().toLocaleLowerCase());
}
export function toggleCode(codes: string[], code: string, limit = MAX_GRAPHS): string[] {
  return codes.includes(code)
    ? codes.filter((c) => c !== code)
    : codes.length < limit
      ? [...codes, code]
      : codes;
}
export type FilterKey = Exclude<keyof KpiQueryFilters, "group_by" | "capture_id">;
export type FilterDraft = { values: Partial<Record<FilterKey, string[]>>; enabledGeo: FilterKey[] };
export const GEO_DIMS = [
  { key: "dor", source: "dor", label: "DOR" },
  { key: "dr", source: "dr", label: "DR" },
  {
    key: "plaque",
    source: "plaque",
    get label() {
      return i18n.t("kpi.03d088bb06c0");
    },
  },
  {
    key: "arcep",
    source: "arcep",
    get label() {
      return i18n.t("kpi.5fcd67575ab2");
    },
  },
  {
    key: "commune",
    source: "commune",
    get label() {
      return i18n.t("kpi.eaf0dc2a430e");
    },
  },
  { key: "insee", source: "insee", label: "INSEE" },
] as const;
export const ADVANCED_DIMS = [
  { key: "service_type", source: "service_types", label: "Service" },
  {
    key: "env",
    source: "envs",
    get label() {
      return i18n.t("kpi.8c95c96815f1");
    },
  },
  { key: "phase", source: "phases", label: "Phase" },
  {
    key: "dep",
    source: "deps",
    get label() {
      return i18n.t("kpi.5e4596ae9d83");
    },
  },
] as const;
export const FILTER_DIMS = [
  {
    key: "operator",
    source: "operators",
    get label() {
      return i18n.t("kpi.16602c56b3e8");
    },
  },
  {
    key: "rat",
    source: "rats",
    get label() {
      return i18n.t("kpi.8a5cefc36adb");
    },
  },
  {
    key: "band",
    source: "bands",
    get label() {
      return i18n.t("kpi.39c716cec99a");
    },
  },
  ...GEO_DIMS,
  ...ADVANCED_DIMS,
] as const;
export const URL_KEYS: Record<FilterKey, string> = {
  operator: "op",
  rat: "tech",
  band: "band",
  service_type: "svc",
  env: "env",
  dep: "dep",
  dr: "dr",
  plaque: "plaque",
  dor: "dor",
  arcep: "arcep",
  commune: "commune",
  insee: "insee",
  phase: "phase",
};
export function fromSearch(search: Record<string, unknown>): FilterDraft {
  const values: FilterDraft["values"] = {};
  for (const [key, url] of Object.entries(URL_KEYS))
    if (Array.isArray(search[url]))
      values[key as FilterKey] = (search[url] as unknown[]).filter(
        (v): v is string => typeof v === "string",
      );
  return { values, enabledGeo: GEO_DIMS.filter((d) => values[d.key]?.length).map((d) => d.key) };
}
export function appliedPayload(
  draft: FilterDraft,
  dimensions: ProjectKpiFilters | undefined,
): KpiQueryFilters {
  const result: KpiQueryFilters = {};
  for (const dim of FILTER_DIMS) {
    if (GEO_DIMS.some((g) => g.key === dim.key) && !draft.enabledGeo.includes(dim.key)) continue;
    const supported = dimensions?.[dim.source];
    if (!supported?.available) continue;
    const values = [...new Set(draft.values[dim.key] ?? [])]
      .filter((v) => supported.values?.includes(v))
      .sort();
    if (values.length || (dim.key === "operator" && draft.values.operator !== undefined))
      result[dim.key] = values;
  }
  return result;
}
export function toSearch(filters: KpiQueryFilters) {
  return Object.fromEntries(
    Object.entries(URL_KEYS).map(([key, url]) => [
      url,
      key === "operator"
        ? filters.operator
        : filters[key as FilterKey]?.length
          ? filters[key as FilterKey]
          : undefined,
    ]),
  );
}
export function statistics(data: ProjectKpiDetail): Statistic[] {
  if (data.status !== "AVAILABLE") return [];
  const groups = data.groups ?? [];
  const counter = data.nature.toLocaleLowerCase() === "compteur";
  return (["value", "p10", "p50", "p90"] as Statistic[]).filter(
    (stat) =>
      groups.some(
        (g) =>
          numberValue(g[stat]) != null ||
          (stat === "value" && counter && numberValue(g["n"]) != null),
      ) ||
      numberValue(data[stat]) != null ||
      (stat === "value" &&
        (data.by_operator ?? []).some((g) => numberValue(g.value) != null || counter)),
  );
}
export function chosenStatistic(
  data: ProjectKpiDetail | undefined,
  selected?: Statistic,
): Statistic {
  if (!data) return "value";
  const choices = statistics(data);
  return selected && choices.includes(selected)
    ? selected
    : choices.includes("p50")
      ? "p50"
      : (choices[0] ?? "value");
}
export type AnalyticRow = {
  id: string;
  code: string;
  metric: string;
  techno: string | null;
  operator: string | null;
  band: string | null;
  dor: string | null;
  cell: string | null;
  service: string | null;
  env: string | null;
  statistic: Statistic;
  value: number | null;
  unit: string | null;
  n: number | null;
  result_id: string | null;
  denominator: number | null;
  label: string;
};
/** One source projection for bars, the table and exports. Never join populations of different KPI. */
export function analyticRows(data: ProjectKpiDetail, statistic: Statistic): AnalyticRow[] {
  if (data.status !== "AVAILABLE") return [];
  const counter = data.nature.toLocaleLowerCase() === "compteur";
  const rowValue = (g: Record<string, unknown>) => {
    if (g["status"] && !["AVAILABLE", "PRESENT"].includes(String(g["status"]))) return null;
    // A count of observations is not evidence for a ratio denominator.
    if (
      data.unit === "%" &&
      !(data.nature === i18n.t("kpi.423fa6ca66e2") && data.source?.startsWith("nmf_decoder ")) &&
      !(numberValue(g["denominator"])! > 0)
    )
      return null;
    return (
      numberValue(g[statistic]) ?? (statistic === "value" && counter ? numberValue(g["n"]) : null)
    );
  };
  let groups: Record<string, unknown>[] = data.groups ?? [];
  if (!groups.some((g) => rowValue(g) != null)) {
    const byOperator = data.by_operator ?? [];
    if (statistic === "value" && byOperator.some((g) => rowValue(g) != null)) groups = byOperator;
    else if (numberValue(data[statistic]) != null)
      groups = [{ [statistic]: data[statistic], n: data.n, denominator: data["denominator"] }];
  }
  return groups.map((g, index) => {
    const operator = textValue(g["operator"]),
      band = textValue(g["band"]),
      dor = textValue(g["dor"]);
    return {
      id: `${data.code}:${JSON.stringify([operator, band, dor, index])}`,
      code: data.code,
      metric: data.name,
      techno: textValue(data.techno),
      operator,
      band,
      dor,
      cell: textValue(g["ecgi"]) ?? textValue(g["cell"]),
      service: textValue(g["service_type"]),
      env: textValue(g["env"]),
      statistic,
      value: rowValue(g),
      unit: data.unit,
      n: numberValue(g["n"]),
      result_id: textValue(g["result_id"]) ?? textValue(data["result_id"]),
      denominator: numberValue(g["denominator"]),
      label:
        [operator, band, dor].filter(Boolean).join(" · ") ||
        (groups.length === 1 ? i18n.t("kpi.f6306ab41d27") : i18n.t("kpi.51d3aaf58c26")),
    };
  });
}
export const CSV_HEADERS = [
  "code",
  "metric",
  "techno",
  "operator",
  "band",
  "dor",
  "cell",
  "service",
  "env",
  "statistic",
  "value",
  "unit",
  "n",
  "denominator",
  "result_id",
] as const;
export function csvText(rows: AnalyticRow[]) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    CSV_HEADERS.join(","),
    ...rows.map((row) => CSV_HEADERS.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
}
export function exportRows(rows: AnalyticRow[], name = "bc4-kpi") {
  downloadCsv(csvText(rows), name);
}
export function downloadCsv(text: string, name: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.csv`;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
