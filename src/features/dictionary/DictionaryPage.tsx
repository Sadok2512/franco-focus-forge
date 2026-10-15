import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  Download,
  FileText,
  Folder,
  Info,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { Chart } from "@/components/bc4/Chart";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { DictFilters } from "@/lib/api/client";
import type { Operator } from "@/lib/api/schemas";
import type { DictTreeMessage, ParamRow } from "@/lib/api/dictionary-schemas";
import type { Map as MlMap } from "maplibre-gl";
import { PROJECTS_CENTER } from "./center";
import { chartDistribution, chartMeasure, CHART_TYPE_LABELS, COLOR_LABELS, type ChartType, type ColorBy } from "./chart-data";
import {
  EMPTY_SELECTION,
  dictQ,
  downloadCsv,
  errMsg,
  fmtInt,
  fmtNum,
  fmtShare,
  leafOf,
  type Selection,
} from "./shared";
import {
  GROUP_LABELS,
  groupDistribution,
  measureOf,
  type GroupBy,
  type Grouped,
  type Measure,
} from "./grouping";

type Techno = "LTE" | "NR" | "LTE+NR";
const MEASURE_LABELS: Record<Measure, string> = {
  count: "Occurrences",
  pct_total: "% de la population filtrée",
  pct_group: "% au sein du groupe",
};
/** Au-delà, on bascule en petits multiples (une vignette par opérateur). */
const MAX_SERIES = 8;

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const OP_VAR: Record<string, string> = {
  Orange: "--op-orange",
  SFR: "--op-sfr",
  Bouygues: "--op-bouygues",
  Free: "--op-free",
};
function seriesColor(op: string | undefined, i: number) {
  const token = op ? OP_VAR[op] : undefined;
  if (token) return cssVar(token);
  return cssVar(`--chart-${(i % 5) + 1}`) || cssVar("--primary");
}

