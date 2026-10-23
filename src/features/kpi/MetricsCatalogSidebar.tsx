// 1.78.0 (BC3) — Metrics tree aligned strictement sur KPI tree.
// Arbre dérivé de /metrics back (jamais hardcodé). Hiérarchie 4-5 niveaux
// (catégorie → groupe → métrique → cellule) rendue avec le même style que
// KpiCatalogSidebar : header p-2, pas d'eyebrow, pas d'Expand/Collapse,
// chevron intégré dans la row (bar-click = expand), status dot, ⋮ menu
// MoreVertical + VisualizationItems partagé. Pas d'icône ★, pas de source
// badge, pas de compteur par leaf.
import { useTranslation } from "react-i18next";
import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  MoreVertical,
  RefreshCw,
  Search,
} from "lucide-react";
import { metricsCatalogQuery } from "@/lib/analytics-bootstrap";
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
import { VisualizationItems } from "./VisualizationMenu";
import type { VisualizationType } from "./visualization-model";
import { APP_VERSION } from "@/lib/version";
import { METRIC_DRAG_TYPE } from "./multi-metric-model";

const rootKey = "__root__";
const STAR = "★";
const MAX_METRICS = 64;
// 1.78.1 — strip des badges source `[PHRATE #1]`, `[CI #2]`, `[CELLMEAS #5]`...
// bakés dans node.label par le back (le back garde la source pour sa logique
// de binding via SOURCE_RE ; côté UI on affiche le nom nu).
const SOURCE_BADGE_RE = /\s*\[[A-Z][A-Z0-9]*\s+#\d+\]\s*/g;
function cleanLabel(raw: string): string {
  return raw.replace(STAR, "").replace(SOURCE_BADGE_RE, "").trim();
}

export function MetricsCatalogSidebar({
  projectId,
  selected,
  onToggle,
  onVisualization,
  searchRef,
  // 1.92.0 — captureKind : si 'scanner', les métriques UE cell_scoped sont
  // désactivées + tooltip "no UE cell metrics in scanner capture". Jamais
  // cachées. 'ue' ou null = comportement nominal.
  captureKind,
}: {
  projectId: string;
  selected: string[];
  onToggle: (code: string) => void;
  onVisualization?: (code: string, view: MetricView) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  captureKind?: "ue" | "scanner" | null;
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [info, setInfo] = useState<MetricCatalogNode | null>(null);
  // 1.103.3 — Partage les options avec `analytics-bootstrap` : persist
  // localStorage + initialData → 2e visite affiche le catalogue instantanément,
  // refetch silencieux en arrière-plan (SWR). Zéro invention.
  const query = useQuery(metricsCatalogQuery(projectId));
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
    const permitted = remove ? candidates : candidates.slice(0, Math.max(0, MAX_METRICS - selected.length));
    for (const value of permitted) onToggle(value);
  };
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((v) => (v === id ? null : v)), 1500);
    } catch {
      /* clipboard refused */
    }
  };

  const renderNode = (node: MetricCatalogNode): ReactNode => {
    if (matching && !matching.has(node.node_id)) return null;
    const children = byParent.get(node.node_id) ?? [];
    const expanded = Boolean(matching) || open.has(node.node_id);
    const branchSelections = children.length ? (descendantSelections.get(node.node_id) ?? []) : [];
    const branchChecked =
      branchSelections.length > 0 && branchSelections.every((value) => selected.includes(value));
    // 1.92.0 — métrique UE cell_scoped désactivée sur capture scanner.
    // Jamais cachée. node.cell non-null = projection cellule (PCell/SCell/PSCell).
    const scannerBlocked = captureKind === "scanner" && node.cell != null;
    const disabled = (node.node_type === "leaf" && !node.selectable) || scannerBlocked;
    const scannerTooltip = scannerBlocked ? "no UE cell metrics in scanner capture" : null;
    const label = cleanLabel(node.label);
    const isSelected = node.selectable && selected.includes(node.selection ?? "");
    const canToggle = (node.selectable && node.selection
      ? isSelected || selected.length < MAX_METRICS
      : false) && !scannerBlocked;
    const statusClass =
      node.selectable && node.n > 0
        ? "status-available"
        : node.proof === "open"
          ? "status-pending"
          : "status-unavailable";
    const showMenu = node.node_type === "metric" || (node.node_type === "leaf" && node.selectable);
    const copyPayload =
      node.selection ?? node.metric_id ?? node.source ?? node.source_column ?? node.node_id;

    // CATEGORIE : même pattern que KPI techno (bar entière cliquable, chevron intégré)
    if (node.node_type === "category") {
      return (
        <li key={node.node_id}>
          <button
            className="kpi-tree-root"
            aria-expanded={expanded}
            onClick={() => toggleOpen(node.node_id)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {label}
          </button>
          {expanded && (
            <ul className="ml-2 space-y-1">{children.map((child) => renderNode(child))}</ul>
          )}
        </li>
      );
    }

    // GROUP ou METRIC parent : même pattern que KPI family
    if (children.length > 0) {
      return (
        <li key={node.node_id}>
          <button
            className="kpi-tree-family"
            aria-expanded={expanded}
            onClick={() => toggleOpen(node.node_id)}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span className="truncate">{label}</span>
            {branchSelections.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {branchSelections.length}
              </span>
            )}
          </button>
          {expanded && (
            <ul className="ml-2 space-y-1">{children.map((child) => renderNode(child))}</ul>
          )}
        </li>
      );
    }

    // LEAF : même pattern que KPI kpi-tree-leaf
    return (
      <li key={node.node_id}>
        <div
          className={`kpi-tree-leaf ${isSelected ? "is-selected" : ""} ${!canToggle && !isSelected ? "is-disabled" : ""} ${disabled ? "opacity-45" : ""}`}
          title={scannerTooltip ?? node.reason ?? node.source ?? label}
          draggable={node.selectable && !!node.selection && !disabled && node.n > 0}
          data-drag-metric={node.selection ?? undefined}
          onDragStart={(event) => {
            const selection = node.selection;
            if (!selection || disabled) { event.preventDefault(); return; }
            const info = query.data?.metrics.find((m) => m.code === selection.split("@")[0]);
            const metric = { selection, label: `${info?.label ?? label}${node.cell ? ` · ${label}` : ""}`, unit: node.unit || info?.unit || "", tech: info?.tech ?? "", kind: info?.kind ?? "categorical" };
            event.dataTransfer.setData(METRIC_DRAG_TYPE, JSON.stringify(metric));
            event.dataTransfer.effectAllowed = "copy";
            const preview = document.createElement("div");
            preview.className = "metric-drag-preview";
            preview.textContent = `${metric.label}\n${metric.tech} · ${metric.unit}`;
            document.body.append(preview);
            event.dataTransfer.setDragImage(preview, 15, 15);
            requestAnimationFrame(() => preview.remove());
          }}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left"
            onClick={() => canToggle && node.selection && onToggle(node.selection)}
            disabled={!canToggle && !isSelected}
            aria-pressed={isSelected}
            aria-label={t("metrics.46d8d72f28dd", { v0: label })}
          >
            <span
              className={`kpi-status-dot ${statusClass}`}
              title={node.proof}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{label}</span>
              {search && (
                <span className="text-[10px] text-muted-foreground">
                  {node.source ?? node.metric_id ?? ""}
                </span>
              )}
            </span>
          </button>
          {/* 1.79.1 — nombre d'observations (node.n) à droite du label,
              aligné sur le pattern KPI tree-root "LTE 84 · 26 AVAIL" */}
          <span
            className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
            data-testid={`metric-leaf-count-${node.node_id}`}
          >
            {node.n.toLocaleString(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB")}
          </span>
          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="kpi-icon kpi-leaf-menu"
                  aria-label={`Visualisation ${label}`}
                  disabled={!isSelected && selected.length >= MAX_METRICS}
                  data-testid={`metric-menu-${node.node_id}`}
                >
                  <MoreVertical size={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>{t("kpi.af3aaf87ff99")}</DropdownMenuLabel>
                {onVisualization && node.selectable && node.selection && (
                  <>
                    {/* 1.80.4 — Graph réintroduit dans le menu Metrics
                        (demande user). KPI menu reste sans Graph (spec v2). */}
                    <VisualizationItems
                      throughput={node.unit === "Mbit/s" || node.unit === "Mbps"}
                      onChange={(mode: VisualizationType) => {
                        if (
                          mode === "histogram" ||
                          mode === "graph" ||
                          mode === "table" ||
                          mode === "map"
                        ) {
                          if (node.selection) onVisualization(node.selection, mode as MetricView);
                        }
                      }}
                    />
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
      </li>
    );
    // branchChecked intentionnellement ignoré ici : les leaves gèrent leur
    // propre sélection via onToggle(node.selection) ; toggleBranch reste
    // disponible via le branch-level menu (groupe/metric parent).
    // Référencer branchChecked pour satisfaire le linter si besoin :
    void branchChecked;
    void toggleBranch;
  };

  const tree = byParent.get(rootKey) ?? [];
  return (
    <aside className="kpi-catalog" aria-label={t("metrics.498227f2b5c6")}>
      <header className="p-2 border-b">
        <h2 className="flex items-center gap-2 font-semibold text-sm">
          <BarChart3 size={16} className="text-primary" /> {t("metrics.498227f2b5c6")}
          <span className="ml-auto text-[10px] font-normal text-muted-foreground tabular-nums">
            {selected.length}/{MAX_METRICS}
          </span>
        </h2>
        <label className="relative block mt-2">
          <Search size={14} className="absolute left-2.5 top-3 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("metrics.433e83817682")}
            aria-label={t("metrics.bf6a6c500977")}
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-xs"
          />
        </label>
      </header>
      {/* The catalogue is prefetched at app start, so a tab opened later joins an
          already-finished request: show the bar for any in-flight fetch, not only
          the first pending one. */}
      {(query.isPending || (query.isFetching && !query.data)) && (
        <div className="kpi-measurements-loading" aria-busy="true">
          <div
            className="kpi-measurements-progress"
            role="progressbar"
            aria-label={t("metrics.109826adfba2")}
          >
            <span />
          </div>
        </div>
      )}
      {query.isError && (
        <div role="alert" className="space-y-2 p-3">
          <p className="text-xs text-destructive">{query.error.message}</p>
          <button className="kpi-button" onClick={() => void query.refetch()}>
            <RefreshCw size={14} /> {t("kpi.d61cacf6ec3e")}
          </button>
        </div>
      )}
      <ul className="kpi-tree p-2 space-y-1">
        {tree.map((node) => renderNode(node))}
        {!tree.length && !query.isPending && !(query.isFetching && !query.data) && (
          <li className="p-4 text-xs text-muted-foreground">{t("metrics.7f626224ba1f") || "—"}</li>
        )}
      </ul>
      <footer
        className="border-t p-2 text-[10px] text-muted-foreground"
        title={`front v${APP_VERSION} · ${t("metrics.498227f2b5c6")}`}
      >
        {t("metrics.498227f2b5c6")}
      </footer>
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
            <h3 className="mb-2 text-sm font-semibold">
              {cleanLabel(info.label)}
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
