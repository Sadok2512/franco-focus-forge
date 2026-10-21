import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MetricSchema, MetricAnalysisSchema } from "@/lib/api/metrics-schemas";
// Optional manual guard against captured live TEST2 responses; no synthetic RF values.
const audit = process.env["BC2_METRICS_AUDIT"];
describe.skipIf(!audit)("Metrics v3 live contract", () => {
  it("validates catalog, preserves proof gaps and server cell choices", () => {
    const rows = MetricSchema.array().parse(
      JSON.parse(readFileSync(`${audit}/catalog-live.json`, "utf8")),
    );
    expect(rows.find((r) => r.code === "plaid_mcs0")?.cells).toContain(1);
    expect(rows.find((r) => r.code === "cell_rsrp")?.cell_scoped).toBe(false);
    expect(rows.filter((r) => r.code.startsWith("unk_")).every((r) => !r.available)).toBe(true);
  });
  it("validates table and preserves the witnessed event presence", () => {
    const data = MetricAnalysisSchema.parse(
      JSON.parse(readFileSync(`${audit}/table-live.json`, "utf8")),
    );
    const row = data.rows.find((r) => r.time_label.startsWith("10:35:48"));
    for (const code of ["HOA", "HOS", "HOI", "MEI", "RACHI", "SCELLMOD"])
      expect(row?.values[`evt_${code}`]).toBe(1);
    expect(data.capture_id).toBe("99e59c9fbf4f");
    expect(data.csv).toContain(data.result_id);
  });
});
