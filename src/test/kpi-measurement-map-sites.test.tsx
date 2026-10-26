// La carte de mesures KPI Analytics (vue « Carte » d'une carte KPI) expose
// la même couche Sites que la page Map : bouton « Sites ON/OFF » persistant
// et chargement lazy par bbox via GET /sites, sans toucher aux points de
// mesure du KPI.
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";

const getSites = vi.fn().mockResolvedValue({
  type: "FeatureCollection",
  features: [],
  n_returned: 0,
  n_total_in_bbox: 0,
  reason: null,
});
vi.mock("@/lib/api/sites", () => ({ getSites: (...a: unknown[]) => getSites(...a) }));

vi.mock("@/lib/api/kpi-timeseries", () => ({
  getKpiCaptures: vi.fn().mockResolvedValue([]),
  getKpiTimeSeries: vi.fn().mockResolvedValue({ status: "UNAVAILABLE", reason: "mock" }),
}));

vi.mock("maplibre-gl", () => {
  class FakeMap {
    handlers = new Map<string, Array<(...a: unknown[]) => void>>();
    addControl() {}
    addSource() {}
    addLayer() {}
    getSource() {
      return { setData: vi.fn() };
    }
    getLayer() {
      return undefined;
    }
    removeLayer() {}
    removeSource() {}
    setFilter() {}
    setFeatureState() {}
    fitBounds() {}
    resize() {}
    remove() {}
    isStyleLoaded() {
      return true;
    }
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
    on(id: string, cb: (...a: unknown[]) => void) {
      const list = this.handlers.get(id) ?? [];
      list.push(cb);
      this.handlers.set(id, list);
      if (id === "load") queueMicrotask(() => cb());
    }
    once(id: string, cb: (...a: unknown[]) => void) {
      if (id === "styledata") queueMicrotask(() => cb());
    }
    off() {}
  }
  class Popup {
    setLngLat() {
      return this;
    }
    setHTML() {
      return this;
    }
    setDOMContent() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  return {
    Map: FakeMap,
    Popup,
    NavigationControl: class {},
    setWorkerUrl: vi.fn(),
  };
});
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?url", () => ({ default: "worker.js" }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;

import { KpiMeasurementMap } from "@/features/kpi/KpiMeasurementMap";

function renderMap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <KpiMeasurementMap
        projectId="p1"
        code="LTE_RRC_ATTEMPTS"
        captureId="cap-1"
        onCaptureChange={() => {}}
        filters={{}}
      />
    </QueryClientProvider>,
  );
}

describe("KpiMeasurementMap — couche Sites", () => {
  it("affiche le bouton Sites ON/OFF et charge les sites de la bbox visible", async () => {
    window.localStorage.setItem(
      "bc4.map.sitesLayer.v4",
      JSON.stringify({
        enabled: true,
        cellsEnabled: true,
        filters: { technos: [], bands: [], operators: [] },
      }),
    );
    renderMap();
    const toggle = await screen.findByRole("button", { name: "Site and cell layers" });
    expect(toggle.textContent).toMatch(/Sites ON/);
    await waitFor(() => expect(getSites).toHaveBeenCalled());
    const requests = getSites.mock.calls.map((call) => call[0] as { bbox: number[]; zoom: number });
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bbox: [2.2, 48.89, 2.24, 48.91], zoom: 12 }),
      ]),
    );
  });
});
