/** Shared premium network-map chrome used by the Map page and Signaling View.
 * It only drives the existing MapLibre instance and the shared Sites layer
 * state: no second map implementation, no fabricated counters. */
import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from "maplibre-gl";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  Crosshair,
  ArrowLeftRight,
  Layers,
  List,
  LocateFixed,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Ruler,
  Search,
  SlidersHorizontal,
  Spline,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  BASEMAPS,
  BASEMAP_PREVIEW,
  applyBasemap,
  readBasemap,
  writeBasemap,
  type BasemapId,
} from "./basemaps";
import { OPERATORS, type SitesLayerControlsProps } from "./SitesLayerControls";
import { BeamDisplayControls } from "./BeamDisplayControls";
import { useMapRfPanel } from "./map-rf-panel";
import {
  BAND_CODES,
  LTE_COLOR,
  NETWORK_BANDS,
  NR_COLOR,
  TECHNO_CODES,
  bandColor,
  formatArea,
  formatDistance,
  isActive,
  pathLength,
  polygonArea,
  scaleBar,
  searchNetwork,
  toggleWithin,
  type SearchableFeature,
} from "./network-map-model";

export type NetworkMapChromeProps = SitesLayerControlsProps & {
  map?: MlMap | null;
  onToggleDisplay?: (key: "beams" | "labels", v: boolean) => void;
  onSetTechnos?: (v: string[]) => void;
  onSetBands?: (v: string[]) => void;
  sitesFeatures?: SearchableFeature[] | undefined;
  cellsFeatures?: SearchableFeature[] | undefined;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  fullscreenLevel?: number;
  onRestore?: (() => void) | undefined;
  wide?: boolean;
  onToggleWide?: (() => void) | undefined;
  onRecenter?: () => void;
  status?: SitesLayerControlsProps["status"];
  /** Metric legend (classes, colours, counts) shown first in the Layers panel. */
  layersLegend?: ReactNode;
};

type MeasureMode = "none" | "distance" | "area";
const MEASURE_SRC = "bc4-measure";

const glass = "border border-border/70 bg-card/90 shadow-lg backdrop-blur-md";