function useWidth() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Panel({
  title,
  icon,
  actions,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={`panel flex min-h-0 flex-col overflow-hidden ${className}`}>
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold">
          {icon}
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

function Seg<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-7 overflow-hidden rounded-md border">
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`px-2.5 text-xs font-medium ${value === o.v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SelectBox<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  label: string;
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  title?: string | undefined;
}) {
  return (
    <select
      aria-label={label}
      title={title}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-7 rounded-md border bg-card px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------------------------------------- */
/* Arbre ASN.1                                                       */
/* ---------------------------------------------------------------- */

function Tree({
  projectId,
  filters,
  techno,
  sel,
  onPick,
}: {
  projectId: string;
  filters: DictFilters;
  techno: Techno;
  sel: Selection;
  onPick: (s: Selection) => void;
}) {
  const tree = useQuery(dictQ.tree(projectId, filters));
  const [open, setOpen] = useState<Set<string>>(() => new Set(["LTE", "NR"]));
  const [q, setQ] = useState("");
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Ouvre automatiquement le message contenant la sélection (état conservé ensuite).
  useEffect(() => {
    if (sel.system && sel.message)
      setOpen((s) => new Set([...s, sel.system!, `m:${sel.system}:${sel.message}`]));
  }, [sel.system, sel.message]);

  const body = tree.isPending ? (
    <div className="space-y-1.5 p-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <LoadingSkeleton key={i} className="h-5" />
      ))}
    </div>
  ) : tree.isError ? (
    <ErrorState message={errMsg(tree.error)} onRetry={() => tree.refetch()} />
  ) : (
    <ul role="tree" aria-label="Arbre ASN.1 des paramètres RRC" className="p-1.5 text-[12.5px]">
      {tree.data.branches
        .filter((b) => techno === "LTE+NR" || b.system === techno)
        .map((branch) => {
          const needle = q.trim().toLowerCase();
          const messages = needle
            ? branch.messages
                .map((m) => ({
                  ...m,
                  params: m.params.filter((p) => p.param.toLowerCase().includes(needle)),
                }))
                .filter((m) => m.params.length || m.message.toLowerCase().includes(needle))
            : branch.messages;
          const branchOpen = open.has(branch.system) || !!needle;
          return (
            <li key={branch.system} role="none">
              <button
                role="treeitem"
                aria-expanded={branchOpen}
                aria-level={1}
                onClick={() => toggle(branch.system)}
                className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left font-semibold hover:bg-muted"
              >
                {branchOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Folder className="h-3.5 w-3.5 text-primary" />
                {branch.system}
                <span className="ml-auto font-mono text-[10px] font-normal text-muted-foreground">
                  {fmtInt(branch.count)}
                </span>
              </button>
              {branchOpen && (
                <ul role="group" className="ml-3">
                  {branch.messages.length === 0 && (
                    <li role="none" className="py-1 pl-5 pr-2 text-[11px] italic text-muted-foreground">
                      Aucune donnée {branch.system} dans ce projet avec les filtres actifs
                    </li>
                  )}
                  {messages.map((m) => (
                    <TreeMessage
                      key={m.message}
                      system={branch.system}
                      message={m}
                      sel={sel}
                      open={open.has(`m:${branch.system}:${m.message}`) || !!needle}
                      toggle={toggle}
                      onPick={onPick}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
    </ul>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un paramètre…"
            aria-label="Rechercher un paramètre dans l'arbre"
            className="h-8 w-full rounded-md border bg-card pl-7 pr-2 text-xs"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </div>
  );
}

function TreeMessage({
  system,
  message,
  sel,
  open,
  toggle,
  onPick,
}: {
  system: "LTE" | "NR";
  message: DictTreeMessage;
  sel: Selection;
  open: boolean;
  toggle: (k: string) => void;
  onPick: (s: Selection) => void;
}) {
  const key = `m:${system}:${message.message}`;
  return (
    <li role="none">
      <button
        role="treeitem"
        aria-level={2}
        aria-expanded={open}
        onClick={() => toggle(key)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-muted"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="min-w-0 truncate">{message.message}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{fmtInt(message.count)}</span>
      </button>
      {open && (
        <ul role="group" className="ml-4 border-l pl-1">
          {message.params.length === 0 ? (
            <li role="none" className="py-1 pl-3 pr-2 text-[11px] italic text-muted-foreground">
              Aucun paramètre ingéré pour ce message
            </li>
          ) : (
            message.params.map((p) => {
              const selected = sel.system === system && sel.message === message.message && sel.path === p.param;
              return (
                <li key={p.param} role="none">
                  <button
                    role="treeitem"
                    aria-selected={selected}
                    aria-level={3}
                    title={p.param}
                    onClick={() => onPick({ system, message: message.message, path: p.param })}
                    className={`flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left ${selected ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted"}`}
                  >
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{leafOf(p.param)}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{fmtInt(p.count)}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- */
/* Infos techniques (à la demande)                                   */
/* ---------------------------------------------------------------- */

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* presse-papiers refusé */
        }
      }}
      className="shrink-0 rounded p-0.5 text-primary hover:bg-muted"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function InfoPanel({ row }: { row: ParamRow }) {
  const nd = <span className="text-muted-foreground">N/D</span>;
  const conv = row.value_converted_dominant;
  const items: [string, ReactNode][] = [
    ["Système", row.system],
    ["Message", <span className="font-mono">{row.message}</span>],
    [
      "Chemin ASN.1",
      <span className="flex items-start gap-1.5">
        <code className="min-w-0 break-all font-mono text-[11px]">{row.path}</code>
        <CopyButton text={row.path} label="Copier le chemin ASN.1" />
      </span>,
    ],
    ["Type ASN.1", row.type ? <span className="font-mono">{row.type}</span> : nd],
    ["Référence 3GPP", row.conversion_rule?.ref ?? nd],
    [
      "Valeur brute dominante",
      row.value_raw_dominant == null ? nd : <span className="font-mono">{String(row.value_raw_dominant)}</span>,
    ],
    [
      "Valeur convertie dominante",
      conv == null || !row.conversion_rule ? (
        nd
      ) : (
        <span className="font-mono font-semibold text-primary">
          {typeof conv === "number" ? fmtNum(conv, row.conversion_rule.decimals) : conv} {row.unit_converted ?? ""}
        </span>
      ),
    ],
    ["Part dominante", fmtShare(row.share_dominant)],
    [
      "Règle de conversion",
      row.conversion_rule ? (
        <span className="font-mono">{row.conversion_rule.formula}</span>
      ) : (
        <span className="text-muted-foreground">Aucune règle validée fournie par l'API — valeurs brutes</span>
      ),
    ],
    ["Occurrences (filtres actifs)", fmtInt(row.count)],
  ];
  return (
    <Panel title={leafOf(row.path)} icon={<Info className="h-4 w-4" />} className="h-full">
      <p className="px-3 pt-2 text-xs text-muted-foreground">Informations techniques du paramètre</p>
      <dl className="divide-y px-3 pb-2 text-[12.5px]">
        {items.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)] gap-2 py-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
/* Histogramme                                                       */
/* ---------------------------------------------------------------- */

function unitLabel(row: ParamRow, g: Grouped) {
  return g.isEnum ? "Valeur ASN.1 brute" : `Valeur${row.unit_converted ? ` (${row.unit_converted})` : ""}`;
}


function HistogramChart({
  row,
  g,
  series,
  measure,
  chartType,
  colorBy,
  highlight,
  title,
  height,
}: {
  row: ParamRow;
  g: Grouped;
  series: Grouped["series"];
  measure: Measure;
  chartType: ChartType;
  colorBy: ColorBy;
  highlight: string | null;
  title: string;
  height: number;
}) {
  const hiIdx = highlight == null ? -1 : g.bins.findIndex((b) => b.raw === highlight);
  const color = useCallback((s: Grouped["series"][number], si: number, binIndex: number) => {
    const bands = [...new Set(g.series.flatMap((item) => item.band ? [item.band] : []))].sort();
    return colorBy === "value" ? seriesColor(undefined, binIndex)
      : colorBy === "band" ? seriesColor(undefined, Math.max(0, bands.indexOf(s.band ?? "")))
        : seriesColor(s.operator, si);
  }, [g, colorBy]);
  const build = useCallback(
    (c: { fg: string; muted: string; border: string }) => ({
      grid: { left: 52, right: 12, top: 16, bottom: colorBy !== "value" && series.length > 1 ? 75 : 50 },
      ...(colorBy !== "value" && series.length > 1
        ? { legend: { type: "scroll" as const, bottom: 0, icon: "circle", itemWidth: 9, textStyle: { color: c.fg, fontSize: 11 } } }
        : {}),
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "line" as const, lineStyle: { color: c.border }, z: 0 },
        formatter: (raw: unknown) => {
          const ps = raw as { seriesIndex: number; dataIndex: number; marker: string }[];
          const i = ps[0]?.dataIndex ?? 0;
          const bin = g.bins[i];
          if (!bin) return "";
          const lines = ps.map((p) => {
            const s = series[p.seriesIndex];
            if (!s) return "";
            const n = s.counts[i] ?? 0;
            const share = s.total ? ((n / s.total) * 100).toFixed(1) : "N/D";
            return `${p.marker}${s.key === "Total" ? "Total" : s.key} : <b>${fmtInt(n)}</b> (${share} % du groupe, n=${fmtInt(s.total)})`;
          });
          return `<b>${bin.label}${!g.isEnum && row.unit_converted ? " " + row.unit_converted : ""}</b> <span style="opacity:.6">(brut ${bin.raw})</span><br/>${lines.join("<br/>")}<br/><span style="opacity:.6">Population filtrée : ${fmtInt(g.population)}</span>`;
        },
      },
      xAxis: {
        type: "category" as const,
        data: g.bins.map((b) => b.label),
        name: unitLabel(row, g),
        nameLocation: "middle" as const,
        nameGap: 28,
        nameTextStyle: { color: c.fg, fontSize: 11 },
        axisLabel: { color: c.muted, fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: c.border } },
      },
      yAxis: {
        type: "value" as const,
        name: chartType === "stacked100" || measure !== "count" ? "%" : "Occurrences",
        ...(chartType === "stacked100" ? { max: 100 } : {}),
        nameTextStyle: { color: c.muted, fontSize: 10 },
        axisLabel: { color: c.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: c.border } },
      },
      series: series.map((s, si) => ({
        type: "bar" as const,
        name: colorBy === "band" ? (s.band ?? s.key) : colorBy === "operator" ? (s.operator ?? s.key) : s.key,
        barMaxWidth: chartType === "grouped" ? 22 : 36,
        ...(chartType !== "grouped" ? { stack: "total" } : {}),
        itemStyle: { color: color(s, si, 0) },
        data: s.counts.map((n, i) => ({
          value: chartMeasure(n, i, series, chartType, measure, g.population, s.total),
          itemStyle: { color: color(s, si, i), opacity: hiIdx >= 0 && i !== hiIdx ? 0.25 : 1 },
        })),
      })),
    }),
    [row, g, series, measure, chartType, colorBy, color, hiIdx],
  );
  return <Chart title={title} subtitle={`Mesure : ${chartType === "stacked100" ? "% par valeur" : MEASURE_LABELS[measure]} · Couleurs : ${COLOR_LABELS[colorBy]}`} exportName={`distribution_${leafOf(row.path)}`} build={build} height={height} />;
}

