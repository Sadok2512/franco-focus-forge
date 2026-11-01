// Style de graphe + glisser-déposer sur un graphe :
//  - le ⋮ d'une carte expose un sous-menu Style (tracé Ligne/Barres/Points +
//    couleur) mémorisé par onglet ;
//  - déposer une métrique du catalogue sur la carte l'ajoute comme série du
//    même graphe (jamais au workspace), et la demande porte les deux codes.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import { getMetricSeries } from "@/lib/api/client";
import { MAP_METRIC_MIME } from "@/features/kpi/map-metric-drop";
import { addGraphSeries, normalizeUnit } from "@/features/kpi/graph-series-drop";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  const series = {
    series: [
      {
        code: "cell_rsrp@0",
        label: "RSRP",
        unit: "dBm",
        kind: "numeric",
        points: [
          { seq: 1, t_rel_s: 0, value: -100 },
          { seq: 2, t_rel_s: 1, value: -101 },
        ],
      },
      {
        code: "cell_rsrq@0",
        label: "RSRQ",
        unit: "dB",
        kind: "numeric",
        points: [
          { seq: 1, t_rel_s: 0, value: -12 },
          { seq: 2, t_rel_s: 1, value: -13 },
        ],
      },
    ],
    origin_ts: "2023-06-26T10:33:20Z",
    nmf_start_at: null,
    utc_offset_min: null,
    capture_date: null,
  };
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi
      .fn()
      .mockResolvedValue([{ capture_id: "44621571bccc", label: "M1" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
    getMetricSeries: vi.fn().mockResolvedValue(series),
    getMetricAggregate: vi.fn().mockResolvedValue({ groups: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })),
}));

function mount() {
  window.localStorage.clear();
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
        workspaceId="t1"
      />
    </QueryClientProvider>,
  );
}

async function openCardMenu() {
  mount();
  const card = (await waitFor(() => {
    const element = document.querySelector('[data-metric-code="cell_rsrp@0"]');
    expect(element).not.toBeNull();
    return element as HTMLElement;
  })) as HTMLElement;
  fireEvent.keyDown(within(card).getByTestId("workspace-panel-menu"), { key: "Enter" });
  return card;
}

// La carte démarre en Histogramme : le graphe (et donc la demande de série)
// n'apparaît qu'après ⋮ → Graphe.
async function openGraphView() {
  const card = await openCardMenu();
  fireEvent.click(await screen.findByTestId("metric-view-graph"));
  await waitFor(() => expect(getMetricSeries).toHaveBeenCalled());
  return card;
}

describe("style de graphe", () => {
  it("le sous-menu Style change le tracé et la couleur, et les mémorise par onglet", async () => {
    await openCardMenu();
    fireEvent.click(await screen.findByTestId("metric-style-sub"));
    fireEvent.click(await screen.findByTestId("metric-plot-bar"));
    expect(
      JSON.parse(window.localStorage.getItem("bc3.metrics.styles.t1") ?? "{}"),
    ).toEqual({ "cell_rsrp@0": { plot: "bar", color: "#1d4ed8" } });
    fireEvent.click(await screen.findByTestId("metric-color-#0f766e"));
    expect(
      JSON.parse(window.localStorage.getItem("bc3.metrics.styles.t1") ?? "{}"),
    ).toEqual({ "cell_rsrp@0": { plot: "bar", color: "#0f766e" } });
  });
});

describe("glisser-déposer sur un graphe", () => {
  it("déposer une métrique l'ajoute comme série du graphe et élargit la demande", async () => {
    const card = await openGraphView();
    const added = { kind: "metric", code: "cell_rsrq@0", label: "RSRQ", unit: "dB" };
    const dataTransfer = {
      types: [MAP_METRIC_MIME],
      getData: (type: string) => (type === MAP_METRIC_MIME ? JSON.stringify(added) : ""),
      dropEffect: "",
    };
    fireEvent.dragOver(card, { dataTransfer });
    expect(card.className).toContain("is-drop-target");
    fireEvent.drop(card, { dataTransfer });
    await waitFor(() =>
      expect(getMetricSeries).toHaveBeenCalledWith(
        "4b7bfd50ddb6",
        "44621571bccc",
        ["cell_rsrp@0", "cell_rsrq@0"],
        expect.any(AbortSignal),
      ),
    );
    expect(
      JSON.parse(window.localStorage.getItem("bc4.graph.series.t1.cell_rsrp@0") ?? "[]"),
    ).toEqual([{ ...added, color: expect.any(String) }]);
    // La série ajoutée est retirable depuis le sous-menu Style.
    fireEvent.click(await screen.findByTestId("metric-style-sub"));
    const row = await screen.findByTestId("metric-series-remove-cell_rsrq@0");
    fireEvent.click(row);
    expect(window.localStorage.getItem("bc4.graph.series.t1.cell_rsrp@0")).toBe("[]");
  });

  it("refuse la métrique déjà présente et une 3e unité (jamais une fausse échelle)", () => {
    expect(normalizeUnit("Mbit/s")).toBe("mbps");
    const base = { code: "a", unit: "dBm" };
    const first = addGraphSeries([], { code: "b", label: "B", unit: "dB" }, base);
    expect(first.ok).toBe(true);
    const duplicate = addGraphSeries(
      first.ok ? first.series : [],
      { code: "b", label: "B", unit: "dB" },
      base,
    );
    expect(duplicate).toEqual({ ok: false, reason: "duplicate" });
    const third = addGraphSeries(
      first.ok ? first.series : [],
      { code: "c", label: "C", unit: "%" },
      base,
    );
    expect(third).toEqual({ ok: false, reason: "axis" });
  });
});
