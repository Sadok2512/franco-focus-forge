import { act, render, screen, waitFor } from "@testing-library/react";
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

function mount(map: ReturnType<typeof mapDouble>, selectionLayerId?: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DriveRsrpLayer
        map={map as unknown as MlMap}
        projectId="Test_3"
        activeCaptureId="c1"
        selectionLayerId={selectionLayerId}
      />
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
    // The selected point grows slightly, filled with its own colour (never blue).
    expect(paint?.["circle-color"]).toEqual(paint?.["circle-stroke-color"]);
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

  it("selects an exact KPI point and draws its API-published serving line", async () => {
    api.map.mockResolvedValue({
      capture_id: "c1",
      map_points: [
        {
          seq: 67,
          lat: 48.9,
          lng: 2.2,
          code: "cell_rsrp",
          value: -95,
          serving_cell_lat: 48.91,
          serving_cell_lng: 2.21,
          serving_cell_source: "chi_previous_seq_cell_ref_exact",
        },
      ],
    });
    const map = mapDouble();
    mount(map, "kpi-measures");

    await screen.findByText("1 point shown");
    await waitFor(() =>
      expect(map.on).toHaveBeenCalledWith("click", "kpi-measures", expect.any(Function)),
    );
    const click = map.on.mock.calls
      .filter(([event, layer]) => event === "click" && layer === "kpi-measures")
      .at(-1)?.[2] as ((event: unknown) => void) | undefined;
    expect(click).toBeDefined();

    act(() => click?.({ features: [{ properties: { seq: 67 } }] }));

    const links = map.sources.get("bc4-drive-rsrp-serving-links");
    await screen.findByTestId("selected-point-card");
    await waitFor(() =>
      expect(
        links?.setData.mock.calls.some(([data]) =>
          JSON.stringify(data).includes('"coordinates":[[2.2,48.9],[2.21,48.91]]'),
        ),
      ).toBe(true),
    );
    expect(
      map.setFilter.mock.calls.some(
        ([layer, filter]) => layer === SELECTED && JSON.stringify(filter).includes("67"),
      ),
    ).toBe(true);
    const servingSite = map.sources.get("bc4-drive-rsrp-serving-site");
    expect(
      servingSite?.setData.mock.calls.some(([data]) =>
        JSON.stringify(data).includes('"coordinates":[2.21,48.91]'),
      ),
    ).toBe(true);
  });
});
