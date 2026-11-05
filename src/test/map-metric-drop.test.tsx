import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { droppedMetricFeatures, MapMetricDropTarget } from "@/features/kpi/MapMetricDropTarget";
import {
  MAP_METRIC_MIME,
  addMapMetric,
  readMapMetric,
  type MapMetric,
} from "@/features/kpi/map-metric-drop";
import { getMetricMap } from "@/lib/api/client";
import "@/lib/i18n";

vi.mock("@/lib/api/client", () => ({
  getMetricMap: vi.fn().mockResolvedValue({
    result_id: "r1",
    map_points: [{ code: "cell_rsrq@0", seq: 12, value: -9, lng: 2.3, lat: 48.8 }],
  }),
}));
const base = { kind: "kpi" as const, code: "LTE_DL_BLER", label: "BLER", unit: "%" };
const added = { kind: "metric" as const, code: "cell_rsrq@0", label: "RSRQ", unit: "dB" };

describe("Add a metric to the existing map", () => {
  it("keeps numeric-string dimensions and maps textual dimensions as categories", () => {
    const earfcn = droppedMetricFeatures(
      [{ code: "cell_ch@lte-type-0", seq: 1, value: "3650.0", lng: 3, lat: 50 }],
      "cell_ch@lte-type-0",
      "cap1",
      "r1",
      "earfcn",
    );
    expect(earfcn.categorical).toBe(false);
    expect(earfcn.features[0]?.properties.value).toBe(3650);

    const direction = droppedMetricFeatures(
      [
        { code: "direction", seq: 1, value: "DL", lng: 3, lat: 50 },
        { code: "direction", seq: 2, value: "UL", lng: 3.1, lat: 50.1 },
      ],
      "direction",
      "cap1",
      "r1",
      "",
    );
    expect(direction.categorical).toBe(true);
    expect(direction.labels).toEqual(["DL", "UL"]);
    expect(direction.features.map((feature) => feature.properties.value)).toEqual([0, 1]);
  });

  it("adds without replacing existing membership and ignores duplicate drops", () => {
    const current = [{ ...added, code: "cell_rsrp@0" }];
    expect(addMapMetric(current, added, base)).toEqual([...current, added]);
    expect(addMapMetric(current, current[0] ?? added, base)).toBe(current);
    expect(addMapMetric(current, base, base)).toBe(current);
  });
  it("rejects external or malformed drag data", () => {
    expect(readMapMetric("file:///tmp/example")).toBeNull();
    expect(readMapMetric(JSON.stringify({ ...added, kind: "file" }))).toBeNull();
    expect(readMapMetric(JSON.stringify(added))).toEqual(added);
  });
  it("loads only the dropped metric after drop on the same capture and preserves the map camera", async () => {
    localStorage.clear();
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    const map = {
      getSource: vi.fn((id: string) => sources.get(id)),
      addSource: vi.fn((id: string, _data: unknown) => {
        sources.set(id, { setData: vi.fn() });
      }),
      addLayer: vi.fn(),
      setLayoutProperty: vi.fn(),
      getLayer: vi.fn(),
      removeLayer: vi.fn(),
      removeSource: vi.fn(),
      fitBounds: vi.fn(),
    };
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MapMetricDropTarget
          base={base}
          map={map as never}
          projectId="p1"
          captureId="cap1"
          filters={{ band: ["B3"] } as never}
          workspaceId="w1"
        >
          {(legend) => <article data-testid="existing-map">{legend}</article>}
        </MapMetricDropTarget>
      </QueryClientProvider>,
    );
    const target = container.querySelector("[data-map-drop-target]");
    if (!target) throw new Error("Missing drop target");
    const dataTransfer = {
      types: [MAP_METRIC_MIME],
      getData: (type: string) => (type === MAP_METRIC_MIME ? JSON.stringify(added) : ""),
      dropEffect: "",
    };
    fireEvent.dragOver(target, { dataTransfer });
    expect(getMetricMap).not.toHaveBeenCalled();
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(map.addLayer).toHaveBeenCalledOnce());
    expect(getMetricMap).toHaveBeenCalledWith(
      "p1",
      "cap1",
      ["cell_rsrq@0"],
      { band: ["B3"] },
      expect.any(AbortSignal),
    );
    const setData = [...sources.values()][0]?.setData;
    await waitFor(() =>
      expect(setData?.mock.calls.at(-1)?.[0].features[0]?.geometry.coordinates).toEqual([
        2.3, 48.8,
      ]),
    );
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("existing-map")).toHaveLength(1);
    fireEvent.drop(target, { dataTransfer });
    expect(getMetricMap).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Show \/ hide RSRQ/ }));
    await waitFor(() =>
      expect(map.setLayoutProperty).toHaveBeenLastCalledWith(
        expect.any(String),
        "visibility",
        "none",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Remove RSRQ/ }));
    expect(container.querySelector("[data-map-added-metric]")).toBeNull();
  });

  it("keeps collapse, visibility, range selection and settings independent and persistent", async () => {
    localStorage.clear();
    const layers = new Set<string>();
    const map = {
      getSource: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
      setLayoutProperty: vi.fn(),
      setFilter: vi.fn(),
      getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
      removeLayer: vi.fn(),
      removeSource: vi.fn(),
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = () => (
      <QueryClientProvider client={client}>
        <MapMetricDropTarget
          base={base}
          map={map as never}
          projectId="p1"
          captureId="cap1"
          filters={{}}
          workspaceId="persisted-map"
        >
          {(legend) => <article>{legend}</article>}
        </MapMetricDropTarget>
      </QueryClientProvider>
    );
    const first = render(ui());
    const target = first.container.querySelector("[data-map-drop-target]")!;
    const dataTransfer = {
      types: [MAP_METRIC_MIME],
      getData: () => JSON.stringify(added),
      dropEffect: "",
    };
    fireEvent.drop(target, { dataTransfer });
    await screen.findByRole("button", { name: /Collapse metric legend/ });
    fireEvent.click(await screen.findByRole("checkbox", { name: /100\.0%/ }));
    expect(map.setFilter).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.arrayContaining(["!"]),
    );
    fireEvent.click(screen.getByRole("button", { name: /Collapse metric legend/ }));
    expect(screen.queryByRole("checkbox", { name: /100\.0%/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show \/ hide RSRQ/ }));
    fireEvent.click(screen.getByRole("button", { name: /Metric legend settings/ }));
    expect(screen.getByTestId("metric-legend-settings")).toBeInTheDocument();
    first.unmount();

    render(ui());
    await screen.findByRole("button", { name: /Expand metric legend/ });
    expect(screen.getByRole("button", { name: /Show \/ hide RSRQ/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(await screen.findByRole("checkbox", { name: /100\.0%/ })).not.toBeChecked();
  });

  it("adds three distinct metrics without replacing the existing map", () => {
    const metrics = [
      { ...added, code: "cell_rsrp@0", label: "RSRP" },
      added,
      { ...added, code: "cell_rssi@0", label: "RSSI", unit: "dBm" },
    ];
    expect(
      metrics.reduce<MapMetric[]>((all, metric) => addMapMetric(all, metric, base), []),
    ).toEqual(metrics);
  });
});
