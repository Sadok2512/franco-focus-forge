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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Info,
  MoreVertical,
  RefreshCw,
  Search,
} from "lucide-react";
import { exportMetadata } from "@/lib/api/settings";
import { apiBase, getSession } from "@/lib/api/http";
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
import type { Entry } from "./workspace-model";
import type { MetricView } from "./MetricGraphCard";
import { VisualizationItems } from "./VisualizationMenu";
import type { VisualizationType } from "./visualization-model";
import { APP_VERSION } from "@/lib/version";
import { toUserMessage } from "@/lib/api/http";
import { MAP_METRIC_MIME } from "./map-metric-drop";

const rootKey = "__root__";
const STAR = "★";
const MAX_METRICS = 64;
// A 250 ms delay still fired between ordinary 300 ms keystrokes and mounted
// the broad `e` / `ea` result trees. Wait for a real typing pause instead;
// the input itself remains synchronous and the eventual render interruptible.
const SEARCH_DEBOUNCE_MS = 400;
// 1.78.1 — strip des badges source `[PHRATE #1]`, `[CI #2]`, `[CELLMEAS #5]`...
// bakés dans node.label par le back (le back garde la source pour sa logique
// de binding via SOURCE_RE ; côté UI on affiche le nom nu).
const SOURCE_BADGE_RE = /\s*\[[A-Z][A-Z0-9]*\s+#\d+\]\s*/g;
function cleanLabel(raw: string): string {
  return raw.replace(STAR, "").replace(SOURCE_BADGE_RE, "").trim();
}

/** Search is presentation-only and always spans the complete certified tree.
 * Every whitespace-separated term must occur, case-insensitively, in one of
 * the catalogue identity or display fields. */
export function metricCatalogSearchTerms(query: string): string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

export function metricCatalogSearchText(node: MetricCatalogNode): string {
  return [
    node.display_code_lisible,
    node.label,
    node.event,
    node.metric_id,
    node.nom_court,
    node.source === "measured-catalog" ? undefined : node.source,
    node.technical_label,
    node.cell_label,
    node.metric_label,
    node.source_column,
    node.selection,
    node.cell,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

export function metricCatalogMatchesSearch(node: MetricCatalogNode, query: string): boolean {
  const terms = metricCatalogSearchTerms(query);
  if (!terms.length) return true;
  const haystack = metricCatalogSearchText(node);
  return terms.every((term) => haystack.includes(term));
}

/** RF cell order is semantic, never lexical (SCELL10 must not precede
 * SCELL2) and never driven by availability/count. */
export function metricCellSortRank(node: MetricCatalogNode): number {
  const identity = (node.display_code_lisible || node.cell_label || node.cell || node.label)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (/(?:^|_)PCELL(?:$|_)/.test(identity) && !identity.includes("PSCELL")) return 0;
  const scg = identity.match(/(?:^|_)SCG_?SCELL_?(\d+)(?:$|_)/);
  if (scg) return 200 + Number(scg[1]);
  const scell = identity.match(/(?:^|_)SCELL_?(\d+)(?:$|_)/);
  if (scell) return 10 + Number(scell[1]);
  if (/(?:^|_)PSCELL(?:$|_)/.test(identity)) return 100;
  if (/NEIGHBOU?R/.test(identity)) return 300;
  if (/SCANNER/.test(identity)) return 400;
  return 1_000;
}

/** Normalize the release catalogue without using display text as identity.
 * The backend supplies technology, source_column and the semantic cell enum;
 * labels are presentation only.  Exact duplicate projections collapse to one
 * leaf, preferring a selectable definition over an unavailable duplicate. */
export function buildMetricCellTree(nodes: MetricCatalogNode[]): MetricCatalogNode[] {
  const byId = new Map(nodes.map((node) => [node.node_id, node]));
  const technologyOf = (leaf: MetricCatalogNode) => {
    if (leaf.technology) return leaf.technology;
    let current: MetricCatalogNode | undefined = leaf;
    const seen = new Set<string>();
    while (current && !seen.has(current.node_id)) {
      seen.add(current.node_id);
      if (current.node_type === "tech") return cleanLabel(current.label);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return "Other";
  };
  const leafCandidates = nodes.filter(
    (node) => node.node_type === "leaf" && node.analytics_tab === "metrics",
  );
  const deduplicated = new Map<string, MetricCatalogNode>();
  for (const leaf of leafCandidates) {
    const technology = technologyOf(leaf);
    const metricIdentity = `${leaf.event ?? ""}:${leaf.source_column ?? leaf.metric_id ?? leaf.node_id}`;
    const physicalIdentity = leaf.selection?.includes("!")
      ? leaf.selection.slice(leaf.selection.indexOf("!") + 1)
      : "";
    const cellIdentity = `${leaf.cell_system ?? ""}:${leaf.raw_cell_type ?? "none"}:${physicalIdentity}`;
    const key = `${technology}:${metricIdentity}:${cellIdentity}`;
    const previous = deduplicated.get(key);
    if (!previous || (!previous.selectable && leaf.selectable)) deduplicated.set(key, leaf);
  }

  const technologyOrder = ["LTE", "NR", "EN-DC", "CAPTURE", "Shared", "Other"];
  const grouped = new Map<string, Map<string, MetricCatalogNode[]>>();
  for (const leaf of deduplicated.values()) {
    const technology = technologyOf(leaf);
    const metricLabel =
      leaf.metric_label ?? cleanLabel(leaf.label).split(" @ ", 1)[0] ?? leaf.label;
    const metricIdentity = `${leaf.event ?? ""}:${leaf.source_column ?? leaf.metric_id ?? leaf.node_id}:${metricLabel}`;
    const metrics = grouped.get(technology) ?? new Map<string, MetricCatalogNode[]>();
    metrics.set(metricIdentity, [...(metrics.get(metricIdentity) ?? []), leaf]);
    grouped.set(technology, metrics);
  }

  const result: MetricCatalogNode[] = [];
  const technologies = [...grouped].sort(
    ([a], [b]) =>
      (technologyOrder.indexOf(a) < 0 ? 99 : technologyOrder.indexOf(a)) -
        (technologyOrder.indexOf(b) < 0 ? 99 : technologyOrder.indexOf(b)) || a.localeCompare(b),
  );
  technologies.forEach(([technology, metrics], technologyIndex) => {
    const techId = `normalized:technology:${technology}`;
    result.push({
      node_id: techId,
      parent_id: null,
      order: technologyIndex,
      label: technology,
      note: null,
      source: null,
      node_type: "tech",
      analytics_tab: null,
      metric_id: null,
      selection: null,
      event: null,
      field_idx: null,
      source_column: null,
      unit: "",
      cell: null,
      n: 0,
      proof: "catalog-structured-identity",
      selectable: false,
      reason: null,
    });
    [...metrics.entries()]
      .sort(([, a], [, b]) =>
        (a[0]?.metric_label ?? a[0]?.label ?? "").localeCompare(
          b[0]?.metric_label ?? b[0]?.label ?? "",
        ),
      )
      .forEach(([metricIdentity, leaves], metricIndex) => {
        const first = leaves[0]!;
        const metricId = `${techId}:metric:${metricIdentity}`;
        result.push({
          ...first,
          node_id: metricId,
          parent_id: techId,
          order: metricIndex,
          label: first.metric_label ?? cleanLabel(first.label).split(" @ ", 1)[0] ?? first.label,
          node_type: "metric",
          selection: null,
          cell: null,
          n: leaves.reduce((total, leaf) => total + (leaf.selectable ? leaf.n : 0), 0),
          selectable: false,
          reason: null,
        });
        const sortedLeaves = leaves.sort(
          (a, b) =>
            (a.raw_cell_type ?? Number.MAX_SAFE_INTEGER) -
              (b.raw_cell_type ?? Number.MAX_SAFE_INTEGER) ||
            (a.cell_label ?? a.label).localeCompare(b.cell_label ?? b.label),
        );
        const relations = new Set(
          sortedLeaves.flatMap((leaf) => (leaf.cell_relation ? [leaf.cell_relation] : [])),
        );
        const splitByRelation = relations.has("serving") && relations.has("neighbour");
        const addLeaves = (relationLeaves: MetricCatalogNode[], parentId: string) =>
          relationLeaves.forEach((leaf, cellIndex) =>
            result.push({
              ...leaf,
              node_id: `normalized:leaf:${leaf.node_id}`,
              parent_id: parentId,
              order: cellIndex,
              label: leaf.cell_label ?? (leaf.cell ? leaf.cell : "No cell scope"),
            }),
          );
        if (!splitByRelation) {
          addLeaves(sortedLeaves, metricId);
          return;
        }
        (["serving", "neighbour"] as const).forEach((relation, relationIndex) => {
          const relationLeaves = sortedLeaves.filter((leaf) => leaf.cell_relation === relation);
          if (!relationLeaves.length) return;
          const relationId = `${metricId}:relation:${relation}`;
          result.push({
            ...first,
            node_id: relationId,
            parent_id: metricId,
            order: relationIndex,
            label: relation === "serving" ? "Serving Cells" : "Neighbour Cells",
            node_type: "group",
            selection: null,
            cell: null,
            cell_relation: relation,
            technical_label: null,
            n: relationLeaves.reduce((total, leaf) => total + (leaf.selectable ? leaf.n : 0), 0),
            selectable: false,
            reason: null,
          });
          addLeaves(relationLeaves, relationId);
        });
        addLeaves(
          sortedLeaves.filter((leaf) => !leaf.cell_relation),
          metricId,
        );
      });
  });
  return result;
}

/** Keep the certified BC5 hierarchy when it is present, while attaching the
 * calculated metrics catalogue to the same technology roots. Rebuilding the
 * whole response with `buildMetricCellTree` would discard the synthetic
 * category/group parents and classify QUARANTAINE leaves from their legacy
 * `technology` field again. */
export function mergeMetricCatalogTrees(
  catalogNodes: MetricCatalogNode[],
  measuredNodes: MetricCatalogNode[],
): MetricCatalogNode[] {
  // 2.68.3 full-name responses already contain the complete unified
  // catalogue. Re-normalizing them would discard `tree_visible` and re-add
  // the legacy measured panel as duplicate leaves.
  if (catalogNodes.some((node) => node.node_id.startsWith("full:tech:"))) {
    return catalogNodes;
  }
  const referenceTech = new Map(
    catalogNodes
      .filter((node) => node.node_type === "tech" && node.node_id.startsWith("ref:tech:"))
      .map((node) => [cleanLabel(node.label), node.node_id]),
  );
  if (!referenceTech.size) return buildMetricCellTree([...catalogNodes, ...measuredNodes]);

  const existingSelections = new Set(
    catalogNodes.flatMap((node) => (node.selection ? [node.selection] : [])),
  );
  const measuredTree = buildMetricCellTree(
    measuredNodes.filter((node) => !node.selection || !existingSelections.has(node.selection)),
  );
  const measuredTechIds = new Map(
    measuredTree
      .filter((node) => node.node_type === "tech")
      .map((node) => [node.node_id, cleanLabel(node.label)]),
  );
  // Oracle discipline: when the certified reference hierarchy is present
  // the LTE / NR / EN-DC / QUARANTAINE branches must mirror tree.html
  // (sha f4057ccc5332cebd329063287b23ab05343038ac78cfd902404fdf0801af2cda)
  // exactly — i.e. 6 108 RF cell-scoped leaves with their oracle role as
  // display label. Measured catalogue entries whose root technology lands
  // on one of those four oracle techs are therefore NOT reparented into
  // ref:tech:* (they would otherwise show as « No cell scope » project-
  // level KPIs beside PCell / SCell N / PSCell, which the oracle never
  // emits). They remain available in the dedicated KPI tab; measured
  // techs that are not in the oracle (AGGREGATED KPIS, VOICE, …) still
  // surface here under their own root so no selectable value is lost.
  const measuredById = new Map(measuredTree.map((node) => [node.node_id, node]));
  const measuredRootTechLabel = (node: MetricCatalogNode): string | undefined => {
    let current: MetricCatalogNode | undefined = node;
    while (current) {
      if (current.node_type === "tech") return cleanLabel(current.label);
      current = current.parent_id ? measuredById.get(current.parent_id) : undefined;
    }
    return undefined;
  };
  const attachedMeasured = measuredTree.flatMap((node) => {
    if (node.node_type === "tech") return referenceTech.has(cleanLabel(node.label)) ? [] : [node];
    const rootTech = measuredRootTechLabel(node);
    if (rootTech && referenceTech.has(rootTech)) return [];
    return [node];
  });
  return [...catalogNodes, ...attachedMeasured];
}

function measuredMetricNodes(entries: Entry[]): MetricCatalogNode[] {
  return entries.map(({ techno, family, item }, order) => ({
    node_id: `measured:${techno}:${item.code}`,
    parent_id: null,
    order,
    label: item.name,
    note: item.reason ?? null,
    source: "measured-catalog",
    node_type: "leaf" as const,
    analytics_tab: "metrics" as const,
    metric_id: item.code,
    selection: item.status === "AVAILABLE" ? item.code : null,
    event: family,
    field_idx: null,
    source_column: item.code,
    unit: item.unit ?? "",
    cell: null,
    technology: techno === "ENDC" ? "EN-DC" : techno,
    metric_label: item.name,
    cell_label: "No cell scope",
    cell_system: null,
    raw_cell_type: null,
    cell_relation: null,
    technical_label: null,
    availability_status:
      item.status === "AVAILABLE" ? ("available" as const) : ("no_data" as const),
    n: 0,
    proof: item.source ?? "measured-catalog",
    selectable: item.status === "AVAILABLE",
    reason: item.reason ?? null,
  }));
}

export function MetricsCatalogSidebar({
  projectId,
  selected,
  onToggle,
  onVisualization,
  onVisualizationIntent,
  searchRef,
  selectionCount,
  measuredEntries = [],
  measuredSelected = [],
  measuredActive = null,
  onMeasuredVisualization,
  onVisibleCountChange,
  // 1.92.0 — captureKind : si 'scanner', les métriques UE cell_scoped sont
  // désactivées + tooltip "no UE cell metrics in scanner capture". Jamais
  // cachées. 'ue' ou null = comportement nominal.
  captureKind,
  captureIds = [],
}: {
  projectId: string;
  selected: string[];
  onToggle: (code: string) => void;
  onVisualization?: (code: string, view: MetricView) => void;
  onVisualizationIntent?: (code: string, view: MetricView) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  selectionCount?: number;
  measuredEntries?: Entry[];
  measuredSelected?: string[];
  measuredActive?: string | null;
  onMeasuredVisualization?: (code: string, view: VisualizationType) => void;
  onVisibleCountChange?: (count: number) => void;
  captureKind?: "ue" | "scanner" | null;
  captureIds?: string[];
}) {
  const { t, i18n } = useTranslation();
  // Search stays local to the sidebar: lifting each keystroke into
  // KpiWorkspace rerendered every selected Graph/Table/Map panel. The input
  // value remains synchronous (stable focus/caret), while only the catalogue
  // filter is debounced.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isSearchPending, startSearchTransition] = useTransition();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Filtering can expose hundreds of nested rows. Keep that render
      // interruptible: an urgent input update must win immediately when the
      // user resumes typing after a short pause.
      startSearchTransition(() => setDebouncedSearch(search));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, startSearchTransition]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const [searchScrollTop, setSearchScrollTop] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [info, setInfo] = useState<MetricCatalogNode | null>(null);
  // Oracle discipline (tree.html sha f4057ccc…): the Metrics sidebar must
  // mirror the certified reference 1:1 — every tech, category, group,
  // metric and cell leaf of the oracle is shown by default, including
  // leaves the current capture never observed. Those stay greyed-out and
  // keep their "no_data" tooltip + reason, so the user can still read the
  // full oracle structure without having to toggle a switch. The
  // "Show unavailable" control is kept for symmetry with earlier versions
  // but is now ON by default; a user who prefers the compact view can
  // still turn it OFF to hide the non-selectable leaves.
  const [showUnavailable, setShowUnavailable] = useState(true);
  const [activeOnly, setActiveOnly] = useState(false);
  // 1.103.3 — Partage les options avec `analytics-bootstrap` : persist
  // localStorage + initialData → 2e visite affiche le catalogue instantanément,
  // refetch silencieux en arrière-plan (SWR). Zéro invention.
  const query = useQuery({ ...metricsCatalogQuery(projectId, captureIds), retry: false });
  const normalizedNodes = useMemo(
    () => mergeMetricCatalogTrees(query.data?.nodes ?? [], measuredMetricNodes(measuredEntries)),
    [measuredEntries, query.data?.nodes],
  );
  const byParent = useMemo(() => {
    const result = new Map<string, MetricCatalogNode[]>();
    for (const node of normalizedNodes) {
      const key = node.parent_id ?? rootKey;
      result.set(key, [...(result.get(key) ?? []), node]);
    }
    for (const children of result.values())
      children.sort((a, b) => {
        if (a.node_type === "leaf" && b.node_type === "leaf") {
          const semantic = metricCellSortRank(a) - metricCellSortRank(b);
          if (semantic) return semantic;
        }
        return a.order - b.order || cleanLabel(a.label).localeCompare(cleanLabel(b.label));
      });
    return result;
  }, [normalizedNodes]);
  const availableTree = useMemo(() => {
    if (showUnavailable) return null;
    const nodes = normalizedNodes;
    const byId = new Map(nodes.map((node) => [node.node_id, node]));
    const visible = new Set<string>();
    // Pass 1 — ancestors of every selectable leaf: a Metric that holds at
    // least one measured cell leaf (n > 0) is visible all the way up to
    // the Technology root.
    for (const leaf of nodes) {
      if (leaf.node_type !== "leaf" || !leaf.selectable) continue;
      let current: MetricCatalogNode | undefined = leaf;
      while (current && !visible.has(current.node_id)) {
        visible.add(current.node_id);
        current = current.parent_id ? byId.get(current.parent_id) : undefined;
      }
    }
    // Pass 2 — cell siblings under a visible Metric: the certified oracle
    // (tree.html sha f4057ccc…) lists every cell role (PCell / SCell 1 …
    // SCell 6 / SCG SCell 0 / PSCell / Listed neighbour / Detected
    // neighbour / …) under each metric, regardless of whether the current
    // capture observed them. Showing only the selectable leaf makes the
    // Metrics sidebar look like a strict subset of the oracle. Instead,
    // once a Metric node is visible, surface all its cell children as
    // greyed-out "no data" entries (keeping their reason tooltip + grey
    // rendering) so the tree mirrors the oracle. Non-leaf siblings are
    // left out: only cell leaves gain this exposure.
    for (const node of nodes) {
      if (node.node_type !== "leaf") continue;
      if (visible.has(node.node_id)) continue;
      if (node.parent_id && visible.has(node.parent_id)) {
        const parent = byId.get(node.parent_id);
        if (parent?.node_type === "metric") visible.add(node.node_id);
      }
    }
    return visible;
  }, [normalizedNodes, showUnavailable]);
  // Pre-compute a lowercase haystack per node once (keyed on
  // normalizedNodes), together with the by-id lookup used by the
  // ancestor / descendant walks in `matching`. Everything that doesn't
  // depend on the search needle is lifted out of the per-keystroke path:
  // typing used to re-run `.filter` on all nodes, re-build an array of
  // 10 fields per node, join + lowercase both sides, re-build the by-id
  // map — all on every keystroke on 5000+ nodes.
  const nodeIndex = useMemo(() => {
    const haystacks = new Array<string>(normalizedNodes.length);
    const byId = new Map<string, MetricCatalogNode>();
    for (let i = 0; i < normalizedNodes.length; i += 1) {
      const node = normalizedNodes[i]!;
      byId.set(node.node_id, node);
      // The group title is `label`; leaf identity is
      // `display_code_lisible`. Keep both plus the backend label, event and
      // metric_id in the same precomputed search surface.
      haystacks[i] = metricCatalogSearchText(node);
    }
    return { haystacks, byId };
  }, [normalizedNodes]);
  const matching = useMemo(() => {
    const trimmed = debouncedSearch.trim();
    if (!trimmed) return null;
    const terms = metricCatalogSearchTerms(trimmed);
    const { haystacks, byId } = nodeIndex;
    const own = new Set<string>();
    for (let i = 0; i < normalizedNodes.length; i += 1) {
      if (terms.every((term) => haystacks[i]!.includes(term))) {
        own.add(normalizedNodes[i]!.node_id);
      }
    }
    const visible = new Set(own);
    const descendants = [...own];
    while (descendants.length) {
      const parent = descendants.pop()!;
      for (const child of byParent.get(parent) ?? []) {
        if (visible.has(child.node_id)) continue;
        visible.add(child.node_id);
        descendants.push(child.node_id);
      }
    }
    for (const id of own) {
      let node = byId.get(id);
      while (node?.parent_id) {
        visible.add(node.parent_id);
        node = byId.get(node.parent_id);
      }
    }
    return visible;
  }, [byParent, debouncedSearch, nodeIndex, normalizedNodes]);
  const searchRows = useMemo(() => {
    if (!matching) return [];
    const rows: Array<{ node: MetricCatalogNode; depth: number }> = [];
    const visit = (node: MetricCatalogNode, depth: number) => {
      if (!matching.has(node.node_id)) return;
      rows.push({ node, depth });
      for (const child of byParent.get(node.node_id) ?? []) visit(child, depth + 1);
    };
    for (const root of byParent.get(rootKey) ?? []) visit(root, 0);
    return rows;
  }, [byParent, matching]);
  useEffect(() => {
    setSearchScrollTop(0);
    if (treeScrollRef.current) treeScrollRef.current.scrollTop = 0;
  }, [debouncedSearch]);
  const SEARCH_ROW_HEIGHT = 34;
  const searchWindow = useMemo(() => {
    const viewport = treeScrollRef.current?.clientHeight || 640;
    const overscan = 8;
    const start = Math.max(0, Math.floor(searchScrollTop / SEARCH_ROW_HEIGHT) - overscan);
    const end = Math.min(
      searchRows.length,
      Math.ceil((searchScrollTop + viewport) / SEARCH_ROW_HEIGHT) + overscan,
    );
    return { start, end };
  }, [searchRows.length, searchScrollTop]);

  // 1.134.0 (REPRISE 7 Lot 7) — export CSV avec UNE colonne par capture +
  // Kind / unit / data_type / display_code. Le back fournit l'endpoint
  // `/projects/{pid}/metrics/catalog-csv` qui merge toutes les captures
  // du projet par display_code et renvoie un text/csv direct — jamais
  // de fallback silencieux, jamais de re-calcul côté front.
  const exportAllMetricsCsv = async () => {
    const session = getSession();
    if (!session) {
      alert(t("metrics.exportAllCsvAuth", "Session expirée — rechargez la page."));
      return;
    }
    const url = `${apiBase()}/projects/${encodeURIComponent(projectId)}/metrics/catalog-csv`;
    const res = await fetch(url, {
      headers: {
        Accept: "text/csv",
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!res.ok) {
      alert(
        t("metrics.exportAllCsvError", "Export CSV échoué") + ` (${res.status} ${res.statusText})`,
      );
      return;
    }
    const blob = await res.blob();
    const releaseVer = query.data?.catalog_release?.version ?? "legacy";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bc4-metrics-catalog-${releaseVer}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  // Oracle rendering parity (tree.html sha f4057ccc…):
  //   - at every Technology summary, show "<X> avec valeurs / <Y>"
  //     where X = selectable leaves descendant of this tech, Y = total
  //     oracle leaves under this tech.
  //   - at every Category summary, show "<N> métriques · <M> cellules"
  //     where N = distinct Metric names in this category, M = total
  //     cell leaves in this category.
  // Strings are kept verbatim from the oracle (French) so the sidebar
  // reads exactly like the reference file; no translation shim.
  const descendantStats = useMemo(() => {
    type Stat = { total: number; selectable: number; metrics: Set<string> };
    const empty = (): Stat => ({ total: 0, selectable: 0, metrics: new Set() });
    const stats = new Map<string, Stat>();
    const byIdLocal = new Map<string, MetricCatalogNode>();
    for (const node of normalizedNodes) {
      stats.set(node.node_id, empty());
      byIdLocal.set(node.node_id, node);
    }
    for (const node of normalizedNodes) {
      if (node.node_type !== "leaf") continue;
      const parent = node.parent_id ? byIdLocal.get(node.parent_id) : undefined;
      const metricLabel =
        parent?.node_type === "metric" ? cleanLabel(parent.label) : cleanLabel(node.label);
      let current: MetricCatalogNode | undefined = node;
      while (current) {
        const s = stats.get(current.node_id);
        if (s) {
          s.total += 1;
          if (node.selectable) s.selectable += 1;
          s.metrics.add(metricLabel);
        }
        current = current.parent_id ? byIdLocal.get(current.parent_id) : undefined;
      }
    }
    return stats;
  }, [normalizedNodes]);
  const visibleSelectableCount = useMemo(
    () =>
      normalizedNodes.filter(
        (node) =>
          node.node_type === "leaf" &&
          node.selectable &&
          (!matching && availableTree ? availableTree.has(node.node_id) : true) &&
          (!matching || matching.has(node.node_id)) &&
          (matching || !activeOnly || node.n > 0),
      ).length,
    [activeOnly, availableTree, matching, normalizedNodes],
  );
  useEffect(
    () => onVisibleCountChange?.(visibleSelectableCount),
    [onVisibleCountChange, visibleSelectableCount],
  );
  // Reveal the certified Technology roots on first data arrival: without this
  // the sidebar reads as empty because every root (LTE/NR/CAPTURE/…) is
  // collapsed and no leaf count is drawn next to it. Only runs while the
  // open set is empty so a user who manually collapses a root keeps control
  // on subsequent renders. Scoped to tech level — categories, groups and
  // metrics still expand on demand.
  const visibleTechIds = useMemo(
    () =>
      normalizedNodes
        .filter(
          (node) =>
            node.node_type === "tech" && (!availableTree || availableTree.has(node.node_id)),
        )
        .map((node) => node.node_id),
    [normalizedNodes, availableTree],
  );
  useEffect(() => {
    if (visibleTechIds.length === 0) return;
    setOpen((previous) => (previous.size ? previous : new Set(visibleTechIds)));
  }, [visibleTechIds]);
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
    for (const node of normalizedNodes) collect(node.node_id);
    return cache;
  }, [byParent, normalizedNodes]);
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
    // Oracle-remapped leaves already display the cell role (PCell /
    // SCell N / PSCell / …) as their label; adding the legacy "PER
    // CELL" badge would show the same role twice (PCellPCell …). The
    // badge is a leftover from the pre-oracle verbose labels and is
    // only needed for leaves still rendered with their raw backend
    // label (CAPTURE / Shared / Other branches).
    if (node.parent_id?.startsWith("ref:met:")) return null;
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

  const renderNode = (
    node: MetricCatalogNode,
    renderChildren = true,
    flatDepth?: number,
    virtualTop?: number,
  ): ReactNode => {
    // A content search spans the complete certified catalogue. Availability
    // controls apply only while browsing, never as a hidden search filter.
    if (!matching && availableTree && !availableTree.has(node.node_id)) return null;
    if (matching && !matching.has(node.node_id)) return null;
    const children = byParent.get(node.node_id) ?? [];
    const expanded = Boolean(matching) || open.has(node.node_id);
    // Active only complète le filtre de disponibilité pour les rares feuilles
    // sélectionnables dont le compteur peut être nul après un refetch.
    if (!matching && activeOnly && node.node_type === "leaf" && node.selectable && node.n === 0) {
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
    // BC5 — reference hierarchy labels : groupes et catégorie bilingues via i18n.
    // Préserve aussi la bascule BC1 RC `cell_relation` pour les groupes serving/
    // neighbour hérités du back `_cell_relation_for_tree`.
    const groupKey: Record<string, string> = {
      Serving: "metrics.treeGroup.serving",
      Voisines: "metrics.treeGroup.neighbour",
      "À étiqueter": "metrics.treeGroup.toLabel",
    };
    const categoryKey: Record<string, string> = {
      "Non catégorisé": "metrics.treeCategory.uncategorized",
    };
    const rawLabel = cleanLabel(node.label);
    const label =
      node.node_type === "group" && node.cell_relation
        ? t(node.cell_relation === "serving" ? "metrics.servingCells" : "metrics.neighbourCells")
        : node.node_type === "group" && groupKey[rawLabel]
          ? t(groupKey[rawLabel])
          : node.node_type === "category" && categoryKey[rawLabel]
            ? t(categoryKey[rawLabel])
            : rawLabel;
    const quarantineBadge = node.node_type === "tech" && rawLabel === "QUARANTAINE";
    const measured = node.source === "measured-catalog";
    const selectedForNode = measured ? measuredSelected : selected;
    const isSelected = node.selectable && selectedForNode.includes(node.selection ?? "");
    const isActive = measured && measuredActive === node.selection;
    const canToggle =
      (node.selectable && node.selection
        ? isSelected || (selectionCount ?? selected.length) < MAX_METRICS
        : false) && !scannerBlocked;
    const statusClass =
      node.selectable && node.n > 0
        ? "status-available"
        : node.proof === "open"
          ? "status-pending"
          : "status-unavailable";
    const showMenu = node.node_type === "leaf" && node.selectable;
    const copyPayload =
      node.selection ?? node.metric_id ?? node.source ?? node.source_column ?? node.node_id;

    // 1.107.0 — TECH (racine Technology LTE / NR / Shared / Other).
    // Rendu kpi-tree-root (top-level) ; les catégories deviennent children
    // family. Préserve le design actuel (chevron intégré, bar-click = expand).
    const stat = descendantStats.get(node.node_id);
    if (node.node_type === "tech") {
      // Oracle tech badge "<X> avec valeurs / <Y>" — exact copy of
      // tree.html rendering so the sidebar reads 1:1 with the reference.
      return (
        <li
          key={node.node_id}
          style={
            flatDepth === undefined
              ? undefined
              : {
                  position: "absolute",
                  top: virtualTop,
                  left: Math.min(flatDepth, 4) * 8,
                  right: 0,
                  height: SEARCH_ROW_HEIGHT,
                }
          }
        >
          <button
            className="kpi-tree-root"
            aria-expanded={expanded}
            onClick={() => toggleOpen(node.node_id)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {label}
            {quarantineBadge && (
              <span className="kpi-count ml-2" aria-label="review">
                {t("metrics.quarantineBadge")}
              </span>
            )}
            {stat && stat.total > 0 && (
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                {stat.selectable} avec valeurs / {stat.total}
              </span>
            )}
          </button>
          {renderChildren && expanded && (
            <ul className="ml-2 space-y-1">{children.map((child) => renderNode(child))}</ul>
          )}
        </li>
      );
    }

    // CATEGORIE : rendu kpi-tree-root quand pas sous un tech, sinon family
    // (évite de dupliquer le niveau racine quand l'arbre est "flat").
    if (node.node_type === "category") {
      const underTech = node.parent_id && byParent.has(node.parent_id);
      // Oracle category badge "<N> métriques · <M> cellules" — exact
      // copy of tree.html rendering.
      return (
        <li
          key={node.node_id}
          style={
            flatDepth === undefined
              ? undefined
              : {
                  position: "absolute",
                  top: virtualTop,
                  left: Math.min(flatDepth, 4) * 8,
                  right: 0,
                  height: SEARCH_ROW_HEIGHT,
                }
          }
        >
          <button
            className={underTech ? "kpi-tree-family" : "kpi-tree-root"}
            aria-expanded={expanded}
            onClick={() => toggleOpen(node.node_id)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {label}
            {stat && stat.total > 0 && (
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                {stat.metrics.size} métriques · {stat.total} cellules
              </span>
            )}
          </button>
          {renderChildren && expanded && (
            <ul className="ml-2 space-y-1">{children.map((child) => renderNode(child))}</ul>
          )}
        </li>
      );
    }

    // GROUP ou METRIC parent : même pattern que KPI family
    if (children.length > 0) {
      return (
        <li
          key={node.node_id}
          style={
            flatDepth === undefined
              ? undefined
              : {
                  position: "absolute",
                  top: virtualTop,
                  left: Math.min(flatDepth, 4) * 8,
                  right: 0,
                  height: SEARCH_ROW_HEIGHT,
                }
          }
        >
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
          {renderChildren && expanded && (
            <ul className="ml-2 space-y-1">{children.map((child) => renderNode(child))}</ul>
          )}
        </li>
      );
    }

    // LEAF : même pattern que KPI kpi-tree-leaf
    return (
      <li
        key={node.node_id}
        style={
          flatDepth === undefined
            ? undefined
            : {
                position: "absolute",
                top: virtualTop,
                left: Math.min(flatDepth, 4) * 8,
                right: 0,
                height: SEARCH_ROW_HEIGHT,
              }
        }
      >
        <div
          draggable={node.selectable && Boolean(node.selection) && !disabled}
          onDragStart={(event) => {
            if (!node.selectable || !node.selection || disabled) {
              event.preventDefault();
              return;
            }
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData(
              MAP_METRIC_MIME,
              JSON.stringify({
                kind: "metric",
                code: node.selection,
                label,
                unit: node.unit ?? "",
              }),
            );
          }}
          className={`kpi-tree-leaf ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""} ${!canToggle && !isSelected ? "is-disabled" : ""} ${disabled ? "opacity-45" : ""}`}
          title={scannerTooltip ?? node.reason ?? node.technical_label ?? node.source ?? label}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left"
            onClick={() => setInfo(node)}
            disabled={disabled}
            aria-pressed={isSelected}
            aria-label={t("metrics.46d8d72f28dd", { v0: label })}
            data-testid={`metric-label-${node.node_id}`}
          >
            <span
              className={`kpi-status-dot ${statusClass}`}
              title={node.proof ?? undefined}
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
              <span className="text-[10px] text-muted-foreground">
                {[node.kind, node.unit].filter(Boolean).join(" · ")}
                {search && (node.technical_label ?? node.source) ? (
                  <> · {node.technical_label ?? node.source}</>
                ) : null}
              </span>
            </span>
          </button>
          {/* 1.79.1 — nombre d'observations (node.n) à droite du label,
              aligné sur le pattern KPI tree-root "LTE 84 · 26 AVAIL" */}
          {!measured && (
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
                  className="kpi-icon kpi-leaf-menu"
                  aria-label={`Visualisation ${label}`}
                  disabled={!isSelected && (selectionCount ?? selected.length) >= MAX_METRICS}
                  data-testid={`metric-menu-${node.node_id}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
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
                      excludeGraph={measured}
                      throughput={node.unit === "Mbit/s" || node.unit === "Mbps"}
                      onIntent={(mode: VisualizationType) => {
                        if (mode === "map") onVisualizationIntent?.(node.selection!, "map");
                      }}
                      onChange={(mode: VisualizationType) => {
                        if (
                          mode === "histogram" ||
                          mode === "graph" ||
                          mode === "table" ||
                          mode === "map"
                        ) {
                          if (measured) onMeasuredVisualization?.(node.selection!, mode);
                          else onVisualization(node.selection!, mode as MetricView);
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
    // L'ajout d'une feuille passe exclusivement par son menu ⋮ ; toggleBranch
    // reste disponible pour un éventuel menu de branche.
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
          {/* 1.137.1 — Full release version, including the patch component,
              read verbatim from the active catalogue envelope. */}
          {query.data?.catalog_release?.version && (
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              V{query.data.catalog_release.version}
            </span>
          )}
          <span
            className="ml-auto text-[10px] font-normal text-muted-foreground tabular-nums"
            data-testid="metrics-unified-selection-count"
          >
            {t("metrics.unifiedSelected", { count: selectionCount ?? selected.length })}
          </span>
          <button
            type="button"
            onClick={exportAllMetricsCsv}
            disabled={!normalizedNodes.length}
            title={t("metrics.exportAllCsv", "Exporter tout le catalogue en CSV")}
            aria-label={t("metrics.exportAllCsv", "Exporter tout le catalogue en CSV")}
            data-testid="metrics-sidebar-export-all"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Download size={14} />
          </button>
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
          <p className="text-xs text-destructive">{toUserMessage(query.error)}</p>
          <button className="kpi-button" onClick={() => void query.refetch()}>
            <RefreshCw size={14} /> {t("kpi.d61cacf6ec3e")}
          </button>
        </div>
      )}
      <div
        ref={treeScrollRef}
        className="kpi-tree"
        data-testid="unified-metrics-tree"
        aria-busy={isSearchPending}
        onScroll={(event) => {
          if (matching) setSearchScrollTop(event.currentTarget.scrollTop);
        }}
      >
        {matching ? (
          <ul
            className="relative mx-2"
            style={{ height: searchRows.length * SEARCH_ROW_HEIGHT }}
            data-testid="metrics-search-virtual-list"
          >
            {searchRows
              .slice(searchWindow.start, searchWindow.end)
              .map(({ node, depth }, index) =>
                renderNode(
                  node,
                  false,
                  depth,
                  (searchWindow.start + index) * SEARCH_ROW_HEIGHT,
                ),
              )}
          </ul>
        ) : (
          <ul className="p-2 space-y-1">{tree.map((node) => renderNode(node))}</ul>
        )}
        {debouncedSearch.trim() && matching?.size === 0 && (
          <p className="p-3 text-xs text-muted-foreground" role="status">
            {t("metrics.7f626224ba1f")}
          </p>
        )}
      </div>
      <div className="kpi-catalog-controls" data-testid="metrics-catalog-controls">
        <label
          className="flex items-center gap-2 text-[11px] text-muted-foreground"
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
            onChange={(event) => setActiveOnly(event.target.checked)}
            className="h-3 w-3"
          />
          {t("metrics.activeOnly")}
        </label>
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
              {info.cell_relation && (
                <>
                  <dt className="text-muted-foreground">relation</dt>
                  <dd>{info.cell_relation}</dd>
                </>
              )}
              {info.technical_label && (
                <>
                  <dt className="text-muted-foreground">display_name</dt>
                  <dd className="break-all font-mono">{info.technical_label}</dd>
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
