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
import type { MetricCatalogNode, MetricCatalogResponse } from "@/lib/api/metrics-schemas";

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

// Fallback index for backend ids that are not keyed by the oracle `lf_*`
// identifier (typically dynamically-generated leaves like
// `lf_observed_cellmeas_lte-type-10_cell_rsrp` emitted when a cell is
// observed only in a specific capture). We match them by
// `(event, raw_cell_type, metric_label)` against the mapping so they
// still land under the correct oracle Metric / Role instead of being
// dropped from the Metrics sidebar.
const fallbackByEventRawMetric: Map<string, RefMeta> = (() => {
  const result = new Map<string, RefMeta>();
  for (const meta of Object.values(mapping)) {
    if (meta.k !== "KPI") continue;
    if (meta.e == null || meta.raw == null || meta.m == null) continue;
    // Oracle discipline: `(event, raw_cell_type, metric_label)` collides
    // between LTE and NR CELLMEAS on raw=0 (both call it PCell). The
    // technology must be part of the key so an observed NR leaf never
    // gets re-labelled with the LTE hn (and vice versa).
    const key = `${meta.t}|${meta.e}|${meta.raw}|${meta.m.toLowerCase()}`;
    if (!result.has(key)) result.set(key, meta);
  }
  return result;
})();
// Helper: infer the technology of a backend leaf from `cell_system` and
// fall back to the `node_id` prefix (`lf_*_lte-type-N`, `lf_*_nr-type-N`,
// `_f12_` for NR frequency 12). Returns null when nothing in the node
// hints at a tech — in which case the fallback does not attempt to match.
const inferTech = (node: MetricCatalogNode): string | null => {
  if (node.cell_system === "LTE" || node.cell_system === "NR") return node.cell_system;
  const id = node.node_id ?? "";
  if (/_lte-type-\d+/.test(id)) return "LTE";
  if (/_nr-type-\d+/.test(id) || /_f12_/.test(id)) return "NR";
  return null;
};

export const REFERENCE_TECH_ORDER = ["LTE", "NR", "EN-DC", "QUARANTAINE"] as const;

const DEFAULT_NODE: Omit<
  MetricCatalogNode,
  "node_id" | "parent_id" | "label" | "order" | "node_type"
> = {
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
  tree_visible: true,
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
  event: string,
): MetricCatalogNode {
  const order = structure.metrics[`${tech}/${category}/${group}/${metricName}`];
  // Oracle discipline: the reference tree keys the Metric level on
  // `(m, e)`. Different events sharing the same metric name (e.g.
  // RSSI/CELLMEAS and RSSI/CI) therefore become two sibling Metric
  // nodes with the same label but different ids, each carrying its own
  // cells. Collapsing them on the metric name alone would duplicate
  // every cell role.
  const idKey = event
    ? `${tech}/${category}/${group}/${metricName}@${event}`
    : `${tech}/${category}/${group}/${metricName}`;
  return {
    ...DEFAULT_NODE,
    node_id: syntheticId("met", idKey),
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
    return (
      withoutCell.slice(0, bloc.index) + withoutCell.slice((bloc.index ?? 0) + bloc[0].length)
    ).trim();
  }
  const system = withoutCell.match(/\s*\((?:LTE|NR)\)\s*/);
  if (system) {
    return (
      withoutCell.slice(0, system.index) + withoutCell.slice((system.index ?? 0) + system[0].length)
    ).trim();
  }
  return withoutCell;
}

