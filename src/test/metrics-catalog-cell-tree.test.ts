import { describe, expect, it } from "vitest";
import {
  buildMetricCellTree,
  buildSimpleMetricTree,
  mergeMetricCatalogTrees,
  metricCellSortRank,
} from "@/features/kpi/MetricsCatalogSidebar";
import type { MetricCatalogNode, SimpleTreeEntry } from "@/lib/api/metrics-schemas";
import { metricsCatalogQuery, metricsCatalogRawQuery } from "@/lib/analytics-bootstrap";

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

describe("Simplified Metrics tree", () => {
  it("builds Technology -> Theme -> KPI -> Cell -> Value from API metadata", () => {
    const definitions: SimpleTreeEntry[] = [
      {
        tech: "LTE",
        theme: "1 · Couverture",
        kpi: "RSRP",
        label: "RSRP serving",
        families: ["cellmeas_rsrp", "cell_rsrp"],
        unit: "dBm",
        status: "ok",
      },
    ];
    const nodes = buildSimpleMetricTree(
      [
        leaf({
          simple_name: "LTE_RSRP_PCELL",
          simple_tech: "LTE",
          simple_theme: "1 · Couverture",
          simple_kpi: "RSRP",
          simple_label: "RSRP serving",
          simple_status: "ok",
        }),
        leaf({
          node_id: "rsrp-scell1",
          metric_id: "cell_rsrp@lte-type-10",
          selection: "cell_rsrp@lte-type-10",
          cell: "lte-type-10",
          cell_label: "SCell 1",
          raw_cell_type: 10,
          simple_name: "LTE_RSRP_SCELL1",
          simple_tech: "LTE",
          simple_theme: "1 · Couverture",
          simple_kpi: "RSRP",
          simple_label: "RSRP serving",
          simple_status: "ok",
        }),
      ],
      definitions,
    );
    expect(nodes.map((node) => [node.node_type, node.label])).toEqual([
      ["tech", "LTE"],
      ["category", "1 · Couverture"],
      ["metric", "RSRP serving"],
      ["group", "PCell"],
      ["leaf", "RSRP"],
      ["group", "SCell 1"],
      ["leaf", "RSRP"],
    ]);
    expect(nodes.find((node) => node.node_type === "metric")?.n).toBe(9870);
  });

  it("adds EARFCN and PCI context below every matching cell", () => {
    const definitions: SimpleTreeEntry[] = [
      {
        tech: "LTE",
        theme: "1 · Couverture",
        kpi: "RSRP",
        label: "RSRP serving",
        families: ["cell_rsrp"],
        unit: "dBm",
        status: "ok",
      },
      {
        tech: "LTE",
        theme: "1 · Couverture",
        kpi: "EARFCN",
        label: "EARFCN",
        families: ["cell_ch"],
        unit: "",
        status: "ok",
      },
      {
        tech: "LTE",
        theme: "1 · Couverture",
        kpi: "PCI",
        label: "PCI",
        families: ["cell_pci"],
        unit: "",
        status: "ok",
      },
    ];
    const nodes = buildSimpleMetricTree(
      [
        leaf({
          simple_name: "LTE_RSRP_PCELL",
          simple_tech: "LTE",
          simple_theme: "1 · Couverture",
          simple_kpi: "RSRP",
        }),
        leaf({
          node_id: "earfcn-pcell",
          metric_id: "cell_ch@lte-type-0",
          selection: "cell_ch@lte-type-0",
          metric_label: "EARFCN",
          simple_name: "LTE_EARFCN_PCELL",
          simple_tech: "LTE",
          simple_theme: "1 · Couverture",
          simple_kpi: "EARFCN",
        }),
        leaf({
          node_id: "pci-pcell",
          metric_id: "cell_pci@lte-type-0",
          selection: "cell_pci@lte-type-0",
          metric_label: "PCI",
          simple_name: "LTE_PCI_PCELL",
          simple_tech: "LTE",
          simple_theme: "1 · Couverture",
          simple_kpi: "PCI",
        }),
      ],
      definitions,
    );
    const rsrpMetric = nodes.find(
      (node) => node.node_type === "metric" && node.label === "RSRP serving",
    )!;
    const pcell = nodes.find(
      (node) => node.parent_id === rsrpMetric.node_id && node.label === "PCell",
    )!;
    expect(
      nodes
        .filter((node) => node.parent_id === pcell.node_id)
        .map((node) => [node.label, node.selection]),
    ).toEqual([
      ["RSRP", "cell_rsrp@lte-type-0"],
      ["EARFCN", "cell_ch@lte-type-0"],
      ["PCI", "cell_pci@lte-type-0"],
    ]);
  });

  it("keeps an OPEN KPI visible without inventing a selectable metric", () => {
    const nodes = buildSimpleMetricTree(
      [],
      [
        {
          tech: "LTE",
          theme: "3 · Débit UL",
          kpi: "THP_UL_MAC",
          label: "Débit MAC UL",
          families: [],
          unit: "Mbit/s",
          status: "open",
        },
      ],
    );
    const placeholder = nodes.find((node) => node.node_type === "leaf");
    expect(placeholder?.label).toBe("Débit MAC UL");
    expect(placeholder?.proof).toBe("open");
    expect(placeholder?.selection).toBeNull();
    expect(placeholder?.selectable).toBe(false);
  });
});

describe("Metrics Technology -> Metric -> Cell tree", () => {
  it("orders PCell and SCells numerically regardless of counts", () => {
    const roles = ["SCELL5", "PCELL", "SCELL4", "SCELL1", "SCELL6"];
    const ordered = roles
      .map((role) => ({
        role,
        rank: metricCellSortRank(
          leaf({ display_code_lisible: `LTE_SERVING_RSRP_${role}`, n: role === "SCELL4" ? 0 : 4 }),
        ),
      }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ role }) => role);
    expect(ordered).toEqual(["PCELL", "SCELL1", "SCELL4", "SCELL5", "SCELL6"]);
  });

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

  it("shares one request while keeping raw leaves for the simplified tree", () => {
    const raw = metricsCatalogRawQuery("project", ["capture-a"]);
    const advanced = metricsCatalogQuery("project", ["capture-a"]);
    expect(raw.queryKey).toEqual(advanced.queryKey);
    expect(raw.select).toBeUndefined();
    expect(advanced.select).toBeTypeOf("function");
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
