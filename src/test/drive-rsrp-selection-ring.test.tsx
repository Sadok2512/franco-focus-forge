import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MlMap } from "maplibre-gl";
import "@/lib/i18n";

const api = vi.hoisted(() => ({ map: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  getMetricAnalysis: vi.fn(),
  getMetricMap: api.map,
  getMetricCaptures: vi.fn(),
  getSignaling: vi.fn(),
}));
vi.mock("@/features/kpi/RsrpDiagnosisDialog", () => ({
  RsrpDiagnosisDialog: () => null,
}));
import { DriveRsrpLayer } from "@/features/kpi/DriveRsrpLayer";

/** Map double that remembers installed sources and layers like MapLibre does. */
function mapDouble() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  const double = {
    sources,
    layers,
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.add(layer.id);
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
    getStyle: vi.fn(() => ({ layers: [] })),
    isStyleLoaded: vi.fn(() => true),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    setFilter: vi.fn(),
    fitBounds: vi.fn(),
    easeTo: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    moveLayer: vi.fn(),
  };
  return double;
}

const SELECTED = "bc4-drive-rsrp-selected";

function selectedPaint(map: ReturnType<typeof mapDouble>) {
  const call = map.addLayer.mock.calls
    .map(([layer]) => layer as { id?: string; paint?: Record<string, unknown> })
    .find((layer) => layer?.id === SELECTED);
  return call?.paint;
}

function mount(map: ReturnType<typeof mapDouble>) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DriveRsrpLayer map={map as unknown as MlMap} projectId="Test_3" activeCaptureId="c1" />
    </QueryClientProvider>,
  );
}

describe("Selection ring of a drive point", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.map.mockResolvedValue({
      capture_id: "c1",
      map_points: [
        { seq: 67, lat: 48.9, lng: 2.2, code: "cell_rsrp", value: -95 },
        { seq: 68, lat: 48.91, lng: 2.21, code: "cell_rsrp", value: -75 },
      ],
    });
  });

  it("draws a hollow ring that borrows the point's own colour, never the blue link colour", async () => {
    const map = mapDouble();
    mount(map);
    await waitFor(() => expect(map.layers.has(SELECTED)).toBe(true));

    const paint = selectedPaint(map);
    expect(paint).toBeDefined();
    // The point underneath is never repainted: the ring itself has no fill.
    expect(paint?.["circle-color"]).toBe("transparent");
    // Its outline is the point's own class colour, not the cyan serving link.
    const stroke = paint?.["circle-stroke-color"] as unknown[];
    expect(stroke[0]).toBe("match");
    expect(stroke[1]).toEqual(["get", "rsrp_class"]);
    expect(JSON.stringify(paint)).not.toContain("#00b8ff");
    // And it sits outside the point instead of enlarging it.
    const radius = paint?.["circle-radius"] as unknown[];
    expect(radius[0]).toBe("+");
    expect(radius[2]).toBe(4);
  });

  it("lets the host map supply the ring colour of the point it shows", async () => {
    const map = mapDouble();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DriveRsrpLayer
          map={map as unknown as MlMap}
          projectId="Test_3"
          activeCaptureId="c1"
          selectedRingColor="#dc2626"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(map.layers.has(SELECTED)).toBe(true));
    expect(selectedPaint(map)?.["circle-stroke-color"]).toBe("#dc2626");
  });
});
