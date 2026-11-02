// 1.94.0 — la barre [View ▾ | Per row ▾ | Export CSV | Fullscreen] du panneau
// Metrics est supprimée. Le mode (cartes ou grand tableau) est donc piloté par
// les demandes du catalogue : ⋮ → Tableau = paneRequest, ⋮ → Graphique =
// cardViewRequest. Ces deux tests verrouillent les deux directions.
import { fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi
      .fn()
      .mockResolvedValue([
        { capture_id: "44621571bccc", label: "M1_FREE_DL-7Go_Max-10_W30_26Jun23_103320.4.nmf" },
      ]),
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

function mount(props: {
  paneRequest?: number;
  cardViewRequest?: { workspaceId: string; id: string; code: string; view: string; n: number };
  view?: "table" | "graph" | "histogram" | "scatter" | "map";
}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MetricsWorkspace
        projectId="4b7bfd50ddb6"
        captureId="44621571bccc"
        onCaptureChange={() => {}}
        selections={["cell_rsrp@0"]}
        catalog={[]}
        filters={{}}
        onClear={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("MetricsWorkspace — mode piloté par le catalogue (barre supprimée)", () => {
  it("⋮ → Tableau (paneRequest) ouvre le grand tableau sans retirer les cartes graphe", async () => {
    window.localStorage.removeItem("bc3.metrics.pane");
    window.localStorage.removeItem("bc4.metrics.card-panels.metrics");
    mount({ paneRequest: 1 });
    await waitFor(
      () => {
        expect(screen.getByTestId("metrics-table-panel")).toBeVisible();
      },
      { timeout: 3000 },
    );
    expect(screen.getByTestId("metrics-charts-grid")).toBeVisible();
    expect(screen.queryByTestId("time-axis-switcher")).toBeNull();
  });

  it("closing the table panel keeps the graphs", async () => {
    window.localStorage.setItem("bc3.metrics.pane", "table");
    mount({});
    await waitFor(() => expect(screen.getByTestId("metrics-table-panel")).toBeVisible(), {
      timeout: 3000,
    });
    await removeTable();
    expect(screen.queryByTestId("metrics-table-panel")).toBeNull();
    expect(screen.getByTestId("metrics-charts-grid")).toBeInTheDocument();
  });

  it("⋮ → Tableau depuis un graphe garde le graphe visible", async () => {
    window.localStorage.setItem("bc3.metrics.pane", "charts");
    mount({});
    const graph = await screen.findByTestId("metrics-charts-grid");
    fireEvent.keyDown(within(graph).getByTestId("workspace-panel-menu"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("metric-open-table"));
    await waitFor(() => expect(screen.getByTestId("metrics-table-panel")).toBeVisible());
    expect(screen.getByTestId("metrics-charts-grid")).toBeVisible();
    await removeTable();
    expect(screen.getByTestId("metrics-charts-grid")).toBeVisible();
  });


  it("⋮ → Graphique ajoute une carte tout en conservant le tableau", async () => {
    window.localStorage.setItem("bc3.metrics.pane", "table");
    window.localStorage.removeItem("bc4.metrics.card-panels.metrics");
    mount({
      cardViewRequest: {
        workspaceId: "metrics",
        id: "metric-panel:test",
        code: "cell_rsrp@0",
        view: "graph",
        n: 1,
      },
    });
    await waitFor(
      () => {
        expect(screen.getByTestId("metrics-charts-grid")).toBeVisible();
      },
      { timeout: 3000 },
    );
    await waitFor(() => expect(screen.getByTestId("metrics-table-panel")).toBeVisible(), {
      timeout: 3000,
    });
  });
});

async function removeTable() {
  const { fireEvent: fe, screen: sc, within: wi } = await import("@testing-library/react");
  const panel = sc.getByTestId("metrics-table-panel");
  fe.keyDown(wi(panel).getByTestId("workspace-panel-menu"), { key: "Enter" });
  fe.click(await sc.findByTestId("metrics-table-remove"));
}
