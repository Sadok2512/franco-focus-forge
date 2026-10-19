import { describe, expect, it } from "vitest";
import {
  analyticRows,
  appliedPayload,
  chosenStatistic,
  csvText,
  fromSearch,
  operatorColor,
  statistics,
  toggleCode,
} from "@/features/kpi/workspace-model";
import type { ProjectKpiDetail } from "@/lib/api/project-kpi-schemas";
// Contract fixtures are restricted to tests; no synthetic data is imported by UI.
const detail: ProjectKpiDetail = {
  code: "TEST_RSRP",
  name: "Test RSRP",
  techno: "LTE",
  nature: "Mesure",
  unit: "dBm",
  source: "test",
  formula: null,
  status: "AVAILABLE",
  reason: null,
  n: 10,
  result_id: "proof-1",
  groups: [
    { operator: "Orange", band: "B1", n: 4, p10: -110, p50: 0, p90: -60 },
    { operator: "SFR", band: "B3", n: 6, p10: null, p50: null, p90: null },
  ],
};
describe("KPI workspace integrity", () => {
  it("uses canonical unique selections and a bounded limit", () => {
    expect(toggleCode(["A"], "A")).toEqual([]);
    expect(toggleCode(["A"], "B", 1)).toEqual(["A"]);
    expect(toggleCode(["A"], "B", 2)).toEqual(["A", "B"]);
  });
  it("keeps zero, null, units, original population and result_id in the same chart/table rows", () => {
    const before = JSON.stringify(detail),
      rows = analyticRows(detail, "p50");
    expect(rows.map((r) => r.value)).toEqual([0, null]);
    expect(rows.map((r) => r.n)).toEqual([4, 6]);
    expect(rows.every((r) => r.result_id === "proof-1" && r.unit === "dBm")).toBe(true);
    expect(JSON.stringify(detail)).toBe(before);
    expect(csvText(rows)).toContain('"0","dBm","4"');
    expect(csvText(rows)).toContain('"","dBm","6"');
  });
  it("never treats a sample count as a measurement or manufactures time series", () => {
    const data = { ...detail, groups: [{ operator: "Orange", n: 12, p50: null }] };
    expect(analyticRows(data, "value")[0]?.value).toBeNull();
    expect(statistics(data)).toEqual([]);
    expect(analyticRows(detail, "p50")[0]).not.toHaveProperty("time");
  });
  it("withholds unvalidated groups and percentages without a proven positive denominator", () => {
    expect(
      analyticRows(
        { ...detail, groups: [{ operator: "Orange", n: 4, p50: 12, status: "UNVALIDATED" }] },
        "p50",
      )[0]?.value,
    ).toBeNull();
    const ratio = { ...detail, unit: "%", groups: [{ operator: "Orange", n: 4, p50: 50 }] };
    expect(analyticRows(ratio, "p50")[0]?.value).toBeNull();
    expect(
      analyticRows({ ...ratio, groups: [{ ...ratio.groups[0]!, denominator: 4 }] }, "p50")[0]
        ?.value,
    ).toBe(50);
  });
  it("uses n as metric value only for an explicit counter", () => {
    const rows = analyticRows(
      {
        ...detail,
        nature: "Compteur",
        unit: "occurrences",
        groups: [{ operator: "Orange", n: 0, status: "PRESENT" }],
      },
      "value",
    );
    expect(rows[0]?.value).toBe(0);
  });
  it("offers only supplied statistics and does not show unvalidated values", () => {
    expect(statistics(detail)).toEqual(["p10", "p50", "p90"]);
    expect(chosenStatistic(detail, "value")).toBe("p50");
    expect(analyticRows({ ...detail, status: "UNVALIDATED" }, "p50")).toEqual([]);
  });
  it("excludes disabled geography and unsupported values while preserving draft choices", () => {
    const draft = fromSearch({ dor: ["Nord"], op: ["Orange", "Unknown"], band: ["B1"] });
    draft.enabledGeo = [];
    const applied = appliedPayload(draft, {
      dor: { available: true, values: ["Nord"] },
      operators: { available: true, values: ["Orange"] },
      bands: { available: false, values: ["B1"] },
    });
    expect(applied).toEqual({ operator: ["Orange"] });
    expect(draft.values.dor).toEqual(["Nord"]);
  });
  it("reuses the operator palette and quotes CSV labels safely", () => {
    expect(["Orange", "SFR", "Bouygues", "Free", "N/D"].map(operatorColor)).toEqual([
      "#FF7900",
      "#E2001A",
      "#009FE3",
      "#16A34A",
      "#CBD5E1",
    ]);
    const rows = analyticRows({ ...detail, name: 'Metric, "quoted"' }, "p50");
    expect(csvText(rows)).toContain('"Metric, ""quoted"""');
  });
});
