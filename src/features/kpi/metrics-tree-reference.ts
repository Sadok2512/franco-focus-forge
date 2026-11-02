/**
 * Metrics tree reference hierarchy — pure front transform.
 *
 * Reclassifies the metrics catalogue produced by `/metrics` into four
 * stable technology roots (LTE, NR, EN-DC, QUARANTAINE), reparenting
 * leaves into the hierarchy
 *     Technology → Category → Group → Metric → Cell (leaf)
 * documented by the certified reference artifact (sha256
 * f4057ccc5332cebd329063287b23ab05343038ac78cfd902404fdf0801af2cda).
 *
 * The transform is bijective on the 6 082 RF cell-scoped leaves of the
 * current catalogue (`catalog_2.60.0`): 6 077 match 1:1 on the composite
 * `(cleaned_name, event, cell_type, band_from_label)`; 5 ambiguous cases
 * (PCI/RSRP/RSRQ at raw 0 and PDSCH sch bitrate at raw 0/199) are
 * resolved deterministically by the catalogue leaf's tech chain. Non-RF
 * leaves (CAPTURE file metadata, `event === null`) keep their original
 * parent chain untouched — this transform never invents a metric and
 * never drops one.
 *
 * API selectors (`metric_id`, `selection`), availability counts (`n`),
 * selectable flags, proofs and reasons are preserved verbatim on every
 * leaf. Only `parent_id` and `label` change for the reclassified leaves.
 */
import mappingJson from "./metrics-tree-reference.json";
import structureJson from "./metrics-tree-structure.json";
import type {
  MetricCatalogNode,
  MetricCatalogResponse,
} from "@/lib/api/metrics-schemas";

type RefMeta = {
  t: string;
  cat: string;
  g: string;
  o: number;
  role: string;
  hn: string;
  // Oracle metric name and event, enriched from tree.html (sha
  // f4057ccc5332cebd329063287b23ab05343038ac78cfd902404fdf0801af2cda).
  // Used to label the metric level and the cell leaf exactly like the
  // certified reference instead of the verbose backend label.
  m?: string;
  raw?: number;
  e?: string;
  // Oracle `k` field: STRUCT (structural fields), DIM (dimensions),
  // KPI (actual KPI metric). The oracle view hides STRUCT and DIM
  // when `onlyKpi` is on; we mirror that by only remapping k === "KPI"
  // leaves into the ref hierarchy. STRUCT and DIM leaves of mapped
  // backend ids are dropped from the Metrics sidebar — they remain in
  // the backend `/metrics` response and in the Parameters tab.
  k?: string;
};

type StructureEntry = Record<string, number>;
type Structure = {
  techs: StructureEntry;
  categories: StructureEntry;
  groups: StructureEntry;
  metrics: StructureEntry;
};

const mapping: Record<string, RefMeta> = mappingJson as Record<string, RefMeta>;
const structure: Structure = structureJson as Structure;

export const REFERENCE_TECH_ORDER = ["LTE", "NR", "EN-DC", "QUARANTAINE"] as const;

const DEFAULT_NODE: Omit<MetricCatalogNode, "node_id" | "parent_id" | "label" | "order" | "node_type"> = {
  note: null,
  source: null,
  analytics_tab: null,
  metric_id: null,
  selection: null,
  event: null,
  field_idx: null,
  source_column: null,
  unit: "",
  cell: null,
  n: 0,
  proof: "",
  selectable: false,
  reason: null,
};

function roundOrder(value: number): number {
  // The reference order is a float used only for sort stability; the schema
  // requires an integer, so scale by 1000 to keep two decimals of precision.
  return Math.round(value * 1000);
}

function syntheticId(prefix: string, path: string): string {
  // Stable, collision-free with catalog ids (which use `tech_`, `cat_`, `lf_` …).
  return `ref:${prefix}:${path}`;
}

