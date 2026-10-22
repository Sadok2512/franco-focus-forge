// 1.94.0 — la barre [View ▾ | Per row ▾ | Export CSV | Fullscreen] du panneau
// Metrics est supprimée. Le mode (cartes ou grand tableau) est donc piloté par
// les demandes du catalogue : ⋮ → Tableau = paneRequest, ⋮ → Graphique =
// cardViewRequest. Ces deux tests verrouillent les deux directions.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import "@/lib/i18n";

const { fixture } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fx = require("./fixtures/metrics-analysis-44621571bccc.json");
  return { fixture: fx };
});

vi.mock("@/lib/api/client", () => ({
  getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
  getMetricCaptures: vi.fn().mockResolvedValue([
    { capture_id: "44621571bccc", label: "M1_FREE_DL-7Go_Max-10_W30_26Jun23_103320.4.nmf" },
  ]),
  getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
}));

vi.mock("maplibre-gl", () => ({
  Map: vi.fn(),
  Popup: vi.fn(),
  NavigationControl: vi.fn(),
}));
vi.mock("echarts", () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })),
}));

function mount(props: {
  paneRequest?: number;
  cardViewRequest?: { code: string; view: string; n: number };
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
  it("⋮ → Tableau (paneRequest) ouvre le grand tableau alors que le mode mémorisé est charts", async () => {
    window.localStorage.removeItem("bc3.metrics.pane");
    mount({ paneRequest: 1 });
    await waitFor(
      () => {
        expect(screen.getByText("Time local")).toBeVisible();
      },
      { timeout: 3000 },
    );
  });

  it("⋮ → Graphique (cardViewRequest) ramène les cartes alors que le mode mémorisé est table", async () => {
    window.localStorage.setItem("bc3.metrics.pane", "table");
    mount({
      view: "graph",
      cardViewRequest: { code: "cell_rsrp", view: "graph", n: 1 },
    });
    await waitFor(
      () => {
        expect(screen.getByTestId("metrics-charts-grid")).toBeVisible();
      },
      { timeout: 3000 },
    );
    expect(screen.queryByTestId("metrics-table-pager")).toBeNull();
  });
});
