// 1.73.0 (BC3) — Metrics tree premium (spec v10 /specs/metrics_catalogue_lte.html) :
// ★ catégories/métriques détectées par présence de ★ dans node.label (généré depuis
// /metrics back, jamais codé en dur côté front), menu ⋯ par métrique (Chart /
// Table / Map / Info / Copy id), feuilles n=0 greyées (déjà via node.selectable=false).
import { useTranslation } from "react-i18next";
import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  MapPin,
  MoreHorizontal,
  Search,
  Star,
  Table2,
} from "lucide-react";
import { getMetrics } from "@/lib/api/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MetricCatalogNode } from "@/lib/api/metrics-schemas";
import type { MetricView } from "./MetricGraphCard";
import { Button } from "@/components/ui/button";

const rootKey = "__root__";
const STAR = "★";

export function MetricsCatalogSidebar({
  projectId,
  selected,
  onToggle,
  onVisualization,
  searchRef,
}: {
  projectId: string;
  selected: string[];
  onToggle: (code: string) => void;
  onVisualization?: (code: string, view: MetricView) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [info, setInfo] = useState<MetricCatalogNode | null>(null);
  const query = useQuery({
    queryKey: ["project-metrics", projectId],
    queryFn: ({ signal }) => getMetrics(projectId, signal),
    staleTime: 300_000,
  });
  const byParent = useMemo(() => {
    const result = new Map<string, MetricCatalogNode[]>();
    for (const node of query.data?.nodes ?? []) {
      const key = node.parent_id ?? rootKey;
      result.set(key, [...(result.get(key) ?? []), node]);
    }
    for (const children of result.values()) children.sort((a, b) => a.order - b.order);
    return result;
  }, [query.data]);
  const matching = useMemo(() => {
    if (!search.trim()) return null;
    const needle = search.trim().toLocaleLowerCase();
    const own = new Set(
      (query.data?.nodes ?? [])
        .filter((node) =>
          `${node.label} ${node.source ?? ""} ${node.event ?? ""}`
            .toLocaleLowerCase()
            .includes(needle),
        )
        .map((node) => node.node_id),
    );
    const visible = new Set(own);
    const byId = new Map((query.data?.nodes ?? []).map((node) => [node.node_id, node]));
    for (const id of own) {
      let node = byId.get(id);
      while (node?.parent_id) {
        visible.add(node.parent_id);
        node = byId.get(node.parent_id);
      }
    }
    return visible;
  }, [query.data, search]);
  const descendantSelections = useMemo(() => {
    const cache = new Map<string, string[]>();
    const collect = (id: string): string[] => {
      const cached = cache.get(id);
      if (cached) return cached;
      const values = (byParent.get(id) ?? []).flatMap((node) => [
        ...(node.selectable && node.selection ? [node.selection] : []),
        ...collect(node.node_id),
      ]);
      cache.set(id, values);
      return values;
    };
    for (const node of query.data?.nodes ?? []) collect(node.node_id);
    return cache;
  }, [byParent, query.data]);
  const toggleOpen = (id: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleBranch = (node: MetricCatalogNode) => {
    const values = descendantSelections.get(node.node_id) ?? [];
    const remove = values.length > 0 && values.every((value) => selected.includes(value));
    const candidates = values.filter((value) => remove === selected.includes(value));
    const permitted = remove ? candidates : candidates.slice(0, Math.max(0, 64 - selected.length));
    for (const value of permitted) onToggle(value);
  };
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((v) => (v === id ? null : v)), 1500);
    } catch {
      // clipboard refused — leave feedback null
    }
  };
  const renderNode = (node: MetricCatalogNode, depth = 0): ReactNode => {
    if (matching && !matching.has(node.node_id)) return null;
    const children = byParent.get(node.node_id) ?? [];
    const expanded = Boolean(matching) || open.has(node.node_id);
    const branchSelections = children.length ? (descendantSelections.get(node.node_id) ?? []) : [];
    const branchChecked =
      branchSelections.length > 0 && branchSelections.every((value) => selected.includes(value));
    const branchPartial =
      branchSelections.some((value) => selected.includes(value)) && !branchChecked;
    const disabled = node.node_type === "leaf" && !node.selectable;
    const isSelected = node.selectable && selected.includes(node.selection ?? "");
    const starred = node.label.includes(STAR);
    const kindClass =
      node.node_type === "category"
        ? "kpi-tree-root"
        : node.node_type === "leaf"
          ? "kpi-tree-leaf"
          : "kpi-tree-family";
    const starClass = starred ? " kpi-tree-starred" : "";
    const showMenu =
      node.node_type === "metric" || (node.node_type === "leaf" && node.selectable);
    const copyPayload =
      node.selection ?? node.metric_id ?? node.source ?? node.source_column ?? node.node_id;
    return (
      <li key={node.node_id} style={{ paddingLeft: depth ? 8 : 0 }}>
        <div
          className={`${kindClass}${starClass} ${isSelected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}
          title={node.reason ?? node.source ?? node.label}
        >
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={`${expanded ? t("metrics.catalogCollapse") : t("metrics.catalogExpand")} ${node.label}`}
              aria-expanded={expanded}
              onClick={() => toggleOpen(node.node_id)}
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-[13px]" aria-hidden="true" />
          )}
          {(node.selectable || branchSelections.length > 0) && (
            <input
              type="checkbox"
              checked={node.selectable ? selected.includes(node.selection ?? "") : branchChecked}
              ref={(element) => {
                if (element) element.indeterminate = branchPartial;
              }}
              disabled={
                disabled ||
                (!branchPartial &&
                  !branchChecked &&
                  !selected.includes(node.selection ?? "") &&
                  selected.length >= 64)
              }
              aria-label={t("metrics.46d8d72f28dd", { v0: node.label })}
              onChange={() =>
                node.selectable && node.selection ? onToggle(node.selection) : toggleBranch(node)
              }
            />
          )}
          {starred && (
            <Star
              size={11}
              className="shrink-0 fill-amber-400 text-amber-500"
              aria-label={t("metrics.catalogStarred")}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{node.label.replace(STAR, "").trim()}</span>
          {node.source && (
            <small className="shrink-0 text-[9px] text-muted-foreground">{node.source}</small>
          )}
          {node.node_type === "leaf" && (
            <span
              className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
              data-testid={`metric-leaf-count-${node.node_id}`}
            >
              {node.n.toLocaleString(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB")}
            </span>
          )}
          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="kpi-icon kpi-leaf-menu shrink-0"
                  aria-label={t("metrics.catalogMenu")}
                  data-testid={`metric-menu-${node.node_id}`}
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                <DropdownMenuLabel className="truncate text-[11px]">
                  {node.label.replace(STAR, "").trim()}
                </DropdownMenuLabel>
                {onVisualization && node.selectable && node.selection && (
                  <>
                    <DropdownMenuItem onSelect={() => onVisualization(node.selection!, "graph")}>
                      <ChartNoAxesCombined size={13} /> {t("metrics.catalogChart")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => onVisualization(node.selection!, "histogram")}
                    >
                      <BarChart3 size={13} /> {t("metrics.86eb05ab111d")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onVisualization(node.selection!, "table")}>
                      <Table2 size={13} /> {t("metrics.catalogTable")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onVisualization(node.selection!, "map")}>
                      <MapPin size={13} /> {t("metrics.catalogMap")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onSelect={() => setInfo(node)}>
                  <Info size={13} /> {t("metrics.catalogInfo")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void copyToClipboard(copyPayload, node.node_id)}>
                  <Copy size={13} />{" "}
                  {copied === node.node_id ? t("metrics.catalogCopyIdOk") : t("metrics.catalogCopyId")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {children.length > 0 && expanded && (
          <ul className="border-l border-border/60">
            {children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };
  const expandableIds = (query.data?.nodes ?? [])
    .filter((node) => (byParent.get(node.node_id) ?? []).length > 0)
    .map((node) => node.node_id);
  return (
    <aside className="kpi-catalog" aria-label={t("metrics.498227f2b5c6")}>
      <header className="border-b p-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity size={16} className="text-primary" /> {t("metrics.498227f2b5c6")}
          <span className="ml-auto text-[10px] font-normal text-muted-foreground tabular-nums">{selected.length}/64</span>
        </h2>
        <label className="relative mt-2 block">
          <Search className="absolute left-2.5 top-3 text-muted-foreground" size={14} />
          <input
            ref={searchRef}
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-xs"
            placeholder={t("metrics.433e83817682")}
            aria-label={t("metrics.bf6a6c500977")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="mt-1 flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" onClick={() => setOpen(new Set(expandableIds))}>
            {t("metrics.catalogExpandAll")}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" onClick={() => setOpen(new Set())}>
            {t("metrics.catalogCollapseAll")}
          </Button>
        </div>
      </header>
      {query.isPending && (
        <p className="p-3 text-xs" role="status">
          {t("metrics.109826adfba2")}
        </p>
      )}
      {query.isError && (
        <p role="alert" className="p-3 text-destructive">
          {query.error.message}
        </p>
      )}
      <ul className="kpi-tree space-y-1 p-2">
        {(byParent.get(rootKey) ?? []).map((node) => renderNode(node))}
      </ul>
      {info && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("metrics.catalogInfo")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setInfo(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-auto rounded-md border bg-background p-4 text-xs shadow-xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="metric-info-dialog"
          >
            <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
              {info.label.includes(STAR) && (
                <Star size={12} className="fill-amber-400 text-amber-500" />
              )}
              {info.label.replace(STAR, "").trim()}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {info.source && (
                <>
                  <dt className="text-muted-foreground">source</dt>
                  <dd className="font-mono">{info.source}</dd>
                </>
              )}
              {info.event && (
                <>
                  <dt className="text-muted-foreground">event</dt>
                  <dd className="font-mono">{info.event}</dd>
                </>
              )}
              {info.source_column && (
                <>
                  <dt className="text-muted-foreground">column</dt>
                  <dd className="font-mono">{info.source_column}</dd>
                </>
              )}
              {info.metric_id && (
                <>
                  <dt className="text-muted-foreground">metric_id</dt>
                  <dd className="font-mono">{info.metric_id}</dd>
                </>
              )}
              {info.cell && (
                <>
                  <dt className="text-muted-foreground">cell</dt>
                  <dd className="font-mono">{info.cell}</dd>
                </>
              )}
              {info.unit && (
                <>
                  <dt className="text-muted-foreground">unit</dt>
                  <dd>{info.unit}</dd>
                </>
              )}
              <dt className="text-muted-foreground">n</dt>
              <dd className="tabular-nums">
                {info.n.toLocaleString(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB")}
              </dd>
              <dt className="text-muted-foreground">proof</dt>
              <dd>{info.proof}</dd>
              {info.reason && (
                <>
                  <dt className="text-muted-foreground">reason</dt>
                  <dd className="text-amber-700 dark:text-amber-400">{info.reason}</dd>
                </>
              )}
            </dl>
            <button
              type="button"
              className="mt-3 rounded border px-2 py-1 text-xs"
              onClick={() => setInfo(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
