import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Map as MlMap, MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { getMetricAnalysis, getMetricCaptures, getSignaling } from "@/lib/api/client";
import { Eye, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RsrpDiagnosisDialog } from "./RsrpDiagnosisDialog";
import {
  driveRsrpDiagnostics,
  driveRsrpPoints,
  RSRP_CLASSES,
  RSRP_SELECTION,
  rsrpClass,
  rsrpPositionsFrom,
  type RsrpPosition,
} from "./drive-rsrp";

const SOURCE = "bc4-drive-rsrp";
const LAYER = "bc4-drive-rsrp";
const STORE = "bc4.map.driveRsrp.v1";
const LAST_CAPTURE_STORE = "bc4.driveRsrp.lastCapture";
const SIZE_STORE = "bc4.map.driveRsrpSize.v1";
const INTENSITY_STORE = "bc4.map.driveRsrpIntensity.v1";

function readPrefs(store: string): { on: boolean; cell: string | null } {
  try {
    const raw = localStorage.getItem(store);
    if (!raw) return { on: false, cell: null };
    const v = JSON.parse(raw) as { on?: boolean; cell?: string | null };
    return { on: Boolean(v.on), cell: v.cell ?? null };
  } catch {
    return { on: false, cell: null };
  }
}

/** Drive-test RSRP overlay: the measured values of one capture, drawn at the
 * position the server tied to each measurement. Off by default; the camera is
 * only moved for a capture whose trajectory is unknown to the map. */
