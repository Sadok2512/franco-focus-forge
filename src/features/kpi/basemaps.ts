/** Keyless basemaps for the shared network map. Switching only changes the
 * visibility/paint of the bottom raster layers, so RF overlays, zoom, centre,
 * filters and selection are never reset (no setStyle). */
import type { Map as MlMap, LayerSpecification, SourceSpecification } from "maplibre-gl";

export const BASEMAPS = ["light", "dark", "street", "satellite"] as const;
export type BasemapId = (typeof BASEMAPS)[number];
export const DEFAULT_BASEMAP: BasemapId = "street";
const STORAGE_KEY = "bc4.map.basemap.v1";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
export const BASEMAP_EXTRA_SOURCES: Record<string, SourceSpecification> = {
  "esri-imagery": {
    type: "raster",
    tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  },
  "esri-labels": {
    type: "raster",
    tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
    tileSize: 256,
    maxzoom: 19,
  },
};

export function basemapStyleParts(): { layers: LayerSpecification[] } {
  return {
    layers: [
      { id: "osm", type: "raster", source: "osm" },
      { id: "basemap-sat", type: "raster", source: "esri-imagery", layout: { visibility: "none" } },
      { id: "basemap-sat-labels", type: "raster", source: "esri-labels", layout: { visibility: "none" } },
    ],
  };
}

/** OSM paint per basemap: Light = desaturated/brightened, Dark = inverted grey. */
export const OSM_PAINT: Record<"light" | "dark" | "street", Record<string, number>> = {
  street: { "raster-saturation": 0, "raster-brightness-min": 0, "raster-brightness-max": 1, "raster-contrast": 0 },
  light: { "raster-saturation": -0.85, "raster-brightness-min": 0.25, "raster-brightness-max": 1, "raster-contrast": -0.15 },
  dark: { "raster-saturation": -1, "raster-brightness-min": 0.92, "raster-brightness-max": 0.08, "raster-contrast": 0.1 },
};

export function applyBasemap(map: MlMap, id: BasemapId) {
  const set = (layer: string, on: boolean) => map.getLayer(layer) && map.setLayoutProperty(layer, "visibility", on ? "visible" : "none");
  const sat = id === "satellite";
  set("osm", !sat);
  set("basemap-sat", sat);
  set("basemap-sat-labels", sat);
  if (!sat && map.getLayer("osm"))
    Object.entries(OSM_PAINT[id]).forEach(([k, v]) => map.setPaintProperty("osm", k as "raster-saturation", v));
  map.getContainer?.()?.setAttribute("data-basemap", id);
}

export function readBasemap(): BasemapId {
  if (typeof window === "undefined") return DEFAULT_BASEMAP;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return (BASEMAPS as readonly string[]).includes(v ?? "") ? (v as BasemapId) : DEFAULT_BASEMAP;
}

export function writeBasemap(id: BasemapId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Real tile used as preview thumbnail (Paris, z12). */
export const BASEMAP_PREVIEW: Record<BasemapId, { src: string; filter?: string }> = {
  street: { src: "https://tile.openstreetmap.org/12/2074/1409.png" },
  light: { src: "https://tile.openstreetmap.org/12/2074/1409.png", filter: "grayscale(0.85) brightness(1.15) contrast(0.85)" },
  dark: { src: "https://tile.openstreetmap.org/12/2074/1409.png", filter: "grayscale(1) invert(0.92) contrast(1.1)" },
  satellite: { src: `${ESRI}/World_Imagery/MapServer/tile/12/1409/2074` },
};