function Histogram({
  row,
  g,
  groupBy,
  measure,
  chartType,
  colorBy,
  highlight,
}: {
  row: ParamRow;
  g: Grouped;
  groupBy: GroupBy;
  measure: Measure;
  chartType: ChartType;
  colorBy: ColorBy;
  highlight: string | null;
}) {
  if (groupBy === "operator_band" && g.series.length > MAX_SERIES) {
    const ops = [...new Set(g.series.map((s) => s.operator ?? ""))];
    return (
      <div className="grid gap-2 md:grid-cols-2">
        {ops.map((op) => (
          <HistogramChart
            key={op}
            row={row}
            g={g}
            series={g.series.filter((s) => s.operator === op)}
            measure={measure}
            chartType={chartType}
      colorBy={colorBy}
            highlight={highlight}
            title={`Distribution des valeurs — ${op} (par bande)`}
            height={220}
          />
        ))}
      </div>
    );
  }
  return (
    <HistogramChart
      row={row}
      g={g}
      series={g.series}
      measure={measure}
      chartType={chartType}
      colorBy={colorBy}
      highlight={highlight}
      title="Distribution des valeurs"
      height={300}
    />
  );
}

/* ---------------------------------------------------------------- */
/* Table détaillée                                                   */
/* ---------------------------------------------------------------- */

type SortKey = "value" | "total";

