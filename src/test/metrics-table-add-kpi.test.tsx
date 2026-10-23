// Adding a parameter must not blank the measurements table while it reloads.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import "@/lib/i18n";

let release: () => void = () => {};
vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  let calls = 0;
  return {
    getMetricAnalysis: vi.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve(fixture);
      return new Promise((r) => { release = () => r(fixture); });
    }),
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "c" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({ init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })) }));

describe("measurements table while adding a KPI", () => {
  it("stays visible (veiled) instead of disappearing", async () => {
    window.localStorage.setItem("bc3.metrics.pane", "table");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (sel: string[]) => (
      <QueryClientProvider client={client}>
        <MetricsWorkspace projectId="p" captureId="44621571bccc" onCaptureChange={() => {}}
          selections={sel} catalog={[]} filters={{}} onClear={() => {}} />
      </QueryClientProvider>
    );
    const { rerender } = render(ui(["cell_rsrp@0"]));
    await waitFor(() => expect(screen.getByTestId("metrics-table-panel")).toBeInTheDocument(), { timeout: 3000 });
    rerender(ui(["cell_rsrp@0", "cell_rsrq@0"]));
    expect(screen.getByTestId("metrics-table-panel")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("metrics-table-refreshing")).toBeInTheDocument());
    release();
    await waitFor(() => expect(screen.queryByTestId("metrics-table-refreshing")).toBeNull());
    expect(screen.getByTestId("metrics-table-panel")).toBeInTheDocument();
  });
});
