import { describe, expect, it } from "vitest";
import { classifyKpiCatalog } from "@/features/kpi/workspace-model";
import { MetricCatalogNodeSchema } from "@/lib/api/metrics-schemas";
import type { ProjectKpiCatalog } from "@/lib/api/project-kpi-schemas";

const item = (code: string, analytics_tab: "kpi" | "metrics") => ({
  code,
  name: code,
  nature: "the label is deliberately irrelevant",
  analytics_tab,
  unit: null,
  source: null,
  formula: null,
  status: "AVAILABLE" as const,
  reason: null,
});

describe("catalog-owned KPI / Metrics classification", () => {
  it("partitions every old KPI catalogue leaf exactly once", () => {
    const catalog: ProjectKpiCatalog = {
      project_id: "p",
      catalog_version: "v",
      tree: [
        {
          techno: "LTE",
          families: [
            {
              family: "radio",
              kpis: [item("success", "kpi"), item("rsrp", "metrics")],
            },
          ],
        },
      ],
    };
    const result = classifyKpiCatalog(catalog);
    const codes = (part: ProjectKpiCatalog) =>
      part.tree.flatMap((technology) =>
        technology.families.flatMap((family) => family.kpis.map((leaf) => leaf.code)),
      );

    expect(codes(result.kpi)).toEqual(["success"]);
    expect(codes(result.metrics)).toEqual(["rsrp"]);
    expect([...codes(result.kpi), ...codes(result.metrics)].sort()).toEqual(["rsrp", "success"]);
    expect(new Set([...codes(result.kpi), ...codes(result.metrics)]).size).toBe(2);
  });

  it("rejects a raw Metrics leaf without the catalogue field", () => {
    const base = {
      node_id: "leaf",
      parent_id: null,
      order: 0,
      label: "RSRP",
      note: null,
      source: null,
      node_type: "leaf" as const,
      metric_id: "rsrp",
      selection: "rsrp",
      event: "CELLMEAS",
      field_idx: 1,
      source_column: "rsrp",
      unit: "dBm",
      cell: null,
      n: 1,
      proof: "catalog",
      selectable: true,
      reason: null,
    };
    expect(MetricCatalogNodeSchema.safeParse({ ...base, analytics_tab: "metrics" }).success).toBe(
      true,
    );
    expect(MetricCatalogNodeSchema.safeParse({ ...base, analytics_tab: null }).success).toBe(false);
  });
});
