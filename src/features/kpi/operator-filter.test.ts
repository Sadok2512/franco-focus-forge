import { describe, expect, it } from "vitest";
import { appliedPayload, fromSearch, toSearch } from "./workspace-model";
import { taskQuery } from "@/lib/api/task-analytics";
import type { ProjectKpiFilters } from "@/lib/api/project-kpi-schemas";

const dimensions = {
  operators: { available: true, reason: null, values: ["TEST-op-A", "TEST-op-B"] },
} as ProjectKpiFilters;
describe("operator selection contract", () => {
  it("keeps unrestricted, empty, and all identified selections distinct through URL and requests", () => {
    for (const operator of [undefined, [], ["TEST-op-A"], ["TEST-op-A", "TEST-op-B"]]) {
      const filters = appliedPayload(
        { values: operator === undefined ? {} : { operator }, enabledGeo: [] },
        dimensions,
      );
      expect(filters.operator).toEqual(operator);
      expect(appliedPayload(fromSearch(toSearch(filters)), dimensions)).toEqual(filters);
      const query = new URLSearchParams(taskQuery(filters));
      expect(query.get("operator_mode")).toBe(operator?.length === 0 ? "none" : null);
      expect(query.getAll("operator")).toEqual(operator ?? []);
    }
  });
  it("does not silently widen an invalid explicit selection", () => {
    expect(
      appliedPayload({ values: { operator: ["TEST-invalid"] }, enabledGeo: [] }, dimensions)
        .operator,
    ).toEqual([]);
  });
  it("does not mutate the applied selection when drafting", () => {
    const applied = fromSearch({ op: ["TEST-op-A"] });
    const draft = { ...applied, values: { ...applied.values, operator: ["TEST-op-B"] } };
    expect(appliedPayload(applied, dimensions).operator).toEqual(["TEST-op-A"]);
    expect(appliedPayload(draft, dimensions).operator).toEqual(["TEST-op-B"]);
  });
  it("serializes capture and other filters alongside operators", () => {
    const query = new URLSearchParams(
      taskQuery({
        capture_id: "TEST-cap",
        operator: ["TEST-op-A", "TEST-op-B"],
        band: ["TEST-band"],
      }),
    );
    expect(query.get("capture_id")).toBe("TEST-cap");
    expect(query.getAll("operator")).toEqual(["TEST-op-A", "TEST-op-B"]);
    expect(query.getAll("band")).toEqual(["TEST-band"]);
  });
});
