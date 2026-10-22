// 1.87.0 — Charts pane cards: clicking Table in a card's visualisation menu
// must switch that card to the table (regression: the view was locked to
// graph and the click was silently ignored).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import type { MetricInfo } from "@/lib/api/metrics-schemas";
import "@/lib/i18n";

beforeAll(() => {
  // jsdom has no ResizeObserver; recharts' ResponsiveContainer needs it.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

vi.mock("@/lib/api/client", () => ({
  getMetricAnalysis: vi.fn().mockResolvedValue({
    project_id: "TEST2",
    capture_id: "cap1",
    result_id: "r1",
    decoder_version: "1",
    schema_version: "1",
    decode_level: "deep",
    origin_seq: 0,
    origin_ts: "1970-01-01T00:00:00Z",
    duration_s: 10,
    aggregation: "1s",
    time_policy: "rel",
    pairing: "none",
    columns: [],
    rows: [],
    series: [],
    histogram: [],
    scatter: [],
    map_points: [],
    connected_seconds: null,
    connected_reason: null,
    pair_rates: [],
    gaps: [],
    csv: "",
  }),
  getMetricCaptures: vi
    .fn()
    .mockResolvedValue([{ capture_id: "cap1", label: "Capture 1" }]),
}));

vi.mock("@/lib/api/metrics", () => ({
  getMetricAggregate: vi.fn().mockResolvedValue({
    project_id: "TEST2",
    metric_code: "ci_rs_snr@0",
    group_by: "operator",
    unit: "dB",
    tech: "LTE",
    kind: "numeric",
    n: 1,
    p10: null,
    p50: null,
    p90: null,
    groups: [{ operator: "OP1", band: null, n: 1, p10: 1, p50: 2, p90: 3 }],
  }),
  getMetricCaptures: vi
    .fn()
    .mockResolvedValue([{ capture_id: "cap1", label: "Capture 1" }]),
  getMetricSeries: vi.fn().mockResolvedValue({
    decoder_version: "1",
    series: [
      {
        code: "ci_rs_snr@0",
        label: "RS-SNR",
        unit: "dB",
        states: [],
        segments: [],
        points: [{ seq: 1, t_rel_s: 0, value: 2, tooltip: "2" }],
        sampling: { method: "all", factor: 1, seq_bucket_width: null },
        n_returned: 1,
      },
    ],
  }),
}));

const metric: MetricInfo = {
  event: "RSRQ",
  category_label: "Radio",
  root_notices: [],
  cell_scoped: true,
  cells: [0],
  cell_options: [{ cell: "0", label: "PCell", n_in_project: 1, available: true, reason: null }],
  attributes: [],
  proof: "documented",
  available: true,
  reason: null,
  alias_of: null,
  event_group: null,
  unproven_cells: [],
  code: "ci_rs_snr@0",
  label: "RS-SNR",
  unit: "dB",
  event_code: "RSRQ",
  decoder_version: "1",
  proof_ref: "ref",
  source_table: "t",
  source_column: "c",
  tech: "LTE",
  kind: "numeric",
  n_in_project: 1,
  category: "Radio",
};

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MetricsWorkspace
        projectId="TEST2"
        captureId="cap1"
        onCaptureChange={vi.fn()}
        selections={["ci_rs_snr@0"]}
        catalog={[metric]}
        filters={{}}
        onClear={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("Metrics Charts pane card view", () => {
  it("switches a Charts card to the table when Table is clicked", async () => {
    mount();
    await screen.findByTestId("metrics-v3-workspace");
    const card = document.querySelector('[data-metric-code="ci_rs_snr@0"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-view")).toBe("graph");
    fireEvent.pointerDown(screen.getByTestId("metric-view-trigger"), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    const item = await screen.findByRole("menuitem", { name: /table/i });
    fireEvent.click(item);
    await waitFor(() => {
      expect(
        document.querySelector('[data-metric-code="ci_rs_snr@0"]')?.getAttribute("data-view"),
      ).toBe("table");
    });
    expect(screen.getByTestId("metric-aggregate-table")).toBeVisible();
  });
});
