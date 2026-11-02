import { describe, expect, it } from "vitest";
import {
  buildMetricCellTree,
  mergeMetricCatalogTrees,
} from "@/features/kpi/MetricsCatalogSidebar";
import type { MetricCatalogNode } from "@/lib/api/metrics-schemas";
import { metricsCatalogQuery } from "@/lib/analytics-bootstrap";

const leaf = (overrides: Partial<MetricCatalogNode>): MetricCatalogNode => ({
  node_id: "rsrp-pcell",
  parent_id: "legacy-event",
  order: 0,
  label: "RSRP (LTE) @ Serving",
  note: null,
  source: null,
  node_type: "leaf",
  analytics_tab: "metrics",
  metric_id: "cell_rsrp@lte-type-0",
  selection: "cell_rsrp@lte-type-0",
  event: "CELLMEAS",
  field_idx: 4,
  source_column: "cell_rsrp",
  unit: "dBm",
  cell: "lte-type-0",
  technology: "LTE",
  metric_label: "RSRP",
  cell_label: "PCell",
  cell_system: "LTE",
  raw_cell_type: 0,
  cell_relation: "serving",
  technical_label: "LTE_Serving_RSRP_PCell",
  availability_status: "available",
  n: 4935,
  proof: "documented-2.50",
  selectable: true,
  reason: null,
  ...overrides,
});

describe("Metrics Technology -> Metric -> Cell tree", () => {
  it("isolates the catalogue cache by capture scope during rapid changes", () => {
    expect(metricsCatalogQuery("project", ["capture-a"]).queryKey).toEqual([
      "project-metrics",
      "project",
      "capture-a",
    ]);
    expect(metricsCatalogQuery("project", ["capture-b"]).queryKey).not.toEqual(
      metricsCatalogQuery("project", ["capture-a"]).queryKey,
    );
  });

  it("keeps direct cells when a metric has no certified neighbour distinction", () => {
    const nodes = buildMetricCellTree([
      leaf({}),
      leaf({
        node_id: "rsrp-scell-1",
        metric_id: "cell_rsrp@lte-type-10",
        selection: "cell_rsrp@lte-type-10",
        cell: "lte-type-10",
        cell_label: "SCell 1",
        raw_cell_type: 10,
        n: 120,
      }),
    ]);
    expect(nodes.map((node) => [node.node_type, node.label])).toEqual([
      ["tech", "LTE"],
      ["metric", "RSRP"],
      ["leaf", "PCell"],
      ["leaf", "SCell 1"],
    ]);
    expect(nodes.filter((node) => node.node_type === "metric")).toHaveLength(1);
  });

  it("preserves the reference quarantine hierarchy while attaching measured metrics", () => {
    const quarantineTech: MetricCatalogNode = {
      ...leaf({}),
      node_id: "ref:tech:QUARANTAINE",
      parent_id: null,
      label: "QUARANTAINE",
      node_type: "tech",
      analytics_tab: null,
      selection: null,
      selectable: false,
    };
    const quarantineMetric: MetricCatalogNode = {
      ...leaf({}),
      node_id: "ref:met:QUARANTAINE/UL power/Serving/Power",
      parent_id: quarantineTech.node_id,
      label: "Power",
      node_type: "metric",
      analytics_tab: null,
      selection: null,
      selectable: false,
    };
    const quarantineLeaf = leaf({
      node_id: "legacy-quarantine-leaf",
      parent_id: quarantineMetric.node_id,
      label: "Power @ Serving",
      technology: "LTE",
    });
    const lteTech: MetricCatalogNode = {
      ...quarantineTech,
      node_id: "ref:tech:LTE",
      label: "LTE",
    };
    const measured = leaf({
      node_id: "measured:LTE:LTE_RF_RSRP",
      selection: "LTE_RF_RSRP",
      metric_id: "LTE_RF_RSRP",
      source_column: "LTE_RF_RSRP",
    });

    const nodes = mergeMetricCatalogTrees(
      [lteTech, quarantineTech, quarantineMetric, quarantineLeaf],
      [measured],
    );

    // Oracle discipline (tree.html sha f4057ccc…): LTE / NR / EN-DC /
    // QUARANTAINE branches of the Metrics sidebar must mirror the
    // certified reference exactly. Measured catalogue entries whose root
    // tech lands on one of those four oracle techs are therefore no
    // longer reparented beneath ref:tech:* — they would otherwise show
    // as « No cell scope » project-level KPIs beside PCell / SCell N /
    // PSCell and break the 1:1 oracle alignment. They remain available
    // in the dedicated KPI tab.
    expect(nodes.filter((node) => node.node_type === "tech").map((node) => node.label)).toEqual([
      "LTE",
      "QUARANTAINE",
    ]);
    expect(nodes.find((node) => node.node_id === quarantineLeaf.node_id)?.parent_id).toBe(
      quarantineMetric.node_id,
    );
    expect(nodes.find((node) => node.selection === "LTE_RF_RSRP")).toBeUndefined();
  });

  it("splits a certified CELLMEAS metric into serving and neighbour groups", () => {
    const nodes = buildMetricCellTree([
      leaf({}),
      leaf({
        node_id: "rsrp-neighbour",
        metric_id: "cell_rsrp@lte-type-1",
        selection: "cell_rsrp@lte-type-1",
        cell: "lte-type-1",
        cell_label: "Listed LTE neighbour",
        raw_cell_type: 1,
        cell_relation: "neighbour",
        technical_label: "LTE_Neighbor_RSRP_ListedLTEneighbour",
        n: 105,
      }),
    ]);
    expect(nodes.map((node) => [node.node_type, node.label])).toEqual([
      ["tech", "LTE"],
      ["metric", "RSRP"],
      ["group", "Serving Cells"],
      ["leaf", "PCell"],
      ["group", "Neighbour Cells"],
      ["leaf", "Listed LTE neighbour"],
    ]);
    expect(nodes.find((node) => node.label === "PCell")?.selection).toBe("cell_rsrp@lte-type-0");
  });

  it("does not merge LTE and NR or confuse cell type with physical identity", () => {
    const nodes = buildMetricCellTree([
      leaf({}),
      leaf({
        node_id: "nr-pscell",
        label: "SS-RSRP (NR) @ SCG PSCell",
        metric_id: "ss_rsrp@nr-type-199",
        selection: "ss_rsrp@nr-type-199",
        source_column: "ss_rsrp",
        technology: "NR",
        metric_label: "SS-RSRP",
        cell: "nr-type-199",
        cell_label: "PSCell",
        cell_system: "NR",
        raw_cell_type: 199,
      }),
    ]);
    expect(nodes.filter((node) => node.node_type === "tech").map((node) => node.label)).toEqual([
      "LTE",
      "NR",
    ]);
    expect(nodes.find((node) => node.label === "PSCell")?.cell).toBe("nr-type-199");
  });

  it("deduplicates identical projections and prefers the selectable leaf", () => {
    const nodes = buildMetricCellTree([
      leaf({ node_id: "unavailable", selection: null, selectable: false, n: 0 }),
      leaf({ node_id: "available" }),
      leaf({ node_id: "same-projection", order: 99 }),
    ]);
    expect(nodes.filter((node) => node.node_type === "leaf")).toHaveLength(1);
    expect(nodes.find((node) => node.node_type === "leaf")?.selectable).toBe(true);
  });
});
