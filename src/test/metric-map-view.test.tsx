import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  installMetricMapSource,
  metricMapFeatures,
  metricMapNumericExtent,
  MetricsWorkspace,
} from "@/features/kpi/MetricsWorkspace";
import { getMetricAnalysis } from "@/lib/api/client";
import { readMetricViews, writeMetricViews } from "@/features/kpi/metric-views";
import "@/lib/i18n";

const renderers = vi.hoisted(() => ({ graph: vi.fn(), map: vi.fn() }));
vi.mock("@/features/kpi/MetricGraphCard", async (original) => {
  const actual = await original<typeof import("@/features/kpi/MetricGraphCard")>();
  return { ...actual, MetricGraphCard: (props: { code: string; view: string }) => {
    renderers.graph(props);
    return null;
  } };
});
vi.mock("@/features/kpi/KpiMapOSM", () => ({ KpiMapOSM: (props: unknown) => {
  renderers.map(props);
  return <div data-testid="metric-map-mock">{(props as { children?: ReactNode }).children}</div>;
} }));
vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "Demo" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});

describe("Map selection keeps its own panel", () => {
  // 1.105.8 — une métrique en vue « map » ferme le grand Measurements table
  // (requis UX : « afficher QUE la map »). Le test vérifie que la carte
  // demande le GPS pour sa seule métrique, ne la graphe jamais, et que le
  // tableau reste fermé.
  it("requests GPS for only the map metric, never graphs it, and closes the table", async () => {
    localStorage.setItem("bc3.metrics.pane.map-test", "table");
    writeMetricViews("map-test", { "cell_rsrp@0": "map", "cell_rsrq@0": "table" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MetricsWorkspace
      workspaceId="map-test" projectId="project-a" captureId="44621571bccc"
      selections={["cell_rsrp@0", "cell_rsrq@0", "ci_rs_snr@1"]}
      views={readMetricViews("map-test")} catalog={[]} filters={{}}
      onClear={() => {}} onCaptureChange={() => {}}
    /></QueryClientProvider>);
    await waitFor(() => expect(renderers.map).toHaveBeenCalled());
    expect(getMetricAnalysis).toHaveBeenCalledWith("project-a", "44621571bccc",
      ["cell_rsrp@0"], {}, { group_by: "operator", include_map: true }, expect.any(AbortSignal));
    expect(renderers.graph.mock.calls.map(([props]) => props.code)).not.toContain("cell_rsrp@0");
    expect(renderers.graph.mock.calls.map(([props]) => props.code)).not.toContain("cell_rsrq@0");
    expect(renderers.graph.mock.calls.map(([props]) => props.code)).toContain("ci_rs_snr@1");
    await waitFor(() => expect(screen.queryByTestId("metrics-table-panel")).toBeNull());
    expect(localStorage.getItem("bc3.metrics.pane.map-test")).toBe("charts");
  });

  it("renders 4,935 coloured raw points, the metric legend and the overlay menu", async () => {
    renderers.map.mockClear();
    const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
    const points = Array.from({ length: 4_935 }, (_, index) => ({
      seq: index + 1,
      lat: 48.8 + index * 0.000001,
      lng: 2.3 + index * 0.000001,
      code: "cell_rsrp@0",
      value: -115 + (index % 55),
      t_rel_s: index / 10,
      tooltip: `RSRP ${-115 + (index % 55)} dBm`,
    }));
    vi.mocked(getMetricAnalysis).mockResolvedValueOnce({ ...fixture, map_points: points } as never);
    writeMetricViews("map-raw-points", { "cell_rsrp@0": "map" });
    const close = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MetricsWorkspace
        workspaceId="map-raw-points" projectId="project-a" captureId="44621571bccc"
        selections={["cell_rsrp@0"]} views={readMetricViews("map-raw-points")}
        catalog={[{ code: "cell_rsrp@0", label: "RSRP (LTE) @ Serving", unit: "dBm" } as never]}
        filters={{}} onClear={close} onCaptureChange={() => {}}
        mapFillsAvailable
      />
    </QueryClientProvider>);

    await waitFor(() => expect(renderers.map).toHaveBeenCalled());
    const map = {
      getSource: vi.fn(), addSource: vi.fn(), addLayer: vi.fn(), fitBounds: vi.fn(),
      on: vi.fn(), off: vi.fn(), getCanvas: vi.fn(() => ({ style: {} })),
    };
    const analysis = { ...fixture, map_points: points } as never;
    const features = metricMapFeatures(analysis);
    const [min, max] = metricMapNumericExtent(analysis);
    installMetricMapSource(map as never, features, min, max);

    const source = map.addSource.mock.calls[0]?.[1] as { cluster?: boolean; data: { features: unknown[] } };
    expect(source.cluster).toBeUndefined();
    expect(source.data.features).toHaveLength(4_935);
    expect(map.addLayer.mock.calls.map(([layer]) => layer.id)).toEqual(["metrics-v3"]);
    expect(map.addLayer.mock.calls[0]?.[0].paint["circle-color"][0]).toBe("interpolate");

    expect(screen.getByTestId("metric-map-legend")).toHaveTextContent("RSRP (LTE) @ Serving · dBm");
    expect(screen.getByTestId("metric-map-legend").closest('[data-view="map"]')).toHaveAttribute(
      "data-point-count",
      "4935",
    );
    expect(screen.queryByRole("heading", { name: /1\. RSRP/ })).toBeNull();
    expect(screen.queryByText(/3k|887/)).toBeNull();
    const menu = screen.getByRole("button", { name: "RSRP (LTE) @ Serving · actions" });
    fireEvent.keyDown(menu, { key: "Enter" });
    const content = await screen.findByTestId("workspace-panel-menu-content");
    expect(within(content).getByText("Paramètres")).toBeVisible();
    fireEvent.click(within(content).getByText("Fermer"));
    expect(close).toHaveBeenCalledOnce();
  });

  // 1.106.2 — ouvrir le tableau explicitement (⋮ → Tableau, paneRequest)
  // alors qu'une autre métrique est en vue « map » doit le laisser ouvert :
  // la demande explicite de l'utilisateur prime sur l'auto-fermeture 1.105.8.
  it("keeps the table open when explicitly requested while a metric is a map", async () => {
    localStorage.setItem("bc3.metrics.pane.map-test", "charts");
    writeMetricViews("map-test", { "cell_rsrp@0": "map", "ci_rs_snr@1": "graph" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(<QueryClientProvider client={client}><MetricsWorkspace
      workspaceId="map-test" projectId="project-a" captureId="44621571bccc"
      selections={["cell_rsrp@0", "ci_rs_snr@1"]}
      views={readMetricViews("map-test")} catalog={[]} filters={{}}
      onClear={() => {}} onCaptureChange={() => {}}
    /></QueryClientProvider>);
    await waitFor(() => expect(renderers.map).toHaveBeenCalled());
    rerender(<QueryClientProvider client={client}><MetricsWorkspace
      workspaceId="map-test" projectId="project-a" captureId="44621571bccc"
      selections={["cell_rsrp@0", "ci_rs_snr@1"]}
      views={readMetricViews("map-test")} catalog={[]} filters={{}}
      onClear={() => {}} onCaptureChange={() => {}} paneRequest={1}
    /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("metrics-table-panel")).toBeTruthy());
    await waitFor(() => expect(localStorage.getItem("bc3.metrics.pane.map-test")).toBe("table"));
  });
});
