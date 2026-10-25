import { useTranslation } from "react-i18next";
// -----------------------------------------------------------------------
// 1.20.4 — Carte OSM sur /kpi via MapLibre (dépendance déjà présente,
// cf. RadioMap). Pas de fake coords : la carte base OSM est affichée
// interactive (zoom, pan, OSM attribution) ; les points KPI apparaissent
// uniquement si le back expose lat/lng pour les observations du KPI
// sélectionné (contract /kpi/{code}.points — non câblé en 0.47.x).
//
// Centre par défaut : centroid approximatif FR métropolitaine. Si le
// projet a un `center` validé, utiliser `project.center` à la place.
// -----------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { Map as MapIcon, Maximize2, Minimize2, Search, LocateFixed, Layers } from "lucide-react";
import { CELLS_VISIBLE_ZOOM, MAP_INITIAL_ZOOM, MAP_MIN_ZOOM, useSitesLayer } from "./SitesLayer";
import {
  SitesLayerControls,
  SitesMapWorkspaceControls,
  useSitesLayerState,
} from "./SitesLayerControls";

// 1.21.0 — Couleurs de marque opérateurs (identiques à KPI/Chart).
const OPERATOR_COLORS: Array<{ op: string; hex: string }> = [
  { op: "Orange", hex: "#FF7900" },
  { op: "SFR", hex: "#E2001A" },
  { op: "Bouygues", hex: "#009FE3" },
  { op: "Free", hex: "#7C8794" },
];

/** Harness interne : relie `useSitesLayer` au contrôle UI persistant.
 *  Doit être enfant de KpiMapOSM pour avoir accès au Map instance. */
function SitesLayerHarness({ map, workspace = false }: { map: MlMap | null; workspace?: boolean }) {
  const { t } = useTranslation();
  const {
    enabled,
    cellsEnabled,
    filters,
    setEnabled,
    setCellsEnabled,
    toggleTechno,
    toggleBand,
    toggleOperator,
    reset,
  } = useSitesLayerState();
  const labels = useMemo(
    () => ({
      siteName: t("mapSites.siteName"),
      siteId: t("mapSites.siteId"),
      technology: t("mapSites.technology"),
      cells: t("mapSites.cellCount"),
      band: t("mapSites.band"),
      pci: t("mapSites.pci"),
      azimuth: t("mapSites.azimuth"),
    }),
    [t],
  );
  const status = useSitesLayer(map, enabled, cellsEnabled, filters, labels);
  const truncated = [status.sites, status.cells].some((response) =>
    Boolean(response?.reason?.startsWith("truncated")),
  );
  const returned = (status.sites?.n_returned ?? 0) + (status.cells?.n_returned ?? 0);
  const controls = {
    enabled,
    cellsEnabled,
    cellsAvailable: status.zoom >= CELLS_VISIBLE_ZOOM,
    filters,
    onToggleEnabled: setEnabled,
    onToggleCells: setCellsEnabled,
    onToggleTechno: toggleTechno,
    onToggleBand: toggleBand,
    onToggleOperator: toggleOperator,
    onReset: reset,
    status: {
      loading: status.loading,
      error: status.error,
      zoom: status.zoom,
      ...(status.sites ? { n_sites: status.sites.n_returned } : {}),
      ...(status.cells ? { n_cells: status.cells.n_returned } : {}),
      n_returned: returned,
      n_total: (status.sites?.n_total_in_bbox ?? 0) + (status.cells?.n_total_in_bbox ?? 0),
      truncated,
    },
  };
  if (workspace) return <SitesMapWorkspaceControls {...controls} />;
  return <SitesLayerControls {...controls} />;
}

