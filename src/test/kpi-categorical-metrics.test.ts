import { describe, expect, it } from "vitest";

import { MetricSeriesSchema } from "@/lib/api/metrics-schemas";

describe("categorical metric series contract", () => {
  it("accepts a labeled marker with an optional physical cell", () => {
    const payload = MetricSeriesSchema.parse({
      decoder_version: "1.8.2",
      schema_version: "1.8.2",
      decode_level: "deep",
      aggregation: "raw",
      project_id: "project",
      capture_id: "capture",
      result_id: "result",
      origin_seq: 1,
      origin_ts: "00:00:00.000",
      duration_s: 1,
      time_policy: "capture_seq",
      csv: "",
      series: [
        {
          cell: "all",
          code: "rachi_rach_result",
          label: "RACH result",
          unit: "",
          kind: "categorical",
          n_total: 1,
          n_returned: 1,
          sampling: { method: "none", factor: 1, seq_bucket_width: null },
          states: ["1"],
          segments: [],
          points: [
            {
              seq: 42,
              t_rel_s: 0.25,
              value: "1",
              label: "Success",
              cell: "Detected · LTE",
              tooltip: "RACH result: Success",
            },
          ],
        },
      ],
    });

    expect(payload.series[0]?.points[0]?.label).toBe("Success");
    expect(payload.series[0]?.points[0]?.cell).toBe("Detected · LTE");
  });
});
