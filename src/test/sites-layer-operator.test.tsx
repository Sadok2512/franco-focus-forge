// 1.106.5 — le back nomme les opérateurs en clair (« Bouygues ») alors que la
// légende, les filtres et les couleurs parlent en codes (BYT). Sans clé
// canonique, les sites Bouygues tombaient dans le gris « inconnu » et aucune
// bulle ne disait combien de sites ils comptaient.
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MlMap } from "maplibre-gl";

type Props = { properties: Record<string, unknown> };

const bytSite = {
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [2.22, 48.9] as [number, number] },
  properties: { kind: "site", operator: "Bouygues", site_name: "BY-1", n_cells: 3 },
};
const orfSite = {
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [2.23, 48.9] as [number, number] },
  properties: { kind: "site", operator: "Orange", site_name: "OR-1", n_cells: 2 },
};
const serverCluster = {
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [2.225, 48.9] as [number, number] },
  properties: { kind: "cluster", n_sites: 4800, n_cells: 12000 },
};

const getSites = vi.fn().mockResolvedValue({
  type: "FeatureCollection",
  features: [bytSite, orfSite, serverCluster],
  aggregation: "site",
  bbox: [2.2, 48.89, 2.24, 48.91],
  n_total_in_bbox: 4802,
  n_returned: 3,
  reason: null,
});
vi.mock("@/lib/api/sites", () => ({ getSites: (...a: unknown[]) => getSites(...a) }));

class FakeSource {
  data: unknown = null;
  setData(d: unknown) {
    this.data = d;
  }
}
class FakeMap {
  sources = new Map<string, FakeSource>();
  sourceOptions = new Map<string, Record<string, unknown>>();
  layers: Array<{ id: string; paint?: Record<string, unknown> }> = [];
  addSource(id: string, options?: Record<string, unknown>) {
    this.sources.set(id, new FakeSource());
    if (options) this.sourceOptions.set(id, options);
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  addLayer(layer: { id: string; paint?: Record<string, unknown> }) {
    this.layers.push(layer);
  }
  getLayer() {
    return undefined;
  }
  removeLayer() {}
  removeSource() {}
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

import {
  operatorKey,
  operatorLabel,
  useSitesLayer,
} from "@/features/kpi/SitesLayer";

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

describe("SitesLayer — opérateurs", () => {
  it("loads individual sites when a parsed satellite style still has pending tiles", async () => {
    const map = new FakeMap();
    map.isStyleLoaded = () => false;
    const parsedMap = Object.assign(map, {
      getStyle: () => ({ version: 8, sources: {}, layers: [] }),
    });
    renderHook(() =>
      useSitesLayer(parsedMap as unknown as MlMap, true, false, NO_FILTER, LABELS),
    );
    await waitFor(() => {
      const data = map.sources.get("bc4-sites")?.data as { features: Props[] } | undefined;
      expect(data?.features).toHaveLength(2);
      expect(data?.features.map((feature) => feature.properties["operator"])).toEqual([
        "Bouygues", "Orange",
      ]);
    });
  });

  it("reconnaît Bouygues sous l'orthographe du back comme sous le code du filtre", () => {
    expect(operatorKey("Bouygues")).toBe("BYT");
    expect(operatorKey("BYT")).toBe("BYT");
    expect(operatorKey("bouygues telecom")).toBe("BYT");
    expect(operatorKey("Orange")).toBe("ORF");
    expect(operatorKey("Free")).toBe("FRM");
    expect(operatorKey("Telefonica")).toBeNull();
    expect(operatorLabel("BYT")).toBe("Bouygues");
    expect(operatorLabel("Bouygues")).toBe("Bouygues");
    expect(operatorLabel(null)).toBe("?");
  });

  it("colore les sites Bouygues en bleu et affiche chaque site individuellement, sans aucun cluster", async () => {
    const map = new FakeMap();
    renderHook(() =>
      useSitesLayer(map as unknown as MlMap, true, false, NO_FILTER, LABELS),
    );
    await waitFor(() => expect(getSites).toHaveBeenCalled());
    await waitFor(() => {
      const sites = map.sources.get("bc4-sites")?.data as
        | { features: Props[] }
        | undefined;
      expect(sites?.features.length).toBe(2);
    });

    const sites = map.sources.get("bc4-sites")!.data as { features: Props[] };
    const byt = sites.features.find((f) => f.properties["op_key"] === "BYT");
    expect(byt?.properties["operator"]).toBe("Bouygues");
    expect(sites.features.some((f) => f.properties["kind"] === "cluster")).toBe(false);

    const color = map.layers.find((l) => l.id === "bc4-sites-site")?.paint?.[
      "circle-color"
    ] as unknown[];
    expect(JSON.stringify(color)).toContain('["get","op_key"]');
    expect(color[color.indexOf("BYT") + 1]).toBe("#009FE3");

    // Aucun regroupement : la source n'est jamais clusterée, à aucun zoom…
    const options = map.sourceOptions.get("bc4-sites");
    expect(options?.["cluster"] ?? false).toBe(false);
    expect(options?.["clusterMaxZoom"]).toBeUndefined();
    expect(options?.["clusterProperties"]).toBeUndefined();
    // …aucune bulbe de cluster n'existe…
    expect(map.layers.some((l) => l.id === "bc4-sites-cluster")).toBe(false);
    expect(map.layers.some((l) => l.id === "bc4-sites-cluster-count")).toBe(false);
    // …et la couche des sites n'exclut personne (pas de filtre point_count).
    const siteLayer = map.layers.find((l) => l.id === "bc4-sites-site") as
      | { filter?: unknown }
      | undefined;
    expect(JSON.stringify(siteLayer?.filter ?? null)).not.toContain("point_count");
  });
});