export function KpiMapOSM({
  center = [2.4, 46.6],
  zoom = MAP_INITIAL_ZOOM,
  nPoints,
  contextLabel = "KPI",
  premium = false,
  showOperatorLegend = true,
  fullscreen,
  onFullscreenChange,
  onMapReady,
  onRecenter,
  children,
  measurementStatus,
  // 2.0.0 (SA2–SA4) — Site layer MapLibre lazy par bbox + contrôles UI.
  // Toujours disponible via le panneau "Layers" en haut à droite, OFF
  // par défaut. Utilisateur active + filtre techno/band/operator.
  sitesLayerEnabled = true,
  workspace = false,
}: {
  center?: [number, number];
  zoom?: number;
  nPoints?: number;
  contextLabel?: string;
  premium?: boolean;
  showOperatorLegend?: boolean;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
  onMapReady?: (map: MlMap) => void;
  onRecenter?: (() => void) | undefined;
  children?: ReactNode;
  measurementStatus?: string | null;
  sitesLayerEnabled?: boolean;
  workspace?: boolean;
}) {
  const { t: translate, i18n: locale } = useTranslation();
  const readyCallback = useRef(onMapReady);
  readyCallback.current = onMapReady;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [coordinates, setCoordinates] = useState("");
  const [coordinateError, setCoordinateError] = useState("");
  const [baseVisible, setBaseVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [localFull, setLocalFull] = useState(false);
  const full = fullscreen ?? localFull;
  const setFull = useCallback(
    (value: boolean) => {
      setLocalFull(value);
      onFullscreenChange?.(value);
    },
    [onFullscreenChange],
  );

  useEffect(() => {
    let disposed = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      // 1.106.2 — MapLibre v6 : le worker calculé par Vite échoue
      // (« Worker failed to load »), la carte restait blanche. Même
      // correctif que SignalingMap/AssistantMap : worker bundlé explicite.
      const worker = await import("maplibre-gl/dist/maplibre-gl-worker.mjs?url");
      maplibregl.setWorkerUrl(worker.default);
      if (disposed || !el.current) return;
      const instance = new maplibregl.Map({
        container: el.current,
        center,
        zoom: Math.max(MAP_MIN_ZOOM, zoom),
        minZoom: MAP_MIN_ZOOM,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              // 1.105.7 — tile.openstreetmap.org direct. Le proxy Vite dev
              // `/osm/*` n'existe pas en prod Nitro node-server (donc 404).
              // Les autres cartes du projet (AssistantMap, SignalingMap,
              // RadioMap, GeoPreviewMap) tapent déjà en direct avec succès.
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
      });
      map.current = instance;
      instance.on("load", () => {
        setReady(true);
        readyCallback.current?.(instance);
      });
      instance.on("error", (e: unknown) => {
        const err = e as { error?: { status?: number } };
        if (err?.error?.status) setTileError(true);
      });
      instance.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    })().catch(() => {
      if (!disposed) setTileError(true);
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const observer = new ResizeObserver(() => map.current?.resize());
    if (el.current) observer.observe(el.current);
    return () => observer.disconnect();
  }, []);

  // Esc → sortie fullscreen
  useEffect(() => {
    if (!full) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [full, setFull]);

  // Resize map quand on bascule fullscreen
  useEffect(() => {
    const id = setTimeout(() => map.current?.resize(), 50);
    return () => clearTimeout(id);
  }, [full]);

  return (
    <div
      style={
        premium && !full && !workspace
          ? { height: "var(--rrc-map-height, clamp(350px, 42vh, 450px))" }
          : undefined
      }
      className={
        full
          ? "fixed inset-0 z-[60] bg-background"
          : "relative h-full min-h-[310px] w-full overflow-hidden rounded-md border border-[#E2E8F0]"
      }
    >
      <div
        ref={el}
        style={{ position: "absolute", inset: 0 }}
        aria-label={translate("kpi.37f8ac5eacf2")}
      />
      {!ready && !tileError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20 text-[11px] text-muted-foreground">
          {" "}
          {translate("kpi.97076ba0b624")}{" "}
        </div>
      )}
      {tileError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card p-6 text-center text-[11px] text-muted-foreground">
          <MapIcon className="h-6 w-6" />
          <p className="font-medium">{translate("kpi.f083f735c91a")}</p>
          <p>
            {" "}
            {translate("kpi.db5f5c2f28f7")} <code>tile.openstreetmap.org</code>.
          </p>
        </div>
      )}
      {premium && (
        <div className="absolute left-2 top-2 z-10">
          <div className="flex gap-1">
            <button
              className="rrc-map-icon"
              aria-label={translate("kpi.633863fe6e73")}
              title={translate("kpi.e873044509c4")}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen(!searchOpen);
                setLayersOpen(false);
              }}
            >
              <Search size={15} />
            </button>
            <button
              className="rrc-map-icon"
              aria-label={translate("kpi.fb2563ef77c2")}
              title={translate("kpi.fb2563ef77c2")}
              onClick={() => (onRecenter ? onRecenter() : map.current?.flyTo({ center, zoom }))}
            >
              <LocateFixed size={15} />
            </button>
            <button
              className="rrc-map-icon"
              aria-label={translate("kpi.2544123cbe41")}
              title={translate("kpi.2544123cbe41")}
              aria-expanded={layersOpen}
              onClick={() => {
                setLayersOpen(!layersOpen);
                setSearchOpen(false);
              }}
            >
              <Layers size={15} />
            </button>
          </div>
          {searchOpen && (
            <form
              className="rrc-map-popover"
              onSubmit={(event) => {
                event.preventDefault();
                const values = coordinates.split(/[;,]/).map((v) => Number(v.trim()));
                const lat = values[0],
                  lon = values[1];
                if (
                  values.length !== 2 ||
                  coordinates.split(/[;,]/).some((v) => !v.trim()) ||
                  lat == null ||
                  lon == null ||
                  !Number.isFinite(lat) ||
                  !Number.isFinite(lon) ||
                  Math.abs(lat) > 90 ||
                  Math.abs(lon) > 180
                ) {
                  setCoordinateError("Saisissez latitude, longitude valides.");
                  return;
                }
                setCoordinateError("");
                map.current?.flyTo({ center: [lon, lat], zoom: 12 });
                setSearchOpen(false);
              }}
            >
              <label className="text-xs">
                Latitude, longitude
                <input
                  aria-label="Latitude, longitude"
                  value={coordinates}
                  onChange={(e) => setCoordinates(e.target.value)}
                  placeholder="48.8566, 2.3522"
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <button className="rrc-control mt-2" type="submit">
                {" "}
                {translate("kpi.9e3df88a709a")}{" "}
              </button>
              {coordinateError && (
                <p role="alert" className="text-xs mt-1">
                  {coordinateError}
                </p>
              )}
            </form>
          )}
          {layersOpen && (
            <div className="rrc-map-popover">
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={baseVisible}
                  disabled={!ready}
                  onChange={(e) => {
                    setBaseVisible(e.target.checked);
                    map.current?.setLayoutProperty(
                      "osm",
                      "visibility",
                      e.target.checked ? "visible" : "none",
                    );
                  }}
                />{" "}
                {translate("kpi.6f6ba4244731")}{" "}
              </label>
            </div>
          )}
        </div>
      )}
      {children}
      {/* 2.0.0 (SA2–SA4) — Site layer MapLibre controls + layer. */}
      {sitesLayerEnabled && ready && <SitesLayerHarness map={map.current} workspace={workspace} />}
      {/* Compact empty-measurement status; attribution remains on the map. */}
      {measurementStatus !== null && (
        <div
          className={`absolute left-2 ${premium ? "bottom-2" : "top-2"} z-10 rounded border border-[#E2E8F0] bg-card/95 px-2 py-1 text-[10px] shadow-sm`}
          title={translate("kpi.9988d7ea6ad3")}
        >
          {nPoints != null && (
            <span className="mr-2">
              {nPoints.toLocaleString(locale.resolvedLanguage === "fr" ? "fr-FR" : "en-GB")} obs.{" "}
              {contextLabel}
            </span>
          )}
          <span className="text-sev-warn">
            {measurementStatus ??
              (premium
                ? translate("kpi.a5802ba6f148")
                : translate("kpi.8b720795f9b0", { v0: contextLabel }))}
          </span>
        </div>
      )}
      {/* Bouton plein écran ⤢ en haut à droite */}
      <button
        onClick={() => setFull(!full)}
        aria-label={
          full
            ? translate("kpi.3645da627202")
            : premium
              ? translate("kpi.2668a681be64")
              : translate("kpi.dee312b0129c")
        }
        title={full ? translate("kpi.0d8f484c8af1") : translate("kpi.dee312b0129c")}
        className="absolute right-[50px] top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded border border-[#E2E8F0] bg-card/95 shadow-sm hover:bg-muted"
      >
        {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
      {/* Légende opérateur en bas à gauche — couleurs de marque BC4. */}
      {showOperatorLegend && !workspace && (
        <div className="absolute bottom-2 left-2 z-10 rounded border border-[#E2E8F0] bg-card/95 px-2 py-1 text-[10px] shadow-sm">
          <div className="mb-0.5 font-semibold text-foreground">
            {translate("kpi.5bb4229062a5")}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {OPERATOR_COLORS.map(({ op, hex }) => (
              <span key={op} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: hex }} />
                <span className="text-foreground">{op}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full border border-dashed border-muted-foreground" />
              <span className="text-muted-foreground">{translate("kpi.eb34623b71cd")}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
