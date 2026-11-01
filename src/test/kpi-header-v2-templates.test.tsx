import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KpiFilters } from "@/features/kpi/KpiFilters";
import {
  restoreWorkspaceTemplate,
  snapshotWorkspaceTemplate,
} from "@/features/kpi/workspace-template-state";
import { WorkspaceTemplatesProvider } from "@/features/kpi/workspace-templates-context";
import { DEFAULT_TABLE_SETTINGS, saveTableSettings } from "@/features/kpi/table-settings";
import { saveLayout, EMPTY_LAYOUT } from "@/features/kpi/panel-layout";
import type { WorkspaceTemplateConfiguration } from "@/lib/api/workspace-templates";

const configuration = (): WorkspaceTemplateConfiguration => ({
  schemaVersion: 1,
  workspace: {
    layout: "2",
    overlay: false,
    kpiCodes: ["success_rate"],
    metricCodes: ["cell_rsrp@lte-type-1"],
    activeKpiCode: "success_rate",
    chartConfigurations: {
      success_rate: {
        kpiCode: "success_rate",
        visualization: "graph",
        xMetric: "operator",
        yMetric: "success_rate",
        groupBy: "operator",
        statistic: "value",
      },
    },
    metricViews: { "cell_rsrp@lte-type-1": "map" },
    panelLayout: EMPTY_LAYOUT,
    tableSettings: (({ search: _search, ...settings }) => settings)(DEFAULT_TABLE_SETTINGS),
    metricPane: "charts",
    mapPreferences: {
      "cell_rsrp@lte-type-1": {
        palette: "coverage",
        pointSize: 3,
        links: { serving: true, neighbour: true, nr_anchor: true },
      },
    },
    legendSettings: {},
  },
});

describe("KPI Header V2", () => {
  beforeEach(() => localStorage.clear());

  it("renders the compact V2 controls in the restored toolbar order", () => {
    const onScopeChange = vi.fn();
    const onEventsVisibleChange = vi.fn();
    const context = {
      templates: [],
      activeTemplate: null,
      loading: false,
      error: null,
      workspaceDirty: false,
      currentConfiguration: configuration,
      retry: vi.fn(),
      apply: vi.fn(async () => {}),
      create: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    };
    const { container } = render(
      <WorkspaceTemplatesProvider value={context}>
        <KpiFilters
          draft={{ values: { rat: ["LTE"] }, enabledGeo: [] }}
          applied={{}}
          dimensions={{
            project_id: "p",
            rats: { available: true, reason: null, values: ["LTE"] },
            operators: { available: true, reason: null, values: ["Orange", "Free"] },
            group_by_options: [],
          }}
          period={null}
          dirty
          loading={false}
          error={false}
          onRetry={vi.fn()}
          onChange={vi.fn()}
          onApply={vi.fn()}
          onReset={vi.fn()}
          scope={{ type: "capture", captureId: "cap-a" }}
          captures={[{ capture_id: "cap-a", label: "Capture A" }]}
          superstreams={[]}
          sourcesLoading={false}
          onScopeChange={onScopeChange}
          eventsVisible
          onEventsVisibleChange={onEventsVisibleChange}
        />
      </WorkspaceTemplatesProvider>,
    );
    const order = [
      "kpi-header-technology",
      "kpi-header-operator",
      "kpi-header-source",
      "kpi-header-templates",
      "kpi-header-events",
      "kpi-header-reset",
      "kpi-header-apply",
    ].map((testId) => screen.getByTestId(testId));
    order.slice(1).forEach((node, index) => {
      expect(
        order[index]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
    expect(container.querySelectorAll(".kpi-header-field")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "LTE" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "NR" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "LTE + NR" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Operator.*Orange.*Free/ })).toBeInTheDocument();
    const source = screen.getByTestId("kpi-source-selector");
    expect(source.querySelector("optgroup")?.label).toBe("Streams / Captures");
    expect(screen.queryByText("Band")).not.toBeInTheDocument();
    expect(screen.queryByText("Geographic Area")).not.toBeInTheDocument();
    expect(screen.queryByText("Period")).not.toBeInTheDocument();
    expect(screen.queryByText("Advanced Filters")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Events ON" }));
    expect(onEventsVisibleChange).toHaveBeenCalledWith(false);
  });
});

describe("workspace template serialization", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips presentation state without temporary search or capture identity", () => {
    saveLayout("ws-a", { ...EMPTY_LAYOUT, order: ["kpi:success_rate"] });
    saveTableSettings("ws-a", { ...DEFAULT_TABLE_SETTINGS, search: "temporary" });
    const snapshot = snapshotWorkspaceTemplate(
      {
        id: "ws-a",
        name: "Workspace A",
        codes: ["success_rate"],
        metricCodes: ["cell_rsrp@lte-type-1"],
        activeCode: "success_rate",
        layout: "2",
        overlay: false,
      },
      configuration().workspace.chartConfigurations,
      configuration().workspace.metricViews,
    );
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("captureId");
    expect(serialized).not.toContain("temporary");
    expect(serialized).not.toContain("token");
    expect(snapshot.workspace.panelLayout.order).toEqual(["kpi:success_rate"]);

    const restored = restoreWorkspaceTemplate("ws-b", snapshot, "keep-this-search");
    expect(restored.tab.layout).toBe("2");
    expect(restored.tab.metricCodes).toEqual(["cell_rsrp@lte-type-1"]);
    expect(JSON.parse(localStorage.getItem("bc4.tableSettings.ws-b") ?? "{}").search).toBe(
      "keep-this-search",
    );
  });
});
