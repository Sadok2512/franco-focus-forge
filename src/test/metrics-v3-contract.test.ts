import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MetricCatalogResponseSchema, MetricAnalysisSchema } from "@/lib/api/metrics-schemas";
// Mandatory manual guard against captured live TEST2 responses; no synthetic RF values.
const audit = process.env["BC2_METRICS_AUDIT"];
if (!audit) {
  throw new Error("BC2_METRICS_AUDIT is required; run this guard against captured live responses");
}

describe("Metrics v3 live contract", () => {
  it("validates the current catalog envelope and release leaf parity", () => {
    const response = MetricCatalogResponseSchema.parse(
      JSON.parse(readFileSync(`${audit}/catalog-live.json`, "utf8")),
    );
    const release = response.catalog_release;
    expect(release).toBeDefined();
    expect(release).not.toBeNull();
    if (!release) throw new Error("catalog_release is required in the current catalog contract");
    expect(response.catalogue_version).toBe(release.version);
    expect(response.nodes.filter((node) => node.node_type === "leaf")).toHaveLength(
      release.n_leaves,
    );
    expect(new Set(response.nodes.map((node) => node.node_id)).size).toBe(response.nodes.length);
    expect(new Set(response.metrics.map((metric) => metric.code)).size).toBe(
      response.metrics.length,
    );
    expect(
      response.nodes
        .filter((node) => node.node_type === "leaf" && !node.selectable)
        .every((node) => node.reason !== null),
    ).toBe(true);
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
