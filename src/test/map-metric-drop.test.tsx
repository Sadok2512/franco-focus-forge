import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapMetricDropTarget } from "@/features/kpi/MapMetricDropTarget";
import { MAP_METRIC_MIME, addMapMetric, readMapMetric } from "@/features/kpi/map-metric-drop";
import { getMetricMap } from "@/lib/api/client";
import "@/lib/i18n";

vi.mock("@/lib/api/client", () => ({ getMetricMap: vi.fn().mockResolvedValue({ result_id: "r1", map_points: [{ code: "cell_rsrq@0", seq: 12, value: -9, lng: 2.3, lat: 48.8 }] }) }));
const base = { kind: "kpi" as const, code: "LTE_DL_BLER", label: "BLER", unit: "%" };
const added = { kind: "metric" as const, code: "cell_rsrq@0", label: "RSRQ", unit: "dB" };

describe("Add a metric to the existing map", () => {
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
    const map = { getSource: vi.fn(), addSource: vi.fn(), addLayer: vi.fn(), setLayoutProperty: vi.fn(), getLayer: vi.fn(), removeLayer: vi.fn(), removeSource: vi.fn(), fitBounds: vi.fn() };
    const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MapMetricDropTarget base={base} map={map as never} projectId="p1" captureId="cap1" filters={{ band: ["B3"] } as never} workspaceId="w1">
        {(legend) => <article data-testid="existing-map">{legend}</article>}
      </MapMetricDropTarget>
    </QueryClientProvider>);
    const target = container.querySelector("[data-map-drop-target]");
    if (!target) throw new Error("Missing drop target");
    const dataTransfer = { types: [MAP_METRIC_MIME], getData: (type: string) => type === MAP_METRIC_MIME ? JSON.stringify(added) : "", dropEffect: "" };
    fireEvent.dragOver(target, { dataTransfer });
    expect(getMetricMap).not.toHaveBeenCalled();
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(map.addLayer).toHaveBeenCalledOnce());
    expect(getMetricMap).toHaveBeenCalledWith("p1", "cap1", ["cell_rsrq@0"], { band: ["B3"] }, expect.any(AbortSignal));
    expect(map.addSource.mock.calls[0]?.[1].data.features[0].geometry.coordinates).toEqual([2.3, 48.8]);
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("existing-map")).toHaveLength(1);
    fireEvent.drop(target, { dataTransfer });
    expect(getMetricMap).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Show \/ hide RSRQ/ }));
    await waitFor(() => expect(map.setLayoutProperty).toHaveBeenLastCalledWith(expect.any(String), "visibility", "none"));
    fireEvent.click(screen.getByRole("button", { name: /Remove RSRQ/ }));
    expect(container.querySelector("[data-map-added-metric]")).toBeNull();
  });
});