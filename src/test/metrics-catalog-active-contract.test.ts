import { describe, expect, it } from "vitest";
import { MetricCatalogResponseSchema } from "@/lib/api/metrics-schemas";

describe("active metrics catalogue contract", () => {
  it("accepts certified KPI kinds, nullable source metadata and unavailable nodes", () => {
    const parsed = MetricCatalogResponseSchema.parse({
      catalogue_version: "2.68.2",
      title: "Metrics",
      header: "Metrics",
      metrics: [
        {
          event: null,
          category_label: "Mobility",
          root_notices: [],
          cell_scoped: false,
          cells: [],
          cell_options: [],
          attributes: [],
          proof: "catalog-2.68.2",
          available: true,
          reason: null,
          alias_of: null,
          event_group: null,
          unproven_cells: [],
          code: "lte_ho_attempts",
          label: "HO Attempts",
          unit: "count",
          event_code: null,
          decoder_version: "1.11.2",
          proof_ref: "",
          source_table: "nmf_event_deep",
          source_column: null,
          tech: "LTE",
          kind: "KPI",
          n_in_project: 126,
        },
      ],
      nodes: [
        {
          node_id: "lte",
          parent_id: null,
          order: 0,
          label: "LTE",
          note: null,
          source: null,
          node_type: "tech",
          analytics_tab: "metrics",
          metric_id: null,
          selection: null,
          event: null,
          field_idx: null,
          source_column: null,
          unit: "",
          cell: null,
          availability_status: "not_available",
          n: 0,
          proof: null,
          selectable: false,
          reason: "Not certified",
        },
      ],
      decoder_version: "1.11.2",
      reason: "from_catalog_release",
    });
    expect(parsed.metrics[0]?.kind).toBe("KPI");
    expect(parsed.nodes[0]?.availability_status).toBe("not_available");
  });
});
