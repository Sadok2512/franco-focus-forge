import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ECharts } from "echarts";
import { RfTimeline } from "@/features/signaling/RfTimeline";

// Fake chart: the RSRP point at t=5 s lands at pixel (150, 50).
const handlers: Record<string, (ev: unknown) => void> = {};
const zrHandlers: Record<string, (ev: unknown) => void> = {};
const fakeChart = {
  isDisposed: () => false,
  on: (name: string, cb: (ev: unknown) => void) => {
    handlers[name] = cb;
  },
  off: () => {},
  getOption: () => ({
    xAxis: [{}, {}, {}, {}],
    yAxis: [{}, {}, {}, {}],
    dataZoom: [{ start: 0, end: 100 }],
  }),
  setOption: () => {},
  dispatchAction: () => {},
  resize: () => {},
  dispose: () => {},
  convertFromPixel: () => 10,
  convertToPixel: (target: unknown, value: unknown) => {
    if (target && typeof target === "object" && "seriesId" in target) {
      const [time] = value as [number, number];
      return [100 + time * 10, 50];
    }
    return Number(value) * 10;
  },
  getZr: () => ({
    on: (name: string, cb: (ev: unknown) => void) => {
      zrHandlers[name] = cb;
    },
    handler: { findHover: () => ({}) },
  }),
} as unknown as ECharts;

vi.mock("echarts", () => ({
  init: () => (globalThis as { __chart?: ECharts }).__chart as ECharts,
}));

const event = {
  id: "dl-1",
  lane: "services",
  type: "DATA",
  kind: "bar",
  seq: 10,
  seq_end: 12,
  t_rel_s: 5,
  t_rel_end_s: 9,
  duration_ms: 4000,
  outcome: "ok",
  cause: null,
  label: "DL Data Bearer 1",
  attrs: { track: "dl" },
  pivot_seq: 10,
  linked_seqs: [11],
  link_rule: "same_procedure",
  seq_gap: 0,
};

function renderTimeline() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["signaling-rf", "p", "c", "", "", ""], {
    project_id: "p",
    capture_id: "c",
    result_id: "r",
    events: [event],
    total: 1,
    lanes: ["services"],
    counts_by_lane: {},
    link_rule_counts: {},
    rule_version: null,
  });
  client.setQueryData(["signaling-rf-radio", "p", "c"], {
    project_id: "p",
    capture_id: "c",
    result_id: "r",
    duration_s: 100,
    series: [{ code: "cell_rsrp", points: [{ seq: 1, t_rel_s: 5, value: -98.2 }] }],
  });
  render(
    <QueryClientProvider client={client}>
      <RfTimeline
        projectId="p"
        captureId="c"
        selectedTime={null}
        selectedEventId={null}
        onTime={() => {}}
        onSelect={() => {}}
        onRange={() => {}}
        technology=""
        direction=""
        search=""
        allowedProtocols={[]}
        timeWindow={[0, 100]}
        onWindow={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("Signaling click shows the name only", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    (globalThis as { __chart?: ECharts }).__chart = fakeChart;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { __chart?: ECharts }).__chart;
    for (const key of Object.keys(handlers)) delete handlers[key];
    for (const key of Object.keys(zrHandlers)) delete zrHandlers[key];
  });

  it("shows just the event name at the click, without time, seq or evidence", async () => {
    renderTimeline();
    await waitFor(() => expect(handlers["click"]).toBeInstanceOf(Function));
    act(() => handlers["click"]!({ data: { event }, event: { offsetX: 200, offsetY: 60 } }));
    const tag = screen.getByTestId("rf-name-tag");
    expect(tag.textContent).toBe("DL Data Bearer 1");
    expect(tag.textContent).not.toContain(" s");
    expect(tag.textContent).not.toContain("#");
  });

  it("names the RF measurement under the cursor and clears when the click misses", async () => {
    renderTimeline();
    await waitFor(() => expect(zrHandlers["click"]).toBeInstanceOf(Function));
    act(() => zrHandlers["click"]!({ offsetX: 152, offsetY: 51 }));
    const tag = screen.getByTestId("rf-name-tag");
    expect(tag.textContent).toMatch(/rsrp/i);
    expect(tag.textContent).not.toBe("DL Data Bearer 1");
    act(() => zrHandlers["click"]!({ offsetX: 152, offsetY: 120 }));
    expect(screen.queryByTestId("rf-name-tag")).toBeNull();
  });

  it("hides the name on Escape", async () => {
    renderTimeline();
    await waitFor(() => expect(handlers["click"]).toBeInstanceOf(Function));
    act(() => handlers["click"]!({ data: { event }, event: { offsetX: 200, offsetY: 60 } }));
    expect(screen.getByTestId("rf-name-tag")).toBeTruthy();
    act(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen.queryByTestId("rf-name-tag")).toBeNull();
  });
});
