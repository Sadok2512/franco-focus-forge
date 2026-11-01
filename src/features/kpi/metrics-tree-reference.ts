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

  for (const node of nodes) {
    if (node.node_type !== "leaf") continue;
    const meta = mapping[node.node_id];
    if (meta) {
      const metricName = metricNameFromLabel(node.label);
      const techNode = synthesizeTech(meta.t);
      const catNode = synthesizeCategory(meta.t, meta.cat);
      const grpNode = synthesizeGroup(meta.t, meta.cat, meta.g);
      const metNode = synthesizeMetric(meta.t, meta.cat, meta.g, metricName);
      ensureSynthetic(techNode);
      ensureSynthetic(catNode);
      ensureSynthetic(grpNode);
      ensureSynthetic(metNode);
      // Preserve metric_id, selection, selectable, n, proof, reason, cell;
      // only parent_id and order change. Label is kept so the sidebar
      // still shows the cell leaf as the back labelled it.
      remappedLeaves.push({
        ...node,
        parent_id: metNode.node_id,
        order: roundOrder(meta.o),
      });
    } else {
      keptLeaves.push(node);
    }
  }

  // Keep non-leaf nodes only if they lead to a kept leaf. Walk ancestors
  // of kept leaves and mark them visible.
  const visibleOriginalIds = new Set<string>();
  for (const leaf of keptLeaves) {
    let current: MetricCatalogNode | undefined = leaf;
    while (current && !visibleOriginalIds.has(current.node_id)) {
      visibleOriginalIds.add(current.node_id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }

  const keptOriginalNodes = nodes.filter(
    (node) => node.node_type === "leaf" ? !mapping[node.node_id] : visibleOriginalIds.has(node.node_id),
  );

  return {
    ...response,
    nodes: [...keptOriginalNodes, ...synthetic.values(), ...remappedLeaves],
  };
}
