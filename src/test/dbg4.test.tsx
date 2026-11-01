import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "M1" }]),
    getMetricMap: vi.fn().mockResolvedValue({ points: [] }),
    getSignaling: vi.fn().mockResolvedValue({ points: [] }),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});
vi.mock("@/lib/api/metrics", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetrics: vi.fn().mockResolvedValue([]),
    metricRequestQuery: () => "",
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "M1" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricMap: vi.fn().mockResolvedValue({ points: [] }),
    getMetricSeries: vi.fn().mockResolvedValue({ series: [], origin_ts: null, nmf_start_at: null, utc_offset_min: null, capture_date: null }),
    getMetricAggregate: vi.fn().mockResolvedValue({ groups: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({ init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })) }));

describe("dbg4", () => {
  it("reopen strategies", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MetricsWorkspace projectId="4b7bfd50ddb6" captureId="44621571bccc" onCaptureChange={() => {}}
        selections={["cell_rsrp@0"]} catalog={[]} filters={{}} onClear={() => {}} workspaceId="t1"
        views={{ "cell_rsrp@0": "histogram" }} />
    </QueryClientProvider>);
    const card = (await waitFor(() => { const e = document.querySelector('[data-metric-code="cell_rsrp@0"]'); expect(e).not.toBeNull(); return e as HTMLElement; })) as HTMLElement;
    const trigger = within(card).getByTestId("workspace-panel-menu");
    const open = () => { trigger.focus(); fireEvent.keyDown(trigger, { key: "Enter" }); return !!screen.queryByTestId("metric-style-sub"); };
    console.log("OPEN1", open());
    fireEvent.click(screen.getByTestId("metric-style-sub"));
    fireEvent.click(screen.getByTestId("metric-plot-bar"));
    console.log("AFTER PLOT state", trigger.getAttribute("data-state"), "ls", window.localStorage.getItem("bc3.metrics.styles.t1"));
    console.log("OPEN2", open());
    fireEvent.click(screen.getByTestId("metric-style-sub"));
    fireEvent.click(screen.getByTestId("metric-color-#0f766e"));
    console.log("AFTER COLOR ls", window.localStorage.getItem("bc3.metrics.styles.t1"));
  });
});
