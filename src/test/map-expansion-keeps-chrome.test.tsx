// Level one of the map fullscreen must keep the application header and the
// catalogue sidebar visible: the map grows inside the content panel instead of
// covering the whole window. This mounts the real map component inside a fake
// panel layout and drives the expand control.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";

vi.mock("@/lib/api/sites", () => ({
  getSites: vi.fn().mockResolvedValue({
    type: "FeatureCollection",
    features: [],
    n_returned: 0,
    n_total_in_bbox: 0,
    reason: null,
  }),
}));
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
    moveLayer() {}
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
        getNorthEast: () => ({ lng: 2.5, lat: 49.05 }),
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
  return { Map: FakeMap, Popup, NavigationControl: class {}, setWorkerUrl: vi.fn() };
});
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?url", () => ({ default: "worker.js" }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;

import { KpiMapOSM } from "@/features/kpi/KpiMapOSM";

const PANEL_BOX = { top: 56, left: 300, right: 1024, bottom: 768 };

function renderInPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <div data-panel="" data-testid="content-panel">
        <KpiMapOSM />
      </div>
    </QueryClientProvider>,
  );
  const panel = view.getByTestId("content-panel");
  panel.getBoundingClientRect = () =>
    ({
      ...PANEL_BOX,
      x: PANEL_BOX.left,
      y: PANEL_BOX.top,
      width: PANEL_BOX.right - PANEL_BOX.left,
      height: PANEL_BOX.bottom - PANEL_BOX.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return view;
}

describe("map expansion keeps the app chrome", () => {
  it("expands inside the content panel, leaving the sidebar area free", async () => {
    const { container } = renderInPanel();
    const button = await screen.findByRole("button", {
      name: /expand map within the app|agrandir la carte dans l/i,
    });
    fireEvent.click(button);
    const map = await waitFor(() => {
      const el = container.querySelector<HTMLElement>("[data-map-level='1']");
      if (!el) throw new Error("map not expanded");
      return el;
    });
    // The sidebar occupies 0→300px: the expanded map must start at its edge.
    expect(map.style.left).toBe("300px");
    expect(map.style.top).toBe("56px");
    expect(map.style.right).toBe("0px");
    expect(map.style.bottom).toBe("0px");
    expect(document.fullscreenElement ?? null).toBeNull();
  });
});