export function DriveRsrpLayer({
  map,
  projectId,
  activeCaptureId,
  autoFrame = true,
  positions,
  store = STORE,
  lastKey = LAST_CAPTURE_STORE,
}: {
  map: MlMap | null;
  projectId: string;
  /** Embedded mode (Signaling View): the capture is the page's own, never chosen here. */
  activeCaptureId?: string;
  /** Auto-frame is only allowed when the map has no trajectory of its own. */
  autoFrame?: boolean;
  /** Capture positions the page already holds, used when a row carries no GPS of its own. */
  positions?: RsrpPosition[];
  /** Separate preference store so a page-level toggle never changes another page's. */
  store?: string;
  /** Separate last-capture store: remembering a capture must not move another page. */
  lastKey?: string;
}) {
  const { t } = useTranslation();
  const embedded = Boolean(activeCaptureId);
  const [prefs, setPrefs] = useState(() => readPrefs(store));
  const [size, setSize] = useState(() => {
    const v = Number(localStorage.getItem(SIZE_STORE));
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 6;
  });
  const [intensity, setIntensity] = useState(() => {
    const v = Number(localStorage.getItem(INTENSITY_STORE));
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 75;
  });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIZE_STORE, String(size));
    } catch {
      /* private mode */
    }
  }, [size]);
  useEffect(() => {
    try {
      localStorage.setItem(INTENSITY_STORE, String(intensity));
    } catch {
      /* private mode */
    }
  }, [intensity]);

  const captures = useQuery({
    queryKey: ["metric-captures", projectId],
    queryFn: ({ signal }) => getMetricCaptures(projectId, signal),
    enabled: Boolean(projectId) && !embedded,
    staleTime: 60_000,
  });
  const captureId = activeCaptureId ?? prefs.cell ?? "";
  const analysis = useQuery({
    queryKey: ["drive-rsrp", projectId, captureId],
    queryFn: ({ signal }) =>
      getMetricAnalysis(projectId, captureId, [RSRP_SELECTION], {}, { group_by: "operator", include_map: true }, signal),
    enabled: Boolean(projectId) && prefs.on && Boolean(captureId),
    staleTime: 30_000,
  });

  /** What arrived before any pairing: decides whether the capture's GPS log is even needed. */
  const bare = useMemo(() => driveRsrpDiagnostics(analysis.data), [analysis.data]);
  const needsGps =
    prefs.on &&
    !embedded &&
    Boolean(captureId) &&
    !positions?.length &&
    bare.rowsWithRsrp > 0 &&
    bare.rowsWithGps === 0;

  /** Positions the server published for this capture (same view the Signaling map draws). */
  const gps = useQuery({
    queryKey: ["drive-rsrp-gps", projectId, captureId],
    queryFn: ({ signal }) =>
      getSignaling(projectId, "points", { capture_id: captureId }, signal),
    enabled: needsGps,
    staleTime: 60_000,
  });

  const allPositions = useMemo<RsrpPosition[]>(() => {
    if (positions?.length) return positions;
    if (!gps.data) return [];
    return rsrpPositionsFrom(gps.data.points, gps.data.markers);
  }, [positions, gps.data]);

  const features = useMemo(
    () => driveRsrpPoints(analysis.data, allPositions),
    [analysis.data, allPositions],
  );
  const diag = useMemo(
    () => driveRsrpDiagnostics(analysis.data, allPositions),
    [analysis.data, allPositions],
  );

  /** The remembered capture is only kept when it really produced points: a
   * capture that yields nothing must never come back as the default view. */
  useEffect(() => {
    if (embedded || !captureId || !features.length) return;
    try {
      localStorage.setItem(lastKey, captureId);
    } catch {
      /* private mode */
    }
  }, [embedded, captureId, features.length, lastKey]);

  /* --- source + layer, rebuilt with the map --- */
  const mounted = useRef(false);
  useEffect(() => {
    if (!map) {
      mounted.current = false;
      return;
    }
    if (mapRef.current === map && mounted.current) return;
    mapRef.current = map;
    let cancelled = false;
    const render = async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !map.isStyleLoaded()) return;
      if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: "geojson", data: EMPTY });
      if (!map.getLayer(LAYER))
        map.addLayer({
          id: LAYER,
          type: "circle",
          source: SOURCE,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2, 16, 7],
            "circle-color": [
              "match",
              ["get", "rsrp_class"],
              "excellent", "#16a34a",
              "good", "#84cc16",
              "fair", "#facc15",
              "poor", "#f97316",
              "bad", "#dc2626",
              "#94a3b8",
            ],
            "circle-opacity": 0.75,
            "circle-stroke-width": 0.6,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.9,
          },
        });
      mounted.current = true;
    };
    if (map.isStyleLoaded()) void render();
    else map.once("styledata", () => void render());
    return () => {
      cancelled = true;
    };
  }, [map]);

  /* --- data --- */
  const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mounted.current) return;
    const src = m.getSource(SOURCE) as { setData: (d: FeatureCollection) => void } | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: features.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: {
          value: p.value,
          unit: analysis.data?.unit ?? "dBm",
          capture_id: analysis.data?.capture_id ?? captureId,
          seq: p.seq,
          cell: p.cell,
          rsrp_class: rsrpClass(p.value),
          position_source: p.position_source,
        },
      })),
    });
  }, [features, analysis.data, captureId]);

  /* --- frame --- */
  const frame = useCallback(() => {
    const m = mapRef.current;
    if (!m || !features.length) return;
    const lngs = features.map((p) => p.lng);
    const lats = features.map((p) => p.lat);
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, maxZoom: 16, duration: 700 },
    );
  }, [features]);

  /** Only when the map has no trajectory to show: a capture already on the
   * screen keeps the investigator's camera. */
  useEffect(() => {
    if (!autoFrame || !prefs.on || analysis.isFetching || !features.length) return;
    const timer = window.setTimeout(frame, 80);
    return () => window.clearTimeout(timer);
  }, [autoFrame, prefs.on, analysis.isFetching, features.length, frame]);

  /* --- visibility --- */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mounted.current) return;
    m.setLayoutProperty(LAYER, "visibility", prefs.on && features.length ? "visible" : "none");
  }, [prefs.on, features.length]);

  /* --- click popup --- */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const onClick = (e: {
      point: { x: number; y: number };
      target: MlMap;
      originalEvent: MouseEvent;
    }) => {
      const ml = (globalThis as { maplibregl?: { Popup: new (o: object) => { setLngLat: (l: [number, number]) => { addTo: (m: MlMap) => { remove: () => void } } } } }).maplibregl;
      if (!ml) return;
      const hits = m.queryRenderedFeatures(e.point, { layers: [LAYER] }) as {
        geometry: { coordinates: [number, number] };
        properties: Record<string, string | number | null | undefined>;
      }[];
      if (!hits.length) return;
      const p = hits[0]!.properties;
      const el = document.createElement("div");
      el.style.cssText = "font:12px/1.55 ui-sans-serif,system-ui;white-space:pre-line";
      el.textContent =
        t("mapWorkspace.driveRsrpPopup", {
          value: p["value"],
          unit: p["unit"] || "dBm",
          capture: p["capture_id"],
          seq: p["seq"],
        }) +
        "\n" +
        t("mapWorkspace.driveRsrpPopupCell", { cell: p["cell"] ?? 0 }) +
        "\n" +
        t(
          p["position_source"] === "capture"
            ? "mapWorkspace.driveRsrpPopupPosCapture"
            : "mapWorkspace.driveRsrpPopupPosRow",
        );
      const popup = new ml.Popup({ closeButton: false, closeOnClick: true, offset: 8 })
        .setLngLat(hits[0]!.geometry.coordinates)
        .setDOMContent(el)
        .addTo(m);
      const close = (ev: Event) => {
        const target = ev.target as HTMLElement | null;
        if (!target?.closest?.(".maplibregl-popup")) popup.remove();
        else if (target.getAttribute("data-popup-close-button") !== null) popup.remove();
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") popup.remove();
      };
      window.addEventListener("pointerdown", close, true);
      window.addEventListener("keydown", onKey);
      const stop = () => {
        window.removeEventListener("pointerdown", close, true);
        window.removeEventListener("keydown", onKey);
      };
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
      });
      popup.on("remove", stop);
    };
    m.on("click", onClick);
    return () => {
      m.off("click", onClick);
    };
  }, [t]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(RSRP_CLASSES.map((k) => [k.id, 0])) as Record<string, number>;
    for (const f of features) {
      const id = rsrpClass(f.value);
      if (id) c[id] = (c[id] ?? 0) + 1;
    }
    return c;
  }, [features]);

  const diagStatus = useMemo(
    () => ({
      capture: captureId || t("mapWorkspace.driveRsrpNone"),
      request: RSRP_SELECTION,
      rows: diag.rows,
      rowsWithRsrp: diag.rowsWithRsrp,
      rowsWithGps: diag.rowsWithGps,
      pairedPositions: diag.paired,
      mapPoints: diag.mapPoints,
      rsrpPoints: diag.rsrpMapPoints,
      numericRsrp: driveRsrpPoints(analysis.data).length,
      displayed: features.length,
      gpsMarkers: allPositions.length,
    }),
    [captureId, diag, analysis.data, features.length, allPositions.length, t],
  );

  const failure = (captures.error ?? analysis.error ?? (needsGps ? gps.error : null)) as
    | Error
    | null;
  const status = !prefs.on
    ? null
    : failure
      ? String(failure.message || "—")
      : (captures.isLoading || analysis.isLoading || (needsGps && gps.isPending)) &&
          (captures.isFetching || analysis.isFetching || (needsGps && gps.isFetching))
        ? t("common.loadingShort")
        : !captures.data?.length
          ? t("mapWorkspace.driveRsrpNone")
          : !diag.rows
            ? t("mapWorkspace.driveRsrpNoRows")
            : !diag.rowsWithRsrp
              ? t("mapWorkspace.driveRsrpNoValue")
              : !features.length
                ? t("mapWorkspace.driveRsrpNoGps")
                : t("mapWorkspace.driveRsrpCount", { count: features.length });

  const refresh = () => {
    setBusy(true);
    void analysis.refetch().finally(() => setBusy(false));
  };

  const on = useDebouncedValue(prefs.on, 150);
  const cell = useDebouncedValue(prefs.cell, 200);
  useEffect(() => {
    const next = JSON.stringify({ on, cell });
    if (localStorage.getItem(store) !== next) localStorage.setItem(store, next);
  }, [on, cell, store]);


  const radius = 1 + (size / 100) * 14;
  const stroke = 0.15 + (size / 100) * 1.2;
  const alpha = 0.1 + (intensity / 100) * 0.9;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        className="absolute bottom-3 right-3 z-20 w-[min(280px,calc(100vw-2rem))] overflow-hidden rounded-md border bg-card text-card-foreground shadow-lg"
        data-testid="drive-rsrp-panel"
      >
        <div className="flex h-9 items-center gap-2 border-b px-2">
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("mapWorkspace.driveRsrpTitle")}
            >
              <Layers className="size-3.5" />
            </Button>
          </DialogTrigger>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">
            {t("mapWorkspace.driveRsrpTitle")}
          </span>
          <Switch
            checked={prefs.on}
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, on: v }))}
            aria-label={t("mapWorkspace.driveRsrpTitle")}
            className="scale-90"
          />
        </div>
        {prefs.on && (
          <div className="space-y-2 p-2">
            {!embedded && (
              <>
                <label className="block space-y-0.5">
                  <span className="text-[11px] text-muted-foreground">
                    {t("mapWorkspace.driveRsrpCapture")}
                  </span>
                  <select
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                    value={prefs.cell ?? ""}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, cell: e.target.value || null }))
                    }
                    disabled={captures.isLoading}
                  >
                    <option value="">
                      {captures.isLoading ? t("common.loadingShort") : t("common.select")}
                    </option>
                    {captures.data?.map((c) => (
                      <option key={c.capture_id} value={c.capture_id}>
                        {c.label || c.capture_id}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 gap-1 text-[11px]"
                    onClick={frame}
                    disabled={!features.length}
                  >
                    <Eye className="size-3" />
                    {t("mapWorkspace.driveRsrpFrame")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={refresh}
                    disabled={busy || !captureId}
                    aria-label={t("mapWorkspace.driveRsrpRefresh")}
                  >
                    <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </>
            )}
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{t("mapWorkspace.driveRsrpSize")}</span>
                <span className="tabular-nums">{size}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                aria-label={t("mapWorkspace.driveRsrpSize")}
                className="h-1 w-full accent-primary"
              />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{t("mapWorkspace.driveRsrpIntensity")}</span>
                <span className="tabular-nums">{intensity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                aria-label={t("mapWorkspace.driveRsrpIntensity")}
                className="h-1 w-full accent-primary"
              />
            </div>
            <div className="space-y-0.5">
              {RSRP_CLASSES.map((k) => (
                <div key={k.id} className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: k.color }}
                    aria-hidden
                  />
                  <span className="text-muted-foreground">
                    {t(`mapWorkspace.driveRsrpClass.${k.id}`)}
                  </span>
                  <span className="ml-auto tabular-nums">{counts[k.id] ?? 0}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{status}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1 text-[11px]"
              onClick={() => setDiagnosisOpen(true)}
            >
              {t("rsrpDiagnosis.open")}
            </Button>
          </div>
        )}
      </div>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("mapWorkspace.driveRsrpTitle")}</DialogTitle>
          <DialogDescription>{t("mapWorkspace.driveRsrpHelp")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-xs">
          {RSRP_CLASSES.map((k) => (
            <div key={k.id} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: k.color }}
                aria-hidden
              />
              <span className="text-muted-foreground">
                {t(`mapWorkspace.driveRsrpClass.${k.id}`)}
              </span>
              <span className="ml-auto tabular-nums">
                {k.min === -Infinity ? "< -110 dBm" : `≥ ${k.min} dBm`}
              </span>
            </div>
          ))}
          <div className="h-px bg-border" />
          {Object.entries(diagStatus).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t(`rsrpDiagnosis.status_${k}`)}</span>
              <span className="tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      </DialogContent>
      <RsrpDiagnosisDialog
        open={diagnosisOpen}
        onOpenChange={setDiagnosisOpen}
        status={diagStatus}
      />
    </Dialog>
  );
}