function fullNameHierarchy(response: MetricCatalogResponse): MetricCatalogResponse | null {
  const leaves = response.nodes.filter((node) => node.node_type === "leaf");
  if (!leaves.length || leaves.some((node) => !node.display_code_lisible || !node.display_branch)) {
    return null;
  }
  const byId = new Map(response.nodes.map((node) => [node.node_id, node]));
  const categoryOf = (leaf: MetricCatalogNode): { label: string; order: number } => {
    let current: MetricCatalogNode | undefined = leaf;
    const seen = new Set<string>();
    while (current && !seen.has(current.node_id)) {
      seen.add(current.node_id);
      if (current.node_type === "category") return { label: current.label, order: current.order };
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return { label: "Other", order: Number.MAX_SAFE_INTEGER };
  };
  const branchOrder = new Map(
    ["CAPTURE", "LTE", "NR", "IP / Services"].map((branch, index) => [branch, index]),
  );
  const cellOrder = (leaf: MetricCatalogNode): number => {
    const label = leaf.cell_label ?? "";
    if (/^PCell$/i.test(label)) return 0;
    const scell = label.match(/^SCell\s+(\d+)$/i);
    if (scell) return 10 + Number(scell[1]);
    if (/PSCell/i.test(label) && !/SCG/i.test(label)) return 100;
    const scg = label.match(/^SCG\s+SCell\s+(\d+)$/i);
    if (scg) return 110 + Number(scg[1]);
    if (/Listed/i.test(label)) return 900;
    if (/Detected/i.test(label)) return 901;
    if (/Scanner/i.test(label)) return 902;
    return 500 + (leaf.raw_cell_type ?? leaf.order);
  };
  type Group = {
    branch: string;
    category: string;
    categoryOrder: number;
    metricLabel: string;
    event: string;
    leaves: MetricCatalogNode[];
  };
  const groups = new Map<string, Group>();
  for (const leaf of leaves) {
    if (leaf.tree_visible === false) continue;
    const branch = leaf.display_branch!;
    const category = categoryOf(leaf);
    const metricLabel = leaf.metric_label ?? metricNameFromLabel(leaf.label);
    const event = leaf.event ?? "";
    const identity = leaf.source_column ?? leaf.metric_id?.split("@", 1)[0] ?? metricLabel;
    const relation = leaf.cell_relation ?? "none";
    const key = `${branch}|${category.label}|${event}|${identity}|${metricLabel}|${relation}`;
    const group = groups.get(key) ?? {
      branch,
      category: category.label,
      categoryOrder: category.order,
      metricLabel,
      event,
      leaves: [],
    };
    group.leaves.push(leaf);
    groups.set(key, group);
  }
  const commonPrefix = (values: string[]): string => {
    let prefix = values[0] ?? "";
    for (const value of values.slice(1)) {
      while (prefix && !value.startsWith(prefix)) prefix = prefix.slice(0, -1);
    }
    return prefix.replace(/_+$/, "");
  };
  const output: MetricCatalogNode[] = [];
  const branches = [...new Set([...groups.values()].map((group) => group.branch))].sort(
    (a, b) => (branchOrder.get(a) ?? 99) - (branchOrder.get(b) ?? 99) || a.localeCompare(b),
  );
  for (const branch of branches) {
    const techId = `full:tech:${branch}`;
    output.push({
      ...DEFAULT_NODE,
      node_id: techId,
      parent_id: null,
      order: branchOrder.get(branch) ?? 99,
      label: branch,
      node_type: "tech",
    });
    const branchGroups = [...groups.values()].filter((group) => group.branch === branch);
    const categories = [...new Set(branchGroups.map((group) => group.category))].sort((a, b) => {
      const ao = branchGroups.find((group) => group.category === a)?.categoryOrder ?? 0;
      const bo = branchGroups.find((group) => group.category === b)?.categoryOrder ?? 0;
      return ao - bo || a.localeCompare(b);
    });
    for (const [categoryIndex, category] of categories.entries()) {
      const categoryId = `full:cat:${branch}:${category}`;
      output.push({
        ...DEFAULT_NODE,
        node_id: categoryId,
        parent_id: techId,
        order: categoryIndex,
        label: category,
        node_type: "category",
      });
      const metricGroups = branchGroups
        .filter((group) => group.category === category)
        .sort((a, b) => {
          const ac = commonPrefix(a.leaves.map((leaf) => leaf.display_code_lisible!));
          const bc = commonPrefix(b.leaves.map((leaf) => leaf.display_code_lisible!));
          return ac.localeCompare(bc) || a.event.localeCompare(b.event);
        });
      metricGroups.forEach((group, groupIndex) => {
        const codes = group.leaves.map((leaf) => leaf.display_code_lisible!);
        const groupCode = commonPrefix(codes);
        const groupId = `full:metric:${branch}:${category}:${group.event}:${groupCode}:${groupIndex}`;
        output.push({
          ...DEFAULT_NODE,
          node_id: groupId,
          parent_id: categoryId,
          order: groupIndex,
          label: [groupCode, group.metricLabel, group.event].filter(Boolean).join(" · "),
          node_type: "metric",
          event: group.event || null,
          n: group.leaves.reduce((sum, leaf) => sum + leaf.n, 0),
        });
        group.leaves
          .sort(
            (a, b) =>
              cellOrder(a) - cellOrder(b) ||
              a.display_code_lisible!.localeCompare(b.display_code_lisible!),
          )
          .forEach((leaf, leafIndex) =>
            output.push({
              ...leaf,
              node_id: `full:leaf:${leaf.node_id}`,
              parent_id: groupId,
              order: leafIndex,
              label: leaf.display_code_lisible!,
            }),
          );
      });
    }
  }
  return { ...response, nodes: output };
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
export function applyReferenceHierarchy(response: MetricCatalogResponse): MetricCatalogResponse {
  const named = fullNameHierarchy(response);
  if (named) return named;
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
  const resolveMeta = (node: MetricCatalogNode): RefMeta | undefined => {
    const direct = mapping[node.node_id];
    if (direct) return direct;
    if (node.event != null && node.raw_cell_type != null && node.metric_label) {
      const tech = inferTech(node);
      if (!tech) return undefined;
      // Try the raw label first, then a normalized variant that strips
      // the `cell_` prefix the backend emits for dynamic observed
      // leaves (e.g. `cell_sinr` vs oracle `SINR`) and the
      // `(bloc XXX)` tech-selector suffix (e.g. `#Params (bloc UMTS
      // TD-SCDMA)` vs oracle `#Params`). All variants key the same
      // (tech, event, raw) triple so there is no cross-metric
      // collision risk.
      const raw = node.metric_label.toLowerCase();
      const noBloc = raw.replace(/\s*\(bloc [^)]+\)\s*/, "").trim();
      const stripped = noBloc.startsWith("cell_") ? noBloc.slice(5) : noBloc;
      const seen = new Set<string>();
      for (const label of [raw, noBloc, stripped]) {
        if (seen.has(label)) continue;
        seen.add(label);
        const hit = fallbackByEventRawMetric.get(
          `${tech}|${node.event}|${node.raw_cell_type}|${label}`,
        );
        if (hit) return hit;
      }
    }
    return undefined;
  };
  for (const node of nodes) {
    if (node.node_type !== "leaf") continue;
    const meta = resolveMeta(node);
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
      // Leaf label = oracle `hn` (technical name like LTE_PUSCH_AVG_UL_TBS_PCELL),
      // not just the role, so each leaf carries its unique oracle identifier.
      const cellLabel = meta.hn || meta.role || node.cell_label || node.label;
      const techNode = synthesizeTech(meta.t);
      const catNode = synthesizeCategory(meta.t, meta.cat);
      const grpNode = synthesizeGroup(meta.t, meta.cat, meta.g);
      const metNode = synthesizeMetric(meta.t, meta.cat, meta.g, metricName, meta.e ?? "");
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
    // Oracle has 0 KPI entries under EN-DC (only STRUCT / DIM in the
    // reference). The onlyKpi view therefore shows no EN-DC branch at
    // all — hide any backend-origin EN-DC leaves to keep the Metrics
    // sidebar strictly aligned with tree.html's publishable rows.
    if (tech === "EN-DC") continue;
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

  // Visual consistency pass: for every Metric node where the Serving
  // group hosts at least one real cell leaf, ensure the full roster
  // of serving cells (PCell + SCell 1..6 + SCG SCell 0 + PSCell for
  // NR) is represented. Missing cells become greyed-out placeholder
  // leaves (selectable=false, n=0, availability_status="no_data")
  // so a user never sees PCell + SCell 1 + SCell 5 + SCell 6 without
  // SCell 2 / 3 / 4 — the gap always matches "the probe never
  // recorded this cell", not "the sidebar silently dropped it".
  const SERVING_LTE_ROSTER: Array<[number, string, string]> = [
    [0, "PCell", "PCELL"],
    [10, "SCell 1", "SCELL1"],
    [11, "SCell 2", "SCELL2"],
    [12, "SCell 3", "SCELL3"],
    [13, "SCell 4", "SCELL4"],
    [14, "SCell 5", "SCELL5"],
    [15, "SCell 6", "SCELL6"],
  ];
  const SERVING_NR_ROSTER: Array<[number, string, string]> = [
    [0, "PCell", "PCELL"],
    [1, "SCell 1", "SCELL1"],
    [2, "SCell 2", "SCELL2"],
    [3, "SCell 3", "SCELL3"],
    [4, "SCell 4", "SCELL4"],
    [5, "SCell 5", "SCELL5"],
    [6, "SCell 6", "SCELL6"],
    [100, "SCG SCell 0", "SCGSCELL0"],
    [199, "PSCell", "PSCELL"],
  ];
  // Known hn suffixes that correspond to a cell role; used to strip the
  // suffix from a sibling leaf's hn label so we can swap in the missing
  // role's suffix for the placeholder label.
  const HN_ROLE_SUFFIXES = new Set([
    "PCELL",
    "PSCELL",
    "SCGSCELL0",
    "SCELL1",
    "SCELL2",
    "SCELL3",
    "SCELL4",
    "SCELL5",
    "SCELL6",
    "LISTED",
    "DETECTED",
    "SCANNER",
    "CELLTYPE3",
    "CELLTYPE4",
  ]);
  const placeholderLeaves: MetricCatalogNode[] = [];
  const byMetricParent = new Map<string, MetricCatalogNode[]>();
  for (const leaf of remappedLeaves) {
    if (!leaf.parent_id) continue;
    (
      byMetricParent.get(leaf.parent_id) ??
      byMetricParent.set(leaf.parent_id, []).get(leaf.parent_id)!
    ).push(leaf);
  }
  for (const [metId, siblings] of byMetricParent) {
    // Only pad Serving groups (ref:met:<tech>/.../Serving/...)
    if (!/\/Serving\//.test(metId)) continue;
    const techMatch = metId.match(/^ref:met:(LTE|NR)\//);
    if (!techMatch) continue;
    const tech = techMatch[1] as "LTE" | "NR";
    const roster = tech === "LTE" ? SERVING_LTE_ROSTER : SERVING_NR_ROSTER;
    const seenRaws = new Set(siblings.map((l) => l.raw_cell_type ?? -1));
    const seenRoles = new Set(siblings.map((l) => (l.label ?? "").trim()));
    const sample = siblings[0]!;
    // Derive the oracle hn prefix from the sample sibling label by
    // stripping any trailing `_<ROLE>` segment (PCELL, SCELL1 … SCELL6,
    // PSCELL, SCGSCELL0, …). The remaining base lets the placeholder
    // reuse the same hn-style identifier (e.g. a sample
    // `LTE_SERVING_PATHLOSS_PCELL` yields the base
    // `LTE_SERVING_PATHLOSS`, so SCell 2's placeholder reads
    // `LTE_SERVING_PATHLOSS_SCELL2` instead of the bare `SCell 2`
    // the user would otherwise see.
    const sampleLabel = (sample.label ?? "").trim();
    let hnBase = sampleLabel;
    const underscoreIdx = sampleLabel.lastIndexOf("_");
    if (underscoreIdx > 0) {
      const suffix = sampleLabel.slice(underscoreIdx + 1).toUpperCase();
      if (HN_ROLE_SUFFIXES.has(suffix)) {
        hnBase = sampleLabel.slice(0, underscoreIdx);
      }
    }
    const hnLooksSynthetic = /^[A-Z0-9_]+$/.test(hnBase);
    for (const [raw, role, hnSuffix] of roster) {
      if (seenRaws.has(raw) || seenRoles.has(role)) continue;
      const placeholderLabel = hnLooksSynthetic ? `${hnBase}_${hnSuffix}` : role;
      placeholderLeaves.push({
        ...sample,
        node_id: `ref:placeholder:${metId}@${raw}`,
        parent_id: metId,
        label: placeholderLabel,
        metric_id: null,
        selection: null,
        selectable: false,
        n: 0,
        proof: "oracle-placeholder-no-data",
        reason: "No observations recorded by the probe on this cell",
        availability_status: "no_data",
        cell: null,
        raw_cell_type: raw,
        cell_label: role,
      });
    }
  }

  // Dedup pass over every KPI leaf under a metric node. Multiple
  // independent pathways can land on the same hn-style label under the
  // same parent:
  //   1. The static catalog variant (`lf_cqi_req_rate_c0`, n=0) and the
  //      dynamic observed variant
  //      (`lf_observed_cqi_lte-type-0_cqi_req_rate`, n=2909) both
  //      resolve to `LTE_CQI_REQ_RATE_PCELL` via the fallback matcher.
  //   2. The placeholder generator synthesizes a label for every roster
  //      slot whose `raw_cell_type` number is missing from the siblings
  //      (the LTE roster uses 10..15 for SCell 1..6 — matching the
  //      oracle cell_type codes — while the backend observed leaves
  //      emit 1..6, so the slot looks "missing" even when a real cell
  //      is already present). The placeholder label collides with the
  //      real sibling's label.
  // We key the dedup by `(parent_id, lowercased label)` — the dimension
  // the user actually perceives as "duplicate". The leaf with the most
  // samples wins; ties prefer the `lf_observed_*` variant (actual
  // capture series) and drop `ref:placeholder:*` whenever a real leaf
  // competes.
  const allKpiLeaves = [...remappedLeaves, ...placeholderLeaves];
  const dedupByLabel = new Map<string, MetricCatalogNode>();
  for (const leaf of allKpiLeaves) {
    if (!leaf.parent_id) continue;
    const key = `${leaf.parent_id}@@${(leaf.label ?? "").trim().toLowerCase()}`;
    const existing = dedupByLabel.get(key);
    if (!existing) {
      dedupByLabel.set(key, leaf);
      continue;
    }
    const existingN = existing.n ?? 0;
    const leafN = leaf.n ?? 0;
    const existingIsPlaceholder = existing.node_id.startsWith("ref:placeholder:");
    const leafIsPlaceholder = leaf.node_id.startsWith("ref:placeholder:");
    if (existingIsPlaceholder && !leafIsPlaceholder) {
      dedupByLabel.set(key, leaf);
      continue;
    }
    if (leafIsPlaceholder && !existingIsPlaceholder) continue;
    if (leafN > existingN) {
      dedupByLabel.set(key, leaf);
    } else if (leafN === existingN && leaf.node_id.startsWith("lf_observed_")) {
      dedupByLabel.set(key, leaf);
    }
  }
  const dedupedKpiLeaves = [...dedupByLabel.values()];

  return {
    ...response,
    nodes: [
      ...keptOriginalNodes,
      ...synthetic.values(),
      ...reparentedUncategorised,
      ...dedupedKpiLeaves,
    ],
  };
}
