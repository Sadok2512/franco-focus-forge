/** Shared premium network-map chrome used by the Map page and Signaling View.
 * It only drives the existing MapLibre instance and the shared Sites layer
 * state: no second map implementation, no fabricated counters. */
import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from "maplibre-gl";
import {
  Antenna,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  Crosshair,
  Layers,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Plus,
  Ruler,
  Search,
  Settings2,
  SlidersHorizontal,
  Spline,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { OPERATORS, type SitesLayerControlsProps } from "./SitesLayerControls";
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
  display?: { beams: boolean; labels: boolean };
  onToggleDisplay?: (key: "beams" | "labels", v: boolean) => void;
  onSetTechnos?: (v: string[]) => void;
  onSetBands?: (v: string[]) => void;
  sitesFeatures?: SearchableFeature[] | undefined;
  cellsFeatures?: SearchableFeature[] | undefined;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onRecenter?: () => void;
  status?: SitesLayerControlsProps["status"];
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
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const showPanel = panelOpen ?? !compact;
  const [menu, setMenu] = useState<null | "bands" | "operator" | "metrics" | "tools">(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);
  const [centerLat, setCenterLat] = useState(46.6);
  const [mode, setMode] = useState<MeasureMode>("none");
  const [points, setPoints] = useState<Array<[number, number]>>([]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

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
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } }]
          : []),
        ...(mode === "area" && points.length > 2
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } }]
          : []),
        ...points.map((c) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: c } })),
      ],
    };
    const src = map.getSource(MEASURE_SRC) as GeoJSONSource | undefined;
    if (src) return void src.setData(data);
    if (!points.length) return;
    map.addSource(MEASURE_SRC, { type: "geojson", data });
    map.addLayer({ id: "bc4-measure-fill", type: "fill", source: MEASURE_SRC, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 } });
    map.addLayer({ id: "bc4-measure-line", type: "line", source: MEASURE_SRC, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 1] } });
    map.addLayer({ id: "bc4-measure-pt", type: "circle", source: MEASURE_SRC, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": "#ffffff", "circle-stroke-color": "#2563eb", "circle-stroke-width": 2 } });
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
  const filterCount = filters.technos.length + filters.bands.length + filters.operators.length;
  const measureValue =
    mode === "distance" ? formatDistance(pathLength(points)) : mode === "area" ? formatArea(polygonArea(points)) : "";

  const pill = (on: boolean) =>
    `flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${on ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted"}`;
  const railBtn = (on = false) =>
    `flex h-8 w-8 items-center justify-center rounded-lg transition ${on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`;

  const legend = (
    <div className={compact ? "space-y-1.5 text-[10px]" : "flex gap-4 text-[10px]"}>
      <LegendRow title={t("mapWorkspace.technology")}>
        <Swatch color={NR_COLOR} label="5G NR" />
        <Swatch color={LTE_COLOR} label="4G LTE" />
      </LegendRow>
      <LegendRow title={t("mapWorkspace.bands")}>
        {NETWORK_BANDS.filter((b) => isActive(filters.bands, [b.code])).map((b) => (
          <Swatch key={b.key} color={bandColor(b.key)} label={b.key} hideLabel={!compact} />
        ))}
      </LegendRow>
      <LegendRow title={t("mapWorkspace.siteColour")}>
        {OPERATORS.filter((o) => isActive(filters.operators, [o.v])).map((o) => (
          <Swatch key={o.v} color={o.color} label={o.label} round hideLabel={!compact} />
        ))}
      </LegendRow>
      <LegendRow title={t("mapWorkspace.symbols")}>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-card bg-muted-foreground ring-1 ring-border" />
          {t("mapWorkspace.site")}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M6 11 L1 2 A6 6 0 0 1 11 2 Z" fill="currentColor" opacity="0.5" />
          </svg>
          {t("mapWorkspace.cellSector")}
        </span>
      </LegendRow>
    </div>
  );

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-20" data-testid="network-map-chrome">
      {/* Left — collapsible Layers panel */}
      {showPanel ? (
        <aside
          aria-label={t("mapWorkspace.layers")}
          className={`pointer-events-auto absolute left-3 top-3 flex w-56 flex-col overflow-hidden rounded-xl ${glass} ${compact ? "bottom-3" : "bottom-[76px]"}`}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-xs font-semibold">{t("mapWorkspace.layers")}</h2>
            <button type="button" aria-label={t("mapWorkspace.collapse")} onClick={() => setPanelOpen(false)} className="rounded p-1 hover:bg-muted">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2 text-[11px]">
            <Section title={t("mapWorkspace.sitesAndCells")}>
              <Check label={t("mapWorkspace.sites")} checked={enabled} onChange={onToggleEnabled} />
              <Check label={t("mapWorkspace.cellSectors")} checked={cellsEnabled} onChange={onToggleCells} hint={cellsAvailable ? undefined : t("mapSites.cellsFromZoom")} />
              <Check label={t("mapWorkspace.beams")} checked={display.beams} disabled={!onToggleDisplay} onChange={(v) => onToggleDisplay?.("beams", v)} />
              <Check label={t("mapWorkspace.labels")} checked={display.labels} disabled={!onToggleDisplay} onChange={(v) => onToggleDisplay?.("labels", v)} />
            </Section>
            <Section title={t("mapWorkspace.technology")}>
              <Check label="5G NR" color={NR_COLOR} checked={isActive(filters.technos, ["5G"])} onChange={() => setTechnos(["5G"])} />
              <Check label="4G LTE" color={LTE_COLOR} checked={isActive(filters.technos, ["4G", "LTE"])} onChange={() => setTechnos(["4G", "LTE"])} />
              <Check label="3G" checked={false} disabled onChange={() => {}} hint={t("mapWorkspace.notInData")} />
            </Section>
            <Section title={t("mapWorkspace.bands")}>
              {NETWORK_BANDS.map((b) => (
                <Check key={b.key} label={b.key} color={bandColor(b.key)} checked={isActive(filters.bands, [b.code])} onChange={() => setBand(b.code)} />
              ))}
            </Section>
            <Section title={t("mapWorkspace.siteTypes")}>
              {["macro", "indoor", "smallCell"].map((k) => (
                <Check key={k} label={t(`mapWorkspace.${k}`)} checked={false} disabled onChange={() => {}} />
              ))}
              <p className="text-[10px] text-muted-foreground">{t("mapWorkspace.siteTypesUnavailable")}</p>
            </Section>
            <Section title={t("mapWorkspace.heatmap")}>
              <Check label={t("mapWorkspace.heatmap")} checked={false} disabled onChange={() => {}} hint={t("mapWorkspace.heatmapUnavailable")} />
            </Section>
            {compact && <Section title={t("mapWorkspace.legend")}>{legend}</Section>}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label={t("mapWorkspace.expandLayers")}
          className={`pointer-events-auto absolute left-3 top-3 flex h-10 items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold ${glass}`}
        >
          <Layers className="h-4 w-4" /> {!compact && t("mapWorkspace.layers")}
        </button>
      )}

      {/* Top — floating filter toolbar */}
      <div
        className="pointer-events-none absolute top-3 flex justify-center"
        style={{ left: showPanel && !compact ? 248 : compact ? 64 : 140, right: compact ? 56 : 380 }}
      >
        <div data-testid="map-workspace-topbar" className={`pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl p-1 ${glass}`}>
          <button type="button" aria-pressed={enabled} onClick={() => onToggleEnabled(!enabled)} className={pill(enabled)}>
            <MapPin className="h-3.5 w-3.5" /> {t("mapWorkspace.sites")}
          </button>
          <button
            type="button"
            aria-pressed={cellsEnabled}
            disabled={!cellsAvailable}
            title={cellsAvailable ? t("mapSites.showCells") : t("mapSites.cellsFromZoom")}
            onClick={() => onToggleCells(!cellsEnabled)}
            className={pill(cellsEnabled && cellsAvailable)}
          >
            <Antenna className="h-3.5 w-3.5" /> {t("mapWorkspace.cells")}
          </button>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <div className="flex shrink-0 gap-0.5" role="group" aria-label={t("mapWorkspace.technology")}>
            {TECHNO_CODES.map((code) => (
              <button key={code} type="button" aria-pressed={isActive(filters.technos, [code])} onClick={() => (onSetTechnos ? setTechnos([code]) : onToggleTechno(code))} className={pill(isActive(filters.technos, [code]))}>
                {code}
              </button>
            ))}
          </div>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <Dropdown
            open={menu === "bands"}
            onOpen={(o) => setMenu(o ? "bands" : null)}
            label={`${t("mapWorkspace.bands")} (${filters.bands.length || t("common.all")})`}
          >
            {NETWORK_BANDS.map((b) => (
              <MenuCheck key={b.key} label={b.key} color={bandColor(b.key)} checked={isActive(filters.bands, [b.code])} onClick={() => setBand(b.code)} />
            ))}
          </Dropdown>
          <Dropdown
            open={menu === "operator"}
            onOpen={(o) => setMenu(o ? "operator" : null)}
            label={`${t("mapSites.operator")} (${filters.operators.length || t("common.all")})`}
          >
            {OPERATORS.map((o) => (
              <MenuCheck key={o.v} label={o.label} color={o.color} checked={isActive(filters.operators, [o.v])} onClick={() => onToggleOperator(o.v)} />
            ))}
          </Dropdown>
          <button type="button" onClick={() => setPanelOpen(!showPanel)} className={pill(false)}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> {!compact && t("mapWorkspace.moreFilters")}
            {filterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[9px] text-primary-foreground">{filterCount}</span>}
          </button>
          {filterCount > 0 && onReset && (
            <button type="button" onClick={onReset} className={pill(false)} aria-label={t("common.reset")}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Top-right — floating search */}
      {(!compact || searchOpen) && (
        <div className={`pointer-events-auto absolute top-3 ${compact ? "left-3 right-14" : "right-14 w-[300px]"}`}>
          <label className={`flex h-10 items-center gap-2 rounded-xl px-3 ${glass}`}>
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("mapWorkspace.searchPlaceholder")}
              aria-label={t("mapWorkspace.search")}
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" aria-label={t("mapWorkspace.clearSearch")} onClick={() => setQuery("")}>
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
                      map?.flyTo({ center: h.center, zoom: Math.max(map.getZoom(), h.kind === "coords" ? 14 : 15) });
                      setQuery("");
                      setSearchOpen(false);
                    }}
                    className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                  >
                    <span className="font-semibold">{h.kind === "coords" ? t("mapWorkspace.goToCoordinates", { v: h.title }) : h.title}</span>
                    {h.subtitle && <span className="text-[10px] text-muted-foreground">{h.subtitle}</span>}
                  </button>
                </li>
              ))}
              {!hits.length && <li className="px-2 py-1.5 text-[11px] text-muted-foreground">{t("mapWorkspace.searchNoResult")}</li>}
            </ul>
          )}
        </div>
      )}

      {/* Right — vertical map tools */}
      <div className={`pointer-events-auto absolute right-3 top-3 flex flex-col gap-1 rounded-xl p-1 ${glass}`} role="toolbar" aria-orientation="vertical" aria-label={t("mapWorkspace.tools")}>
        {compact && (
          <button type="button" className={railBtn(searchOpen)} aria-label={t("mapWorkspace.search")} onClick={() => setSearchOpen((v) => !v)}>
            <Search className="h-4 w-4" />
          </button>
        )}
        <button type="button" className={railBtn(props.fullscreen)} aria-label={props.fullscreen ? t("mapWorkspace.exitFullscreen") : t("mapWorkspace.fullscreen")} onClick={props.onToggleFullscreen}>
          {props.fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button type="button" className={railBtn()} aria-label={t("mapWorkspace.zoomIn")} onClick={() => map?.zoomIn()}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" className={railBtn()} aria-label={t("mapWorkspace.zoomOut")} onClick={() => map?.zoomOut()}>
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" className={railBtn()} aria-label={t("mapWorkspace.center")} onClick={props.onRecenter}>
          <LocateFixed className="h-4 w-4" />
        </button>
        <button type="button" className={railBtn(mode === "distance")} aria-pressed={mode === "distance"} aria-label={t("mapWorkspace.distance")} onClick={() => startMeasure("distance")}>
          <Ruler className="h-4 w-4" />
        </button>
        <button type="button" className={railBtn(mode === "area")} aria-pressed={mode === "area"} aria-label={t("mapWorkspace.area")} onClick={() => startMeasure("area")}>
          <Spline className="h-4 w-4" />
        </button>
        <button type="button" className={railBtn(mode === "none")} aria-pressed={mode === "none"} aria-label={t("mapWorkspace.select")} onClick={() => setMode("none")}>
          <MousePointer2 className="h-4 w-4" />
        </button>
        <button type="button" className={railBtn(showPanel)} aria-pressed={showPanel} aria-label={t("mapWorkspace.toggleLayers")} onClick={() => setPanelOpen(!showPanel)}>
          <Layers className="h-4 w-4" />
        </button>
      </div>

      {/* Measurement read-out */}
      {mode !== "none" && (
        <div className={`pointer-events-auto absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] ${glass}`} role="status">
          <Ruler className="h-3.5 w-3.5 text-primary" />
          <strong className="tabular-nums">{points.length ? measureValue : t("mapWorkspace.measureHint")}</strong>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setPoints([])}>
            {t("mapWorkspace.clearMeasure")}
          </button>
          <button type="button" aria-label={t("mapWorkspace.select")} onClick={() => setMode("none")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Bottom-left — legend */}
      {!compact && (
        <div className={`pointer-events-auto absolute bottom-3 left-3 rounded-xl px-3 py-2 ${glass}`} aria-label={t("mapWorkspace.legend")}>
          {legend}
        </div>
      )}

      {/* Bottom — status bar */}
      <div className={`pointer-events-none absolute bottom-3 flex justify-center ${compact ? "left-3 right-3" : "left-1/2 -translate-x-1/2"}`}>
        <div data-testid="map-workspace-statusbar" className={`pointer-events-auto flex max-w-full items-center gap-3 overflow-x-auto whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] ${glass}`}>
          <Stat value={fmt(status?.n_sites)} label={t("mapWorkspace.visibleSites")} />
          <Stat value={fmt(status?.n_cells)} label={t("mapWorkspace.visibleCells")} />
          <span className="h-6 w-px bg-border" />
          <span className="tabular-nums">
            <span className="text-muted-foreground">Z </span>
            <strong className="text-sm">{zoom.toFixed(1)}</strong>
          </span>
          {!compact && (
            <span className="inline-flex min-w-[118px] items-center gap-1 tabular-nums text-muted-foreground" title={t("mapWorkspace.cursor")}>
              <Crosshair className="h-3 w-3" />
              {cursor ? `${cursor[1].toFixed(4)}, ${cursor[0].toFixed(4)}` : "—"}
            </span>
          )}
          <span className="flex flex-col items-center text-[10px]" title={t("mapWorkspace.scale")}>
            {scale.label}
            <span className="h-1 border-x border-b border-foreground" style={{ width: scale.px }} />
          </span>
          <span className={`h-2 w-2 rounded-full ${status?.loading ? "animate-pulse bg-primary" : status?.error ? "bg-destructive" : "bg-muted-foreground/40"}`} title={status?.error ?? (status?.loading ? t("mapSites.loading") : t("mapWorkspace.ready"))} />
          <Dropdown up open={menu === "metrics"} onOpen={(o) => setMenu(o ? "metrics" : null)} label={<><BarChart3 className="h-3.5 w-3.5" />{!compact && t("mapWorkspace.metrics")}</>}>
            <div className="space-y-1 p-2 text-[11px]">
              <Row label={t("mapWorkspace.totalInView")} value={fmt(status?.n_total)} />
              <Row label={t("mapWorkspace.returned")} value={fmt(status?.n_returned)} />
              {status?.truncated && <p className="text-[10px] text-destructive">{t("mapSites.partial")}</p>}
              {status?.error && <p className="text-[10px] text-destructive">{t("mapSites.error")}: {status.error}</p>}
              <p className="text-[10px] text-muted-foreground">{t("mapWorkspace.heatmapUnavailable")}</p>
            </div>
          </Dropdown>
          <Dropdown up open={menu === "tools"} onOpen={(o) => setMenu(o ? "tools" : null)} label={<><Settings2 className="h-3.5 w-3.5" />{!compact && t("mapWorkspace.tools")}</>}>
            <MenuItem onClick={() => startMeasure("distance")}>{t("mapWorkspace.distance")}</MenuItem>
            <MenuItem onClick={() => startMeasure("area")}>{t("mapWorkspace.area")}</MenuItem>
            <MenuItem onClick={() => { setPoints([]); setMode("none"); setMenu(null); }}>{t("mapWorkspace.clearMeasure")}</MenuItem>
            <MenuItem onClick={() => { props.onRecenter?.(); setMenu(null); }}>{t("mapWorkspace.center")}</MenuItem>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mb-1 flex w-full items-center justify-between font-semibold">
        {title}
        <ChevronDown className={`h-3 w-3 transition ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="space-y-0.5 pl-1">{children}</div>}
    </section>
  );
}

function Check({ label, checked, onChange, disabled, color, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; color?: string; hint?: string | undefined }) {
  return (
    <label className={`flex items-center gap-2 rounded px-1 py-0.5 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-muted"}`} title={hint}>
      <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
      <span className="flex-1">{label}</span>
    </label>
  );
}

function Dropdown({ label, open, onOpen, children, up = false }: { label: ReactNode; open: boolean; onOpen: (o: boolean) => void; children: ReactNode; up?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onOpen]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-expanded={open} onClick={() => onOpen(!open)} className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold hover:bg-muted">
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className={`fixed z-50 min-w-44 rounded-xl border bg-popover p-1 shadow-xl`} style={dropdownPos(ref.current, up)}>
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
  return up ? { left: r.left, bottom: window.innerHeight - r.top + 6 } : { left: r.left, top: r.bottom + 6 };
}

function MenuCheck({ label, checked, onClick, color }: { label: string; checked: boolean; onClick: () => void; color?: string }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-muted">
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      <span className="flex-1">{label}</span>
      <span aria-hidden className="text-primary">{checked ? "✓" : ""}</span>
    </button>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-muted">
      {children}
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <strong className="text-sm tabular-nums">{value}</strong>
      <span className="text-[10px] text-muted-foreground">{label}</span>
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

function LegendRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 font-semibold">{title}</p>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">{children}</div>
    </div>
  );
}

function Swatch({ color, label, round, hideLabel }: { color: string; label: string; round?: boolean; hideLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <span className={`h-2.5 w-2.5 ${round ? "rounded-full" : "rounded-sm"}`} style={{ background: color }} aria-label={hideLabel ? label : undefined} />
      {!hideLabel && label}
    </span>
  );
}
