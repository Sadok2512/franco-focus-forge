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
/** 1.106.4 — Agrégats serveur + sites regroupés côté client (lisibles). */
const AGG_SOURCE_ID = "bc4-sites-agg";
const LAYER_AGG_ID = "bc4-sites-agg";
const LAYER_AGG_COUNT_ID = "bc4-sites-agg-count";
const LAYER_CLUSTER_ID = "bc4-sites-cluster";
const LAYER_CLUSTER_COUNT_ID = "bc4-sites-cluster-count";
const LAYER_SITE_ID = "bc4-sites-site";
const LAYER_CELL_ID = "bc4-sites-cell";
const LAYER_CELL_SECTOR_ID = "bc4-sites-cell-sector";
const ALL_LAYERS = [
  LAYER_AGG_COUNT_ID,
  LAYER_AGG_ID,
  LAYER_CLUSTER_COUNT_ID,
  LAYER_CLUSTER_ID,
  LAYER_SITE_ID,
  LAYER_CELL_ID,
  LAYER_CELL_SECTOR_ID,
];

/** Glyphes nécessaires aux compteurs de clusters (couches symbol). */
export const MAP_GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const COUNT_FONT = ["Open Sans Semibold"];
const SITE_BUBBLE_COLOR = "#334155";
const SITE_BUBBLE_RADIUS = ["step", ["get", "n_sites"], 11, 10, 14, 50, 17, 200, 21, 1000, 26];