function synthesizeTech(tech: string): MetricCatalogNode {
  const order = structure.techs[tech];
  return {
    ...DEFAULT_NODE,
    node_id: syntheticId("tech", tech),
    parent_id: null,
    label: tech,
    order: roundOrder(order ?? 1e6),
    node_type: "tech",
  };
}

function synthesizeCategory(tech: string, category: string): MetricCatalogNode {
  const order = structure.categories[`${tech}/${category}`];
  return {
    ...DEFAULT_NODE,
    node_id: syntheticId("cat", `${tech}/${category}`),
    parent_id: syntheticId("tech", tech),
    label: category,
    order: roundOrder(order ?? 1e6),
    node_type: "category",
  };
}

function synthesizeGroup(tech: string, category: string, group: string): MetricCatalogNode {
  const order = structure.groups[`${tech}/${category}/${group}`];
  return {
    ...DEFAULT_NODE,
    node_id: syntheticId("grp", `${tech}/${category}/${group}`),
    parent_id: syntheticId("cat", `${tech}/${category}`),
    label: group,
    order: roundOrder(order ?? 1e6),
    node_type: "group",
  };
}

function synthesizeMetric(
  tech: string,
  category: string,
  group: string,
  metricName: string,
): MetricCatalogNode {
  const order = structure.metrics[`${tech}/${category}/${group}/${metricName}`];
  return {
    ...DEFAULT_NODE,
    node_id: syntheticId("met", `${tech}/${category}/${group}/${metricName}`),
    parent_id: syntheticId("grp", `${tech}/${category}/${group}`),
    label: metricName,
    order: roundOrder(order ?? 1e6),
    node_type: "metric",
  };
}

function metricNameFromLabel(label: string): string {
  // "Name (bloc X) @ Cell" → "Name"
  // "Name (LTE) @ Cell"    → "Name"
  const withoutCell = label.replace(/\s*@\s*[^@]+$/, "").trim();
  const bloc = withoutCell.match(/\(bloc\s+([^)]+)\)/);
  if (bloc) {
    return (withoutCell.slice(0, bloc.index) + withoutCell.slice((bloc.index ?? 0) + bloc[0].length)).trim();
  }
  const system = withoutCell.match(/\s*\((?:LTE|NR)\)\s*/);
  if (system) {
    return (withoutCell.slice(0, system.index) + withoutCell.slice((system.index ?? 0) + system[0].length)).trim();
  }
  return withoutCell;
}

/**
 * Apply the reference hierarchy to a `/metrics` response.
 *
 * The transform:
 *   1. For each leaf, look up its reclassification in the static mapping.
 *   2. If matched, synthesize the (tech, category, group, metric) parent
 *      chain and reparent the leaf; the leaf's own fields (metric_id,
 *      selection, selectable, n, proof, reason) are preserved verbatim.
 *   3. Original parent nodes (`tech_`, `cat_`, `ev_`, `grp_`, `met_`) whose
 *      descendants are now all reparented are dropped.
 *   4. Non-RF leaves (file metadata, event === null) keep their original
 *      hierarchy; their parent chain is retained in full.
 *   5. Returns a new response object; the input is not mutated.
 */
