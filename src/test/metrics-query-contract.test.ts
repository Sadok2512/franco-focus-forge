import { describe, expect, it, vi } from "vitest";
import { getMetricMap, metricRequestQuery } from "@/lib/api/metrics";

vi.mock("@/lib/api/project-kpi", () => ({ kpiFetch: vi.fn() }));
import { kpiFetch } from "@/lib/api/project-kpi";

describe("Metrics request query contract", () => {
  it("emits capture_id exactly once when workspace filters already contain it", () => {
    const query = metricRequestQuery(
      "a4b0c321c52e",
      { capture_id: "stale-capture", operator: ["Orange"] },
      { codes: "cell_rsrp@lte-serving", include_map: "true" },
    );

    expect(query.getAll("capture_id")).toEqual(["a4b0c321c52e"]);
    expect(query.getAll("operator")).toEqual(["Orange"]);
    expect(query.get("include_map")).toBe("true");
  });

  it("uses the dedicated map endpoint once for every selected code", () => {
    getMetricMap(
      "project-a",
      "a4b0c321c52e",
      ["cell_rsrp@lte-serving", "cell_rsrq@lte-serving"],
      { operator: ["Orange"] },
      new AbortController().signal,
    );

    expect(kpiFetch).toHaveBeenCalledTimes(1);
    const url = vi.mocked(kpiFetch).mock.calls[0]?.[0] ?? "";
    expect(url).toMatch(/^\/projects\/project-a\/metrics\/map\?/);
    const query = new URLSearchParams(url.split("?")[1]);
    expect(query.get("codes")).toBe("cell_rsrp@lte-serving,cell_rsrq@lte-serving");
    expect(query.get("capture_id")).toBe("a4b0c321c52e");
    expect(query.get("operator")).toBe("Orange");
    expect(url).not.toContain("/metrics/table");
  });
});
