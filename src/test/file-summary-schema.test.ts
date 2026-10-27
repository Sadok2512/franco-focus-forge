import { describe, expect, it } from "vitest";
import { FileSummaryResponseSchema } from "@/lib/api/file-summary-schemas";
import {
  compareFileSummaryValues,
  isPositiveFailure,
} from "@/features/projects/file-summary-table";

describe("file summary contract", () => {
  it("preserves a proven zero and the query id", () => {
    const parsed = FileSummaryResponseSchema.parse({
      project_id: "p",
      offset: 0,
      limit: 10,
      total: 1,
      query_id: "q",
      files: [
        {
          file_id: "f",
          filename: "capture.nmf",
          cells: {
            session_fail: {
              value: 0,
              n: 3,
              max: null,
              unit: "count",
              source_event: "DAF",
              reason: null,
              query_id: "q",
            },
          },
        },
      ],
    });
    expect(parsed.files[0]!.cells["session_fail"]?.value).toBe(0);
    expect(parsed.files[0]!.cells["session_fail"]?.query_id).toBe("q");
  });

  it("keeps unavailable data null with its source reason", () => {
    const cell = {
      value: null,
      n: null,
      max: null,
      unit: "ms",
      source_event: "RTT",
      reason: "no RTT in file",
      query_id: "q",
    };
    const result = FileSummaryResponseSchema.safeParse({
      project_id: "p",
      offset: 0,
      limit: 10,
      total: 1,
      query_id: "q",
      files: [{ file_id: "f", filename: "f.nmf", cells: { latency: cell } }],
    });
    expect(result.success).toBe(true);
  });
});

describe("file summary table behavior", () => {
  it("colors only proven positive failure counters", () => {
    const cell = {
      value: 2,
      n: 10,
      max: null,
      unit: "count",
      source_event: "DAF",
      reason: null,
      query_id: "q",
    };
    expect(isPositiveFailure("session_fail", cell)).toBe(true);
    expect(isPositiveFailure("session_fail", { ...cell, value: 0 })).toBe(false);
    expect(isPositiveFailure("dl_total", cell)).toBe(false);
  });

  it("sorts values while keeping unavailable cells last", () => {
    const values = [null, 10, 2, 30];
    expect([...values].sort((a, b) => compareFileSummaryValues(a, b, "asc"))).toEqual([
      2,
      10,
      30,
      null,
    ]);
    expect([...values].sort((a, b) => compareFileSummaryValues(a, b, "desc"))).toEqual([
      30,
      10,
      2,
      null,
    ]);
  });
});