function ValuesTable({
  row,
  g,
  measure,
  highlight,
  onHighlight,
}: {
  row: ParamRow;
  g: Grouped;
  measure: Measure;
  highlight: string | null;
  onHighlight: (raw: string | null) => void;
}) {
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "total", desc: true });
  const [q, setQ] = useState("");
  const grouped = g.series.length > 1 || g.series[0]?.key !== "Total";
  const rows = useMemo(() => {
    const list = g.bins.map((b, i) => ({ b, i }));
    const filteredList = q ? list.filter(({ b }) => `${b.label} ${b.raw}`.toLowerCase().includes(q.toLowerCase())) : list;
    if (sort.k === "total") filteredList.sort((a, b) => (sort.desc ? b.b.total - a.b.total : a.b.total - b.b.total));
    else if (sort.desc) filteredList.reverse();
    return filteredList;
  }, [g, q, sort]);
  const max = Math.max(1, ...g.bins.map((b) => b.total));
  const unit = !g.isEnum && row.unit_converted ? ` (${row.unit_converted})` : "";
  const fmtCell = (n: number, groupTotal: number) => {
    const v = measureOf(n, measure, g.population, groupTotal);
    if (v == null) return "N/D";
    return measure === "count" ? fmtInt(v) : `${fmtNum(v, 1)} %`;
  };
  const exportCsv = () =>
    downloadCsv(`valeurs_${leafOf(row.path)}`, [
      [`# Paramètre : ${row.path} — mesure : ${MEASURE_LABELS[measure]} — population filtrée : ${g.population}`],
      ["valeur_brute", `valeur${unit}`, "total", ...g.series.filter(() => grouped).map((s) => s.key), "pct_total"],
      ...g.bins.map((b, i) => [
        b.raw,
        b.label,
        b.total,
        ...g.series.filter(() => grouped).map((s) => s.counts[i]!),
        g.population ? ((b.total / g.population) * 100).toFixed(2) : "N/D",
      ]),
    ]);
  const th = "sticky top-0 z-[1] bg-muted px-2 py-1.5 text-left text-[11px] font-semibold whitespace-nowrap";
  const sortBtn = (k: SortKey, label: string) => (
    <button
      onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k === "total" }))}
      className="inline-flex items-center gap-1 hover:text-primary"
      aria-label={`Trier par ${label}`}
    >
      {label}
      {sort.k === k && <span aria-hidden>{sort.desc ? "↓" : "↑"}</span>}
    </button>
  );
  return (
    <Panel
      title="Détail des valeurs"
      actions={
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrer une valeur…"
            aria-label="Filtrer les valeurs du tableau"
            className="h-7 w-36 rounded-md border bg-card px-2 text-xs"
          />
          <button onClick={exportCsv} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted">
            <Download className="h-3.5 w-3.5" /> Exporter CSV
          </button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px] tabular-nums">
          <thead>
            <tr>
              <th className={th}>#</th>
              <th className={th}>{sortBtn("value", `Valeur${unit}`)}</th>
              {!g.isEnum && <th className={th}>Brut</th>}
              <th className={`${th} text-right`}>{sortBtn("total", "Total")}</th>
              {grouped && g.series.map((s) => <th key={s.key} className={`${th} text-right`}>{s.key}</th>)}
              <th className={`${th} text-right`}>% du total</th>
              <th className={`${th} w-32`} aria-label="Part visuelle" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, i }, n) => {
              const pct = g.population ? (b.total / g.population) * 100 : null;
              const active = highlight === b.raw;
              return (
                <tr
                  key={b.raw}
                  tabIndex={0}
                  aria-selected={active}
                  onClick={() => onHighlight(active ? null : b.raw)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onHighlight(active ? null : b.raw);
                    }
                  }}
                  className={`cursor-pointer border-b outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-accent" : "hover:bg-muted/60"}`}
                >
                  <td className="px-2 py-1 text-muted-foreground">{n + 1}</td>
                  <td className="px-2 py-1 font-mono font-semibold">{b.label}</td>
                  {!g.isEnum && <td className="px-2 py-1 font-mono text-muted-foreground">{b.raw}</td>}
                  <td className="px-2 py-1 text-right font-semibold">{fmtInt(b.total)}</td>
                  {grouped && g.series.map((s) => <td key={s.key} className="px-2 py-1 text-right">{fmtCell(s.counts[i]!, s.total)}</td>)}
                  <td className="px-2 py-1 text-right">{pct == null ? "N/D" : `${fmtNum(pct, 1)} %`}</td>
                  <td className="px-2 py-1">
                    <div className="h-2 rounded bg-muted">
                      <div className="h-2 rounded bg-primary" style={{ width: `${(b.total / max) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-2 py-1.5" colSpan={g.isEnum ? 2 : 3}>
                Total (population filtrée)
              </td>
              <td className="px-2 py-1.5 text-right">{fmtInt(g.population)}</td>
              {grouped && g.series.map((s) => <td key={s.key} className="px-2 py-1.5 text-right">{fmtInt(s.total)}</td>)}
              <td className="px-2 py-1.5 text-right">{g.population ? "100,0 %" : "N/D"}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {measure === "pct_group" && grouped && (
        <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
          Colonnes de groupe en % du total de chaque groupe (dénominateur = ligne Total).
        </p>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
/* Carte                                                             */
/* ---------------------------------------------------------------- */

type MapPointLike = {
  lat: number;
  lon: number;
  value_raw: string | number | null;
  value_converted: string | number | null;
  operator: string | null;
  band: string | null;
};
const MAP_PALETTE = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];

function OccurrenceMap({
  points,
  center,
  unit,
  highlight,
}: {
  points: MapPointLike[];
  center: [number, number];
  unit: string | null;
  highlight: string | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [full, setFull] = useState(false);

  const { geo, legend } = useMemo(() => {
    const palette = MAP_PALETTE.map((v) => cssVar(v) || "gray");
    const nums = points.map((p) => Number(p.value_converted)).filter((v) => Number.isFinite(v));
    const numeric = nums.length === points.length && nums.length > 0;
    const min = numeric ? Math.min(...nums) : 0;
    const max = numeric ? Math.max(...nums) : 1;
    const cats = numeric ? [] : [...new Set(points.map((p) => String(p.value_converted ?? p.value_raw ?? "N/D")))];
    const colorOf = (p: MapPointLike) => {
      if (numeric) {
        const v = Number(p.value_converted);
        const t = max === min ? 0.5 : (v - min) / (max - min);
        return palette[Math.min(palette.length - 1, Math.floor(t * palette.length))]!;
      }
      return palette[cats.indexOf(String(p.value_converted ?? p.value_raw ?? "N/D")) % palette.length]!;
    };
    const legend = numeric
      ? palette.map((c, i) => {
          const a = min + ((max - min) * i) / palette.length;
          return { c, l: `≥ ${fmtNum(a, 1)}${unit ? " " + unit : ""}` };
        })
      : cats.slice(0, 5).map((l, i) => ({ c: palette[i % palette.length]!, l }));
    return {
      legend,
      geo: {
        type: "FeatureCollection" as const,
        features: points
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
          .map((p) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] as [number, number] },
            properties: {
              color: colorOf(p),
              raw: p.value_raw == null ? "N/D" : String(p.value_raw),
              display: p.value_converted == null ? "N/D" : `${p.value_converted}${unit ? " " + unit : ""}`,
              op: p.operator ?? "N/D",
              band: p.band ?? "N/D",
            },
          })),
      },
    };
  }, [points, unit]);

  const fit = () => {
    if (!map.current || !geo.features.length) return;
    const xs = geo.features.map((f) => f.geometry.coordinates[0]);
    const ys = geo.features.map((f) => f.geometry.coordinates[1]);
    map.current.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: 30, duration: 0 },
    );
  };

  useEffect(() => {
    if (!points.length) return;
    let cancelled = false;
    Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]).then(([ml, worker]) => {
      if (cancelled || !el.current) return;
      ml.setWorkerUrl(worker.default);
      const m = new ml.Map({
        container: el.current,
        center,
        zoom: 10,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6, "raster-opacity": 0.9 } }],
        },
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => {
        if (String(e.error?.message ?? "").match(/tile|fetch|Failed|load/i)) setTileError(true);
      });
      m.on("load", () => {
        m.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "pts",
          type: "circle",
          source: "pts",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 7],
            "circle-color": ["get", "color"],
            "circle-stroke-width": 0.6,
            "circle-stroke-color": "rgba(20,34,53,0.5)",
          },
        });
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
        m.on("mousemove", "pts", (e) => {
          m.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (p)
            popup
              .setLngLat(e.lngLat)
              .setHTML(`<div style="font:12px Inter"><b>${p["op"]}</b> · ${p["band"]}<br/>Valeur : ${p["display"]} <span style="opacity:.6">(brut ${p["raw"]})</span></div>`)
              .addTo(m);
        });
        m.on("mouseleave", "pts", () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });
        setReady(true);
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], points.length > 0]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource("pts") as { setData: (d: unknown) => void } | undefined)?.setData(geo);
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.setPaintProperty(
      "pts",
      "circle-opacity",
      highlight == null ? 0.9 : ["case", ["==", ["get", "raw"], highlight], 1, 0.12],
    );
    map.current.setPaintProperty(
      "pts",
      "circle-stroke-opacity",
      highlight == null ? 1 : ["case", ["==", ["get", "raw"], highlight], 1, 0.1],
    );
  }, [highlight, ready]);

  useEffect(() => {
    setTimeout(() => {
      map.current?.resize();
      fit();
    }, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  if (!points.length)
    return (
      <EmptyState title="Aucune position GPS">
        Aucune coordonnée GPS n'est associée à ces observations. Aucune position n'est inventée.
      </EmptyState>
    );
  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className={`relative min-h-[260px] flex-1 overflow-hidden rounded-md border ${full ? "fixed inset-4 z-50 shadow-2xl" : ""}`}>
        <div ref={el} className="h-full w-full bg-muted" role="region" aria-label={`Carte, ${points.length} points`} />
        <div className="absolute right-12 top-2.5 z-10 flex gap-1">
          <button onClick={fit} aria-label="Recentrer sur les données" className="panel p-1.5 shadow">
            <Crosshair className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setFull((f) => !f)} aria-label={full ? "Quitter plein écran" : "Carte plein écran"} className="panel p-1.5 shadow">
            {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
        {tileError && (
          <div role="status" className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md bg-warning px-2 py-1 text-[11px] text-warning-foreground">
            <AlertTriangle className="h-3 w-3" /> Fond de carte indisponible — points affichés sans tuiles.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {legend.map((x) => (
          <span key={x.l} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.c }} />
            {x.l}
          </span>
        ))}
        <span className="ml-auto text-muted-foreground">{fmtInt(points.length)} points</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Barre d'outils unique                                             */
/* ---------------------------------------------------------------- */

type Draft = { techno: Techno; op: string[]; band: string[] };

function Toolbar({
  draft,
  setDraft,
  operators,
  bands,
  period,
  geoLabel,
  groupBy,
  setGroupBy,
  measure,
  setMeasure,
  chartType,
  colorBy,
  setChartType,
  setColorBy,
  showMap,
  infoOpen,
  setInfoOpen,
  setShowMap,
  dirty,
  onApply,
  onReset,
  groupingSupported,
  compact,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  operators: string[];
  bands: string[];
  period: string | null;
  geoLabel: string | null;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  measure: Measure;
  setMeasure: (m: Measure) => void;
  chartType: ChartType;
  colorBy: ColorBy;
  setChartType: (t: ChartType) => void;
  setColorBy: (v: ColorBy) => void;
  showMap: boolean;
  infoOpen: boolean;
  setInfoOpen: (v: boolean) => void;
  setShowMap: (b: boolean) => void;
  dirty: boolean;
  onApply: () => void;
  onReset: () => void;
  groupingSupported: boolean;
  compact: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const secondary = (
    <>
      <Labeled label="Zone géographique">
        <SelectBox
          label="Zone géographique"
          value="all"
          disabled
          title="Filtre géographique non pris en charge par l'API du dictionnaire (référentiel cellules vide)"
          options={[{ v: "all", l: geoLabel ? `${geoLabel} (toutes)` : "Toutes" }]}
          onChange={() => {}}
        />
      </Labeled>
      <Labeled label="Période">
        <span className="inline-flex h-7 items-center rounded-md border bg-muted/40 px-2 text-xs" title="Période du projet (filtre par période non pris en charge par l'API)">
          {period ?? "N/D"}
        </span>
      </Labeled>
    </>
  );
  return (
    <div className="panel flex flex-wrap items-end gap-x-3 gap-y-2 px-3 py-2">
      <Labeled label="Technologie">
        <Seg
          label="Technologie"
          value={draft.techno}
          onChange={(t) => setDraft({ ...draft, techno: t })}
          options={[
            { v: "LTE", l: "LTE" },
            { v: "NR", l: "NR" },
            { v: "LTE+NR", l: "LTE + NR" },
          ]}
        />
      </Labeled>
      <Labeled label="Opérateur">
        <MultiSelect label="Opérateur" options={operators} value={draft.op} onChange={(v) => setDraft({ ...draft, op: v })} />
      </Labeled>
      <Labeled label="Bande">
        <MultiSelect label="Bande" options={bands} value={draft.band} onChange={(v) => setDraft({ ...draft, band: v })} />
      </Labeled>
      {compact ? (
        <button onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Plus de filtres
        </button>
      ) : (
        secondary
      )}
      <Labeled label="Regrouper par">
        <SelectBox
          label="Regrouper par"
          value={groupingSupported ? groupBy : "none"}
          disabled={!groupingSupported}
          title={groupingSupported ? undefined : "L'API ne fournit pas le détail par opérateur/bande pour ce paramètre"}
          onChange={setGroupBy}
          options={(Object.keys(GROUP_LABELS) as GroupBy[]).map((v) => ({ v, l: GROUP_LABELS[v] }))}
        />
      </Labeled>
      <Labeled label="Type">
        <SelectBox
          label="Type de graphique"
          value={chartType}
          onChange={setChartType}
          options={(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((v) => ({ v, l: CHART_TYPE_LABELS[v] }))}
        />
      </Labeled>
      <Labeled label="Colorer par">
        <SelectBox
          label="Colorer par"
          value={colorBy}
          onChange={setColorBy}
          options={(Object.keys(COLOR_LABELS) as ColorBy[]).map((v) => ({ v, l: COLOR_LABELS[v] }))}
        />
      </Labeled>
      <Labeled label="Afficher">
        <SelectBox
          label="Mesure affichée"
          value={measure}
          onChange={setMeasure}
          options={(Object.keys(MEASURE_LABELS) as Measure[]).map((v) => ({ v, l: MEASURE_LABELS[v] }))}
        />
      </Labeled>
      <button
        role="switch"
        aria-checked={infoOpen}
        onClick={() => setInfoOpen(!infoOpen)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${infoOpen ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted"}`}
      >
        <Info className="h-3.5 w-3.5" /> Infos
        <span className={`ml-1 inline-block h-3.5 w-6 rounded-full p-0.5 ${infoOpen ? "bg-primary" : "bg-muted-foreground/40"}`}>
          <span className={`block h-2.5 w-2.5 rounded-full bg-card transition-transform ${infoOpen ? "translate-x-2.5" : ""}`} />
        </span>
      </button>
      <button
        role="switch"
        aria-checked={showMap}
        onClick={() => setShowMap(!showMap)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${showMap ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted"}`}
      >
        <MapIcon className="h-3.5 w-3.5" /> Carte
        <span className={`ml-1 inline-block h-3.5 w-6 rounded-full p-0.5 ${showMap ? "bg-primary" : "bg-muted-foreground/40"}`}>
          <span className={`block h-2.5 w-2.5 rounded-full bg-card transition-transform ${showMap ? "translate-x-2.5" : ""}`} />
        </span>
      </button>
      <div className="ml-auto flex gap-2">
        <button
          onClick={onApply}
          disabled={!dirty}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Appliquer
        </button>
        <button onClick={onReset} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold text-primary hover:bg-muted">
          <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
        </button>
      </div>
      {compact && advanced && <div className="flex w-full flex-wrap gap-3 border-t pt-2">{secondary}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

export function DictionaryPage({
  projectId,
  filters,
  setFilters,
}: {
  projectId: string;
  filters: DictFilters;
  setFilters: (p: Partial<DictFilters>) => void;
}) {
  const width = useWidth();
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);
  const [techno, setTechno] = useState<Techno>("LTE+NR");
  const [draft, setDraft] = useState<Draft>({ techno: "LTE+NR", op: filters.op ?? [], band: filters.band ?? [] });
  const [groupBy, setGroupBy] = useState<GroupBy>("operator");
  const [measure, setMeasure] = useState<Measure>("count");
  const [chartType, setChartType] = useState<ChartType>("grouped");
  const [colorBy, setColorBy] = useState<ColorBy>("operator");
  const [showMap, setShowMap] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);

  useEffect(() => setSel(EMPTY_SELECTION), [projectId]);
  useEffect(() => setHighlight(null), [sel.path]);
  useEffect(() => {
    setDraft((d) => ({ ...d, op: filters.op ?? [], band: filters.band ?? [] }));
  }, [filters.op, filters.band]);

  const proj = useQuery(dictQ.project(projectId));
  const dims = proj.data?.dimensions;

  const paramsQ = useQuery({
    ...dictQ.params(projectId, sel.system ?? "LTE", sel.message ?? "", filters),
    enabled: !!sel.system && !!sel.message,
  });
  const row: ParamRow | null = useMemo(
    () => (sel.path && paramsQ.data ? (paramsQ.data.params.find((p) => p.path === sel.path) ?? null) : null),
    [paramsQ.data, sel.path],
  );
  const mapQ = useQuery({
    ...dictQ.map(projectId, sel.path ?? "", sel.system ?? "LTE", filters),
    enabled: showMap && !!sel.path && !!sel.system,
  });
  const g = useMemo(() => (row ? groupDistribution(row, groupBy) : null), [row, groupBy]);

  const chartG = useMemo(() => row ? chartDistribution(row, groupBy, colorBy) : null, [row, groupBy, colorBy]);

  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const dirty = draft.techno !== techno || !same(draft.op, filters.op ?? []) || !same(draft.band, filters.band ?? []);
  const apply = () => {
    setTechno(draft.techno);
    setFilters({ op: draft.op as Operator[], band: draft.band });
  };
  const reset = () => {
    setDraft({ techno: "LTE+NR", op: [], band: [] });
    setTechno("LTE+NR");
    setGroupBy("operator");
    setColorBy("operator");
    setChartType("grouped");
    setMeasure("count");
    setShowMap(false);
    setFilters({ op: undefined, band: undefined, dr: undefined, plaque: undefined, arcep: undefined });
  };

  const compact = width < 1100;
  const systemHidden = sel.system && techno !== "LTE+NR" && sel.system !== techno;

  const toolbar = (
    <Toolbar
      draft={draft}
      setDraft={setDraft}
      operators={dims?.operators ?? []}
      bands={dims?.bands ?? []}
      period={dims?.periods[0]?.replace("/", " → ") ?? null}
      geoLabel={dims?.geo_tree[0]?.label ?? null}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      measure={measure}
      setMeasure={setMeasure}
      chartType={chartType}
      colorBy={colorBy}
      setChartType={setChartType}
      setColorBy={setColorBy}
      showMap={showMap}
      infoOpen={infoOpen}
      setInfoOpen={setInfoOpen}
      setShowMap={setShowMap}
      dirty={dirty}
      onApply={apply}
      onReset={reset}
      groupingSupported={g ? g.groupingSupported : true}
      compact={compact}
    />
  );

  const treeNode = (
    <Tree
      projectId={projectId}
      filters={filters}
      techno={techno}
      sel={sel}
      onPick={(s) => {
        setSel(s);
        setTreeOpen(false);
      }}
    />
  );

  const analysis = !sel.path ? (
    <div className="panel h-full">
      <EmptyState title="Sélectionnez un paramètre">
        Choisissez un paramètre dans l'arbre ASN.1 pour afficher sa distribution et le détail des valeurs.
      </EmptyState>
    </div>
  ) : systemHidden ? (
    <div className="panel h-full">
      <EmptyState title={`Paramètre ${sel.system} masqué`}>
        Le paramètre sélectionné appartient à {sel.system}, exclu par le filtre Technologie « {techno} ». Repassez en {sel.system} ou LTE + NR pour l'afficher.
      </EmptyState>
    </div>
  ) : paramsQ.isPending ? (
    <div className="flex flex-col gap-2">
      <LoadingSkeleton className="h-[340px]" />
      <LoadingSkeleton className="h-[260px]" />
    </div>
  ) : paramsQ.isError ? (
    <div className="panel">
      <ErrorState message={errMsg(paramsQ.error)} onRetry={() => paramsQ.refetch()} />
    </div>
  ) : !row || !g ? (
    <div className="panel">
      <EmptyState title="Paramètre indisponible">
        L'API ne renvoie plus « {leafOf(sel.path)} » avec les filtres actifs. Ajustez les filtres pour le retrouver.
      </EmptyState>
    </div>
  ) : g.population === 0 ? (
    <div className="panel">
      <EmptyState title="Aucune valeur observée">Aucune occurrence pour ce paramètre avec les filtres actifs.</EmptyState>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Histogram row={row} g={chartG ?? g} groupBy={groupBy} measure={measure} chartType={chartType} colorBy={colorBy} highlight={highlight} />
      </div>
      {!g.groupingSupported && groupBy !== "none" && (
        <p className="px-1 text-[11px] text-muted-foreground">
          Regroupement indisponible : l'API ne fournit pas le détail par opérateur/bande — totaux affichés.
        </p>
      )}
      <ValuesTable row={row} g={g} measure={measure} highlight={highlight} onHighlight={setHighlight} />
    </div>
  );

  const mapNode = (
    <Panel title="Carte" icon={<MapIcon className="h-4 w-4" />} className="h-full">
      {!sel.path || !row ? (
        <EmptyState title="Aucun paramètre">Sélectionnez un paramètre pour le cartographier.</EmptyState>
      ) : mapQ.isPending ? (
        <div className="p-2">
          <LoadingSkeleton className="h-[320px]" />
        </div>
      ) : mapQ.isError ? (
        <ErrorState message={errMsg(mapQ.error)} onRetry={() => mapQ.refetch()} />
      ) : (
        <OccurrenceMap points={mapQ.data?.points ?? []} center={PROJECTS_CENTER(projectId)} unit={row.unit_converted} highlight={highlight} />
      )}
    </Panel>
  );

  const infoNode = row ? (
    <InfoPanel row={row} />
  ) : (
    <Panel title="Infos" icon={<Info className="h-4 w-4" />} className="h-full">
      <EmptyState title="Aucun paramètre">Sélectionnez un paramètre.</EmptyState>
    </Panel>
  );
  const sideShown = showMap || infoOpen;
  const sideNode = (
    <div className="flex h-full flex-col gap-2">
      {infoOpen && <div className={showMap ? "shrink-0" : "min-h-0 flex-1"}>{infoNode}</div>}
      {showMap && <div className="min-h-[300px] flex-1">{mapNode}</div>}
    </div>
  );

  if (width < 1024) {
    return (
      <div className="flex flex-col gap-2 p-2">
        {toolbar}
        <button onClick={() => setTreeOpen(true)} className="panel inline-flex h-9 items-center gap-2 px-3 text-xs font-semibold">
          <Folder className="h-4 w-4 text-primary" /> Paramètres RRC
          <span className="ml-auto truncate font-mono font-normal text-muted-foreground">{sel.path ? leafOf(sel.path) : "aucun"}</span>
        </button>
        <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
          <SheetContent side="left" className="w-[320px] p-0">
            <SheetHeader className="border-b p-3">
              <SheetTitle>Paramètres RRC</SheetTitle>
              <SheetDescription className="sr-only">Arbre ASN.1</SheetDescription>
            </SheetHeader>
            <div className="h-[calc(100%-60px)]">{treeNode}</div>
          </SheetContent>
        </Sheet>
        {analysis}
        {infoOpen && <div>{infoNode}</div>}
        {showMap && <div className="h-[420px]">{mapNode}</div>}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col gap-2 p-2">
      {toolbar}
      <ResizablePanelGroup key={sideShown ? "side" : "noside"} orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="20%" minSize="14%" collapsible>
          <Panel title="Paramètres RRC" className="h-full">
            {treeNode}
          </Panel>
        </ResizablePanel>
        <ResizableHandle withHandle className="mx-1" />
        <ResizablePanel defaultSize={sideShown ? "52%" : "80%"} minSize="35%">
          <div className="h-full overflow-auto pr-0.5">{analysis}</div>
        </ResizablePanel>
        {sideShown && (
          <>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize="28%" minSize="20%">
              {sideNode}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
