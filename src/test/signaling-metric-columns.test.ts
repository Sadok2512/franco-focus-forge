import { describe, expect, it } from "vitest";
import {
  addMetricColumn,
  defaultColumns,
  isMetricCol,
  knownOrder,
  metricColId,
  metricSelector,
  parseColumns,
  removeMetricColumn,
  toggleColumn,
  visibleColumns,
} from "@/features/signaling/message-columns";

const COL = { selector: "cell_rsrp@lte-type-0", label: "RSRP", unit: "dBm" };

describe("signaling metric columns", () => {
  it("adds a metric column at the end, visible by default", () => {
    const next = addMetricColumn(defaultColumns(), COL);
    const id = metricColId(COL.selector);
    expect(next.metrics).toEqual([COL]);
    expect(next.order.at(-1)).toBe(id);
    expect(next.visible).toContain(id);
    expect(visibleColumns(next)).toContain(id);
    expect(knownOrder(next)).toContain(id);
  });

  it("adding the same metric twice does not duplicate it", () => {
    const once = addMetricColumn(defaultColumns(), COL);
    const twice = addMetricColumn(once, COL);
    expect(twice.metrics).toHaveLength(1);
    expect(twice.order.filter((k) => k === metricColId(COL.selector))).toHaveLength(1);
  });

  it("removes a metric column from order, visible and metrics", () => {
    const withCol = addMetricColumn(defaultColumns(), COL);
    const next = removeMetricColumn(withCol, COL.selector);
    expect(next.metrics).toHaveLength(0);
    expect(next.order).not.toContain(metricColId(COL.selector));
    expect(next.visible).not.toContain(metricColId(COL.selector));
  });

  it("round-trips metric columns through localStorage persistence", () => {
    const withCol = addMetricColumn(defaultColumns(), COL);
    const restored = parseColumns(JSON.stringify(withCol));
    expect(restored.metrics).toEqual([COL]);
    expect(restored.order).toContain(metricColId(COL.selector));
    expect(restored.visible).toContain(metricColId(COL.selector));
  });

  it("drops persisted metric ids whose metric definition is gone", () => {
    const withCol = addMetricColumn(defaultColumns(), COL);
    const raw = JSON.stringify({ ...withCol, metrics: [] });
    const restored = parseColumns(raw);
    expect(restored.order).not.toContain(metricColId(COL.selector));
    expect(restored.visible).not.toContain(metricColId(COL.selector));
  });

  it("toggles a metric column hidden without removing it", () => {
    const withCol = addMetricColumn(defaultColumns(), COL);
    const hidden = toggleColumn(withCol, metricColId(COL.selector));
    expect(hidden.metrics).toHaveLength(1);
    expect(visibleColumns(hidden)).not.toContain(metricColId(COL.selector));
  });

  it("identifies metric column ids and extracts the selector", () => {
    const id = metricColId(COL.selector);
    expect(isMetricCol(id)).toBe(true);
    expect(isMetricCol("rsrp")).toBe(false);
    expect(metricSelector(id)).toBe(COL.selector);
  });
});
