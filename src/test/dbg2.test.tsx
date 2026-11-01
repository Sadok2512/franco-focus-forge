import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  captures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "M1" }]),
  series: vi.fn().mockResolvedValue({ series: [], origin_ts: null, nmf_start_at: null, utc_offset_min: null, capture_date: null }),
}));
vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: mocks.captures,
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
    getMetricSeries: mocks.series,
    getMetricAggregate: vi.fn().mockResolvedValue({ groups: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({ init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })) }));

describe("dbg2", () => {
  it("plot body", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MetricsWorkspace projectId="4b7bfd50ddb6" captureId="44621571bccc" onCaptureChange={() => {}}
        selections={["cell_rsrp@0"]} catalog={[]} filters={{}} onClear={() => {}} workspaceId="t1" />
    </QueryClientProvider>);
    const card = (await waitFor(() => { const e = document.querySelector('[data-metric-code="cell_rsrp@0"]'); expect(e).not.toBeNull(); return e as HTMLElement; })) as HTMLElement;
    await new Promise((r) => setTimeout(r, 600));
    console.log("CAPTURES CALLS", mocks.captures.mock.calls.length);
    console.log("SERIES CALLS", mocks.series.mock.calls.length);
    console.log("TEXT", JSON.stringify(card.textContent?.slice(0, 300)));
    console.log("BODY", card.children.length, card.lastElementChild?.className);
  });
});
