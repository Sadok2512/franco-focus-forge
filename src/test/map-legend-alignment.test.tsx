// Toutes les légendes de carte suivent la même structure que la légende RSRP :
// un titre en gras, une ligne par classe (case à cocher + pastille de couleur +
// nom + valeur alignée à droite en chiffres tabulaires), et un bloc de réglages
// séparé par un trait. Ce test épingle cette structure sur la référence RSRP et
// sur une légende de métrique déposée.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
import { MapMetricDropTarget } from "@/features/kpi/MapMetricDropTarget";
import { MAP_METRIC_MIME } from "@/features/kpi/map-metric-drop";
import {
  MapLegendList,
  MapLegendRow,
  MapLegendSection,
  MapLegendSettings,
} from "@/features/kpi/map-legend";

/** Rows of one legend group: `ul[aria-label] > li`, whatever the surface. */
function legendRows(host: ParentNode, label: string) {
  return [...host.querySelectorAll(`ul[aria-label="${label}"] > li`)];
}

/**
 * The RSRP row shape every legend must keep: checkbox, colour swatch, name,
 * and the value right-aligned in muted tabular figures.
 */
function expectRsrpRowStructure(row: Element, withCheckbox = true) {
  const body = row.querySelector(withCheckbox ? "label" : "span");
  expect(body).not.toBeNull();
  if (withCheckbox) expect(body!.querySelector('input[type="checkbox"]')).not.toBeNull();
  const swatch = body!.querySelector<HTMLElement>("span[style]");
  expect(swatch?.style.background).toBeTruthy();
  expect(body!.querySelector(".flex-1")).not.toBeNull();
  expect(body!.querySelector(".tabular-nums.text-muted-foreground")).not.toBeNull();
}

function mapDouble() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  return {
    sources,
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

describe("Map legends share the RSRP structure", () => {
  it("renders the reference row: bold title, checkbox, swatch, name, muted value", () => {
    const { container } = render(
      <MapLegendSection title="RSRP (LTE)">
        <MapLegendList label="RSRP legend">
          <MapLegendRow color="#15803d" label="≥ -85" meta="1 234" checked onToggle={() => {}} />
          <MapLegendRow swatch="line" color="#2563eb" label="Serving cell" meta="12" />
        </MapLegendList>
        <MapLegendSettings title="Colour settings">
          <span>2 to 8 colours</span>
        </MapLegendSettings>
      </MapLegendSection>,
    );

    expect(container.querySelector(".font-semibold")?.textContent).toBe("RSRP (LTE)");
    const rows = legendRows(container, "RSRP legend");
    expect(rows).toHaveLength(2);
    expectRsrpRowStructure(rows[0]!);
    // A row without a toggle is a plain reading of its swatch, same layout.
    expectRsrpRowStructure(rows[1]!, false);
    expect(container.querySelector("fieldset.border-t legend.font-semibold")).not.toBeNull();
  });

  it("keeps the drive RSRP legend on that structure", async () => {
    localStorage.clear();
    api.map.mockResolvedValue({
      capture_id: "c1",
      map_points: [
        { seq: 67, lat: 48.9, lng: 2.2, code: "cell_rsrp", value: -95 },
        { seq: 68, lat: 48.91, lng: 2.21, code: "cell_rsrp", value: -75 },
      ],
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const map = mapDouble();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DriveRsrpLayer
          map={map as unknown as MlMap}
          projectId="Test_3"
          activeCaptureId="c1"
          hideControls
          legendHost={host}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(host.querySelector("[data-map-drive-rsrp-legend]")).not.toBeNull());
    const rows = legendRows(host, "RSRP legend");
    expect(rows).toHaveLength(RSRP_CLASSES.length);
    for (const row of rows) expectRsrpRowStructure(row);
    // The class count stays with the row it describes.
    expect(rows[0]!.querySelector(".tabular-nums.text-muted-foreground")?.textContent).toMatch(
      /dBm/,
    );
  });

  it("keeps a dropped metric's legend on that structure and hides its classes", async () => {
    localStorage.clear();
    api.map.mockResolvedValue({
      result_id: "r1",
      map_points: [
        { code: "cell_rsrq@0", seq: 12, value: -9, lng: 2.3, lat: 48.8 },
        { code: "cell_rsrq@0", seq: 13, value: -14, lng: 2.31, lat: 48.81 },
      ],
    });
    const map = mapDouble();
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MapMetricDropTarget
          base={{ kind: "kpi", code: "LTE_DL_BLER", label: "BLER", unit: "%" }}
          map={map as unknown as MlMap}
          projectId="p1"
          captureId="cap1"
          filters={{}}
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
      getData: (type: string) =>
        type === MAP_METRIC_MIME
          ? JSON.stringify({ kind: "metric", code: "cell_rsrq@0", label: "RSRQ", unit: "dB" })
          : "",
      dropEffect: "",
    };
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(map.addLayer).toHaveBeenCalledOnce());
    const section = container.querySelector("[data-map-added-metric]");
    expect(section?.querySelector(".font-semibold")?.textContent).toBe("RSRQ · dB");
    const rows = legendRows(section!, "RSRQ");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expectRsrpRowStructure(row);

    // Unchecking a class hides exactly that class on the map.
    const firstCheckbox = rows[0]!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    fireEvent.click(firstCheckbox);
    await waitFor(() => expect(map.setFilter).toHaveBeenCalled());
    const [layerId, filter] = map.setFilter.mock.calls.at(-1)!;
    expect(layerId).toMatch(/^bc4-dropped-/);
    expect(JSON.stringify(filter)).toContain("cls");
    expect(JSON.stringify(filter)).toMatch(/"c\d+"/);
    // Re-checking the class brings its points back.
    fireEvent.click(firstCheckbox);
    await waitFor(() => expect(map.setFilter.mock.calls.at(-1)?.[1]).toBeNull());
  });
});
