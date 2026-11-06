import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import { ApiHttpError } from "@/lib/api/http";
import { MAP_METRIC_MIME } from "@/features/kpi/map-metric-drop";
import fixture from "./fixtures/metrics-analysis-44621571bccc.json";
import "@/lib/i18n";

const api = vi.hoisted(() => ({ analysis: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  getMetricAnalysis: api.analysis,
  getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "cap-a", label: "A" }]),
  getMetricMap: vi.fn().mockResolvedValue({ map_points: [] }),
  getSignaling: vi.fn().mockResolvedValue({ events: [] }),
  getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
}));
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })),
}));

const response = (captureId: string, value = -76.6) => ({
  ...fixture,
  capture_id: captureId,
  rows: fixture.rows.slice(0, 1).map((row) => ({
    ...row,
    values: { "cell_rsrp@0": value },
  })),
  total_rows: 1,
  total_pages: 1,
});
const emptyResponse = {
  ...response("cap-empty"),
  rows: [],
  total_rows: 0,
  total_pages: 0,
  connected_reason: "projection cell_second missing: run internal backend command",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function mount(captureId = "cap-a", onVisualization = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MetricsWorkspace
        projectId="project-a"
        captureId={captureId}
        onCaptureChange={() => {}}
        selections={["cell_rsrp@0"]}
        catalog={[]}
        filters={{}}
        onClear={() => {}}
        view="table"
        paneRequest={1}
        onVisualization={onVisualization}
      />
    </QueryClientProvider>,
  );
  return { ...view, client, onVisualization };
}

describe("Measurements table request states", () => {
  beforeEach(() => {
    localStorage.clear();
    api.analysis.mockReset();
  });

  it("shows a visible loading label and removes it after success", async () => {
    const request = deferred<ReturnType<typeof response>>();
    api.analysis.mockReturnValue(request.promise);
    mount();
    expect(await screen.findByTestId("metrics-table-loading")).toHaveTextContent(
      "Loading measurements",
    );
    expect(screen.getByRole("progressbar")).toBeVisible();
    expect(screen.getByTestId("metrics-loading-skeleton")).toBeVisible();
    request.resolve(response("cap-a"));
    expect(await screen.findByTestId("metrics-table-panel")).toBeVisible();
    expect(screen.queryByTestId("metrics-table-loading")).toBeNull();
  });

  it("renders an empty compact state without backend instructions or a blank table", async () => {
    api.analysis.mockResolvedValue(emptyResponse);
    mount("cap-empty");
    const empty = await screen.findByTestId("metrics-empty-state");
    expect(empty).toHaveTextContent("No measurements for this selection");
    expect(empty).not.toHaveTextContent(/cell_second|backend|command/i);
    expect(screen.queryByTestId("metrics-table-panel")).toBeNull();
  });

  it("accepts a catalogue metric dropped on the measurements table", async () => {
    api.analysis.mockResolvedValue(response("cap-a"));
    const { onVisualization } = mount();
    await screen.findByTestId("metrics-table-panel");
    const target = screen.getByTestId("metrics-v3-workspace");
    const metric = {
      kind: "metric",
      code: "cell_rsrq@lte-type-0",
      label: "RSRQ",
      unit: "dB",
    };
    const dataTransfer = {
      types: [MAP_METRIC_MIME],
      getData: (type: string) => (type === MAP_METRIC_MIME ? JSON.stringify(metric) : ""),
      dropEffect: "",
    };
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass("is-table-drop-target");
    fireEvent.drop(target, { dataTransfer });
    expect(onVisualization).toHaveBeenCalledWith(metric.code, "table");
  });

  it("renders ERROR with Retry and succeeds after retry", async () => {
    api.analysis
      .mockRejectedValueOnce(new ApiHttpError("INTERNAL_ERROR", "broken", 500))
      .mockResolvedValueOnce(response("cap-a"));
    mount();
    const alerts = await screen.findAllByRole("alert");
    const tableAlert = alerts.find((node) => node.textContent?.includes("HTTP 500"));
    expect(tableAlert).toBeDefined();
    fireEvent.click(within(tableAlert!).getByRole("button", { name: /retry/i }));
    expect(await screen.findByTestId("metrics-table-panel")).toBeVisible();
    expect(api.analysis).toHaveBeenCalledTimes(2);
  });

  it("does not let a late previous capture response replace the active capture", async () => {
    const oldRequest = deferred<ReturnType<typeof response>>();
    const newRequest = deferred<ReturnType<typeof response>>();
    api.analysis.mockImplementation((_project, capture) =>
      capture === "cap-a" ? oldRequest.promise : newRequest.promise,
    );
    const { rerender, client } = mount("cap-a");
    await screen.findByTestId("metrics-table-loading");
    rerender(
      <QueryClientProvider client={client}>
        <MetricsWorkspace
          projectId="project-a"
          captureId="cap-b"
          onCaptureChange={() => {}}
          selections={["cell_rsrp@0"]}
          catalog={[]}
          filters={{}}
          onClear={() => {}}
          view="table"
          paneRequest={1}
        />
      </QueryClientProvider>,
    );
    newRequest.resolve(response("cap-b", -55.5));
    await waitFor(() =>
      expect(screen.getByTestId("metrics-table-panel")).toHaveTextContent("-55.5"),
    );
    oldRequest.resolve(response("cap-a", -99.9));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId("metrics-table-panel")).toHaveTextContent("-55.5");
    expect(screen.getByTestId("metrics-table-panel")).not.toHaveTextContent("-99.9");
  });
});
