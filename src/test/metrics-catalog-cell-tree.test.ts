import { describe, expect, it } from "vitest";
import { buildMetricCellTree } from "@/features/kpi/MetricsCatalogSidebar";
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

  it("groups cells under one metric and removes legacy category/event levels", () => {
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
