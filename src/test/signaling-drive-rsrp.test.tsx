import { render, waitFor, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MlMap } from "maplibre-gl";
import "@/lib/i18n";

const api = vi.hoisted(() => ({ analysis: vi.fn(), captures: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  getMetricAnalysis: api.analysis,
  getMetricCaptures: api.captures,
}));
import { DriveRsrpLayer } from "@/features/kpi/DriveRsrpLayer";

function mapDouble() {
  const source = { setData: vi.fn() };
  let added = false;
  return {
    source,
    getSource: vi.fn(() => added ? source : undefined),
    addSource: vi.fn(() => { added = true; }),
    addLayer: vi.fn(),
    getLayer: vi.fn(() => added ? {} : undefined),
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

describe("Signaling drive RSRP", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.analysis.mockImplementation(async (_project, capture) => ({
      capture_id: capture,
      map_points: [
        { seq: 67, lat: 48.9, lng: 2.2, code: "cell_rsrp", value: -95 },
        { seq: 68, lat: 48.91, lng: 2.21, code: "cell_rsrp", value: -85 },
        { seq: 69, lat: 48.92, lng: 2.22, code: "cell_rsrp", value: "N/D" },
        { seq: 70, lat: 91, lng: 2.23, code: "cell_rsrp", value: -80 },
      ],
    }));
  });

  function mount(map: ReturnType<typeof mapDouble>, capture: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (id: string) => <QueryClientProvider client={client}>
      <DriveRsrpLayer map={map as unknown as MlMap} projectId="Test_3" activeCaptureId={id} autoFrame={false} />
    </QueryClientProvider>;
    return { ...render(view(capture)), view };
  }

  it("loads RSRP for the active Signaling capture without choosing another capture", async () => {
    const map = mapDouble();
    const mounted = mount(map, "1e4e8d879a83");
    await waitFor(() => expect(api.analysis).toHaveBeenCalledWith("Test_3", "1e4e8d879a83", ["cell_rsrp@0"], {}, { group_by: "operator", include_map: true }, expect.any(AbortSignal)));
    expect(api.captures).not.toHaveBeenCalled();
    mounted.rerender(mounted.view("capture-2"));
    await waitFor(() => expect(api.analysis.mock.calls.at(-1)?.[1]).toBe("capture-2"));
  });

  it("renders only numeric RSRP with valid GPS and retains the original sequence", async () => {
    const map = mapDouble();
    mount(map, "1e4e8d879a83");
    await waitFor(() => expect(map.source.setData.mock.calls.at(-1)?.[0].features).toHaveLength(2));
    expect(map.source.setData.mock.calls.at(-1)?.[0].features[0]).toMatchObject({
      geometry: { coordinates: [2.2, 48.9] },
      properties: { value: -95, seq: 67, capture_id: "1e4e8d879a83", rsrp_class: "fair" },
    });
  });

  it("never moves the Signaling camera when RSRP loads or visibility changes", async () => {
    const map = mapDouble();
    mount(map, "1e4e8d879a83");
    await waitFor(() => expect(map.source.setData.mock.calls.at(-1)?.[0].features).toHaveLength(2));
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(map.source.setData.mock.calls.at(-1)?.[0].features).toHaveLength(0));
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();
  });
});