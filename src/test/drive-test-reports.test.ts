import { describe, expect, it } from "vitest";
import { DriveTestReportDataSchema, DriveTestFiltersSchema } from "@/lib/api/drive-test-reports";
import { summaryValueClass } from "@/features/rf-modules/DriveTestReportsPage";

describe("drive-test report contracts", () => {
  it("uses semantic summary colors without presenting missing values as valid", () => {
    expect(summaryValueClass("Service Success Rate", "98.2")).toContain("emerald");
    expect(summaryValueClass("Failure Count", "3")).toContain("rose");
    expect(summaryValueClass("DL Throughput Avg", "125")).toContain("blue");
    expect(summaryValueClass("DL Throughput Avg", "N/A")).toContain("slate");
  });
  it("accepts explicit empty coverage and nullable KPI values", () => {
    expect(DriveTestFiltersSchema.parse({
      project_id: "p1", captures: [], operators: [], rats: [], bands: [],
      services: [], cells: [], sites: [], time_min: null, time_max: null,
    }).captures).toEqual([]);
    const parsed = DriveTestReportDataSchema.parse({
      project_id: "p1", filters: {}, methodology: "no interpolation",
      split_by: "none", groups: [],
      population: { samples: 0, returned: 0, sampling: "none" },
      metrics: [{ code: "dl", label: "DL", unit: "Mbit/s", status: "UNAVAILABLE", reason: "missing", n: 0, avg: null, p10: null, p50: null, p90: null, max: null }],
      unsupported: [{ code: "mcs_dl", status: "UNAVAILABLE", value: null, n: 0, reason: "missing" }],
      points: [], tasks: [], task_summary: { attempts: 0, successes: 0, failures: 0, avg_duration_s: null, volume_bytes: null },
      services: [], failures: [], sources: [],
    });
    expect(parsed.metrics[0]?.avg).toBeNull();
    expect(parsed.unsupported[0]?.value).toBeNull();
  });

  it("accepts backend-calculated operator report groups", () => {
    const summary = { attempts: 2, successes: 1, failures: 1, avg_duration_s: 3, volume_bytes: 1000 };
    const metric = { code: "dl", label: "DL", unit: "Mbit/s", status: "AVAILABLE", reason: null, n: 2, avg: 20, p10: 10, p50: 20, p90: 30, max: 30 };
    const parsed = DriveTestReportDataSchema.parse({
      project_id: "p1", filters: { split_by: "operator" }, methodology: "no interpolation",
      split_by: "operator", groups: [{ key: "Operator A", label: "Operator A", population: { samples: 2, returned: 2 }, metrics: [metric], task_summary: summary, sources: ["s1"] }],
      population: { samples: 2, returned: 2, sampling: "none" }, metrics: [metric],
      unsupported: [], points: [], tasks: [], task_summary: summary, services: [], failures: [], sources: ["s1"],
    });
    expect(parsed.groups[0]?.key).toBe("Operator A");
  });
});
