import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("/dev-server/src/test/fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "M1" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
    getMetricSeries: vi.fn().mockResolvedValue({ series: [], origin_ts: null, nmf_start_at: null, utc_offset_min: null, capture_date: null }),
    getMetricAggregate: vi.fn().mockResolvedValue({ groups: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({ init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })) }));

describe("dbg", () => {
  it("view switches", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MetricsWorkspace projectId="4b7bfd50ddb6" captureId="44621571bccc" onCaptureChange={() => {}}
        selections={["cell_rsrp@0"]} catalog={[]} filters={{}} onClear={() => {}} workspaceId="t1" />
    </QueryClientProvider>);
    const card = (await waitFor(() => { const e = document.querySelector('[data-metric-code="cell_rsrp@0"]'); expect(e).not.toBeNull(); return e as HTMLElement; })) as HTMLElement;
    console.log("VIEW0", card.getAttribute("data-view"));
    fireEvent.keyDown(within(card).getByTestId("workspace-panel-menu"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("metric-view-graph"));
    await new Promise((r) => setTimeout(r, 400));
    console.log("VIEW1", card.getAttribute("data-view"), "plot?", !!document.querySelector('[data-testid="metric-time-plot"]'));
    console.log("SERIES CALLS", vi.mocked((await import("@/lib/api/client")).getMetricSeries).mock.calls.length);
    console.log("HTML", card.innerHTML.slice(0, 300));
  });
});
