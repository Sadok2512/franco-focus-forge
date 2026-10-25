// Multi-band cell display: features sharing one physical sector (same site,
// azimuth, position) are grouped and the sector is split into one colored
// slice per band, with a single deduplicated cell point.
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MlMap } from "maplibre-gl";

const cellB3 = {
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [2.22, 48.9] as [number, number] },
  properties: { kind: "cell", site_id: "S1", cell_name: "S1-1", band: "B3", techno: "LTE", azimuth: 90, pci: 12 },
};
const cellB20 = {
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [2.22, 48.9] as [number, number] },
  properties: { kind: "cell", site_id: "S1", cell_name: "S1-1", band: "B20", techno: "LTE", azimuth: 90, pci: 12 },
};
const otherSector = {
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [2.22, 48.9] as [number, number] },
  properties: { kind: "cell", site_id: "S1", cell_name: "S1-2", band: "B3", techno: "LTE", azimuth: 210, pci: 13 },
};

const getSites = vi.fn().mockImplementation((filters: { zoom: number }) =>
  Promise.resolve(
    filters.zoom >= 15
      ? {
          type: "FeatureCollection",
          features: [cellB3, cellB20, otherSector],
          aggregation: "cell",
          bbox: [2.2, 48.89, 2.24, 48.91],
          n_total_in_bbox: 3,
          n_returned: 3,
          reason: null,
        }
      : {
          type: "FeatureCollection",
          features: [],
          aggregation: "site",
          bbox: [2.2, 48.89, 2.24, 48.91],
          n_total_in_bbox: 0,
          n_returned: 0,
          reason: null,
        },
  ),
);
vi.mock("@/lib/api/sites", () => ({ getSites: (...a: unknown[]) => getSites(...a) }));

class FakeSource {
  data: unknown = null;
  setData(d: unknown) {
    this.data = d;
  }
}
class FakeMap {
  sources = new Map<string, FakeSource>();
  layers: Array<{ id: string }> = [];
  addSource(id: string) {
    this.sources.set(id, new FakeSource());
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  addLayer(layer: { id: string }) {
    this.layers.push(layer);
  }
  getLayer() {
    return undefined;
  }
  isStyleLoaded() {
    return true;
  }
  on() {}
  once() {}
  off() {}
  getCanvas() {
    return { style: {} };
  }
  getBounds() {
    return {
      getSouthWest: () => ({ lng: 2.2, lat: 48.89 }),
      getNorthEast: () => ({ lng: 2.24, lat: 48.91 }),
    };
  }
  getZoom() {
    return 13;
  }
}

import { useSitesLayer } from "@/features/kpi/SitesLayer";

const NO_FILTER = { technos: [], bands: [], operators: [] };
const LABELS = {
  siteName: "Site Name",
  siteId: "Site ID",
  technology: "Technology",
  cells: "Number of Cells",
  band: "Band",
  pci: "PCI",
  azimuth: "Azimuth",
};

describe("SitesLayer — multi-band cells", () => {
  it("splits a two-band sector into one colored slice per band and dedupes the cell point", async () => {
    const map = new FakeMap();
    renderHook(() => useSitesLayer(map as unknown as MlMap, false, true, NO_FILTER, LABELS));
    await waitFor(() => expect(getSites).toHaveBeenCalled());
    await waitFor(() => {
      const cells = map.sources.get("bc4-cells")?.data as
        | { features: Array<{ properties: Record<string, unknown> }> }
        | undefined;
      expect(cells?.features.length).toBeGreaterThan(0);
    });

    const cells = map.sources.get("bc4-cells")!.data as {
      features: Array<{ properties: Record<string, unknown> }>;
    };
    const beams = cells.features.filter((f) => f.properties["render_kind"] === "beam");
    const points = cells.features.filter((f) => f.properties["render_kind"] === "cell");

    // Two sectors: the multi-band one (B3 + B20 → 2 slices) and the single-band one (1 beam).
    expect(beams).toHaveLength(3);
    expect(points).toHaveLength(2);

    const multiBeams = beams.filter((f) => f.properties["azimuth"] === 90);
    expect(multiBeams).toHaveLength(2);
    // Same cell_key on every slice: selecting the cell highlights the whole sector.
    expect(multiBeams[0]!.properties["cell_key"]).toBe(multiBeams[1]!.properties["cell_key"]);
    // One slice per band, each in its own band colour (B3 blue, B20 teal).
    const colors = multiBeams.map((f) => f.properties["band_color"]).sort();
    expect(colors).toEqual(["#14B8A6", "#2563EB"]);
    // The two slices share an edge (contiguous split, no gap).
    const geoA = (multiBeams[0] as unknown as { geometry: { coordinates: [number, number][][] } }).geometry.coordinates[0]!;
    const geoB = (multiBeams[1] as unknown as { geometry: { coordinates: [number, number][][] } }).geometry.coordinates[0]!;
    expect(geoA[geoA.length - 2]).toEqual(geoB[1]);

    // The deduplicated cell point carries the full band list for the popup.
    const multiPoint = points.find((f) => f.properties["azimuth"] === 90);
    expect(multiPoint?.properties["bands"]).toEqual(["B3", "B20"]);
  });
});
