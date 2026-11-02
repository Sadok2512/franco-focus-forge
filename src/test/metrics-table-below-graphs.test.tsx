// The measurements table is a full-row panel below independent graph cards.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import { WorkspaceGrid } from "@/features/kpi/WorkspaceGrid";
import { TABLE_PANEL_ORDER, sunkPanelOrder } from "@/features/kpi/workspace-grid";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "c" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});
vi.mock("maplibre-gl", () => ({
  Map: vi.fn(),
  Popup: vi.fn(),
  NavigationControl: vi.fn(),
}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?url", () => ({ default: "worker.js" }));
vi.mock("echarts", () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })),
}));

// jsdom n'a pas de ResizeObserver : WorkspaceGrid en observe un pour Auto.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ObserverStub;
}

describe("measurements table position", () => {
  it("garde les cartes graphe au-dessus du tableau ouvert", async () => {
    localStorage.removeItem("bc4.metrics.card-panels.table-below-graphs");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <WorkspaceGrid layout="2" count={3}>
          <MetricsWorkspace
            projectId="p"
            captureId="44621571bccc"
            workspaceId="table-below-graphs"
            onCaptureChange={() => {}}
            selections={["cell_rsrp@0", "cell_rsrq@0"]}
            catalog={[]}
            filters={{}}
            onClear={() => {}}
            paneRequest={1}
          />
        </WorkspaceGrid>
      </QueryClientProvider>,
    );
    const table = await screen.findByTestId("metrics-table-panel");
    const workspace = table.parentElement;
    expect(Number(table.style.order)).toBe(TABLE_PANEL_ORDER);
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('[data-panel-id^="legacy:"]'),
    );
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.style.gridColumn).toBe("span 1");
    }
    await removeTable();
    expect(screen.queryByTestId("metrics-table-panel")).toBeNull();
    expect(document.querySelectorAll('[data-panel-id^="legacy:"]')).toHaveLength(2);
    expect(workspace?.dataset["testid"]).toBe("metrics-v3-workspace");
  });


  it("sinks a table panel below a graph with the same saved position", () => {
    expect(sunkPanelOrder(false, 0)).toBe(0);
    expect(sunkPanelOrder(true, 0)).toBe(TABLE_PANEL_ORDER);
    expect(sunkPanelOrder(true, 0)).toBeGreaterThan(sunkPanelOrder(false, 999));
  });
});

async function removeTable() {
  const { fireEvent: fe, screen: sc, within: wi } = await import("@testing-library/react");
  const panel = sc.getByTestId("metrics-table-panel");
  fe.keyDown(wi(panel).getByTestId("workspace-panel-menu"), { key: "Enter" });
  fe.click(await sc.findByTestId("metrics-table-remove"));
}
