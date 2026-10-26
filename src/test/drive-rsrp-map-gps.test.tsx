import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MlMap } from "maplibre-gl";
import "@/lib/i18n";

const api = vi.hoisted(() => ({ analysis: vi.fn(), captures: vi.fn(), points: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  getMetricAnalysis: api.analysis,
  getSignaling: (
    project: string,
    endpoint: string,
    query: Record<string, unknown>,
    signal: AbortSignal,
  ) =>
    endpoint === "captures"
      ? api.captures(project, query, signal)
      : api.points(project, endpoint, query, signal),
}));
vi.mock("@/features/kpi/RsrpDiagnosisDialog", () => ({
  RsrpDiagnosisDialog: () => null,
}));
import { DriveRsrpLayer } from "@/features/kpi/DriveRsrpLayer";

function mapDouble() {
  const source = { setData: vi.fn() };
  let added = false;
  return {
    source,
    getSource: vi.fn(() => (added ? source : undefined)),
    addSource: vi.fn(() => {
      added = true;
    }),
    addLayer: vi.fn(),
    getLayer: vi.fn(() => (added ? {} : undefined)),
    getStyle: vi.fn(() => ({ layers: [] })),
    isStyleLoaded: vi.fn(() => true),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    setFilter: vi.fn(),
    fitBounds: vi.fn(),
    easeTo: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

const rows = (lat: number | null, lon: number | null, v: number | null) => ({
  capture_id: "cap-1",
  map_points: [],
  rows: [{ seq_first: 14, lat, lon, values: { "cell_rsrp@0": v } }],
});

describe("Map page drive RSRP paired with the capture GPS", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.captures.mockResolvedValue({
      captures: [{ capture_id: "cap-1", label: "Drive 1", env: "incar" }],
    });
    api.points.mockResolvedValue({
      points: [
        { seq: 14, t_rel_s: 1, lat: 50.378, lng: 3.478, protocol: "lte", gps_seq: 14, seq_gap: 0 },
      ],
      markers: [],
      positioned_count: 1,
      indoor: false,
      floorplan_id: null,
      reason: null,
    });
  });

  function mount(map: ReturnType<typeof mapDouble>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DriveRsrpLayer map={map as unknown as MlMap} projectId="Test_3" autoFrame={false} />
      </QueryClientProvider>,
    );
  }

  it("draws a row without its own GPS at the capture position of the same sequence", async () => {
    api.analysis.mockResolvedValue(rows(null, null, -95));
    const map = mapDouble();
    mount(map);
    await waitFor(() => expect(map.source.setData.mock.calls.at(-1)?.[0].features).toHaveLength(1));
    expect(api.points).toHaveBeenCalledWith(
      "Test_3",
      "points",
      { capture_id: "cap-1" },
      expect.any(AbortSignal),
    );
    expect(map.source.setData.mock.calls.at(-1)?.[0].features[0]).toMatchObject({
      geometry: { coordinates: [3.478, 50.378] },
      properties: { value: -95, seq: 14, cell: 0, position_source: "capture" },
    });
  });

  it("asks for no extra positions when the rows already carry GPS", async () => {
    api.analysis.mockResolvedValue(rows(50.378, 3.478, -95));
    const map = mapDouble();
    mount(map);
    await waitFor(() => expect(map.source.setData.mock.calls.at(-1)?.[0].features).toHaveLength(1));
    expect(api.points).not.toHaveBeenCalled();
    expect(map.source.setData.mock.calls.at(-1)?.[0].features[0]).toMatchObject({
      properties: { position_source: "row" },
    });
  });

  it("remembers only a capture that produced points", async () => {
    api.analysis.mockResolvedValue(rows(null, null, null));
    const map = mapDouble();
    mount(map);
    await waitFor(() => expect(api.analysis).toHaveBeenCalled());
    expect(localStorage.getItem("bc4.driveRsrp.lastCapture.Test_3")).toBeNull();
  });

  it("loads one drive capture without probing every session", async () => {
    api.captures.mockResolvedValue({
      captures: [
        { capture_id: "cap-empty", label: "Indoor", env: "indoor" },
        { capture_id: "cap-map", label: "Mapped drive", env: "incar" },
        { capture_id: "cap-other", label: "Other drive", env: "incar" },
      ],
    });
    api.analysis.mockImplementation(async (_project: string, capture: string) =>
      capture === "cap-map"
        ? { ...rows(50.378, 3.478, -95), capture_id: capture }
        : { ...rows(null, null, -95), capture_id: capture },
    );
    const map = mapDouble();
    mount(map);
    await waitFor(() =>
      expect(api.analysis.mock.calls.some((call) => call[1] === "cap-map")).toBe(true),
    );
    await waitFor(() =>
      expect(map.source.setData.mock.calls.at(-1)?.[0].features[0]).toMatchObject({
        geometry: { coordinates: [3.478, 50.378] },
        properties: { capture_id: "cap-map", value: -95 },
      }),
    );
    expect(localStorage.getItem("bc4.driveRsrp.lastCapture.Test_3")).toBe("cap-map");
    expect(api.analysis).toHaveBeenCalledTimes(1);
    expect(api.points).not.toHaveBeenCalled();
  });
});
