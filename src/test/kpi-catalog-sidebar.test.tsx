import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KpiCatalogSidebar } from "@/features/kpi/KpiCatalogSidebar";
import type { ProjectKpiCatalog } from "@/lib/api/project-kpi-schemas";

const catalog: ProjectKpiCatalog = {
  project_id: "43e81a34a073",
  catalog_version: "2.60.0",
  tree: [
    {
      techno: "LTE",
      families: [
        {
          family: "Mobility",
          kpis: [
            {
              code: "ho_success_rate",
              name: "HO success rate",
              nature: "calculated",
              analytics_tab: "kpi",
              unit: "%",
              source: "events",
              formula: "success / attempts",
              status: "AVAILABLE",
              reason: null,
            },
            {
              code: "rlf_count",
              name: "RLF count",
              nature: "calculated",
              analytics_tab: "kpi",
              unit: null,
              source: "events",
              formula: "count",
              status: "AVAILABLE",
              reason: null,
            },
          ],
        },
      ],
    },
  ],
};

describe("KPI catalogue sidebar", () => {
  it("shows catalogue leaves with an empty search and separates available from selected counts", () => {
    render(
      <KpiCatalogSidebar
        catalog={catalog}
        selected={[]}
        active={null}
        onToggle={vi.fn()}
        onVisualization={vi.fn()}
        searchRef={createRef<HTMLInputElement>()}
      />,
    );

    expect(screen.getByText("HO success rate")).toBeVisible();
    expect(screen.getByText("RLF count")).toBeVisible();
    expect(screen.getByText("2 · 0/8 sélectionnés")).toBeVisible();
    expect(screen.queryByText(/No KPIs match this search/i)).not.toBeInTheDocument();
  });

  it("never presents zero catalogue counts while the backend is reconnecting", () => {
    render(
      <KpiCatalogSidebar
        catalog={{ ...catalog, tree: [] }}
        selected={[]}
        active={null}
        onToggle={vi.fn()}
        onVisualization={vi.fn()}
        searchRef={createRef<HTMLInputElement>()}
        loading
      />,
    );
    expect(screen.getByText(/(?:Chargement \/ reconnexion|Loading \/ reconnecting)/)).toBeVisible();
    expect(screen.queryByText(/0 · 0\/8/)).not.toBeInTheDocument();
  });
});
