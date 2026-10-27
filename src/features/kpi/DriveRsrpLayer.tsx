import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Map as MlMap, GeoJSONSource, MapLayerMouseEvent, Popup } from "maplibre-gl";
import { getMetricAnalysis, getSignaling } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RsrpDiagnosisDialog } from "./RsrpDiagnosisDialog";
import {
  RSRP_CLASSES,
  RSRP_SELECTION,
  driveRsrpDiagnostics,
  driveRsrpPoints,
  rsrpClass,
  rsrpPositionsFrom,
  type RsrpClassId,
  type RsrpPosition,
} from "./drive-rsrp";

const SOURCE = "bc4-drive-rsrp";
const LAYER = "bc4-drive-rsrp-points";
const LINK_SOURCE = "bc4-drive-rsrp-serving-links";
const LINK_LAYER = "bc4-drive-rsrp-serving-links";
// v2 enables the measurement layer on first use. The dedicated Map page is
// expected to open on real radio points rather than on an empty basemap.
const STORE = "bc4.map.driveRsrp.v2";

type Prefs = { on: boolean; opacity: number; hidden: RsrpClassId[] };
const DEFAULT: Prefs = { on: true, opacity: 90, hidden: [] };
const LAST_CAPTURE_STORE = "bc4.driveRsrp.lastCapture";

function readPrefs(store: string, defaults: Prefs): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(store) ?? "{}") };
  } catch {
    return defaults;
  }
}