const OPERATOR_COLORS: Record<string, string> = {
  ORF: "#FF7900",
  BYT: "#009FE3",
  SFR: "#E2001A",
  FRM: "#7C8794",
};
/** 1.106.5 — le back nomme les opérateurs en clair (« Bouygues ») alors que la
 *  légende, les filtres et les couleurs parlent en codes (BYT). Une seule clé
 *  canonique pour les deux orthographes : sans elle Bouygues tombait dans le
 *  gris « inconnu » et se confondait avec les sites non identifiés. */
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
/** Compteurs par opérateur, sommés dans les bulbes (clusterProperties). */
const OP_FIELD_BY_KEY: Record<string, string> = {
  ORF: "n_orf",
  BYT: "n_byt",
  SFR: "n_sfr",
  FRM: "n_frm",
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
      for (const id of ALL_LAYERS) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      if (map.getSource(AGG_SOURCE_ID)) map.removeSource(AGG_SOURCE_ID);
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
      // Agrégats serveur (kind=cluster) et sites (kind=site) dans une source
      // regroupée côté client : la grille serveur, dense à zoom moyen, se
      // fond en quelques bulles lisibles avec le nombre de sites.
      if (!map.getSource(AGG_SOURCE_ID)) {
        map.addSource(AGG_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 60,
          clusterMaxZoom: 14,
          clusterProperties: {
            n_sites: ["+", ["coalesce", ["get", "n_sites"], 1]],
            n_orf: ["+", ["coalesce", ["get", "n_orf"], 0]],
            n_byt: ["+", ["coalesce", ["get", "n_byt"], 0]],
            n_sfr: ["+", ["coalesce", ["get", "n_sfr"], 0]],
            n_frm: ["+", ["coalesce", ["get", "n_frm"], 0]],
          },
        });
      }
      const bubblePaint = {
        "circle-radius": SITE_BUBBLE_RADIUS,
        "circle-color": SITE_BUBBLE_COLOR,
        "circle-opacity": 0.82,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      } as never;
      const countLayout = {
        "text-field": ["to-string", ["get", "n_sites"]],
        "text-font": COUNT_FONT,
        "text-size": 11,
        "text-allow-overlap": true,
      } as never;
      if (!map.getLayer(LAYER_AGG_ID))
        map.addLayer({
          id: LAYER_AGG_ID,
          type: "circle",
          source: AGG_SOURCE_ID,
          filter: ["has", "point_count"],
          paint: bubblePaint,
        });
      if (!map.getLayer(LAYER_AGG_COUNT_ID))
        map.addLayer({
          id: LAYER_AGG_COUNT_ID,
          type: "symbol",
          source: AGG_SOURCE_ID,
          filter: ["has", "point_count"],
          layout: countLayout,
          paint: { "text-color": "#ffffff" },
        });
      if (!map.getLayer(LAYER_CLUSTER_ID))
        map.addLayer({
          id: LAYER_CLUSTER_ID,
          type: "circle",
          source: AGG_SOURCE_ID,
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "kind"], "cluster"]],
          paint: bubblePaint,
        });
      if (!map.getLayer(LAYER_CLUSTER_COUNT_ID))
        map.addLayer({
          id: LAYER_CLUSTER_COUNT_ID,
          type: "symbol",
          source: AGG_SOURCE_ID,
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "kind"], "cluster"]],
          layout: countLayout,
          paint: { "text-color": "#ffffff" },
        });
      if (!map.getLayer(LAYER_SITE_ID))
        map.addLayer({
          id: LAYER_SITE_ID,
          type: "circle",
          source: AGG_SOURCE_ID,
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "kind"], "site"]],
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "match", ["get", "op_key"],
              "ORF", OP_ORF ?? "#FF7900",
              "BYT", OP_BYT ?? "#009FE3",
              "SFR", OP_SFR ?? "#E2001A",
              "FRM", OP_FRM ?? "#7C8794",
              "#64748b",
            ],
            "circle-opacity": 0.95,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
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
            `<br/>4G ${p["n_4g"] ?? 0} · 5G ${p["n_5g"] ?? 0}`;
          // Répartition par opérateur dès qu'au moins un site est identifié.
          const byOp = (["ORF", "BYT", "SFR", "FRM"] as const)
            .map((k) => {
              const field = OP_FIELD_BY_KEY[k] ?? "";
              return [OPERATOR_LABELS[k] ?? k, Number(p[field] ?? 0)] as const;
            })
            .filter(([, n]) => n > 0);
          if (byOp.length)
            node.innerHTML += `<br/>` + byOp.map(([label, n]) => `${label} ${n}`).join(" · ");
          node.innerHTML += `<br/><em>Zoom in to see each site</em>`;
        } else if (kind === "site") {
          const bands = Array.isArray(p["bands"]) ? (p["bands"] as string[]).join(", ") : "";
          node.innerHTML =
            `<b>${p["site_name"] ?? p["site_id"] ?? "site"}</b> · ${operatorLabel(p["operator"])}` +
            `<br/>${p["n_cells"] ?? 0} cells (${p["n_4g"] ?? 0}×4G · ${p["n_5g"] ?? 0}×5G)` +
            (bands ? `<br/>Bands: ${bands}` : "");
        } else {
          node.innerHTML =
            `<b>${p["techno"] ?? ""} ${p["band"] ?? ""}</b> · ${p["operator"] ? operatorLabel(p["operator"]) : ""}` +
            `<br/>Site: ${p["site_name"] ?? p["site_id"] ?? ""}` +
            `<br/>PCI ${p["pci"] ?? "?"} · az ${p["azimuth"] ?? "?"}° · tilt ${p["tilt"] ?? "?"}°`;
        }
        popupRef.current = new Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setDOMContent(node)
          .addTo(map);
      };
      const zoomInto = async (e: MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const center = (feat.geometry as unknown as { coordinates: [number, number] }).coordinates;
        const clusterId = feat.properties?.["cluster_id"];
        let target = map.getZoom() + 2;
        if (clusterId != null) {
          const src = map.getSource(AGG_SOURCE_ID) as GeoJSONSource | undefined;
          try {
            if (src) target = Math.max(target - 1, await src.getClusterExpansionZoom(Number(clusterId)));
          } catch {
            /* zoom par défaut */
          }
        }
        map.easeTo({ center, zoom: Math.min(target, 16) });
      };
      const handlers = {
        [LAYER_AGG_ID]: (e: MapLayerMouseEvent) => void zoomInto(e),
        [LAYER_CLUSTER_ID]: (e: MapLayerMouseEvent) => void zoomInto(e),
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
      const key = operatorKey(p["operator"]);
      const base = {
        ...f,
        properties: {
          ...p,
          op_key: key ?? "",
          n_orf: key === "ORF" ? 1 : 0,
          n_byt: key === "BYT" ? 1 : 0,
          n_sfr: key === "SFR" ? 1 : 0,
          n_frm: key === "FRM" ? 1 : 0,
        },
      };
      const q = base.properties;
      if (q["kind"] !== "cell" || typeof q["azimuth"] !== "number") return base;
      return { ...base, properties: { ...q, sector_poly: true } };
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
    const isAgg = (f: { properties?: Record<string, unknown> | null }) =>
      f.properties?.["kind"] === "cluster" || f.properties?.["kind"] === "site";
    src.setData({
      type: "FeatureCollection",
      features: [...features.filter((f) => !isAgg(f)), ...sectorFeatures],
    });
    (map.getSource(AGG_SOURCE_ID) as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: features.filter(isAgg),
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
