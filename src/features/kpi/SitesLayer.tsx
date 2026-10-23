/** 2.0.0 — Site layer MapLibre lazy par bbox.
 *
 * Monte 2 sources GeoJSON (sites + cells) sur une carte MapLibre existante
 * et les repopule à chaque `moveend` debouncé (300ms) via `GET /sites?bbox=...`.
 *
 * Trois niveaux de rendu, selon `aggregation` du back :
 *   - `cluster` (zoom < 12) → circle marker gradué par n_cells, légende count.
 *   - `site`    (zoom 12-14) → circle marker par site, couleur = operator.
 *   - `cell`    (zoom ≥ 15) → sector beam SVG orienté par azimuth (SA3).
 *
 * Jamais tout d'un coup. Si `reason="truncated_at_limit_…"`, un badge
 * « Zoom in to see N sites » apparaît en overlay.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, Popup as MlPopup } from "maplibre-gl";
import { getSites, type SitesResponse } from "@/lib/api/sites";

const SOURCE_ID = "bc4-sites";
const LAYER_CLUSTER_ID = "bc4-sites-cluster";
const LAYER_SITE_ID = "bc4-sites-site";
const LAYER_CELL_ID = "bc4-sites-cell";
const LAYER_CELL_SECTOR_ID = "bc4-sites-cell-sector";

const OPERATOR_COLORS: Record<string, string> = {
  ORF: "#FF7900",
  BYT: "#009FE3",
  SFR: "#E2001A",
  FRM: "#7C8794",
};
const OP_ORF = OPERATOR_COLORS["ORF"];
const OP_BYT = OPERATOR_COLORS["BYT"];
const OP_SFR = OPERATOR_COLORS["SFR"];
const OP_FRM = OPERATOR_COLORS["FRM"];

export type SitesLayerFilters = {
  technos: string[]; // [] = all
  bands: string[];
  operators: string[];
};

export function useSitesLayer(
  map: MlMap | null,
  enabled: boolean,
  filters: SitesLayerFilters,
) {
  const [status, setStatus] = useState<{
    loading: boolean;
    error: string | null;
    data: SitesResponse | null;
  }>({ loading: false, error: null, data: null });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<MlPopup | null>(null);

  const fetchForCurrentBbox = useCallback(() => {
    if (!map || !enabled) return;
    const b = map.getBounds();
    const zoom = map.getZoom();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const bbox: [number, number, number, number] = [sw.lng, sw.lat, ne.lng, ne.lat];
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus((s) => ({ ...s, loading: true, error: null }));
    getSites(
      {
        bbox,
        zoom,
        ...(filters.technos.length ? { technos: filters.technos } : {}),
        ...(filters.bands.length ? { bands: filters.bands } : {}),
        ...(filters.operators.length ? { operators: filters.operators } : {}),
      },
      ac.signal,
    )
      .then((data) => {
        if (ac.signal.aborted) return;
        setStatus({ loading: false, error: null, data });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setStatus({ loading: false, error: msg, data: null });
      });
  }, [map, enabled, filters.technos, filters.bands, filters.operators]);

  useEffect(() => {
    if (!map) return;
    if (!enabled) {
      // Désactiver : vider les sources, retirer les layers.
      for (const id of [LAYER_CLUSTER_ID, LAYER_SITE_ID, LAYER_CELL_ID, LAYER_CELL_SECTOR_ID]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      setStatus({ loading: false, error: null, data: null });
      return;
    }
    const addSourcesAndLayers = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      // 1 layer par niveau d'agrégation, filtered on properties.kind.
      if (!map.getLayer(LAYER_CLUSTER_ID))
        map.addLayer({
          id: LAYER_CLUSTER_ID,
          type: "circle",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "cluster"],
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["get", "n_sites"],
              1, 6,
              100, 18,
              1000, 32,
            ],
            "circle-color": "#2563eb",
            "circle-opacity": 0.72,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });
      if (!map.getLayer(LAYER_SITE_ID))
        map.addLayer({
          id: LAYER_SITE_ID,
          type: "circle",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "site"],
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["get", "n_cells"],
              1, 4,
              48, 10,
            ],
            "circle-color": [
              "match", ["get", "operator"],
              "ORF", OP_ORF ?? "#FF7900",
              "BYT", OP_BYT ?? "#009FE3",
              "SFR", OP_SFR ?? "#E2001A",
              "FRM", OP_FRM ?? "#7C8794",
              "#64748b",
            ],
            "circle-opacity": 0.85,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        });
      if (!map.getLayer(LAYER_CELL_SECTOR_ID))
        map.addLayer({
          id: LAYER_CELL_SECTOR_ID,
          type: "fill",
          source: SOURCE_ID,
          filter: ["all", ["==", ["get", "kind"], "cell"], ["has", "sector_poly"]],
          paint: {
            "fill-color": ["get", "band_color"],
            "fill-opacity": 0.45,
            "fill-outline-color": "#ffffff",
          },
        });
      if (!map.getLayer(LAYER_CELL_ID))
        map.addLayer({
          id: LAYER_CELL_ID,
          type: "circle",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "cell"],
          paint: {
            "circle-radius": 3,
            "circle-color": ["get", "band_color"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        });
      // Popup au click (clustered features → zoom in ; site/cell → infos).
      const openPopup = async (
        e: MapLayerMouseEvent,
        kind: "cluster" | "site" | "cell",
      ) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const { Popup } = await import("maplibre-gl");
        popupRef.current?.remove();
        const p = feat.properties ?? {};
        const node = document.createElement("div");
        node.style.fontSize = "11px";
        node.style.maxWidth = "260px";
        if (kind === "cluster") {
          node.innerHTML =
            `<b>${p["n_sites"] ?? "?"} sites</b> · ${p["n_cells"] ?? "?"} cells` +
            `<br/>4G ${p["n_4g"] ?? 0} · 5G ${p["n_5g"] ?? 0}` +
            `<br/><em>Zoom in to see each site</em>`;
        } else if (kind === "site") {
          const bands = Array.isArray(p["bands"]) ? (p["bands"] as string[]).join(", ") : "";
          node.innerHTML =
            `<b>${p["site_name"] ?? p["site_id"] ?? "site"}</b> · ${p["operator"] ?? "?"}` +
            `<br/>${p["n_cells"] ?? 0} cells (${p["n_4g"] ?? 0}×4G · ${p["n_5g"] ?? 0}×5G)` +
            (bands ? `<br/>Bands: ${bands}` : "");
        } else {
          node.innerHTML =
            `<b>${p["techno"] ?? ""} ${p["band"] ?? ""}</b> · ${p["operator"] ?? ""}` +
            `<br/>Site: ${p["site_name"] ?? p["site_id"] ?? ""}` +
            `<br/>PCI ${p["pci"] ?? "?"} · az ${p["azimuth"] ?? "?"}° · tilt ${p["tilt"] ?? "?"}°`;
        }
        popupRef.current = new Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setDOMContent(node)
          .addTo(map);
      };
      const handlers = {
        [LAYER_CLUSTER_ID]: (e: MapLayerMouseEvent) => void openPopup(e, "cluster"),
        [LAYER_SITE_ID]: (e: MapLayerMouseEvent) => void openPopup(e, "site"),
        [LAYER_CELL_ID]: (e: MapLayerMouseEvent) => void openPopup(e, "cell"),
      };
      for (const [id, h] of Object.entries(handlers)) {
        map.on("click", id, h);
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      }
    };
    const onMoveEnd = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchForCurrentBbox, 300);
    };
    if (map.isStyleLoaded()) addSourcesAndLayers();
    else map.once("styledata", addSourcesAndLayers);
    map.on("moveend", onMoveEnd);
    // Fetch initial (sans attendre moveend).
    const initialFetch = () => {
      if (!map.getSource(SOURCE_ID)) {
        setTimeout(initialFetch, 100);
        return;
      }
      fetchForCurrentBbox();
    };
    initialFetch();
    return () => {
      map.off("moveend", onMoveEnd);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      popupRef.current?.remove();
    };
  }, [map, enabled, fetchForCurrentBbox]);

  // Push nouvelle data vers la source.
  useEffect(() => {
    if (!map || !status.data) return;
    const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;
    // SA3 — enrichir les features cell avec un petit polygone secteur
    // (triangle orienté par azimuth) pour le layer fill.
    const features = status.data.features.map((f) => {
      const p = f.properties ?? {};
      if (p["kind"] !== "cell" || typeof p["azimuth"] !== "number") return f;
      const az = p["azimuth"] as number;
      const coords = f.geometry.coordinates as [number, number];
      const poly = sectorPolygon(coords[0], coords[1], az, 60, 0.00045);
      return {
        ...f,
        properties: { ...p, sector_poly: true },
        // On ajoute un deuxième "feature" en polygone — mais MapLibre
        // n'accepte qu'un seul geometry par feature. On stocke le polygon
        // dans properties pour un rendu custom, OU on ajoute un feature
        // polygon séparé plus bas.
      };
    });
    // Ajoute en parallèle les polygons secteurs comme Features séparés.
    const sectorFeatures = status.data.features.flatMap((f) => {
      const p = f.properties ?? {};
      if (p["kind"] !== "cell" || typeof p["azimuth"] !== "number") return [];
      const az = p["azimuth"] as number;
      const coords = f.geometry.coordinates as [number, number];
      return [{
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [sectorPolygon(coords[0], coords[1], az, 60, 0.00045)],
        },
        properties: { ...p, sector_poly: true, kind: "cell" },
      }];
    });
    src.setData({
      type: "FeatureCollection",
      features: [...features, ...sectorFeatures],
    });
  }, [map, status.data]);

  return status;
}

/** Petit polygone en secteur (3 points : centre, az-half, az+half) à
 *  distance `radiusDeg` en degrés. Rendu grossier, suffit à zoom ≥ 15 où
 *  1 pixel ≈ 1.2 m à 48°N. */
function sectorPolygon(
  lng: number,
  lat: number,
  azimuthDeg: number,
  openingDeg: number,
  radiusDeg: number,
): Array<[number, number]> {
  const toRad = (d: number) => (d * Math.PI) / 180;
  // Nemo azimuth : 0 = Nord, croît horaire. MapLibre : lng = x, lat = y.
  const a1 = toRad(azimuthDeg - openingDeg / 2 - 90);
  const a2 = toRad(azimuthDeg + openingDeg / 2 - 90);
  // Latitude compression (cos). Rendu correct au voisinage de lat.
  const kLat = Math.cos(toRad(lat));
  const p1: [number, number] = [lng + (radiusDeg * Math.cos(a1)) / kLat, lat + radiusDeg * Math.sin(a1) * -1];
  const p2: [number, number] = [lng + (radiusDeg * Math.cos(a2)) / kLat, lat + radiusDeg * Math.sin(a2) * -1];
  return [[lng, lat], p1, p2, [lng, lat]];
}