/** Toggleable drive RSRP points with legend and per-class visibility. */
export function DriveRsrpLayer({
  map,
  projectId,
  activeCaptureId,
  autoFrame = true,
  positions,
}: {
  map: MlMap | null;
  projectId: string;
  activeCaptureId?: string;
  autoFrame?: boolean;
  /** Capture positions the page already holds, used when a row carries no GPS of its own. */
  positions?: RsrpPosition[];
}) {
  const { t } = useTranslation();
  const embedded = activeCaptureId !== undefined;
  // v2 deliberately resets the embedded Signaling preference once: older
  // sessions may have persisted the layer OFF before it became the primary
  // map measurement. Signaling now opens with real RSRP visible and framed.
  const store = embedded ? "bc4.signaling.driveRsrp.v2" : STORE;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [open, setOpen] = useState(false);
  const [captureId, setCaptureId] = useState<string>();
  const [diagOpen, setDiagOpen] = useState(false);
  const explicitCapture = useRef(false);
  const automaticRecoveryAttempted = useRef(false);
  const previousProjectId = useRef(projectId);
  const [automaticRecovery, setAutomaticRecovery] = useState<{
    from: string;
    to: string;
  }>();
  useEffect(() => setPrefs(readPrefs(store, DEFAULT)), [store]);
  useEffect(() => {
    if (previousProjectId.current === projectId) return;
    previousProjectId.current = projectId;
    explicitCapture.current = false;
    automaticRecoveryAttempted.current = false;
    setAutomaticRecovery(undefined);
    setCaptureId(undefined);
  }, [projectId]);
  const update = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      localStorage.setItem(store, JSON.stringify(next));
      return next;
    });

  const captures = useQuery({
    queryKey: ["map-captures", projectId],
    queryFn: ({ signal }) =>
      getSignaling(projectId, "captures", {}, signal).then((response) => response.captures),
    enabled: prefs.on && !embedded,
  });
  const lastKey = `${LAST_CAPTURE_STORE}.${projectId}`;
  const preferredCapture = useMemo(() => {
    if (embedded || !captures.data?.length) return undefined;
    const fromUrl = new URLSearchParams(window.location.search).get("capture_id");
    const last = localStorage.getItem(lastKey);
    const has = (id: string | null) => captures.data.find((c) => c.capture_id === id)?.capture_id;
    const urlCapture = has(fromUrl);
    return urlCapture
      ? { id: urlCapture, explicit: true }
      : has(last)
        ? { id: has(last)!, explicit: false }
        : undefined;
  }, [captures.data, embedded, lastKey]);
  useEffect(() => {
    if (embedded || captureId || !captures.data?.length) return;
    // Environment is source metadata. Prefer one drive capture, then load
    // only that capture's rows; never probe every session for GPS.
    const drive = captures.data.find((capture) => capture.env === "incar")?.capture_id;
    explicitCapture.current = preferredCapture?.explicit ?? false;
    setCaptureId(preferredCapture?.id ?? drive ?? captures.data[0]?.capture_id);
  }, [captureId, captures.data, embedded, preferredCapture]);
  const effectiveCaptureId = activeCaptureId ?? captureId;
  const analysis = useQuery({
    queryKey: ["drive-rsrp", projectId, effectiveCaptureId],
    queryFn: ({ signal }) => {
      if (!effectiveCaptureId) throw new Error("Missing capture");
      return getMetricAnalysis(
        projectId,
        effectiveCaptureId,
        [RSRP_SELECTION],
        {},
        { group_by: "operator", include_map: true },
        signal,
      );
    },
    enabled: prefs.on && !!effectiveCaptureId,
    staleTime: 60_000,
  });
  /** What arrived before any pairing: decides whether the capture's GPS log is even needed. */
  const bare = useMemo(() => driveRsrpDiagnostics(analysis.data), [analysis.data]);
  const needsGps =
    prefs.on && !embedded && !positions?.length && bare.rowsWithRsrp > 0 && bare.rowsWithGps === 0;

  /** Positions the server published for this capture (the same view the Signaling map draws). */
  const gps = useQuery({
    queryKey: ["drive-rsrp-gps", projectId, effectiveCaptureId],
    queryFn: ({ signal }) => {
      if (!effectiveCaptureId) throw new Error("Missing capture");
      return getSignaling(projectId, "points", { capture_id: effectiveCaptureId }, signal);
    },
    enabled: needsGps,
    staleTime: 60_000,
  });
  const allPositions = useMemo<RsrpPosition[]>(() => {
    if (positions?.length) return positions;
    if (!gps.data) return [];
    return rsrpPositionsFrom(gps.data.points, gps.data.markers);
  }, [positions, gps.data]);

  const features = useMemo(
    () =>
      driveRsrpPoints(analysis.data, allPositions).map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] as [number, number] },
        properties: {
          value: p.value,
          seq: p.seq,
          capture_id: effectiveCaptureId,
          unit: "dBm",
          rsrp_class: rsrpClass(p.value),
          cell: p.cell,
          position_source: p.position_source,
          serving_cell_id: p.serving_cell_id,
          serving_cell_seq: p.serving_cell_seq,
          serving_cell_ref_id: p.serving_cell_ref_id,
          serving_site_id: p.serving_site_id,
          serving_site_name: p.serving_site_name,
        },
      })),
    [analysis.data, allPositions, effectiveCaptureId],
  );
  const linkFeatures = useMemo(
    () =>
      driveRsrpPoints(analysis.data, allPositions).flatMap((p) =>
        typeof p.serving_cell_lat === "number" && typeof p.serving_cell_lng === "number"
          ? [
              {
                type: "Feature" as const,
                geometry: {
                  type: "LineString" as const,
                  coordinates: [
                    [p.lng, p.lat],
                    [p.serving_cell_lng, p.serving_cell_lat],
                  ],
                },
                properties: {
                  seq: p.seq,
                  serving_cell_id: p.serving_cell_id,
                  serving_cell_seq: p.serving_cell_seq,
                  serving_cell_ref_id: p.serving_cell_ref_id,
                  serving_site_id: p.serving_site_id,
                  serving_site_name: p.serving_site_name,
                  proof: p.serving_cell_source,
                },
              },
            ]
          : [],
      ),
    [analysis.data, allPositions],
  );

  const diag = useMemo(
    () => driveRsrpDiagnostics(analysis.data, allPositions),
    [analysis.data, allPositions],
  );

  // A remembered/default capture may be a valid session with no geolocated
  // RSRP. Try drive captures one at a time until one produces real points.
  // URL and dropdown choices are explicit and are therefore never replaced.
  useEffect(() => {
    if (
      embedded ||
      explicitCapture.current ||
      automaticRecoveryAttempted.current ||
      !effectiveCaptureId ||
      !analysis.isSuccess ||
      (needsGps && !gps.isSuccess) ||
      features.length > 0
    )
      return;

    automaticRecoveryAttempted.current = true;
    localStorage.removeItem(lastKey);
    const driveCaptures = captures.data?.filter((capture) => capture.env === "incar") ?? [];
    const currentIndex = driveCaptures.findIndex(
      (capture) => capture.capture_id === effectiveCaptureId,
    );
    const next = driveCaptures[currentIndex >= 0 ? currentIndex + 1 : 0]?.capture_id;
    if (!next) return;

    setAutomaticRecovery({ from: effectiveCaptureId, to: next });
    setCaptureId(next);
  }, [
    analysis.isSuccess,
    captures.data,
    effectiveCaptureId,
    embedded,
    features.length,
    gps.isSuccess,
    lastKey,
    needsGps,
  ]);

  // The capture investigated in Signaling (or picked on Map) is reused by the
  // other map, so switching pages keeps showing the same drive — but only when
  // it really produced points: an empty capture must never come back as default.
  useEffect(() => {
    if (effectiveCaptureId && features.length) localStorage.setItem(lastKey, effectiveCaptureId);
  }, [effectiveCaptureId, features.length, lastKey]);

  // Source + layer (added once the style is parsed, kept across basemap changes).
  useEffect(() => {
    if (!map) return;
    const add = () => {
      if (!map.getSource(LINK_SOURCE)) {
        map.addSource(LINK_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: LINK_LAYER,
          type: "line",
          source: LINK_SOURCE,
          paint: {
            "line-color": "#2563eb",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 14, 1.25, 18, 2],
            "line-opacity": 0.32,
          },
        });
      }
      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        const before = map.getStyle()?.layers?.find((l) => l.id.startsWith("bc4-sites"))?.id;
        map.addLayer(
          {
            id: LAYER,
            type: "circle",
            source: SOURCE,
            filter: ["!=", ["get", "rsrp_class"], null],
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 4, 18, 7],
              "circle-color": [
                "match",
                ["get", "rsrp_class"],
                ...RSRP_CLASSES.flatMap((c) => [c.id, c.color]),
                "#94a3b8",
              ] as unknown as string,
              "circle-stroke-width": 0,
            },
          },
          before,
        );
      }
      const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
      source?.setData({ type: "FeatureCollection", features: prefs.on ? features : [] });
      const linkSource = map.getSource(LINK_SOURCE) as GeoJSONSource | undefined;
      linkSource?.setData({
        type: "FeatureCollection",
        features: prefs.on ? linkFeatures : [],
      });
      if (map.getLayer(LINK_LAYER))
        map.setLayoutProperty(LINK_LAYER, "visibility", prefs.on ? "visible" : "none");
      if (!map.getLayer(LAYER)) return;
      map.setLayoutProperty(LAYER, "visibility", prefs.on ? "visible" : "none");
      map.setPaintProperty(LAYER, "circle-opacity", prefs.opacity / 100);
      map.setFilter(LAYER, [
        "all",
        ["!=", ["get", "rsrp_class"], null],
        ["!", ["in", ["get", "rsrp_class"], ["literal", prefs.hidden]]],
      ]);
    };
    if (map.getStyle?.() || map.isStyleLoaded()) add();
    else map.once("load", add);
    return () => {
      map.off("load", add);
    };
  }, [map, features, linkFeatures, prefs]);

  useEffect(() => {
    const src = map?.getSource(SOURCE) as GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: prefs.on ? features : [] });
    const links = map?.getSource(LINK_SOURCE) as GeoJSONSource | undefined;
    links?.setData({ type: "FeatureCollection", features: prefs.on ? linkFeatures : [] });
  }, [map, features, linkFeatures, prefs.on]);

  const frame = () => {
    if (!map || !features.length) return;
    const xs = features.map((f) => f.geometry.coordinates[0]);
    const ys = features.map((f) => f.geometry.coordinates[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    if (minX === maxX && minY === maxY)
      map.easeTo({ center: [minX, minY], zoom: 14, duration: 350 });
    else
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        // Keep enough geographic context for the independently loaded site
        // layer. Zoom 15 framed this short drive so tightly that every nearby
        // reference site sat just outside the requested bbox.
        { padding: 60, maxZoom: 13, duration: 350 },
      );
  };

  // Zoom auto sur la zone des points RSRP à chaque activation ou changement de capture.
  useEffect(() => {
    if (!autoFrame || !prefs.on) return;
    frame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, prefs.on, effectiveCaptureId, features.length, autoFrame]);

  useEffect(() => {
    if (!map?.getLayer(LAYER)) return;
    map.setLayoutProperty(LAYER, "visibility", prefs.on ? "visible" : "none");
    if (map.getLayer(LINK_LAYER))
      map.setLayoutProperty(LINK_LAYER, "visibility", prefs.on ? "visible" : "none");
    map.setPaintProperty(LAYER, "circle-opacity", prefs.opacity / 100);
    map.setFilter(
      LAYER,
      prefs.hidden.length
        ? [
            "all",
            ["!=", ["get", "rsrp_class"], null],
            ["!", ["in", ["get", "rsrp_class"], ["literal", prefs.hidden]]],
          ]
        : ["!=", ["get", "rsrp_class"], null],
    );
  }, [map, prefs, features]);

  useEffect(() => {
    if (!map) return;
    let popup: Popup | undefined;
    let disposed = false;
    const click = async (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const { Popup } = await import("maplibre-gl");
      if (disposed) return;
      const el = document.createElement("div");
      el.style.whiteSpace = "pre-line";
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
        ) +
        (p["serving_cell_id"]
          ? "\n" +
            t("mapWorkspace.driveRsrpPopupServing", {
              cell: p["serving_cell_id"],
              site: p["serving_site_name"] || p["serving_site_id"] || "—",
              seq: p["serving_cell_seq"],
            })
          : "");
      popup?.remove();
      popup = new Popup().setLngLat(e.lngLat).setDOMContent(el).addTo(map);
    };
    map.on("click", LAYER, click);
    return () => {
      disposed = true;
      popup?.remove();
      map.off("click", LAYER, click);
    };
  }, [map, t]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of features)
      if (f.properties.rsrp_class)
        c[f.properties.rsrp_class] = (c[f.properties.rsrp_class] ?? 0) + 1;
    return c;
  }, [features]);

  const diagStatus = useMemo(
    () => ({
      capture: effectiveCaptureId ?? null,
      request: analysis.isError
        ? "error"
        : analysis.isLoading
          ? "loading"
          : analysis.data
            ? "ok"
            : "idle",
      rows: analysis.data ? diag.rows : null,
      rowsWithRsrp: analysis.data ? diag.rowsWithRsrp : null,
      rowsWithGps: analysis.data ? diag.rowsWithGps : null,
      pairedPositions: analysis.data ? diag.paired : null,
      mapPoints: analysis.data ? diag.mapPoints : null,
      rsrpPoints: analysis.data ? diag.rsrpMapPoints : null,
      numericRsrp: analysis.data ? driveRsrpPoints(analysis.data).length : null,
      displayed: analysis.data ? features.length : null,
      servingLinks: analysis.data ? linkFeatures.length : null,
      gpsMarkers: allPositions.length,
    }),
    [
      analysis.data,
      analysis.isError,
      analysis.isLoading,
      effectiveCaptureId,
      features.length,
      linkFeatures.length,
      diag,
      allPositions.length,
    ],
  );

  const status = !prefs.on
    ? null
    : (!embedded && captures.isError) || analysis.isError || (needsGps && gps.isError)
      ? t("mapWorkspace.driveRsrpError")
      : (!embedded && captures.isLoading) || analysis.isLoading || (needsGps && gps.isLoading)
        ? t("mapWorkspace.driveRsrpLoading")
        : !embedded && !captures.data?.length
          ? t("mapWorkspace.driveRsrpNone")
          : features.length
            ? t("mapWorkspace.driveRsrpCount", { count: features.length })
            : !diag.rows && !diag.rsrpMapPoints
              ? t("mapWorkspace.driveRsrpNoRows")
              : !diag.rowsWithRsrp && !diag.rsrpMapPoints
                ? t("mapWorkspace.driveRsrpNoValue")
                : t("mapWorkspace.driveRsrpNoGps");

  return (
    <div
      className={`absolute bottom-12 z-20 w-60 max-w-[calc(100%-1rem)] rounded-lg border bg-card/95 text-[11px] shadow-md ${embedded ? "right-2" : "right-14"}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 py-0 font-semibold text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {t("mapWorkspace.driveRsrp")} {open ? "▾" : "▸"}
        </Button>
        <Switch
          aria-label={t("mapWorkspace.driveRsrpToggle")}
          checked={prefs.on}
          onCheckedChange={(on) => {
            update({ on });
            if (on) setOpen(true);
          }}
        />
      </div>
      {status && (
        <div className="space-y-1.5 border-t px-3 py-1.5">
          <p role="status" className="break-words text-muted-foreground">
            {status}
            {automaticRecovery && features.length > 0
              ? ` · ${t("mapWorkspace.driveRsrpCaptureRecovered", automaticRecovery)}`
              : ""}
            {linkFeatures.length > 0
              ? ` · ${t("mapWorkspace.driveRsrpServingLinks", { count: linkFeatures.length })}`
              : ""}
          </p>
          <div className="flex justify-end gap-1.5">
            {!analysis.isLoading && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 shrink-0 px-2 text-[11px]"
                onClick={() => setDiagOpen(true)}
              >
                {t("rsrpDiagnosis.open")}
              </Button>
            )}
            {features.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 shrink-0 px-2 text-[11px]"
                onClick={frame}
              >
                {t("mapWorkspace.driveRsrpFrame")}
              </Button>
            )}
          </div>
        </div>
      )}
      <RsrpDiagnosisDialog open={diagOpen} onOpenChange={setDiagOpen} status={diagStatus} />
      {open && (
        <div className="space-y-2 border-t px-3 py-2">
          {prefs.on && !embedded && !!captures.data?.length && (
            <select
              aria-label={t("mapWorkspace.driveRsrpCapture")}
              className="w-full rounded border bg-background px-1 py-0.5"
              value={captureId ?? ""}
              onChange={(e) => {
                explicitCapture.current = true;
                setAutomaticRecovery(undefined);
                setCaptureId(e.target.value);
              }}
            >
              {captures.data.map((c) => (
                <option key={c.capture_id} value={c.capture_id}>
                  {c.label || c.capture_id}
                </option>
              ))}
            </select>
          )}
          <ul className="space-y-1" aria-label={t("mapWorkspace.driveRsrpLegend")}>
            {RSRP_CLASSES.map((c, i) => {
              const upper = RSRP_CLASSES[i - 1]?.min;
              const range =
                upper === undefined
                  ? `≥ ${c.min}`
                  : c.min === -Infinity
                    ? `< ${upper}`
                    : `${c.min} … ${upper}`;
              const hidden = prefs.hidden.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() =>
                        update({
                          hidden: hidden
                            ? prefs.hidden.filter((h) => h !== c.id)
                            : [...prefs.hidden, c.id],
                        })
                      }
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1">{t(`mapWorkspace.rsrp_${c.id}`)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {range} dBm{prefs.on && counts[c.id] ? ` · ${counts[c.id]}` : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div>
            <div className="mb-1 flex justify-between">
              <span>{t("mapWorkspace.driveRsrpOpacity")}</span>
              <span className="tabular-nums">{prefs.opacity} %</span>
            </div>
            <Slider
              aria-label={t("mapWorkspace.driveRsrpOpacity")}
              min={0}
              max={100}
              step={5}
              value={[prefs.opacity]}
              onValueChange={([v]) => update({ opacity: v ?? 0 })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
