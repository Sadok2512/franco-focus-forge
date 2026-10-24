import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
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
  return null;
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