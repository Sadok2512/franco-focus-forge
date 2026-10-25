import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MlMap,
  MapLayerMouseEvent,
  Popup as MlPopup,
} from "maplibre-gl";
import { getSites, type SitesResponse } from "@/lib/api/sites";
import {
  getGeorefBandColor,
  getGeorefBeamRadiusMeters,
  getGeorefSectorCoords,
} from "./georef-cell-geometry";

const SITE_SOURCE_ID = "bc4-sites";
const CELL_SOURCE_ID = "bc4-cells";
const SITE_LAYER_ID = "bc4-sites-site";
const CELL_POINT_LAYER_ID = "bc4-sites-cell";
const CELL_BEAM_LAYER_ID = "bc4-sites-cell-sector";
const CELL_BEAM_OUTLINE_LAYER_ID = "bc4-sites-cell-sector-outline";
export const MAP_MIN_ZOOM = 11;
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
) {
  const [status, setStatus] = useState<SitesLayerStatus>({
    loading: false,
    error: null,
    sites: null,
    cells: null,
    zoom: MAP_MIN_ZOOM,
  });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<MlPopup | null>(null);
  const hoverPopupRef = useRef<MlPopup | null>(null);

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
    const siteRequest = sitesEnabled
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
        map.addSource(SITE_SOURCE_ID, { type: "geojson", data: emptyCollection() });
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

    let selectedSiteId: string | number | undefined;
    let hoveredSiteId: string | number | undefined;
    const openPopup = async (event: MapLayerMouseEvent, kind: "site" | "cell") => {
      const feature = event.features?.[0];
      if (!feature) return;
      const properties = feature.properties ?? {};
      if (kind === "site") {
        if (selectedSiteId != null)
          map.setFeatureState({ source: SITE_SOURCE_ID, id: selectedSiteId }, { selected: false });
        selectedSiteId = feature.id as string | number | undefined;
        if (selectedSiteId != null)
          map.setFeatureState({ source: SITE_SOURCE_ID, id: selectedSiteId }, { selected: true });
      }
      const { Popup } = await import("maplibre-gl");
      popupRef.current?.remove();
      const node = document.createElement("div");
      node.className = "space-y-0.5 text-[11px]";
      const tech = [
        Number(properties["n_4g"]) > 0 || Number(properties["n_lte"]) > 0 ? "LTE" : null,
        Number(properties["n_5g"]) > 0 ? "NR" : null,
      ]
        .filter(Boolean)
        .join(" + ");
      const rows =
        kind === "site"
          ? [
              popupRow(labels.siteName, properties["site_name"]),
              popupRow(labels.siteId, properties["site_id"]),
              popupRow(labels.technology, tech),
              popupRow(labels.cells, properties["n_cells"]),
            ]
          : [
              popupRow(labels.siteName, properties["site_name"] ?? properties["site_id"]),
              popupRow(labels.technology, properties["techno"]),
              popupRow(labels.band, properties["band"]),
              popupRow(labels.pci, properties["pci"]),
              popupRow(
                labels.azimuth,
                properties["azimuth"] == null ? null : `${properties["azimuth"]}°`,
              ),
            ];
      rows.forEach((row) => row && node.append(row));
      popupRef.current = new Popup({ closeButton: true })
        .setLngLat(event.lngLat)
        .setDOMContent(node)
        .addTo(map);
    };

    const siteClick = (event: MapLayerMouseEvent) => void openPopup(event, "site");
    const cellClick = (event: MapLayerMouseEvent) => void openPopup(event, "cell");
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
    if (map.isStyleLoaded()) addSourcesAndLayers();
    else map.once("styledata", addSourcesAndLayers);
    map.on("click", SITE_LAYER_ID, siteClick);
    map.on("click", CELL_POINT_LAYER_ID, cellClick);
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
      map.off("click", SITE_LAYER_ID, siteClick);
      map.off("click", CELL_POINT_LAYER_ID, cellClick);
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
    if (!sitesEnabled || !status.sites) return void source.setData(emptyCollection());
    source.setData({
      type: "FeatureCollection",
      features: status.sites.features
        .filter((feature) => feature.properties["kind"] !== "cluster")
        .map((feature, index) => ({
          ...feature,
          id: String(feature.properties["site_id"] ?? index),
          properties: {
            ...feature.properties,
            op_key: operatorKey(feature.properties["operator"]) ?? "",
          },
        })),
    });
  }, [map, sitesEnabled, status.sites]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource(CELL_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    if (!cellsEnabled || status.zoom < CELLS_VISIBLE_ZOOM || !status.cells)
      return void source.setData(emptyCollection());
    const radius = getGeorefBeamRadiusMeters(status.zoom);
    const cellFeatures = status.cells.features.map((feature) => {
      const bandColor = getGeorefBandColor(
        feature.properties["band"],
        feature.properties["techno"],
      );
      return {
        ...feature,
        properties: { ...feature.properties, band_color: bandColor, render_kind: "cell" },
      };
    });
    const beams = status.cells.features.flatMap((feature) => {
      const azimuth = Number(feature.properties["azimuth"]);
      if (!Number.isFinite(azimuth)) return [];
      const coordinates = getGeorefSectorCoords(feature.geometry.coordinates, azimuth, radius);
      if (!coordinates.length) return [];
      const bandColor = getGeorefBandColor(
        feature.properties["band"],
        feature.properties["techno"],
      );
      return [
        {
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: [coordinates] },
          properties: { ...feature.properties, band_color: bandColor, render_kind: "beam" },
        },
      ];
    });
    source.setData({ type: "FeatureCollection", features: [...beams, ...cellFeatures] });
  }, [map, cellsEnabled, status.cells, status.zoom]);

  return status;
}
