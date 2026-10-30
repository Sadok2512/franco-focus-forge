// 1.107.0 (BC3 Phase 3b) — Metrics tree lit l'enveloppe `catalog_release`
// + `decoder_version` + `reason` du GET /metrics (back 0.80.0) :
//   - footer "Catalog X.Y.Z · Decoder A.B.C" piloté par l'enveloppe
//     (fallback explicite "legacy" quand catalog_release=null) ;
//   - 4 niveaux Technology → Catégorie → Métrique (NFF event) → Feuilles
//     cellule, hérités du JSON 2.50.5 avec `node_type` ∈ {tech, category,
//     event, leaf} ;
//   - badge "PER CELL" dérivé du `metric_id` suffixé `@<cell_type>` ;
//   - interrupteur opt-in pour les feuilles non-sélectionnables ; leur
//     grisage et leur tooltip `reason` sont préservés quand elles sont montrées.
// 1.78.0 (BC3 héritage) — Metrics tree aligned strictement sur KPI tree.
// Arbre dérivé de /metrics back (jamais hardcodé). Même style que
// KpiCatalogSidebar : header p-2, pas d'eyebrow, pas d'Expand/Collapse,
// chevron intégré dans la row, status dot, ⋮ menu MoreVertical.
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
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
import { toUserMessage } from "@/lib/api/http";

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
  search: controlledSearch,
  onSearchChange,
  selectionCount,
  measuredTree,
  onVisibleCountChange,
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
  search?: string;
  onSearchChange?: (value: string) => void;
  selectionCount?: number;
  measuredTree?: ReactNode;
  onVisibleCountChange?: (count: number) => void;
  captureKind?: "ue" | "scanner" | null;
}) {
  const { t, i18n } = useTranslation();
  const [localSearch, setLocalSearch] = useState("");
  const search = controlledSearch ?? localSearch;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [info, setInfo] = useState<MetricCatalogNode | null>(null);
  // "Afficher les non disponibles" est volontairement OFF au chargement :
  // l'arbre nominal ne contient que les feuilles consommables. L'option les
  // réintroduit sans changer leur rendu grisé ni leur tooltip de cause.
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  // 1.103.3 — Partage les options avec `analytics-bootstrap` : persist
  // localStorage + initialData → 2e visite affiche le catalogue instantanément,
  // refetch silencieux en arrière-plan (SWR). Zéro invention.
  const query = useQuery({ ...metricsCatalogQuery(projectId), retry: false });
  const byParent = useMemo(() => {
    const result = new Map<string, MetricCatalogNode[]>();
    for (const node of query.data?.nodes ?? []) {
      const key = node.parent_id ?? rootKey;
      result.set(key, [...(result.get(key) ?? []), node]);
    }
    for (const children of result.values()) children.sort((a, b) => a.order - b.order);
    return result;
  }, [query.data]);
  const availableTree = useMemo(() => {
    if (showUnavailable) return null;
    const nodes = query.data?.nodes ?? [];
    const byId = new Map(nodes.map((node) => [node.node_id, node]));
    const visible = new Set<string>();
    for (const leaf of nodes) {
      if (leaf.node_type !== "leaf" || !leaf.selectable) continue;
      let current: MetricCatalogNode | undefined = leaf;
      while (current && !visible.has(current.node_id)) {
        visible.add(current.node_id);
        current = current.parent_id ? byId.get(current.parent_id) : undefined;
      }
    }
    return visible;
  }, [query.data, showUnavailable]);
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
  const visibleSelectableCount = useMemo(
    () =>
      (query.data?.nodes ?? []).filter(
        (node) =>
          node.node_type === "leaf" &&
          node.selectable &&
          (!availableTree || availableTree.has(node.node_id)) &&
          (!matching || matching.has(node.node_id)) &&
          (!activeOnly || node.n > 0),
      ).length,
    [activeOnly, availableTree, matching, query.data],
  );
  useEffect(
    () => onVisibleCountChange?.(visibleSelectableCount),
    [onVisibleCountChange, visibleSelectableCount],
  );
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
    const permitted = remove
      ? candidates
      : candidates.slice(0, Math.max(0, MAX_METRICS - selected.length));
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

  // 1.107.0 — "PER CELL" dérivé du metric_id : `event_field@<cell_type>`.
  // Null si pas de suffixe `@` ou non-leaf. Garanti par le build_catalog_v4
  // back qui laisse `node.cell=null` tant qu'on n'a pas mappé les cell_type
  // vers "pcell"/"scell*".
  const perCellBadge = (node: MetricCatalogNode): string | null => {
    if (node.node_type !== "leaf") return null;
    // A physical neighbour appends ``!ARFCN:PCI`` to the semantic selector.
    // That identity is already the leaf label and must never leak into the
    // legacy PER CELL badge (nor be mistaken for an internal cell index).
    const mid = (node.metric_id ?? "").split("!", 1)[0] ?? "";
    const at = mid.lastIndexOf("@");
    if (at < 0) return null;
    const suffix = mid.slice(at + 1);
    if (!suffix) return null;
    if (/^(lte|nr)-type-\d+$/.test(suffix)) return null;
    // Mapping lisible pour les cell_type NFF 2.50 fréquents.
    if (suffix === "0") return "PCell";
    if (suffix === "199") return "PSCell";
    if (/^\d{1,2}$/.test(suffix)) return `SCell ${suffix}`;
    if (/^1\d{2}$/.test(suffix)) return `SCG SCell ${Number(suffix) - 100}`;
    return suffix;
  };

  const renderNode = (node: MetricCatalogNode): ReactNode => {
    if (availableTree && !availableTree.has(node.node_id)) return null;
    if (matching && !matching.has(node.node_id)) return null;
    const children = byParent.get(node.node_id) ?? [];
    const expanded = Boolean(matching) || open.has(node.node_id);
    // Active only complète le filtre de disponibilité pour les rares feuilles
    // sélectionnables dont le compteur peut être nul après un refetch.
    if (activeOnly && node.node_type === "leaf" && node.selectable && node.n === 0) {
      return null;
    }
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
    const canToggle =
      (node.selectable && node.selection ? isSelected || selected.length < MAX_METRICS : false) &&
      !scannerBlocked;
    const statusClass =
      node.selectable && node.n > 0
        ? "status-available"
        : node.proof === "open"
          ? "status-pending"
          : "status-unavailable";
    const showMenu = node.node_type === "metric" || (node.node_type === "leaf" && node.selectable);
    const copyPayload =
      node.selection ?? node.metric_id ?? node.source ?? node.source_column ?? node.node_id;

    // 1.107.0 — TECH (racine Technology LTE / NR / Shared / Other).
    // Rendu kpi-tree-root (top-level) ; les catégories deviennent children
    // family. Préserve le design actuel (chevron intégré, bar-click = expand).
    if (node.node_type === "tech") {
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

    // CATEGORIE : rendu kpi-tree-root quand pas sous un tech, sinon family
    // (évite de dupliquer le niveau racine quand l'arbre est "flat").
    if (node.node_type === "category") {
      const underTech = node.parent_id && byParent.has(node.parent_id);
      return (
        <li key={node.node_id}>
          <button
            className={underTech ? "kpi-tree-family" : "kpi-tree-root"}
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
              <span className="block truncate">
                {label}
                {/* 1.107.0 — Badge PER CELL dérivé de metric_id@<cell_type> */}
                {perCellBadge(node) && (
                  <span
                    className="ml-1 inline-flex items-center rounded border border-primary/30 bg-primary/10 px-1 text-[9px] font-medium uppercase tracking-wide text-primary"
                    data-testid={`per-cell-${node.node_id}`}
                  >
                    {perCellBadge(node)}
                  </span>
                )}
              </span>
              {search && (
                <span className="text-[10px] text-muted-foreground">
                  {node.source ??
                    (/@(lte|nr)-type-\d+$/.test(node.metric_id ?? "") ? "" : node.metric_id) ??
                    ""}
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
                          onVisualization(node.selection!, mode as MetricView);
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
                  {copied === node.node_id
                    ? t("metrics.catalogCopyIdOk")
                    : t("metrics.catalogCopyId")}
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
          {/* 1.111.0 BC3 — Version du catalog release visible dans le titre
              (plus seulement dans le footer). Format V{major}.{minor}
              (ex. V2.53 pour catalog_release 2.53.0). Rien si catalog_release
              null (fallback legacy). */}
          {query.data?.catalog_release?.version && (
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              V{query.data.catalog_release.version.split(".").slice(0, 2).join(".")}
            </span>
          )}
          <span
            className="ml-auto text-[10px] font-normal text-muted-foreground tabular-nums"
            data-testid="metrics-unified-selection-count"
          >
            {t("metrics.unifiedSelected", { count: selectionCount ?? selected.length })}
          </span>
        </h2>
        <label className="relative block mt-2">
          <Search size={14} className="absolute left-2.5 top-3 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => {
              setLocalSearch(event.target.value);
              onSearchChange?.(event.target.value);
            }}
            placeholder={t("metrics.433e83817682")}
            aria-label={t("metrics.bf6a6c500977")}
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-xs"
          />
        </label>
        <label
          className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground"
          data-testid="metrics-show-unavailable"
        >
          <input
            type="checkbox"
            role="switch"
            checked={showUnavailable}
            onChange={(event) => setShowUnavailable(event.target.checked)}
            className="h-3 w-3"
          />
          {t("metrics.showUnavailable")}
        </label>
        <label
          className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground"
          data-testid="metrics-active-only"
        >
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="h-3 w-3"
          />
          {t("metrics.activeOnly")}
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
          <p className="text-xs text-destructive">{toUserMessage(query.error)}</p>
          <button className="kpi-button" onClick={() => void query.refetch()}>
            <RefreshCw size={14} /> {t("kpi.d61cacf6ec3e")}
          </button>
        </div>
      )}
      <div className="kpi-tree" data-testid="unified-metrics-tree">
        {measuredTree}
        <ul className="p-2 space-y-1">{tree.map((node) => renderNode(node))}</ul>
      </div>
      {/* 1.107.0 — Footer lit l'enveloppe `catalog_release` + `decoder_version`
          du back 0.80.0. Jamais en dur. Fallback explicite "legacy" quand
          catalog_release=null (bootstrap frais / fallback_legacy). */}
      <footer
        className="border-t p-2 text-[10px] text-muted-foreground"
        title={`front v${APP_VERSION} · ${t("metrics.498227f2b5c6")}`}
        data-testid="metrics-catalog-footer"
      >
        {query.data?.catalog_release ? (
          <span>
            {t("metrics.footerCatalogDecoder", {
              catalog: query.data.catalog_release.version,
              decoder: query.data.decoder_version || "?",
            })}
          </span>
        ) : query.data ? (
          <span>
            {t("metrics.footerLegacy", {
              reason: query.data.reason || "legacy",
            })}
          </span>
        ) : (
          <span>{t("metrics.498227f2b5c6")}</span>
        )}
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
            <h3 className="mb-2 text-sm font-semibold">{cleanLabel(info.label)}</h3>
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
