import { useTranslation } from "react-i18next";
import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronDown, ChevronRight, Search } from "lucide-react";
import { getMetrics } from "@/lib/api/client";
import type { MetricCatalogNode } from "@/lib/api/metrics-schemas";
import type { MetricView } from "./MetricGraphCard";

const rootKey = "__root__";

export function MetricsCatalogSidebar({
  projectId,
  selected,
  onToggle,
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
    return (
      <li key={node.node_id} style={{ paddingLeft: depth ? 8 : 0 }}>
        <div
          className={`${node.node_type === "category" ? "kpi-tree-root" : node.node_type === "leaf" ? "kpi-tree-leaf" : "kpi-tree-family"} ${disabled ? "opacity-45" : ""}`}
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
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
          {node.source && (
            <small className="shrink-0 text-[9px] text-muted-foreground">{node.source}</small>
          )}
          {node.node_type === "leaf" && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {node.n.toLocaleString(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB")}
            </span>
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
  // Keep the catalogue responsive: branches expand on demand. The reference
  // ordering and labels remain server-provided; no client-side catalogue is
  // synthesized.
    .filter(
      (node) =>
        node.node_type === "category" && (byParent.get(node.node_id) ?? []).length > 0,
    )
    .map((node) => node.node_id);
  // The reference catalogue is fully expanded on first render. Keep the
  // server-provided order and labels; the user can still collapse any branch.
  return (
    <aside className="kpi-catalog" aria-label={t("metrics.498227f2b5c6")}>
      <header className="border-b p-3">
        <h2 className="flex gap-2 text-sm font-semibold">
          <Activity size={16} /> {query.data?.title ?? t("metrics.498227f2b5c6")}
        </h2>
        {query.data?.header && (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            {query.data.header}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {t("metrics.f05f8e96265b")} {selected.length}
          {t("metrics.16df3032f7a1")}
        </p>
        <label className="relative mt-3 block">
          <Search className="absolute left-2 top-3" size={14} />
          <input
            ref={searchRef}
            className="h-9 w-full rounded-md border bg-background pl-8 text-xs"
            placeholder={t("metrics.433e83817682")}
            aria-label={t("metrics.bf6a6c500977")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="mt-2 flex gap-2 text-[11px]">
          <button type="button" onClick={() => setOpen(new Set(expandableIds))}>
            {t("metrics.catalogExpandAll")}
          </button>
          <button type="button" onClick={() => setOpen(new Set())}>
            {t("metrics.catalogCollapseAll")}
          </button>
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
    </aside>
  );
}
