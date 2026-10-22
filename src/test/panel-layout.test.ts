import { describe, expect, it } from "vitest";
import { EMPTY_LAYOUT, loadLayout, movePanel, panelOrder, saveLayout } from "@/features/kpi/panel-layout";

describe("unified panel layout", () => {
  it("mixes KPI and metric panels in one order and moves across types", () => {
    const present = ["kpi:A", "kpi:B", "metric:x@0"];
    const next = movePanel(EMPTY_LAYOUT, present, "metric:x@0", "kpi:A");
    expect(next.order).toEqual(["metric:x@0", "kpi:A", "kpi:B"]);
    expect(panelOrder(next, "kpi:B", 1)).toBe(2);
  });
  it("persists custom titles per workspace", () => {
    saveLayout("ws1", { ...EMPTY_LAYOUT, titles: { "kpi:A": "Mon RACH" } });
    expect(loadLayout("ws1").titles["kpi:A"]).toBe("Mon RACH");
    expect(loadLayout("ws2").titles["kpi:A"]).toBeUndefined();
  });
});
