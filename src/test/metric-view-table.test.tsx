// 1.101.0 — une métrique choisie en « Tableau » dans le ⋮ du catalogue ne doit
// jamais recevoir de carte graphique : elle n'existe que dans le grand tableau.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import {
  pickGraphSelections,
  readMetricViews,
  writeMetricViews,
  type MetricViews,
} from "@/features/kpi/metric-views";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi
      .fn()
      .mockResolvedValue([{ capture_id: "44621571bccc", label: "M1_FREE_DL-7Go_Max-10_W30_26Jun23_103320.4.nmf" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })),
}));

function mount(props: { selections: string[]; views?: MetricViews }) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MetricsWorkspace
        projectId="4b7bfd50ddb6"
        captureId="44621571bccc"
        onCaptureChange={() => {}}
        selections={props.selections}
        catalog={[]}
        filters={{}}
        onClear={() => {}}
        views={props.views}
      />
    </QueryClientProvider>,
  );
}

const card = (code: string) => document.querySelector(`[data-metric-code="${code}"]`);

describe("métrique ajoutée en Tableau", () => {
  it("n'a aucune carte graphique, mais reste une colonne du tableau", async () => {
    window.localStorage.setItem("bc3.metrics.pane", "table");
    mount({
      selections: ["cell_rsrp@0", "cell_rsrq@0"],
      views: { "cell_rsrp@0": "table" },
    });
    await waitFor(
      () => expect(screen.getByTestId("metrics-table-panel")).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(card("cell_rsrp@0")).toBeNull();
    expect(card("cell_rsrq@0")).not.toBeNull();
  });

  it("sans carte à afficher, propose le tableau au lieu d'un graphe", async () => {
    window.localStorage.setItem("bc3.metrics.pane", "charts");
    mount({ selections: ["cell_rsrp@0"], views: { "cell_rsrp@0": "table" } });
    await waitFor(
      () => expect(screen.getByTestId("metrics-table-only-state")).toBeVisible(),
      { timeout: 3000 },
    );
    expect(card("cell_rsrp@0")).toBeNull();
    fireEvent.click(screen.getByTestId("metrics-show-table"));
    await waitFor(
      () => expect(screen.getByTestId("metrics-table-panel")).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it("la vue est mémorisée par onglet et filtre les cartes", () => {
    writeMetricViews("tab-a", { "cell_rsrp@0": "table", "cell_rsrq@0": "graph" });
    expect(readMetricViews("tab-a")).toEqual({ "cell_rsrp@0": "table", "cell_rsrq@0": "graph" });
    expect(
      pickGraphSelections(
        [{ full: "cell_rsrp@0" }, { full: "cell_rsrq@0" }],
        readMetricViews("tab-a"),
      ).map((s) => s.full),
    ).toEqual(["cell_rsrq@0"]);
    // Un autre onglet garde ses propres vues.
    expect(readMetricViews("tab-b")).toEqual({});
  });
});
