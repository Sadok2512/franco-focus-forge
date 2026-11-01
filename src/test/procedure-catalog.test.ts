import { describe, expect, it } from "vitest";

import {
  procedureCatalogAsKpiCatalog,
  ProcedureCatalogSchema,
  resultsForProcedureMeasure,
} from "@/lib/api/procedures";
import { mergeKpiCatalogs } from "@/features/kpi/workspace-model";
import type { ProjectKpiCatalog } from "@/lib/api/project-kpi-schemas";

const procedureCatalog = ProcedureCatalogSchema.parse({
  project_id: "project",
  capture_ids: ["capture"],
  engine_version: "procedure-v1",
  tree: [
    {
      technology: "LTE",
      families: [
        {
          family: "Mobility",
          kpis: [
            {
              code: "PROC_LTE_HO_SUCCESS_RATE",
              name: "LTE HO Success Rate",
              description: "Certified explicit handover evidence.",
              unit: "%",
              procedure_types: ["lte_ho_intra_frequency"],
              measure: "rate",
              minimum_evidence: "PROVEN",
              status: "AVAILABLE",
              reason: null,
              available: true,
              map_supported: true,
              replaces_code: null,
              counts: { attempts: 5, success: 5, failures: 0, unknown: 0 },
            },
          ],
        },
      ],
    },
  ],
});

const primary: ProjectKpiCatalog = {
  project_id: "project",
  catalog_version: "2.60.0",
  tree: [
    {
      techno: "LTE",
      families: [
        {
          family: "Accessibility",
          kpis: [
            {
              code: "RRC_RATE",
              name: "RRC Rate",
              nature: "rate",
              analytics_tab: "kpi",
              unit: "%",
              source: "catalog",
              formula: "success / attempts",
              status: "AVAILABLE",
              reason: null,
            },
          ],
        },
      ],
    },
  ],
};

describe("procedure KPI catalogue adapter", () => {
  it("preserves the certified procedure metadata", () => {
    const adapted = procedureCatalogAsKpiCatalog(procedureCatalog);
    const item = adapted.tree[0]?.families[0]?.kpis[0];
    expect(item).toMatchObject({
      code: "PROC_LTE_HO_SUCCESS_RATE",
      analytics_tab: "kpi",
      status: "AVAILABLE",
      procedure_types: ["lte_ho_intra_frequency"],
      minimum_evidence: "PROVEN",
      map_supported: true,
      procedure_counts: { attempts: 5, success: 5, failures: 0, unknown: 0 },
    });
  });

  it("merges without dropping the canonical KPI tree", () => {
    const merged = mergeKpiCatalogs(primary, procedureCatalogAsKpiCatalog(procedureCatalog));
    const codes = merged.tree.flatMap((technology) =>
      technology.families.flatMap((family) => family.kpis.map((item) => item.code)),
    );
    expect(codes).toEqual(["RRC_RATE", "PROC_LTE_HO_SUCCESS_RATE"]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("never replaces a primary formula when codes collide", () => {
    const duplicate = procedureCatalogAsKpiCatalog(procedureCatalog);
    duplicate.tree[0]!.families[0]!.kpis[0]!.code = "RRC_RATE";
    const merged = mergeKpiCatalogs(primary, duplicate);
    const matches = merged.tree.flatMap((technology) =>
      technology.families.flatMap((family) =>
        family.kpis.filter((item) => item.code === "RRC_RATE"),
      ),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.formula).toBe("success / attempts");
  });

  it("enriches an explicitly replaced canonical leaf without duplicating it", () => {
    const replacement = structuredClone(procedureCatalog);
    const item = replacement.tree[0]!.families[0]!.kpis[0]!;
    item.replaces_code = "RRC_RATE";
    const merged = mergeKpiCatalogs(primary, procedureCatalogAsKpiCatalog(replacement));
    const items = merged.tree.flatMap((technology) =>
      technology.families.flatMap((family) => family.kpis),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: "RRC_RATE",
      name: "RRC Rate",
      procedure_code: "PROC_LTE_HO_SUCCESS_RATE",
      procedure_measure: "rate",
      source: "procedure-v1",
      status: "AVAILABLE",
    });
  });

  it("maps KPI measures to explicit procedure outcomes", () => {
    expect(resultsForProcedureMeasure("success")).toEqual(["SUCCESS"]);
    expect(resultsForProcedureMeasure("failures")).toEqual([
      "FAILURE",
      "ABNORMAL_RELEASE",
      "DROP",
      "TIMEOUT",
    ]);
    expect(resultsForProcedureMeasure("unknown")).toEqual(["ATTEMPT", "UNKNOWN"]);
    expect(resultsForProcedureMeasure("rate")).toEqual([]);
  });
});
