import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  Map as MlMap,
  FilterSpecification,
  GeoJSONSource,
  MapLayerMouseEvent,
  Popup,
} from "maplibre-gl";
import { getMetricAnalysis, getMetricMap, getSignaling } from "@/lib/api/client";
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
  type DriveRsrpPoint,
  type RsrpClassId,
  type RsrpPosition,
} from "./drive-rsrp";
import {
  buildMeasurementPointPopup,
  CELL_LINK_COLORS,
  CELL_LINK_KINDS,
  CELL_LINK_STYLE,
  pointCellLinks,
  pointDetails,
  type CellLinkKind,
  type RadioCellLink,
} from "./measurement-point-popup";

const SOURCE = "bc4-drive-rsrp";
const LAYER = "bc4-drive-rsrp-points";
const LINK_SOURCE = "bc4-drive-rsrp-serving-links";
const LINK_LAYER = "bc4-drive-rsrp-cell-links-proven";
const LINK_LAYER_PROBABLE = "bc4-drive-rsrp-cell-links-probable";
const SERVING_LINK_LAYER_PROBABLE = "bc4-drive-rsrp-serving-links-probable";
const SERVING_LINK_LAYER = "bc4-drive-rsrp-serving-links-proven";
export const DRIVE_CELL_LINK_LAYER_SPECS = [
  { id: LINK_LAYER, confidence: "proven", serving: false },
  { id: LINK_LAYER_PROBABLE, confidence: "probable", serving: false },
  // Serving is deliberately painted after neighbour/NR links. Some API
  // records legitimately resolve the serving and a neighbour to the exact
  // same segment; a shared confidence layer used to let the later neighbour
  // hide the serving line completely.
  { id: SERVING_LINK_LAYER_PROBABLE, confidence: "probable", serving: true },
  { id: SERVING_LINK_LAYER, confidence: "proven", serving: true },
] as const;
// v2 enables the measurement layer on first use. The dedicated Map page is
// expected to open on real radio points rather than on an empty basemap.
const STORE = "bc4.map.driveRsrp.v2";

type Prefs = {
  on: boolean;
  opacity: number;
  hidden: RsrpClassId[];
  links: Record<CellLinkKind, boolean>;
};
const DEFAULT: Prefs = {
  on: true,
  opacity: 90,
  hidden: [],
  links: { serving: true, neighbour: true, nr_anchor: true },
};
const LAST_CAPTURE_STORE = "bc4.driveRsrp.lastCapture";

export type MeasurementPointIdentity = {
  projectId: string;
  captureId: string;
  seq: number;
};

type PointLinkEntry = { point: DriveRsrpPoint; links: RadioCellLink[] };

/** Return at most the serving evidence for the exact active measurement point. */
export function activeServingPointLink(
  entries: readonly PointLinkEntry[],
  selected: MeasurementPointIdentity | null,
  projectId: string,
  captureId?: string,
): { point: DriveRsrpPoint; link: RadioCellLink } | undefined {
  if (
    !selected ||
    !captureId ||
    selected.projectId !== projectId ||
    selected.captureId !== captureId
  )
    return undefined;
  const entry = entries.find(({ point }) => point.seq === selected.seq);
  const link = entry?.links.find((candidate) => candidate.kind === "serving");
  return entry && link ? { point: entry.point, link } : undefined;
}

function samePoint(
  selected: MeasurementPointIdentity | null,
  projectId: string,
  captureId: string,
  seq: number,
): boolean {
  return (
    selected?.projectId === projectId && selected.captureId === captureId && selected.seq === seq
  );
}