export function NetworkMapChrome(props: NetworkMapChromeProps) {
  const { t, i18n } = useTranslation();
  const {
    map,
    enabled,
    cellsEnabled,
    cellsAvailable,
    filters,
    onToggleEnabled,
    onToggleCells,
    onToggleTechno,
    onToggleBand,
    onToggleOperator,
    onSetTechnos,
    onSetBands,
    onReset,
    display = { beams: true, labels: false },
    onToggleDisplay,
    status,
  } = props;
  const locale = i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB";
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const compact = width < 760;
  const [panelOpen, setPanelOpenState] = useState<boolean | null>(() => {
    try {
      const saved = localStorage.getItem("bc4.map.chrome.sidebar.v1");
      return saved === "open" ? true : saved === "closed" ? false : null;
    } catch {
      return null;
    }
  });
  const setPanelOpen = (open: boolean) => {
    setPanelOpenState(open);
    try {
      localStorage.setItem("bc4.map.chrome.sidebar.v1", open ? "open" : "closed");
    } catch {
      /* storage unavailable */
    }
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("bc4:workspace-resize")));
  };
  const showPanel = panelOpen ?? !compact;
  const rfPanel = useMapRfPanel();
  const [panelTab, setPanelTab] = useState<"layers" | "legend" | "rf">("layers");
  const tabs = [
    "layers" as const,
    ...(props.layersLegend ? (["legend"] as const) : []),
    ...(rfPanel ? (["rf"] as const) : []),
  ];
  const tab = tabs.includes(panelTab) ? panelTab : "layers";
  // A new point selection brings its RF details forward in the same sidebar.
  const selectionTick = rfPanel?.selectionTick ?? 0;
  useEffect(() => {
    if (selectionTick === 0) return;
    setPanelTab("rf");
    setPanelOpen(true);
  }, [selectionTick]);
  const [menu, setMenu] = useState<null | "bands" | "metrics">(null);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);
  const [centerLat, setCenterLat] = useState(46.6);
  const [mode, setMode] = useState<MeasureMode>("none");
  const [points, setPoints] = useState<Array<[number, number]>>([]);
  const [basemapOpen, setBasemapOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fullscreenLabel = t(props.fullscreenLevel === 2 ? "mapWorkspace.exitFullscreen" : props.fullscreen ? "mapWorkspace.totalFullscreen" : "mapWorkspace.frameFullscreen");
  const [basemap, setBasemap] = useState<BasemapId>(() => readBasemap());
  const chooseBasemap = (id: BasemapId) => {
    setBasemap(id);
    writeBasemap(id);
    if (map) applyBasemap(map, id);
  };

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  // On a compact map an explicitly opened floating panel behaves like a
  // popover: a click back on the map closes it. Desktop keeps the persisted
  // panel open until its own Close control is used.
  useEffect(() => {
    if (!map || !compact || panelOpen !== true) return;
    const close = () => setPanelOpen(false);
    map.on("click", close);
    return () => {
      map.off("click", close);
    };
  }, [compact, map, panelOpen]);

  useEffect(() => {
    if (!map || tab !== "legend" || !props.layersLegend) return;
    const closeLegend = () => setPanelTab("layers");
    map.on("click", closeLegend);
    return () => {
      map.off("click", closeLegend);
    };
  }, [map, props.layersLegend, tab]);

  // Live cursor / zoom / scale from the real map state.
  useEffect(() => {
    if (!map) return;
    const move = (e: MapMouseEvent) => setCursor([e.lngLat.lng, e.lngLat.lat]);
    const out = () => setCursor(null);
    const view = () => {
      setLiveZoom(map.getZoom());
      const c = map.getCenter?.();
      if (c) setCenterLat(c.lat);
    };
    view();
    map.on("mousemove", move);
    map.on("mouseout", out);
    map.on("move", view);
    return () => {
      map.off("mousemove", move);
      map.off("mouseout", out);
      map.off("move", view);
    };
  }, [map]);

  // Measurement tools (distance / area) drawn in their own GeoJSON source.
  useEffect(() => {
    if (!map || mode === "none") return;
    const click = (e: MapMouseEvent) => setPoints((p) => [...p, [e.lngLat.lng, e.lngLat.lat]]);
    map.getCanvas().style.cursor = "crosshair";
    map.doubleClickZoom?.disable();
    map.on("click", click);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMode("none");
    window.addEventListener("keydown", esc);
    return () => {
      map.off("click", click);
      map.getCanvas().style.cursor = "";
      map.doubleClickZoom?.enable();
      window.removeEventListener("keydown", esc);
    };
  }, [map, mode]);

  useEffect(() => {
    if (!map?.getStyle) return;
    const coords = mode === "area" && points.length > 2 ? [...points, points[0]!] : points;
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        ...(coords.length > 1
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: { type: "LineString" as const, coordinates: coords },
              },
            ]
          : []),
        ...(mode === "area" && points.length > 2
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: { type: "Polygon" as const, coordinates: [coords] },
              },
            ]
          : []),
        ...points.map((c) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: c },
        })),
      ],
    };
    const src = map.getSource(MEASURE_SRC) as GeoJSONSource | undefined;
    if (src) return void src.setData(data);
    if (!points.length) return;
    map.addSource(MEASURE_SRC, { type: "geojson", data });
    map.addLayer({
      id: "bc4-measure-fill",
      type: "fill",
      source: MEASURE_SRC,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: "bc4-measure-line",
      type: "line",
      source: MEASURE_SRC,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 1] },
    });
    map.addLayer({
      id: "bc4-measure-pt",
      type: "circle",
      source: MEASURE_SRC,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#2563eb",
        "circle-stroke-width": 2,
      },
    });
  }, [map, points, mode]);

  const startMeasure = (next: MeasureMode) => {
    setPoints([]);
    setMode((m) => (m === next ? "none" : next));
    setMenu(null);
  };

  const hits = useMemo(
    () => searchNetwork(query, props.sitesFeatures ?? [], props.cellsFeatures ?? []),
    [query, props.sitesFeatures, props.cellsFeatures],
  );
  const zoom = liveZoom ?? status?.zoom ?? 11;
  const scale = scaleBar(zoom, centerLat);
  const fmt = (n: number | undefined) => (n == null ? "—" : n.toLocaleString(locale));

  const setTechnos = (values: string[]) =>
    onSetTechnos
      ? onSetTechnos(toggleWithin(filters.technos, values, TECHNO_CODES))
      : values.forEach(onToggleTechno);
  const setBand = (code: string) =>
    onSetBands ? onSetBands(toggleWithin(filters.bands, [code], BAND_CODES)) : onToggleBand(code);
  const measureValue =
    mode === "distance"
      ? formatDistance(pathLength(points))
      : mode === "area"
        ? formatArea(polygonArea(points))
        : "";

  const railBtn = (on = false) =>
    `flex h-8 w-8 items-center justify-center rounded-lg transition ${on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`;

  // MAP UI V1 — floating compact legend: technology, band colours and symbols
  // only. The "site colour = operator" row is removed by design.
  const legend = (
    <div className={compact ? "space-y-1.5 text-[10px]" : "flex gap-4 text-[10px]"}>
      <LegendRow>
        <Swatch
          color={NR_COLOR}
          label="5G NR"
          active={isActive(filters.technos, ["5G"])}
          onClick={() => setTechnos(["5G"])}
        />
        <Swatch
          color={LTE_COLOR}
          label="4G LTE"
          active={isActive(filters.technos, ["4G", "LTE"])}
          onClick={() => setTechnos(["4G", "LTE"])}
        />
      </LegendRow>
      <LegendRow>
        {NETWORK_BANDS.map((b) => (
          <Swatch
            key={b.key}
            color={bandColor(b.key)}
            label={b.key}
            hideLabel={!compact}
            active={isActive(filters.bands, [b.code])}
            onClick={() => setBand(b.code)}
          />
        ))}
      </LegendRow>
      <LegendRow>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => onToggleEnabled(!enabled)}
          className={`inline-flex items-center gap-1 rounded px-0.5 transition hover:bg-muted ${enabled ? "" : "opacity-40 line-through"}`}
        >
          <span className="h-2.5 w-2.5 rounded-full border-2 border-card bg-muted-foreground ring-1 ring-border" />
          {t("mapWorkspace.site")}
        </button>
        <button
          type="button"
          aria-pressed={cellsEnabled}
          onClick={() => onToggleCells(!cellsEnabled)}
          disabled={!enabled}
          className={`inline-flex items-center gap-1 rounded px-0.5 transition hover:bg-muted disabled:cursor-not-allowed ${cellsEnabled && enabled ? "" : "opacity-40 line-through"}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M6 11 L1 2 A6 6 0 0 1 11 2 Z" fill="currentColor" opacity="0.5" />
          </svg>
          {t("mapWorkspace.cellSector")}
        </button>
      </LegendRow>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-20"
      data-testid="network-map-chrome"
    >
      {/* Left — collapsible Layers panel */}
      {showPanel ? (
        <aside
          aria-label={t("mapWorkspace.layers")}
          className={`pointer-events-auto absolute left-3 top-3 flex w-64 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl ${glass} ${compact ? "bottom-3" : "bottom-[76px]"}`}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            {tabs.length > 1 ? (
              <div role="tablist" className="flex min-w-0 gap-1 text-xs font-semibold">
                {tabs.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    data-testid={`map-panel-tab-${id}`}
                    onClick={() => setPanelTab(id)}
                    className={`whitespace-nowrap rounded px-2 py-0.5 ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {t(
                      id === "layers"
                        ? "mapWorkspace.layers"
                        : id === "legend"
                          ? "mapWorkspace.legend"
                          : "mapWorkspace.rfTab",
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="text-xs font-semibold">{t("mapWorkspace.layers")}</h2>
            )}
            <button
              type="button"
              aria-label={
                tab === "legend" ? t("mapWorkspace.closeLegend") : t("mapWorkspace.collapse")
              }
              onClick={() => (tab === "legend" ? setPanelTab("layers") : setPanelOpen(false))}
              className="rounded p-1 hover:bg-muted"
            >
              {tab === "legend" ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2 text-[11px]">
            {/* RF host stays mounted so the selected point survives tab switches. */}
            {rfPanel && (
              <div className={tab === "rf" ? "" : "hidden"} data-testid="map-rf-panel">
                <div ref={rfPanel.setHost} className="peer" />
                <p className="hidden text-muted-foreground peer-empty:block">
                  {t("mapWorkspace.rfEmpty")}
                </p>
              </div>
            )}
            {tab === "rf" ? null : tab === "legend" ? (
              props.layersLegend
            ) : (
              <>
                <Section title={t("mapWorkspace.sitesAndCells")}>
                  <Check
                    label={t("mapWorkspace.sites")}
                    checked={enabled}
                    onChange={onToggleEnabled}
                  />
                  <Check
                    label={t("mapWorkspace.cellSectors")}
                    checked={cellsEnabled}
                    onChange={onToggleCells}
                    hint={cellsAvailable ? undefined : t("mapSites.cellsFromZoom")}
                  />
                  <Check
                    label={t("mapWorkspace.beams")}
                    checked={display.beams}
                    disabled={!onToggleDisplay}
                    onChange={(v) => onToggleDisplay?.("beams", v)}
                  />
                  <Check
                    label={t("mapWorkspace.labels")}
                    checked={display.labels}
                    disabled={!onToggleDisplay}
                    onChange={(v) => onToggleDisplay?.("labels", v)}
                  />
                  <BeamDisplayControls
                    display={display}
                    onSetBeamDisplay={props.onSetBeamDisplay}
                  />
                </Section>
                <Section title={t("mapWorkspace.technology")}>
                  <Check
                    label="5G NR"
                    color={NR_COLOR}
                    checked={isActive(filters.technos, ["5G"])}
                    onChange={() => setTechnos(["5G"])}
                  />
                  <Check
                    label="4G LTE"
                    color={LTE_COLOR}
                    checked={isActive(filters.technos, ["4G", "LTE"])}
                    onChange={() => setTechnos(["4G", "LTE"])}
                  />
                  <Check
                    label="3G"
                    checked={false}
                    disabled
                    onChange={() => {}}
                    hint={t("mapWorkspace.notInData")}
                  />
                </Section>
                <Section title={t("mapWorkspace.bands")}>
                  {NETWORK_BANDS.map((b) => (
                    <Check
                      key={b.key}
                      label={b.key}
                      color={bandColor(b.key)}
                      checked={isActive(filters.bands, [b.code])}
                      onChange={() => setBand(b.code)}
                    />
                  ))}
                </Section>
                {/* MAP UI V1 — operator filtering leaves the top toolbar and lives
                in the sidebar Filters, so the functional filter is preserved. */}
                <Section title={t("mapSites.operator")}>
                  {OPERATORS.map((o) => (
                    <Check
                      key={o.v}
                      label={o.label}
                      color={o.color}
                      checked={isActive(filters.operators, [o.v])}
                      onChange={() => onToggleOperator(o.v)}
                    />
                  ))}
                </Section>
                <Section title={t("mapWorkspace.siteTypes")}>
                  {["macro", "indoor", "smallCell"].map((k) => (
                    <Check
                      key={k}
                      label={t(`mapWorkspace.${k}`)}
                      checked={false}
                      disabled
                      onChange={() => {}}
                    />
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    {t("mapWorkspace.siteTypesUnavailable")}
                  </p>
                </Section>
                <Section title={t("mapWorkspace.heatmap")}>
                  <Check
                    label={t("mapWorkspace.heatmap")}
                    checked={false}
                    disabled
                    onChange={() => {}}
                    hint={t("mapWorkspace.heatmapUnavailable")}
                  />
                </Section>
                {compact && <Section title={t("mapWorkspace.legend")}>{legend}</Section>}
              </>
            )}
          </div>
        </aside>
      ) : (
        /* MAP UI V1 — collapsed sidebar keeps a compact vertical icon rail;
           each icon reopens the panel, filters keep their values. */
        <div
          role="toolbar"
          aria-orientation="vertical"
          aria-label={t("mapWorkspace.layers")}
          className={`pointer-events-auto absolute left-3 top-3 flex flex-col gap-1 rounded-xl p-1 ${glass}`}
        >
          <button
            type="button"
            className={railBtn()}
            aria-label={t("mapWorkspace.expandLayers")}
            onClick={() => setPanelOpen(true)}
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={railBtn()}
            aria-label={t("mapWorkspace.moreFilters")}
            onClick={() => setPanelOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={railBtn()}
            aria-label={t("mapWorkspace.legend")}
            onClick={() => {
              setPanelTab("legend");
              setPanelOpen(true);
            }}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={railBtn()}
            aria-label={t("mapWorkspace.search")}
            onClick={() => {
              if (compact) setSearchOpen(true);
              searchInputRef.current?.focus();
            }}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 1.126.3 BC3 — Overlay « Zoomez pour voir les cellules » quand
          cellsEnabled est vrai mais le niveau de zoom courant est en
          dessous du seuil CELLS_VISIBLE_ZOOM. Visible et centré, pas
          seulement en tooltip du bouton. */}
      {cellsEnabled && !cellsAvailable && (
        <div
          role="status"
          className={`pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full border px-3 py-1.5 text-[11px] font-medium text-muted-foreground ${glass}`}
        >
          {t("mapSites.zoomToSeeCells")}
        </div>
      )}

      {/* Top-right — floating search */}
      {(!compact || searchOpen) && (
        <div
          className={`pointer-events-auto absolute top-3 ${compact ? "left-3 right-14" : "right-14 w-[300px]"}`}
        >
          <label className={`flex h-10 items-center gap-2 rounded-xl px-3 ${glass}`}>
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("mapWorkspace.searchPlaceholder")}
              aria-label={t("mapWorkspace.search")}
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                aria-label={t("mapWorkspace.clearSearch")}
                onClick={() => setQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          {query.trim() && (
            <ul role="listbox" className={`mt-1 max-h-72 overflow-auto rounded-xl p-1 ${glass}`}>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      map?.flyTo({
                        center: h.center,
                        zoom: Math.max(map.getZoom(), h.kind === "coords" ? 14 : 15),
                      });
                      setQuery("");
                      setSearchOpen(false);
                    }}
                    className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                  >
                    <span className="font-semibold">
                      {h.kind === "coords"
                        ? t("mapWorkspace.goToCoordinates", { v: h.title })
                        : h.title}
                    </span>
                    {h.subtitle && (
                      <span className="text-[10px] text-muted-foreground">{h.subtitle}</span>
                    )}
                  </button>
                </li>
              ))}
              {!hits.length && (
                <li className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {t("mapWorkspace.searchNoResult")}
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Right — vertical map tools */}
      <div
        className={`pointer-events-auto absolute right-3 top-3 flex flex-col gap-1 rounded-xl p-1 ${glass}`}
        role="toolbar"
        aria-orientation="vertical"
        aria-label={t("mapWorkspace.tools")}
      >
        {compact && (
          <button
            type="button"
            className={railBtn(searchOpen)}
            aria-label={t("mapWorkspace.search")}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        <Button
          variant="ghost" size="icon"
          className={railBtn(props.fullscreen)}
          aria-label={fullscreenLabel}
          title={fullscreenLabel}
          onClick={props.onToggleFullscreen}
        >
          {props.fullscreenLevel === 2 ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        {props.fullscreen && props.onRestore && <Button variant="ghost" size="icon" className={railBtn()} aria-label={t("mapWorkspace.restoreMap")} title={t("mapWorkspace.restoreMap")} onClick={props.onRestore}><Minimize2 className="h-4 w-4" /></Button>}
        <Button variant="ghost" size="icon" className={railBtn(settingsOpen)} aria-label={t("mapWorkspace.mapSettings")} title={t("mapWorkspace.mapSettings")} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}><SlidersHorizontal className="h-4 w-4" /></Button>
        <button
          type="button"
          className={railBtn()}
          aria-label={t("mapWorkspace.zoomIn")}
          onClick={() => map?.zoomIn()}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={railBtn()}
          aria-label={t("mapWorkspace.zoomOut")}
          onClick={() => map?.zoomOut()}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={railBtn()}
          aria-label={t("mapWorkspace.centerRoute")}
          title={t("mapWorkspace.centerRoute")}
          onClick={props.onRecenter}
        >
          <LocateFixed className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={railBtn(mode === "distance")}
          aria-pressed={mode === "distance"}
          aria-label={t("mapWorkspace.distance")}
          onClick={() => startMeasure("distance")}
        >
          <Ruler className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={railBtn(mode === "area")}
          aria-pressed={mode === "area"}
          aria-label={t("mapWorkspace.area")}
          onClick={() => startMeasure("area")}
        >
          <Spline className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={railBtn(basemapOpen)}
          aria-expanded={basemapOpen}
          aria-label={t("mapWorkspace.basemap")}
          onClick={() => setBasemapOpen((v) => !v)}
        >
          <Layers className="h-4 w-4" />
        </button>
      </div>

      {settingsOpen && <div role="dialog" aria-label={t("mapWorkspace.mapSettings")} className={`pointer-events-auto absolute right-14 top-3 w-56 rounded-lg p-3 ${glass}`}>
        <div className="mb-2 flex items-center justify-between gap-2"><strong className="text-xs">{t("mapWorkspace.mapSettings")}</strong><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t("mapWorkspace.closeSettings")} onClick={() => setSettingsOpen(false)}><X className="h-4 w-4" /></Button></div>
        <Button variant="outline" size="sm" className="w-full text-xs" disabled={props.fullscreen || !props.onToggleWide} aria-pressed={props.wide ?? false} onClick={props.onToggleWide}><ArrowLeftRight className="h-4 w-4" />{t(props.wide ? "mapWorkspace.restoreWidth" : "mapWorkspace.increaseWidth")}</Button>
      </div>}

      {/* Basemap selector — 2 × 2 grid opened from the rail Layers button */}
      {basemapOpen && (
        <div
          role="radiogroup"
          aria-label={t("mapWorkspace.basemap")}
          className={`pointer-events-auto absolute right-14 w-56 rounded-xl p-2 ${glass}`}
          style={{ top: compact ? 56 : 300 }}
        >
          <p className="mb-1.5 px-1 text-[11px] font-semibold">{t("mapWorkspace.basemap")}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {BASEMAPS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={basemap === id}
                onClick={() => chooseBasemap(id)}
                className={`overflow-hidden rounded-lg border-2 text-left text-[10px] font-semibold transition ${basemap === id ? "border-primary" : "border-transparent hover:border-border"}`}
              >
                <img
                  src={BASEMAP_PREVIEW[id].src}
                  alt=""
                  loading="lazy"
                  className="h-14 w-full object-cover"
                  style={
                    BASEMAP_PREVIEW[id].filter ? { filter: BASEMAP_PREVIEW[id].filter } : undefined
                  }
                />
                <span className="block px-1.5 py-1">{t(`mapWorkspace.basemaps.${id}`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Measurement read-out */}
      {mode !== "none" && (
        <div
          className={`pointer-events-auto absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] ${glass}`}
          role="status"
        >
          <Ruler className="h-3.5 w-3.5 text-primary" />
          <strong className="tabular-nums">
            {points.length ? measureValue : t("mapWorkspace.measureHint")}
          </strong>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setPoints([])}
          >
            {t("mapWorkspace.clearMeasure")}
          </button>
          <button
            type="button"
            aria-label={t("mapWorkspace.select")}
            onClick={() => setMode("none")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Top — interactive legend: click an item to show/hide it. */}
      {!compact && (
        <div
          className="pointer-events-none absolute top-3 flex justify-center"
          style={{ left: showPanel ? 248 : 64, right: 380 }}
        >
          <div
            data-testid="map-workspace-legend"
            className={`pointer-events-auto rounded-xl px-3 py-2 ${glass}`}
            aria-label={t("mapWorkspace.legend")}
          >
            {legend}
          </div>
        </div>
      )}

      {/* Bottom — status (left), Metrics (true centre), state dot (right). */}
      <div
        className={`pointer-events-none absolute bottom-3 left-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3 ${compact ? "right-3" : "right-[150px]"}`}
      >
        <div
          data-testid="map-workspace-statusbar"
          className={`pointer-events-auto flex min-w-0 max-w-full items-center gap-2.5 overflow-x-auto whitespace-nowrap rounded-xl px-2.5 py-0.5 text-[11px] justify-self-start ${glass}`}
        >
          <Stat value={fmt(status?.n_sites)} label={t("mapWorkspace.visibleSites")} />
          <Stat value={fmt(status?.n_cells)} label={t("mapWorkspace.visibleCells")} />
          <span className="h-5 w-px bg-border" />
          <span className="tabular-nums">
            <span className="text-muted-foreground">Z </span>
            <strong className="text-sm">{zoom.toFixed(1)}</strong>
          </span>
          {!compact && (
            <span
              className="inline-flex min-w-[118px] items-center gap-1 tabular-nums text-muted-foreground"
              title={t("mapWorkspace.cursor")}
            >
              <Crosshair className="h-3 w-3" />
              {cursor ? `${cursor[1].toFixed(4)}, ${cursor[0].toFixed(4)}` : "—"}
            </span>
          )}
          <span className="flex flex-col items-center text-[10px]" title={t("mapWorkspace.scale")}>
            {scale.label}
            <span className="h-1 border-x border-b border-foreground" style={{ width: scale.px }} />
          </span>
        </div>
        <div
          className={`pointer-events-auto flex items-center rounded-xl px-1.5 py-0.5 text-[11px] justify-self-center ${glass}`}
        >
          <Dropdown
            up
            open={menu === "metrics"}
            onOpen={(o) => setMenu(o ? "metrics" : null)}
            label={
              <>
                <BarChart3 className="h-3.5 w-3.5" />
                {!compact && t("mapWorkspace.metrics")}
              </>
            }
          >
            <div className="space-y-1 p-2 text-[11px]">
              <Row label={t("mapWorkspace.totalInView")} value={fmt(status?.n_total)} />
              <Row label={t("mapWorkspace.returned")} value={fmt(status?.n_returned)} />
              {status?.truncated && (
                <p className="text-[10px] text-destructive">{t("mapSites.partial")}</p>
              )}
              {status?.error && (
                <p className="text-[10px] text-destructive">
                  {t("mapSites.error")}: {status.error}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                {t("mapWorkspace.heatmapUnavailable")}
              </p>
            </div>
          </Dropdown>
        </div>
        <div
          className={`pointer-events-auto flex items-center rounded-xl px-2.5 py-1 justify-self-end ${glass}`}
        >
          {/* MAP UI V1 — the measure/recenter tools live only in the right
              rail; the duplicated Tools dropdown is removed. */}
          <span
            className={`h-2 w-2 rounded-full ${status?.loading ? "animate-pulse bg-primary" : status?.error ? "bg-destructive" : "bg-muted-foreground/40"}`}
            title={
              status?.error ?? (status?.loading ? t("mapSites.loading") : t("mapWorkspace.ready"))
            }
          />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mb-1 flex w-full items-center justify-between font-semibold"
      >
        {title}
        <ChevronDown className={`h-3 w-3 transition ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="space-y-0.5 pl-1">{children}</div>}
    </section>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled,
  color,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: string;
  hint?: string | undefined;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded px-1 py-0.5 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-muted"}`}
      title={hint}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
      <span className="flex-1">{label}</span>
    </label>
  );
}

function Dropdown({
  label,
  open,
  onOpen,
  children,
  up = false,
}: {
  label: ReactNode;
  open: boolean;
  onOpen: (o: boolean) => void;
  children: ReactNode;
  up?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onOpen]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
        className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold hover:bg-muted"
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div
          className={`fixed z-50 min-w-44 rounded-xl border bg-popover p-1 shadow-xl`}
          style={dropdownPos(ref.current, up)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Fixed positioning escapes the toolbar's overflow clipping. */
function dropdownPos(el: HTMLElement | null, up: boolean): React.CSSProperties {
  const r = el?.getBoundingClientRect();
  if (!r) return {};
  return up
    ? { left: r.left, bottom: window.innerHeight - r.top + 6 }
    : { left: r.left, top: r.bottom + 6 };
}

function MenuCheck({
  label,
  checked,
  onClick,
  color,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-muted"
    >
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      <span className="flex-1">{label}</span>
      <span aria-hidden className="text-primary">
        {checked ? "✓" : ""}
      </span>
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-baseline gap-1 leading-none">
      <strong className="text-sm tabular-nums">{value}</strong>
      <span className="text-[10px] text-muted-foreground">: {label}</span>
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}

function LegendRow({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">{children}</div>
    </div>
  );
}

function Swatch({
  color,
  label,
  round,
  hideLabel,
  active = true,
  onClick,
}: {
  color: string;
  label: string;
  round?: boolean;
  hideLabel?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 rounded px-0.5 transition hover:bg-muted ${active ? "" : "opacity-30"}`}
    >
      <span
        className={`h-2.5 w-2.5 ${round ? "rounded-full" : "rounded-sm"}`}
        style={{ background: color }}
      />
      {!hideLabel && <span className={active ? "" : "line-through"}>{label}</span>}
    </button>
  );
}
