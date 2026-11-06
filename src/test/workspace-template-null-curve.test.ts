import { describe, expect, it } from "vitest";
import { WorkspaceTemplateSchema } from "@/lib/api/workspace-templates";

describe("workspace template compatibility", () => {
  it("accepts the backend nullable curveType contract", () => {
    const parsed = WorkspaceTemplateSchema.parse({
      id: "template",
      projectId: "project",
      ownerId: "owner",
      name: "Template",
      description: null,
      schemaVersion: 1,
      revision: 1,
      configuration: {
        schemaVersion: 1,
        workspace: {
          layout: "auto",
          overlay: false,
          kpiCodes: ["KPI"],
          metricCodes: [],
          activeKpiCode: "KPI",
          chartConfigurations: {
            KPI: {
              kpiCode: "KPI",
              visualization: "graph",
              xMetric: "none",
              yMetric: "KPI",
              groupBy: "none",
              statistic: null,
              curveType: null,
            },
          },
          metricViews: {},
          panelLayout: {
            order: [],
            span: {},
            height: {},
            collapsed: {},
            titles: {},
            syncTime: false,
          },
          tableSettings: {
            perRow: 1,
            autoFitWidth: true,
            equalHeights: true,
            spacing: "normal",
            height: "auto",
            customHeight: 480,
            hScroll: "auto",
            resizable: false,
            style: "professional",
            palette: "white",
            colors: {
              background: "#fff",
              headerBg: "#fff",
              headerText: "#000",
              rowBg: "#fff",
              altRow: "#fff",
              border: "#ddd",
              selected: "#def",
            },
            fontSize: "medium",
            rowHeight: "normal",
            headerHeight: "normal",
            cellPadding: "medium",
            borders: "horizontal",
            zebra: true,
            stickyHeader: true,
            stickyFirstColumn: true,
            wrap: false,
            cellAlign: "center",
            numberAlign: "center",
            radius: "rounded",
            hidden: [],
            order: [],
            showUnits: true,
            sort: null,
          },
          metricPane: "charts",
          mapPreferences: {},
          legendSettings: {},
        },
      },
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
    });

    expect(parsed.configuration.workspace.chartConfigurations["KPI"]?.curveType).toBeNull();
  });
});
