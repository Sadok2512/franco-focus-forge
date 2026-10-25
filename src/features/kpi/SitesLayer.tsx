import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MlMap,
  MapLayerMouseEvent,
  MapMouseEvent,
  Popup as MlPopup,
} from "maplibre-gl";
import { getSites, type SitesResponse } from "@/lib/api/sites";
import {
  getGeorefBandColor,
  getGeorefBeamRadiusMeters,
  getGeorefSectorCoords,
  getGeorefSectorSliceCoords,
} from "./georef-cell-geometry";
import { buildCellCard, buildSiteCard, cellKey } from "./site-cell-popup";
import { beamOpacity, beamRadiusScale } from "./beam-display";

const SITE_SOURCE_ID = "bc4-sites";
const CELL_SOURCE_ID = "bc4-cells";
const SITE_LAYER_ID = "bc4-sites-site";
/** Safety cap: never push more raw site features than this into the map. */
export const MAX_SITE_FEATURES = 3000;
/** Glyphs URL required by every symbol (count label) layer. */
export const MAP_GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const CELL_POINT_LAYER_ID = "bc4-sites-cell";
const CELL_BEAM_LAYER_ID = "bc4-sites-cell-sector";
const CELL_BEAM_OUTLINE_LAYER_ID = "bc4-sites-cell-sector-outline";
const SITE_LABEL_LAYER_ID = "bc4-sites-label";
export type SitesLayerDisplay = { beams: boolean; labels: boolean; beamSize?: number; beamIntensity?: number };
export const MAP_MIN_ZOOM = 6;
export const MAP_INITIAL_ZOOM = 11;
export const CELLS_VISIBLE_ZOOM = 13;

const OPERATOR_COLORS = {
  ORF: "#FF7900",
  BYT: "#009FE3",
  SFR: "#E2001A",
  FRM: "#16A34A",
} as const;

const OPERATOR_LABELS: Record<string, string> = {
  ORF: "Orange",
  BYT: "Bouygues",
  SFR: "SFR",
  FRM: "Free",
};
const OPERATOR_ALIASES: Record<string, string> = {
  ORF: "ORF",
  ORANGE: "ORF",
  BYT: "BYT",
  BOUYGUES: "BYT",
  "BOUYGUES TELECOM": "BYT",
  SFR: "SFR",
  FRM: "FRM",
  FREE: "FRM",
};

export function operatorKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return OPERATOR_ALIASES[value.trim().toUpperCase()] ?? null;
}

export function operatorLabel(value: unknown): string {
  const key = operatorKey(value);
  if (key) return OPERATOR_LABELS[key] ?? key;
  return typeof value === "string" && value.trim() ? value : "?";
}

export type SitesLayerFilters = { technos: string[]; bands: string[]; operators: string[] };
export type SitesLayerStatus = {
  loading: boolean;
  error: string | null;
  sites: SitesResponse | null;
  cells: SitesResponse | null;
  zoom: number;
};
export type SitesLayerLabels = {
  siteName: string;
  siteId: string;
  technology: string;
  cells: string;
  band: string;
  pci: string;
  azimuth: string;
};

const emptyCollection = (): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

function popupRow(label: string, value: unknown): HTMLDivElement | null {
  if (value == null || value === "") return null;
  const row = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(String(value)));
  return row;
}

