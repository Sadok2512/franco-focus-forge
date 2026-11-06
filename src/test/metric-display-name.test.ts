import { describe, expect, it } from "vitest";
import {
  canonicalizeMetricsCsv,
  metricDisplayNameMap,
  resolveMetricDisplayName,
} from "@/features/kpi/metric-display-name";
import type { MetricCatalogNode } from "@/lib/api/metrics-schemas";

const leaf = (selection: string, display: string): MetricCatalogNode =>
  ({
    node_id: `leaf:${selection}`,
    parent_id: null,
    order: 0,
    label: "RSRP · Serving · LTE",
    display_code_lisible: display,
    note: null,
    source: "catalog",
    node_type: "leaf",
    analytics_tab: "metrics",
    metric_id: selection,
    selection,
    event: "CELLMEAS",
    field_idx: null,
    source_column: "cell_rsrp",
    unit: "dBm",
    cell: "PCell",
    n: 1,
    proof: "catalog",
    selectable: true,
    reason: null,
  }) as MetricCatalogNode;

describe("canonical metric display names", () => {
  it("uses display_code_lisible for the exact cell selector", () => {
    const names = metricDisplayNameMap([
      leaf("cell_rsrp@lte-type-0", "LTE_RSRP_SERVING_PCELL"),
      leaf("cell_rsrp@lte-type-1", "LTE_RSRP_SERVING_SCELL1"),
    ]);
    expect(resolveMetricDisplayName(names, "cell_rsrp@lte-type-0", "legacy")).toBe(
      "LTE_RSRP_SERVING_PCELL",
    );
    expect(resolveMetricDisplayName(names, "cell_rsrp@lte-type-1!1300:215", "legacy")).toBe(
      "LTE_RSRP_SERVING_SCELL1",
    );
  });

  it("rewrites only the CSV header with canonical catalogue names", () => {
    const names = metricDisplayNameMap([leaf("cell_rsrp@lte-type-0", "LTE_RSRP_SERVING_PCELL")]);
    const csv = 'time,"RSRP · Serving · LTE"\n0,"RSRP · Serving · LTE"\n';
    expect(
      canonicalizeMetricsCsv(
        csv,
        [{ code: "cell_rsrp@lte-type-0", label: "RSRP · Serving · LTE" }],
        names,
      ),
    ).toBe('time,"LTE_RSRP_SERVING_PCELL"\n0,"RSRP · Serving · LTE"\n');
  });
});
