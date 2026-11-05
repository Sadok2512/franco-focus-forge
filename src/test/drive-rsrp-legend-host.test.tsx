import { fireEvent, render, waitFor } from "@testing-library/react";
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
import { RSRP_CLASSES } from "@/features/kpi/drive-rsrp";

/** Map double that remembers installed sources and layers like MapLibre does. */
function mapDouble() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  return {
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
}

function mount(map: ReturnType<typeof mapDouble>, legendHost: HTMLDivElement, hidePoints = false) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DriveRsrpLayer
        map={map as unknown as MlMap}
        projectId="Test_3"
        activeCaptureId="c1"
        hideControls
        hidePoints={hidePoints}
        legendHost={legendHost}
      />
    </QueryClientProvider>,
  );
}

/** Browsers normalise hex colours to rgb(); compare in the same form. */
function rgb(hex: string) {
  const digits = hex.replace("#", "");
  const expanded =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits;
  const value = parseInt(expanded, 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

describe("Drive RSRP legend inside the host map's legend panel", () => {
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

  it("shows every RSRP class with its own colour, and hiding one filters the map", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const map = mapDouble();
    mount(map, host);

    // The control card is hidden, so anything in the host comes from the legend portal.
    await waitFor(() => expect(host.querySelector("[data-map-drive-rsrp-legend]")).not.toBeNull());

    const rows = host.querySelectorAll("ul[aria-label='RSRP legend'] > li");
    expect(rows).toHaveLength(RSRP_CLASSES.length);
    // Each class row carries its own colour, so the panel cannot drift from the map.
    const swatches = [
      ...host.querySelectorAll<HTMLElement>("ul[aria-label='RSRP legend'] span[style]"),
    ].map((span) => span.style.background);
    for (const cls of RSRP_CLASSES) expect(swatches).toContain(rgb(cls.color));
    // The proven cell links are listed too.
    expect(host.textContent).toContain("Serving cell");
    expect(host.textContent).toContain("Neighbour cells");
    expect(host.textContent).toContain("NR anchor");

    // Clicking a class in the panel hides it on the map and remembers the choice.
    const firstCheckbox = host.querySelector<HTMLInputElement>(
      "ul[aria-label='RSRP legend'] input[type=checkbox]",
    );
    expect(firstCheckbox).not.toBeNull();
    fireEvent.click(firstCheckbox!);

    await waitFor(() =>
      expect(
        map.setFilter.mock.calls.some((call) => JSON.stringify(call).includes('"excellent"')),
      ).toBe(true),
    );
    expect(JSON.parse(localStorage.getItem("bc4.signaling.driveRsrp.v2") ?? "{}").hidden).toContain(
      "excellent",
    );
  });

  it("keeps all cell-link switches in KPI maps that own their measurement points", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    mount(mapDouble(), host, true);

    await waitFor(() => expect(host.querySelector("[data-map-drive-rsrp-legend]")).not.toBeNull());
    expect(host.textContent).toContain("Point → cell links");
    expect(host.textContent).toContain("Serving cell");
    expect(host.textContent).toContain("Neighbour cells");
    expect(host.textContent).toContain("NR anchor");
    expect(host.querySelectorAll("input[type=checkbox]")).toHaveLength(4);
  });
});
