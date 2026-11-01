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

describe("dbg3", () => {
  it("menu state", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MetricsWorkspace projectId="4b7bfd50ddb6" captureId="44621571bccc" onCaptureChange={() => {}}
        selections={["cell_rsrp@0"]} catalog={[]} filters={{}} onClear={() => {}} workspaceId="t1" />
    </QueryClientProvider>);
    const card = (await waitFor(() => { const e = document.querySelector('[data-metric-code="cell_rsrp@0"]'); expect(e).not.toBeNull(); return e as HTMLElement; })) as HTMLElement;
    const trigger = within(card).getByTestId("workspace-panel-menu");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    console.log("T0", !!screen.queryByTestId("metric-style-sub"), trigger.getAttribute("data-state"));
    await new Promise((r) => setTimeout(r, 60));
    console.log("T60", !!screen.queryByTestId("metric-style-sub"), trigger.getAttribute("data-state"));
    await new Promise((r) => setTimeout(r, 400));
    console.log("T460", !!screen.queryByTestId("metric-style-sub"), trigger.getAttribute("data-state"));
    console.log("ITEMS", screen.queryAllByRole("menuitem").map((e) => e.textContent).slice(0, 8));
  });
});
