import { describe, expect, it } from "vitest";
import { filterDistribution } from "@/features/dict-v2/distribution-view";
import type { DictDistributionResponse } from "@/lib/api/dict-v2";

// Test-only aggregates. Never imported by production code.
const response: DictDistributionResponse = {
  project_id: "test",
  group_by: "operator_band",
  blocks: [
    {
      param_key: "test-parameter",
      display_name: "Test",
      origin: "network_config",
      n_total: 10,
      distinct_values: 2,
      verdict: "DIFFERENT",
      comparability: "COMPARABLE",
      result_id: "evidence-original",
      values: [
        {
          value: "a",
          value_display: "a",
          groups: [
            { operator: "Orange", band: "B1", n: 2 },
            { operator: "Orange", band: "B3", n: 3 },
            { operator: "SFR", band: "B1", n: 4 },
          ],
        },
        { value: "b", value_display: "b", groups: [{ operator: null, band: null, n: 1 }] },
      ],
    },
  ],
};
describe("RRC effective distribution", () => {
  it("preserves unfiltered response, evidence and backend verdict exactly", () => {
    expect(filterDistribution(response, [], [], "operator_band")).toBe(response);
  });
  it("intersects operator and band before grouping, without mutating API data", () => {
    const original = JSON.stringify(response);
    const block = filterDistribution(response, ["Orange"], ["B1"], "operator")!.blocks[0]!;
    expect(block.n_total).toBe(2);
    expect(block.distinct_values).toBe(1);
    expect(block.values[0]!.groups).toHaveLength(1);
    expect(block.result_id).toBe("evidence-original");
    expect(block.verdict).toBe("DIFFERENT");
    expect(JSON.stringify(response)).toBe(original);
  });
  it("aggregates both bands into the same operator for charts and table", () => {
    const block = filterDistribution(response, ["Orange"], [], "operator")!.blocks[0]!;
    expect(block.values[0]!.groups[0]!.n).toBe(5);
    expect(block.n_total).toBe(5);
  });
  it("keeps absent groups absent instead of adding zero observations", () => {
    const block = filterDistribution(response, ["Free"], [], "operator")!.blocks[0]!;
    expect(block.values).toEqual([]);
    expect(block.n_total).toBe(0);
    expect(filterDistribution(null, ["Orange"], [], "operator")).toBeNull();
  });
});