function readPrefs(store: string, defaults: Prefs): Prefs {
  try {
    const stored = JSON.parse(localStorage.getItem(store) ?? "{}") as Partial<Prefs>;
    return { ...defaults, ...stored, links: { ...defaults.links, ...stored.links } };
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
  onRouteChange,
}: {
  map: MlMap | null;
  projectId: string;
  activeCaptureId?: string;
  autoFrame?: boolean;
  /** Capture positions the page already holds, used when a row carries no GPS of its own. */
  positions?: RsrpPosition[];
  onRouteChange?: (coordinates: Array<[number, number]>) => void;
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
  const [selectedPoint, setSelectedPoint] = useState<MeasurementPointIdentity | null>(null);
  const selectedPointRef = useRef<MeasurementPointIdentity | null>(null);
  const popupRef = useRef<Popup | undefined>(undefined);
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
    enabled: !embedded && (prefs.on || Boolean(onRouteChange)),
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
  const mapAnalysis = useQuery({
    queryKey: ["drive-rsrp-map", projectId, effectiveCaptureId],
    queryFn: ({ signal }) => {
      if (!effectiveCaptureId) throw new Error("Missing capture");
      return getMetricMap(projectId, effectiveCaptureId, [RSRP_SELECTION], {}, signal);
    },
    enabled: prefs.on && !!effectiveCaptureId,
    staleTime: 60_000,
  });
  // Old decoded captures can have no lean map points while the legacy table
  // still carries same-sequence GPS rows. Keep that compatibility path, but
  // never make the normal Map/Signaling load wait for the heavy table route.
  const needsLegacyFallback = mapAnalysis.isSuccess && mapAnalysis.data.map_points.length === 0;
  const legacyAnalysis = useQuery({
    queryKey: ["drive-rsrp-legacy", projectId, effectiveCaptureId],
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
    enabled: prefs.on && !!effectiveCaptureId && needsLegacyFallback,
    staleTime: 60_000,
  });
  const analysis = needsLegacyFallback ? legacyAnalysis : mapAnalysis;
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
    // The shared map framing needs the selected capture route even when the
    // metric rows already carry coordinates (or contain no RSRP at all).
    enabled: !!effectiveCaptureId && (needsGps || Boolean(onRouteChange)),
    staleTime: 60_000,
  });
  const allPositions = useMemo<RsrpPosition[]>(() => {
    if (positions?.length) return positions;
    if (!gps.data) return [];
    return rsrpPositionsFrom(gps.data.points, gps.data.markers);
  }, [positions, gps.data]);
  const drivePoints = useMemo(
    () => driveRsrpPoints(analysis.data, allPositions),
    [analysis.data, allPositions],
  );
  const features = useMemo(
    () =>
      drivePoints.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] as [number, number] },
        properties: {
          value: p.value,
          t_rel_s: p.t_rel_s,
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
    [drivePoints, effectiveCaptureId],
  );
  useEffect(() => {
    const routePositions = gps.data?.markers?.length ? gps.data.markers : allPositions;
    const captureRoute = routePositions
      .filter(
        (point): point is RsrpPosition & { lng: number; lat: number } =>
          typeof point.lng === "number" &&
          Number.isFinite(point.lng) &&
          typeof point.lat === "number" &&
          Number.isFinite(point.lat),
      )
      .map((point) => [point.lng, point.lat] as [number, number]);
    onRouteChange?.(
      captureRoute.length ? captureRoute : features.map((feature) => feature.geometry.coordinates),
    );
  }, [allPositions, features, gps.data?.markers, onRouteChange]);
  const pointLinks = useMemo(
    () => drivePoints.map((point) => ({ point, links: pointCellLinks(point) })),
    [drivePoints],
  );
  const activeServing = useMemo(
    () => activeServingPointLink(pointLinks, selectedPoint, projectId, effectiveCaptureId),
    [effectiveCaptureId, pointLinks, projectId, selectedPoint],
  );
  const linkFeatures = useMemo(() => {
    if (!activeServing || !prefs.links.serving || !effectiveCaptureId) return [];
    const { point, link } = activeServing;
    return [
      {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [point.lng, point.lat],
            [link.lng, link.lat],
          ],
        },
        properties: {
          project_id: projectId,
          capture_id: effectiveCaptureId,
          seq: point.seq,
          link_type: link.kind,
          confidence: link.confidence,
          source: link.source ?? "",
          selected: true,
          has_selection: true,
        },
      },
    ];
  }, [activeServing, effectiveCaptureId, prefs.links.serving, projectId]);
  const linkCounts = useMemo(
    () =>
      pointLinks
        .flatMap(({ links }) => links)
        .reduce<Record<CellLinkKind, number>>(
          (counts, link) => ({ ...counts, [link.kind]: counts[link.kind] + 1 }),
          { serving: 0, neighbour: 0, nr_anchor: 0 },
        ),
    [pointLinks],
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
    let promoteFrame: number | undefined;
    const promoteServingLayers = () => {
      // Site/sector layers are installed by the shared map chrome after this
      // measurement component. Keep serving above those overlays as well as
      // above neighbour/NR links; point circles remain independently
      // clickable because MapLibre hit testing is layer-specific below.
      for (const id of [SERVING_LINK_LAYER_PROBABLE, SERVING_LINK_LAYER]) {
        if (map.getLayer(id)) map.moveLayer(id);
      }
    };
    const add = () => {
      if (!map.getSource(LINK_SOURCE)) {
        map.addSource(LINK_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      for (const spec of DRIVE_CELL_LINK_LAYER_SPECS) {
        const filter: FilterSpecification = [
          "all",
          ["==", ["get", "confidence"], spec.confidence],
          [spec.serving ? "==" : "!=", ["get", "link_type"], "serving"],
        ];
        if (!map.getLayer(spec.id)) {
          map.addLayer({
            id: spec.id,
            type: "line",
            source: LINK_SOURCE,
            filter,
            paint: {
              "line-color": spec.serving
                ? CELL_LINK_COLORS.serving
                : [
                    "match",
                    ["get", "link_type"],
                    "neighbour",
                    CELL_LINK_COLORS.neighbour,
                    "nr_anchor",
                    CELL_LINK_COLORS.nr_anchor,
                    "#64748b",
                  ],
              "line-width": [
                "case",
                ["get", "selected"],
                CELL_LINK_STYLE.selectedWidth,
                CELL_LINK_STYLE.width,
              ],
              "line-opacity": [
                "case",
                ["get", "selected"],
                CELL_LINK_STYLE.selectedOpacity,
                ["get", "has_selection"],
                CELL_LINK_STYLE.mutedOpacity,
                CELL_LINK_STYLE.opacity,
              ],
              ...(spec.confidence === "probable"
                ? { "line-dasharray": CELL_LINK_STYLE.probableDash }
                : {}),
            },
          });
        }
        // Also repair maps whose source survived a style/component refresh.
        map.setFilter(spec.id, filter);
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
      for (const spec of DRIVE_CELL_LINK_LAYER_SPECS) {
        if (map.getLayer(spec.id))
          map.setLayoutProperty(spec.id, "visibility", prefs.on ? "visible" : "none");
      }
      if (!map.getLayer(LAYER)) return;
      map.setLayoutProperty(LAYER, "visibility", prefs.on ? "visible" : "none");
      map.setPaintProperty(LAYER, "circle-opacity", prefs.opacity / 100);
      map.setFilter(LAYER, [
        "all",
        ["!=", ["get", "rsrp_class"], null],
        ["!", ["in", ["get", "rsrp_class"], ["literal", prefs.hidden]]],
      ]);
      promoteServingLayers();
      map.once("idle", promoteServingLayers);
      promoteFrame = window.requestAnimationFrame(() => {
        promoteFrame = window.requestAnimationFrame(promoteServingLayers);
      });
    };
    if (map.getStyle?.() || map.isStyleLoaded()) add();
    else map.once("load", add);
    return () => {
      map.off("load", add);
      map.off("idle", promoteServingLayers);
      if (promoteFrame !== undefined) window.cancelAnimationFrame(promoteFrame);
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
    if (map.getLayer(LINK_LAYER_PROBABLE))
      map.setLayoutProperty(LINK_LAYER_PROBABLE, "visibility", prefs.on ? "visible" : "none");
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
    let disposed = false;
    const click = async (e: MapLayerMouseEvent) => {
      // Several measurements can share one GPS fix. Keep the already-active
      // identity when it is part of the clicked stack so a second click on
      // that visual point reliably deselects it instead of selecting another
      // overlapping sequence.
      const activeFeature = e.features?.find((feature) => {
        const seq = Number(feature.properties?.["seq"]);
        return (
          effectiveCaptureId &&
          Number.isFinite(seq) &&
          samePoint(selectedPointRef.current, projectId, effectiveCaptureId, seq)
        );
      });
      const p = activeFeature?.properties ?? e.features?.[0]?.properties;
      if (!p) return;
      const seq = Number(p["seq"]);
      const point = drivePoints.find((candidate) => candidate.seq === seq);
      if (!point || !effectiveCaptureId) return;
      if (samePoint(selectedPointRef.current, projectId, effectiveCaptureId, seq)) {
        selectedPointRef.current = null;
        setSelectedPoint(null);
        popupRef.current?.remove();
        popupRef.current = undefined;
        return;
      }
      const { Popup } = await import("maplibre-gl");
      if (disposed) return;
      popupRef.current?.remove();
      const identity = { projectId, captureId: effectiveCaptureId, seq };
      selectedPointRef.current = identity;
      setSelectedPoint(identity);
      const el = buildMeasurementPointPopup(
        pointDetails(point, t("mapWorkspace.driveRsrp"), "dBm"),
      );
      const popup = new Popup({ className: "measurement-map-popup", maxWidth: "390px" })
        .setLngLat(e.lngLat)
        .setDOMContent(el)
        .addTo(map);
      popupRef.current = popup;
      popup.on("close", () => {
        if (popupRef.current !== popup) return;
        popupRef.current = undefined;
        selectedPointRef.current = null;
        setSelectedPoint(null);
      });
    };
    map.on("click", LAYER, click);
    return () => {
      disposed = true;
      map.off("click", LAYER, click);
    };
  }, [drivePoints, effectiveCaptureId, map, projectId, t]);

  // A selection is scoped to one project/capture/map workspace. Never carry
  // its line or popup into another context, even when sequence numbers match.
  useEffect(() => {
    selectedPointRef.current = null;
    setSelectedPoint(null);
    popupRef.current?.remove();
    popupRef.current = undefined;
  }, [effectiveCaptureId, map, projectId]);

  useEffect(
    () => () => {
      popupRef.current?.remove();
      popupRef.current = undefined;
    },
    [],
  );

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
          <fieldset className="space-y-1 border-t pt-2">
            <legend className="font-semibold">{t("metrics.mapCellLinks")}</legend>
            {CELL_LINK_KINDS.map((kind) => (
              <label key={kind} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.links[kind]}
                  onChange={(event) =>
                    update({ links: { ...prefs.links, [kind]: event.target.checked } })
                  }
                />
                <span
                  className="h-0 w-5 border-t-[3px]"
                  style={{ borderColor: CELL_LINK_COLORS[kind] }}
                />
                <span className="flex-1">{t(`metrics.mapLink.${kind}`)}</span>
                <span className="tabular-nums text-muted-foreground">{linkCounts[kind]}</span>
              </label>
            ))}
            <div
              className="measurement-link-style-legend pt-1"
              data-testid="measurement-link-style-legend"
            >
              <strong>{t("mapPointPopup.lineStyles")}</strong>
              <span>
                <i className="measurement-popup-line is-proven" />
                {t("mapPointPopup.solid")}
              </span>
              <span>
                <i className="measurement-popup-line is-probable" />
                {t("mapPointPopup.dashed")}
              </span>
            </div>
          </fieldset>
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