export function useSitesLayer(
  map: MlMap | null,
  sitesEnabled: boolean,
  cellsEnabled: boolean,
  filters: SitesLayerFilters,
  labels: SitesLayerLabels,
  display: SitesLayerDisplay = { beams: true, labels: false },
  options: { sitesMinZoom?: number } = {},
) {
  // Embedded maps (Signaling View) can gate site points to a minimum zoom so
  // the GPS track stays readable; the Map page keeps the default 0 (every
  // zoom). Presentation only — never clustering.
  const sitesMinZoom = Math.max(0, options.sitesMinZoom ?? 0);
  const [status, setStatus] = useState<SitesLayerStatus>({
    loading: false,
    error: null,
    sites: null,
    cells: null,
    zoom: MAP_INITIAL_ZOOM,
  });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<MlPopup | null>(null);
  const hoverPopupRef = useRef<MlPopup | null>(null);
  const sitesDataRef = useRef<GeoJSON.Feature[]>([]);

  const fetchForCurrentBbox = useCallback(() => {
    if (!map || (!sitesEnabled && !cellsEnabled)) return;
    const bounds = map.getBounds();
    const zoom = Math.max(MAP_MIN_ZOOM, map.getZoom());
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const common = {
      bbox: [sw.lng, sw.lat, ne.lng, ne.lat] as [number, number, number, number],
      ...(filters.technos.length ? { technos: filters.technos } : {}),
      ...(filters.bands.length ? { bands: filters.bands } : {}),
      ...(filters.operators.length ? { operators: filters.operators } : {}),
    };
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus((current) => ({ ...current, loading: true, error: null, zoom }));
    const siteRequest =
      sitesEnabled && zoom >= sitesMinZoom
        ? getSites({ ...common, zoom: 12 }, controller.signal)
        : Promise.resolve(null);
    const cellRequest =
      cellsEnabled && zoom >= CELLS_VISIBLE_ZOOM
        ? getSites({ ...common, zoom: 15 }, controller.signal)
        : Promise.resolve(null);
    Promise.allSettled([siteRequest, cellRequest])
      .then(([siteResult, cellResult]) => {
        if (controller.signal.aborted) return;
        const errors = [siteResult, cellResult]
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) =>
            result.reason instanceof Error ? result.reason.message : String(result.reason),
          );
        setStatus((current) => ({
          loading: false,
          error: errors.length ? errors.join(" · ") : null,
          sites: siteResult.status === "fulfilled" ? siteResult.value : current.sites,
          cells: cellResult.status === "fulfilled" ? cellResult.value : current.cells,
          zoom,
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          zoom,
        }));
      });
  }, [map, sitesEnabled, cellsEnabled, filters.technos, filters.bands, filters.operators]);

  useEffect(() => {
    if (!map) return;
    const addSourcesAndLayers = () => {
      if (!map.getSource(SITE_SOURCE_ID))
        map.addSource(SITE_SOURCE_ID, {
          type: "geojson",
          data: emptyCollection(),
        });
      if (!map.getSource(CELL_SOURCE_ID))
        map.addSource(CELL_SOURCE_ID, { type: "geojson", data: emptyCollection() });
      if (!map.getLayer(CELL_BEAM_LAYER_ID)) {
        map.addLayer({
          id: CELL_BEAM_LAYER_ID,
          type: "fill",
          source: CELL_SOURCE_ID,
          minzoom: CELLS_VISIBLE_ZOOM,
          filter: ["==", ["get", "render_kind"], "beam"],
          paint: {
            "fill-color": ["coalesce", ["get", "band_color"], "#64748b"],
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.22, 15, 0.28],
          },
        });
      }
      if (!map.getLayer(CELL_BEAM_OUTLINE_LAYER_ID)) {
        map.addLayer({
          id: CELL_BEAM_OUTLINE_LAYER_ID,
          type: "line",
          source: CELL_SOURCE_ID,
          minzoom: CELLS_VISIBLE_ZOOM,
          filter: ["==", ["get", "render_kind"], "beam"],
          paint: {
            "line-color": ["coalesce", ["get", "band_color"], "#64748b"],
            "line-opacity": 0.58,
            "line-width": 0.85,
          },
        });
      }
      if (!map.getLayer(SITE_LAYER_ID)) {
        map.addLayer({
          id: SITE_LAYER_ID,
          type: "circle",
          source: SITE_SOURCE_ID,
          paint: {
            "circle-radius": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              6.5,
              ["boolean", ["feature-state", "hovered"], false],
              5.5,
              4.5,
            ],
            "circle-color": [
              "match",
              ["get", "op_key"],
              "ORF",
              OPERATOR_COLORS.ORF,
              "BYT",
              OPERATOR_COLORS.BYT,
              "SFR",
              OPERATOR_COLORS.SFR,
              "FRM",
              OPERATOR_COLORS.FRM,
              "#64748b",
            ],
            "circle-opacity": 1,
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#1D4ED8",
              "#ffffff",
            ],
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              2.5,
              1.5,
            ],
          },
        });
      }
      if (!map.getLayer(CELL_POINT_LAYER_ID)) {
        map.addLayer({
          id: CELL_POINT_LAYER_ID,
          type: "circle",
          source: CELL_SOURCE_ID,
          minzoom: CELLS_VISIBLE_ZOOM,
          filter: ["==", ["get", "render_kind"], "cell"],
          paint: {
            "circle-radius": 2.5,
            "circle-color": ["coalesce", ["get", "band_color"], "#64748b"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 0.75,
          },
        });
      }
    };

    const addLabels = () => {
      if (map.getLayer(SITE_LABEL_LAYER_ID) || !map.getStyle?.()?.glyphs) return;
      map.addLayer({
        id: SITE_LABEL_LAYER_ID,
        type: "symbol",
        source: SITE_SOURCE_ID,
        minzoom: 12,
        layout: {
          "text-field": ["coalesce", ["get", "site_name"], ["get", "site_id"], ""],
          "text-font": ["Open Sans Semibold"],
          "text-size": 10,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": "#0f172a", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
      });
    };
    const addAll = () => {
      addSourcesAndLayers();
      addLabels();
    };
    let selectedSiteId: string | number | undefined;
    let hoveredSiteId: string | number | undefined;
    const SELECTED_CELL_LAYER_ID = "bc4-sites-cell-selected";
    const selectCell = (key: string) => {
      if (!map.getLayer(SELECTED_CELL_LAYER_ID) && map.getSource(CELL_SOURCE_ID))
        map.addLayer({
          id: SELECTED_CELL_LAYER_ID,
          type: "line",
          source: CELL_SOURCE_ID,
          filter: ["==", ["get", "cell_key"], ""],
          paint: { "line-color": "#1D4ED8", "line-width": 3 },
        });
      map.setFilter?.(SELECTED_CELL_LAYER_ID, [
        "all",
        ["==", ["get", "render_kind"], "beam"],
        ["==", ["get", "cell_key"], key],
      ]);
    };
    const clearSelection = () => {
      if (selectedSiteId != null)
        map.setFeatureState({ source: SITE_SOURCE_ID, id: selectedSiteId }, { selected: false });
      selectedSiteId = undefined;
      if (map.getLayer(SELECTED_CELL_LAYER_ID)) selectCell("");
    };
    // One popup at a time, anchored on the clicked marker / sector.
    const showPopup = async (lngLat: [number, number], node: HTMLElement) => {
      const { Popup } = await import("maplibre-gl");
      popupRef.current?.remove();
      hoverPopupRef.current?.remove();
      const popup = new Popup({ closeButton: true, maxWidth: "340px", className: "bc4-net-popup", offset: 10 })
        .setLngLat(lngLat)
        .setDOMContent(node)
        .addTo(map);
      popup.on?.("close", () => {
        if (popupRef.current === popup) clearSelection();
      });
      popupRef.current = popup;
    };
    const openCell = (cell: Record<string, unknown>, at: [number, number]) => {
      clearSelection();
      selectCell(cellKey(cell));
      const siteId = cell["site_id"];
      const site = siteId == null ? null : siteFeatures().find((f) => f.properties?.["site_id"] === siteId);
      void showPopup(
        at,
        buildCellCard(cell, operatorLabel(cell["operator"] ?? site?.properties?.["operator"]), site
          ? () => openSite(site.properties ?? {}, (site.geometry as GeoJSON.Point).coordinates as [number, number])
          : null),
      );
    };
    const siteFeatures = () => sitesDataRef.current;
    const openSite = (properties: Record<string, unknown>, at: [number, number], featureId?: string | number) => {
      clearSelection();
      selectedSiteId = featureId ?? (properties["site_id"] as string | undefined);
      if (selectedSiteId != null)
        map.setFeatureState({ source: SITE_SOURCE_ID, id: selectedSiteId }, { selected: true });
      const op = operatorLabel(properties["operator"]);
      const render = (cells: Array<Record<string, unknown>> | "loading" | "error") =>
        void showPopup(at, buildSiteCard(properties, at, op, cells, (c) => openCell(c, at)));
      render("loading");
      const d = 0.004;
      getSites({ bbox: [at[0] - d, at[1] - d, at[0] + d, at[1] + d], zoom: 15 })
        .then((r) => {
          const cells = r.features
            .filter((f) => f.properties["site_id"] === properties["site_id"])
            .map((f) => f.properties);
          if (popupRef.current?.getLngLat?.().lng === at[0]) render(cells);
        })
        .catch(() => render("error"));
    };
    // Priority: site marker > cell point > beam. Signaling markers keep their own click.
    const mapClick = (event: MapMouseEvent) => {
      const layers = [SITE_LAYER_ID, CELL_POINT_LAYER_ID, CELL_BEAM_LAYER_ID].filter((id) => map.getLayer(id));
      const own = map.getStyle?.()?.layers?.filter((l) => l.id.startsWith("signaling")).map((l) => l.id) ?? [];
      if (own.length && map.queryRenderedFeatures(event.point, { layers: own }).length) return;
      const hits = layers.length ? map.queryRenderedFeatures(event.point, { layers }) : [];
      const site = hits.find((f) => f.layer.id === SITE_LAYER_ID);
      const cell = hits.find((f) => f.layer.id === CELL_POINT_LAYER_ID) ?? hits.find((f) => f.layer.id === CELL_BEAM_LAYER_ID);
      if (site) {
        const at = (site.geometry as GeoJSON.Point).coordinates as [number, number];
        openSite(site.properties ?? {}, at, site.id);
      } else if (cell) {
        const props = cell.properties ?? {};
        const at: [number, number] =
          cell.geometry.type === "Point" ? ((cell.geometry as GeoJSON.Point).coordinates as [number, number]) : [event.lngLat.lng, event.lngLat.lat];
        openCell(props, at);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && popupRef.current) popupRef.current.remove();
    };
    window.addEventListener("keydown", onKey);
    const siteEnter = async (event: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features?.[0];
      if (!feature) return;
      hoveredSiteId = feature.id as string | number | undefined;
      if (hoveredSiteId != null) {
        map.setFeatureState({ source: SITE_SOURCE_ID, id: hoveredSiteId }, { hovered: true });
      }
      const properties = feature.properties ?? {};
      const { Popup } = await import("maplibre-gl");
      const node = document.createElement("div");
      node.className = "space-y-0.5 text-[11px]";
      [
        popupRow(labels.siteName, properties["site_name"]),
        popupRow(labels.siteId, properties["site_id"]),
        popupRow(labels.cells, properties["n_cells"]),
      ].forEach((row) => row && node.append(row));
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = new Popup({ closeButton: false, closeOnClick: false, offset: 8 })
        .setLngLat(event.lngLat)
        .setDOMContent(node)
        .addTo(map);
    };
    const siteLeave = () => {
      map.getCanvas().style.cursor = "";
      if (hoveredSiteId != null) {
        map.setFeatureState({ source: SITE_SOURCE_ID, id: hoveredSiteId }, { hovered: false });
      }
      hoveredSiteId = undefined;
      hoverPopupRef.current?.remove();
    };
    const pointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const defaultCursor = () => {
      map.getCanvas().style.cursor = "";
    };
    const scheduleFetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchForCurrentBbox, 250);
    };
    // A parsed style can already accept overlays while satellite tiles are
    // still loading. isStyleLoaded() also waits for those tiles; waiting for
    // a one-shot styledata event here can strand the Sites layer indefinitely.
    if (map.getStyle?.() || map.isStyleLoaded()) addAll();
    else map.once("styledata", addAll);
    map.on("click", mapClick);
    map.on("mouseenter", CELL_BEAM_LAYER_ID, pointer);
    map.on("mouseleave", CELL_BEAM_LAYER_ID, defaultCursor);
    map.on("mouseenter", SITE_LAYER_ID, siteEnter);
    map.on("mouseenter", CELL_POINT_LAYER_ID, pointer);
    map.on("mouseleave", SITE_LAYER_ID, siteLeave);
    map.on("mouseleave", CELL_POINT_LAYER_ID, defaultCursor);
    map.on("moveend", scheduleFetch);
    const initialFetch = () => {
      if (!map.getSource(SITE_SOURCE_ID)) {
        debounceRef.current = setTimeout(initialFetch, 50);
        return;
      }
      fetchForCurrentBbox();
    };
    initialFetch();
    return () => {
      map.off("click", mapClick);
      map.off("mouseenter", CELL_BEAM_LAYER_ID, pointer);
      map.off("mouseleave", CELL_BEAM_LAYER_ID, defaultCursor);
      window.removeEventListener("keydown", onKey);
      map.off("mouseenter", SITE_LAYER_ID, siteEnter);
      map.off("mouseenter", CELL_POINT_LAYER_ID, pointer);
      map.off("mouseleave", SITE_LAYER_ID, siteLeave);
      map.off("mouseleave", CELL_POINT_LAYER_ID, defaultCursor);
      map.off("moveend", scheduleFetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      popupRef.current?.remove();
      hoverPopupRef.current?.remove();
    };
  }, [map, fetchForCurrentBbox, labels]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource(SITE_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    if (!sitesEnabled || !status.sites) {
      sitesDataRef.current = [];
      return void source.setData(emptyCollection());
    }
    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: status.sites.features
        .filter((feature) => feature.properties["kind"] !== "cluster")
        .slice(0, MAX_SITE_FEATURES)
        .map((feature, index) => ({
          ...feature,
          id: String(feature.properties["site_id"] ?? index),
          properties: {
            ...feature.properties,
            op_key: operatorKey(feature.properties["operator"]) ?? "",
          },
        })),
    };
    sitesDataRef.current = collection.features;
    source.setData(collection);
  }, [map, sitesEnabled, status.sites]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource(CELL_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    if (!cellsEnabled || status.zoom < CELLS_VISIBLE_ZOOM || !status.cells)
      return void source.setData(emptyCollection());
    const radius = getGeorefBeamRadiusMeters(status.zoom) * beamRadiusScale(display.beamSize);
    // Multi-band cells: features sharing one physical sector (same site,
    // azimuth and position) are grouped, then the sector is split into one
    // colored slice per band. A single feature carrying a `bands` array is
    // split the same way. One deduplicated cell point per sector.
    const bandsOf = (properties: Record<string, unknown>): string[] => {
      const many = properties["bands"];
      if (Array.isArray(many) && many.length) return [...new Set(many.map(String))];
      const single = properties["band"];
      return single != null && single !== "" ? [String(single)] : [];
    };
    const groups = new Map<string, typeof status.cells.features>();
    status.cells.features.forEach((feature) => {
      const azimuth = Number(feature.properties["azimuth"]);
      const [lng, lat] = feature.geometry.coordinates;
      const key = `${String(feature.properties["site_id"] ?? "")}|${Number.isFinite(azimuth) ? azimuth.toFixed(1) : ""}|${lng.toFixed(5)},${lat.toFixed(5)}`;
      const list = groups.get(key);
      if (list) list.push(feature);
      else groups.set(key, [feature]);
    });
    const cellFeatures: GeoJSON.Feature[] = [];
    const beams: GeoJSON.Feature[] = [];
    groups.forEach((features) => {
      const first = features[0];
      if (!first) return;
      const bands = [...new Set(features.flatMap((f) => bandsOf(f.properties)))];
      const primary = bands[0] ?? first.properties["band"];
      const shared = {
        ...first.properties,
        bands,
        band: primary,
        band_color: getGeorefBandColor(primary, first.properties["techno"]),
        render_kind: "cell",
        cell_key: cellKey(first.properties),
      };
      cellFeatures.push({ ...first, properties: shared });
      const azimuth = Number(first.properties["azimuth"]);
      if (!Number.isFinite(azimuth)) return;
      const sliceBands = bands.length > 1 ? bands : [primary];
      sliceBands.forEach((band, index) => {
        const coordinates =
          sliceBands.length > 1
            ? getGeorefSectorSliceCoords(first.geometry.coordinates, azimuth, radius, index, sliceBands.length)
            : getGeorefSectorCoords(first.geometry.coordinates, azimuth, radius);
        if (!coordinates.length) return;
        beams.push({
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: [coordinates] },
          properties: {
            ...shared,
            band,
            band_color: getGeorefBandColor(band, first.properties["techno"]),
            render_kind: "beam",
          },
        });
      });
    });
    source.setData({ type: "FeatureCollection", features: [...beams, ...cellFeatures] });
  }, [map, cellsEnabled, status.cells, status.zoom, display.beamSize]);

  // Beams / labels visibility toggles (Layers panel) — layout only, no refetch.
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      const set = (id: string, on: boolean) => {
        if (map.getLayer(id)) map.setLayoutProperty?.(id, "visibility", on ? "visible" : "none");
      };
      set(CELL_BEAM_LAYER_ID, display.beams);
      set(CELL_BEAM_OUTLINE_LAYER_ID, display.beams);
      set(SITE_LABEL_LAYER_ID, display.labels);
      const opacity = beamOpacity(display.beamIntensity);
      if (map.getLayer(CELL_BEAM_LAYER_ID)) map.setPaintProperty?.(CELL_BEAM_LAYER_ID, "fill-opacity", opacity);
      if (map.getLayer(CELL_BEAM_OUTLINE_LAYER_ID)) map.setPaintProperty?.(CELL_BEAM_OUTLINE_LAYER_ID, "line-opacity", opacity === 0 ? 0 : Math.min(1, opacity * 2));
    };
    apply();
    const id = setTimeout(apply, 120);
    return () => clearTimeout(id);
  }, [map, display.beams, display.labels, display.beamIntensity]);

  return status;
}
