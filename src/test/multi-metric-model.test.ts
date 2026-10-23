import { describe, expect, it } from "vitest";
import { addGraphMetric, metricAxes, normalizeUnit, seriesColor, validateMetricDrop, type GraphMetric } from "@/features/kpi/multi-metric-model";
import { encodeTabs, decodeTabs, newTabsState, updateTab } from "@/features/kpi/workspace-tabs";
const metric = (selection: string, unit: string): GraphMetric => ({ selection, unit, label: selection, tech: "LTE", kind: "numeric" });
describe("Multi-metric physical and panel integrity", () => {
  it("appends without replacing the existing throughput", () => {
    const a = metric("pdsch_bitrate@0", "Mbit/s"); const b = metric("pdsch_bitrate_cw0@0", "Mbit/s");
    expect(addGraphMetric({ metrics: [a] }, b).metrics).toEqual([a, b]);
  });
  it("does not add duplicate cell selections", () => {
    const a = metric("pdsch_bitrate@0", "Mbit/s");
    expect(addGraphMetric({ metrics: [a] }, a).metrics).toEqual([a]);
  });
  it("shares Mbit/s and Mbps on a single physical axis", () => expect(metricAxes([metric("a", "Mbit/s"), metric("b", "Mbps")])).toEqual(["Mbit/s"]));
  it("normalizes the three explicit aliases without silently scaling units", () => {
    expect(["Mbps", "kbps", "bps", "ms", "s"].map(normalizeUnit)).toEqual(["Mbit/s", "kbit/s", "bit/s", "ms", "s"]);
  });
  it("adds dBm on a second axis distinct from throughput", () => expect(metricAxes([metric("a", "Mbit/s"), metric("rsrp", "dBm")])).toEqual(["Mbit/s", "dBm"]));
  it("rejects a third incompatible unit without mutating the graph", () => {
    const config = { metrics: [metric("a", "Mbit/s"), metric("rsrp", "dBm")] };
    expect(validateMetricDrop(config.metrics, metric("snr", "dB"))).toBe("thirdUnit");
    expect(addGraphMetric(config, metric("snr", "dB"))).toBe(config);
  });
  it("never merges dB and dBm", () => expect(metricAxes([metric("a", "dB"), metric("b", "dBm")])).toEqual(["dB", "dBm"]));
  it("rejects categorical series", () => expect(validateMetricDrop([], { ...metric("band", "MHz"), kind: "categorical" })).toBe("categorical"));
  it("uses distinct stable colours", () => expect(seriesColor(metric("a", "Mbit/s"), 0)).not.toBe(seriesColor(metric("b", "Mbit/s"), 1)));
  it("retains series, colour and visibility through tab roundtrip without changing another tab", () => {
    const state = newTabsState(); const id = state.activeTabId;
    const other = { ...state.tabs[0], id: "other", name: "Other", codes: [], metricCodes: ["other@0"], activeCode: null, layout: "auto" as const, overlay: false };
    const next = updateTab({ ...state, tabs: [...state.tabs, other] }, id, { metricGraphs: { "a@0": { metrics: [{ ...metric("a@0", "Mbit/s"), color: "#2563EB", hidden: true }, metric("b@0", "Mbps")] } } });
    expect(decodeTabs(encodeTabs(next))?.tabs[0]?.metricGraphs).toEqual(next.tabs[0]?.metricGraphs);
    expect(next.tabs[1]).toBe(other);
  });
});