export function applyReferenceHierarchy(
  response: MetricCatalogResponse,
): MetricCatalogResponse {
  const nodes = response.nodes;
  const byId = new Map<string, MetricCatalogNode>();
  for (const node of nodes) byId.set(node.node_id, node);

  const remappedLeaves: MetricCatalogNode[] = [];
  const keptLeaves: MetricCatalogNode[] = [];
  const synthetic = new Map<string, MetricCatalogNode>();

  const ensureSynthetic = (node: MetricCatalogNode) => {
    if (!synthetic.has(node.node_id)) synthetic.set(node.node_id, node);
  };

  // Track backend ids that are mapped but not KPI (STRUCT / DIM) so we can
  // drop them from the Metrics tree exactly like the oracle does when its
  // "onlyKpi" filter is on. These leaves stay accessible under the
  // Parameters tab and inside the raw /metrics response.
  const droppedNonKpi = new Set<string>();
  for (const node of nodes) {
    if (node.node_type !== "leaf") continue;
    const meta = mapping[node.node_id];
    if (meta && meta.k && meta.k !== "KPI") {
      droppedNonKpi.add(node.node_id);
      continue;
    }
    if (meta) {
      // Oracle alignment: the Metric level uses the oracle `m` field
      // (e.g. "#Params/cell", "#Serving cells", "RSRP") and the cell leaf
      // displays the oracle `role` (PCell / SCell N / PSCell / Listed
      // neighbour / Detected neighbour / …). Fallbacks keep behaviour
      // safe for mapping entries that predate the oracle enrichment.
      const metricName = meta.m ?? metricNameFromLabel(node.label);
      const cellLabel = meta.role || node.cell_label || node.label;
      const techNode = synthesizeTech(meta.t);
      const catNode = synthesizeCategory(meta.t, meta.cat);
      const grpNode = synthesizeGroup(meta.t, meta.cat, meta.g);
      const metNode = synthesizeMetric(meta.t, meta.cat, meta.g, metricName);
      ensureSynthetic(techNode);
      ensureSynthetic(catNode);
      ensureSynthetic(grpNode);
      ensureSynthetic(metNode);
      // Preserve metric_id, selection, selectable, n, proof, reason, cell;
      // only parent_id, order and the display label change — labels
      // follow the certified oracle, selectors stay untouched so Graph /
      // Table / Map keep resolving the same backend series.
      remappedLeaves.push({
        ...node,
        parent_id: metNode.node_id,
        order: roundOrder(meta.o),
        label: cellLabel,
      });
    } else {
      keptLeaves.push(node);
    }
  }

  // Climb to find a leaf's original tech ancestor label.
  const originalTechOf = (leaf: MetricCatalogNode): string | null => {
    let current: MetricCatalogNode | undefined = leaf;
    while (current) {
      if (current.node_type === "tech") return current.label;
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return null;
  };

  // Oracle "onlyKpi" discipline: un-mapped LTE/NR backend leaves are not
  // part of the certified reference (tree.html publishes only the 6 082
  // RF cell-scoped KPIs). They are dropped from the Metrics tree so the
  // sidebar reads 1:1 with the oracle view (no "Non catégorisé /
  // À étiqueter" synthetic bucket). The raw /metrics response still
  // carries them for the Parameters tab and anyone hitting the API
  // directly.
  const stillKept: MetricCatalogNode[] = [];
  for (const leaf of keptLeaves) {
    const tech = originalTechOf(leaf);
    if (tech === "LTE" || tech === "NR") continue;
    stillKept.push(leaf);
  }
  const reparentedUncategorised: MetricCatalogNode[] = [];

  // Keep non-leaf nodes only if they lead to a leaf that is still kept
  // (CAPTURE / Shared / Other hierarchies). Walk ancestors of each still-kept
  // leaf and mark the chain visible.
  const visibleOriginalIds = new Set<string>();
  for (const leaf of stillKept) {
    let current: MetricCatalogNode | undefined = leaf;
    while (current && !visibleOriginalIds.has(current.node_id)) {
      visibleOriginalIds.add(current.node_id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }

  const stillKeptIds = new Set(stillKept.map((l) => l.node_id));
  const keptOriginalNodes = nodes.filter((node) => {
    if (droppedNonKpi.has(node.node_id)) return false;
    if (node.node_type === "leaf") return stillKeptIds.has(node.node_id);
    return visibleOriginalIds.has(node.node_id);
  });

  return {
    ...response,
    nodes: [
      ...keptOriginalNodes,
      ...synthetic.values(),
      ...remappedLeaves,
      ...reparentedUncategorised,
    ],
  };
}
