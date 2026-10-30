import { describe, expect, it } from "vitest";
import { metricRequestQuery } from "@/lib/api/metrics";

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
});
