// 1.106.1 — la carte Signaling expose la même couche Sites que les cartes
// KPI : bouton « Sites ON/OFF » persistant, chargement lazy par bbox via
// GET /sites, sans toucher au trajet GPS ni aux événements géolocalisés.
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SigCapture } from "@/lib/api/signaling-schemas-v2";
import "@/lib/i18n";

const getSites = vi.fn().mockResolvedValue({
  type: "FeatureCollection",
  features: [],
  n_returned: 0,
  n_total_in_bbox: 0,
  reason: null,
});
const fakeMapState = vi.hoisted(() => ({ zoom: 13 }));
vi.mock("@/lib/api/sites", () => ({ getSites: (...a: unknown[]) => getSites(...a) }));

// MapLibre factice : déclenche « load » immédiatement et expose l'API
// minimale utilisée par SignalingMap et useSitesLayer.
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
      return fakeMapState.zoom;
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

// jsdom ne connaît pas ResizeObserver.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;

import { SignalingMap } from "@/features/signaling-v2/SignalingMap";

const capture: SigCapture = {
  id: "cap-1",
  track: [
    { lng: 2.22, lat: 48.9, t: 0 },
    { lng: 2.23, lat: 48.905, t: 10 },
  ],
  events: [{ id: "e1", name: "RRC Request", severity: "info", t: 1, message_index: 0 }],
  events_gps: [{ event_id: "e1", lng: 2.221, lat: 48.901, t: 1 }],
} as unknown as SigCapture;

describe("SignalingMap — couche Sites", () => {
  it("affiche le bouton Sites ON/OFF et charge les sites de la bbox visible", async () => {
    fakeMapState.zoom = 13;
    window.localStorage.setItem(
      "bc4.map.sitesLayer.v4",
      JSON.stringify({
        enabled: true,
        cellsEnabled: true,
        filters: { technos: [], bands: [], operators: [] },
      }),
    );
    render(<SignalingMap capture={capture} selectedEventId={null} onSelectEvent={() => {}} />);
    const toggle = await screen.findByRole("button", { name: "Site and cell layers" });
    expect(toggle.textContent).toMatch(/Sites ON/);
    await waitFor(() => expect(getSites).toHaveBeenCalled());
    const requests = getSites.mock.calls.map((call) => call[0] as { bbox: number[]; zoom: number });
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bbox: [2.2, 48.89, 2.24, 48.91], zoom: 12 }),
        expect.objectContaining({ bbox: [2.2, 48.89, 2.24, 48.91], zoom: 15 }),
      ]),
    );
  });

  it("ne charge aucun site quand la couche est désactivée", async () => {
    fakeMapState.zoom = 13;
    getSites.mockClear();
    window.localStorage.setItem(
      "bc4.map.sitesLayer.v4",
      JSON.stringify({
        enabled: false,
        cellsEnabled: false,
        filters: { technos: [], bands: [], operators: [] },
      }),
    );
    render(<SignalingMap capture={capture} selectedEventId={null} onSelectEvent={() => {}} />);
    const toggle = await screen.findByRole("button", { name: "Site and cell layers" });
    expect(toggle.textContent).toMatch(/Sites OFF/);
    await new Promise((r) => setTimeout(r, 100));
    expect(getSites).not.toHaveBeenCalled();
  });

  it("au zoom 12 charge les sites individuels sans demander les cellules", async () => {
    getSites.mockClear();
    fakeMapState.zoom = 12;
    window.localStorage.setItem(
      "bc4.map.sitesLayer.v4",
      JSON.stringify({
        enabled: true,
        cellsEnabled: true,
        filters: { technos: [], bands: [], operators: [] },
      }),
    );
    render(<SignalingMap capture={capture} selectedEventId={null} onSelectEvent={() => {}} />);
    await screen.findByRole("button", { name: "Site and cell layers" });
    await waitFor(() => expect(getSites).toHaveBeenCalled());
    const requestedZooms = getSites.mock.calls.map((call) => (call[0] as { zoom: number }).zoom);
    expect(requestedZooms).toContain(12);
    expect(requestedZooms).not.toContain(15);
  });

  it("au zoom 10 ne charge ni n'affiche aucun site (trajet GPS lisible)", async () => {
    getSites.mockClear();
    fakeMapState.zoom = 10;
    window.localStorage.setItem(
      "bc4.map.sitesLayer.v4",
      JSON.stringify({
        enabled: true,
        cellsEnabled: true,
        filters: { technos: [], bands: [], operators: [] },
      }),
    );
    render(<SignalingMap capture={capture} selectedEventId={null} onSelectEvent={() => {}} />);
    await screen.findByRole("button", { name: "Site and cell layers" });
    await new Promise((r) => setTimeout(r, 150));
    expect(getSites).not.toHaveBeenCalled();
  });
});
