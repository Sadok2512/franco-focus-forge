import { fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const data = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(data),
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "c" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })),
}));

function mount() {
  window.localStorage.removeItem("bc3.metrics.pane");
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MetricsWorkspace
        projectId="p"
        captureId="44621571bccc"
        onCaptureChange={() => {}}
        selections={["cell_rsrp@0"]}
        catalog={[]}
        filters={{}}
        onClear={() => {}}
        paneRequest={1}
      />
    </QueryClientProvider>,
  );
}

describe("probe: how to open the shared panel menu in jsdom", () => {
  it("reports which event sequence opens it", async () => {
    mount();
    const panel = await screen.findByTestId("metrics-table-panel");
    const trigger = within(panel).getByTestId("workspace-panel-menu");

    fireEvent.click(trigger);
    const afterClick = !!screen.queryByTestId("metrics-table-export");
    fireEvent.keyDown(document.body, { key: "Escape" });

    fireEvent.keyDown(trigger, { key: "Enter" });
    const afterEnter = !!screen.queryByTestId("metrics-table-export");
    fireEvent.keyDown(document.body, { key: "Escape" });

    fireEvent.keyDown(trigger, { key: " " });
    const afterSpace = !!screen.queryByTestId("metrics-table-export");
    fireEvent.keyDown(document.body, { key: "Escape" });

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false });
    const afterPointer = !!screen.queryByTestId("metrics-table-export");

    console.log(
      "OPENED click=%s enter=%s space=%s pointer=%s",
      afterClick,
      afterEnter,
      afterSpace,
      afterPointer,
    );
    expect(true).toBe(true);
  });
});
