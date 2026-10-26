import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Map as MlMap, GeoJSONSource, MapLayerMouseEvent, Popup } from "maplibre-gl";
import { getMetricAnalysis, getMetricCaptures } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RSRP_CLASSES, RSRP_METRIC, rsrpClass, type RsrpClassId } from "./drive-rsrp";

const SOURCE = "bc4-drive-rsrp";
const LAYER = "bc4-drive-rsrp-points";
const STORE = "bc4.map.driveRsrp.v1";

type Prefs = { on: boolean; opacity: number; hidden: RsrpClassId[] };
const DEFAULT: Prefs = { on: false, opacity: 90, hidden: [] };

function readPrefs(store: string, defaults: Prefs): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(store) ?? "{}") };
  } catch {
    return defaults;
  }
}

/** Toggleable drive RSRP points with legend and per-class visibility. */
export function DriveRsrpLayer({ map, projectId, activeCaptureId, autoFrame = true }: {
  map: MlMap | null;
  projectId: string;
  activeCaptureId?: string;
  autoFrame?: boolean;
}) {
  const { t } = useTranslation();
  const embedded = activeCaptureId !== undefined;
  const store = embedded ? "bc4.signaling.driveRsrp.v1" : STORE;
  const [prefs, setPrefs] = useState<Prefs>({ ...DEFAULT, on: embedded });
  const [open, setOpen] = useState(false);
  const [captureId, setCaptureId] = useState<string>();
  useEffect(() => setPrefs(readPrefs(store, { ...DEFAULT, on: embedded })), [store, embedded]);
  const update = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      localStorage.setItem(store, JSON.stringify(next));
      return next;
    });

  const captures = useQuery({
    queryKey: ["metric-captures", projectId],
    queryFn: ({ signal }) => getMetricCaptures(projectId, {}, signal),
    enabled: prefs.on && !embedded,
  });
  useEffect(() => {
    if (embedded || captureId || !captures.data?.length) return;
    const fromUrl = new URLSearchParams(window.location.search).get("capture_id");
    setCaptureId(
      captures.data.find((c) => c.capture_id === fromUrl)?.capture_id ?? captures.data[0]?.capture_id,
    );
  }, [captures.data, captureId, embedded]);
  const effectiveCaptureId = activeCaptureId ?? captureId;
  const analysis = useQuery({
    queryKey: ["drive-rsrp", projectId, effectiveCaptureId],
    queryFn: ({ signal }) => {
      if (!effectiveCaptureId) throw new Error("Missing capture");
      return getMetricAnalysis(projectId, effectiveCaptureId, [RSRP_METRIC], {}, { group_by: "operator", include_map: true }, signal);
    },
    enabled: prefs.on && !!effectiveCaptureId,
    staleTime: 60_000,
  });
  const features = useMemo(
    () =>
      (analysis.data?.map_points ?? [])
        .filter((p) => p.code === RSRP_METRIC && typeof p.value === "number" && Number.isFinite(p.value))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
        .map((p) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] as [number, number] },
          properties: {
            value: p.value as number,
            seq: p.seq,
            capture_id: effectiveCaptureId,
            unit: "dBm",
            rsrp_class: rsrpClass(p.value as number),
          },
        })),
    [analysis.data, effectiveCaptureId],
  );

  // Source + layer (added once the style is parsed, kept across basemap changes).
  useEffect(() => {
    if (!map) return;
    const add = () => {
      if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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
      if (!map.getLayer(LAYER)) return;
      map.setLayoutProperty(LAYER, "visibility", prefs.on ? "visible" : "none");
      map.setPaintProperty(LAYER, "circle-opacity", prefs.opacity / 100);
      map.setFilter(LAYER, ["all", ["!=", ["get", "rsrp_class"], null], ["!", ["in", ["get", "rsrp_class"], ["literal", prefs.hidden]]]]);
    };
    if (map.getStyle?.() || map.isStyleLoaded()) add();
    else map.once("load", add);
    return () => {
      map.off("load", add);
    };
  }, [map, features, prefs]);

  useEffect(() => {
    const src = map?.getSource(SOURCE) as GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: prefs.on ? features : [] });
  }, [map, features, prefs.on]);

  // Zoom auto sur la zone des points RSRP à chaque activation ou changement de capture.
  useEffect(() => {
    if (!autoFrame || !map || !prefs.on || !features.length) return;
    const xs = features.map((f) => f.geometry.coordinates[0]);
    const ys = features.map((f) => f.geometry.coordinates[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    if (minX === maxX && minY === maxY) map.easeTo({ center: [minX, minY], zoom: 14, duration: 350 });
    else
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 60, maxZoom: 15, duration: 350 },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, prefs.on, effectiveCaptureId, features.length, autoFrame]);

  useEffect(() => {
    if (!map?.getLayer(LAYER)) return;
    map.setLayoutProperty(LAYER, "visibility", prefs.on ? "visible" : "none");
    map.setPaintProperty(LAYER, "circle-opacity", prefs.opacity / 100);
    map.setFilter(
      LAYER,
      prefs.hidden.length
        ? ["all", ["!=", ["get", "rsrp_class"], null], ["!", ["in", ["get", "rsrp_class"], ["literal", prefs.hidden]]]]
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
      el.textContent = t("mapWorkspace.driveRsrpPopup", {
        value: p["value"],
        unit: p["unit"] || "dBm",
        capture: p["capture_id"],
        seq: p["seq"],
      });
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
    for (const f of features) if (f.properties.rsrp_class) c[f.properties.rsrp_class] = (c[f.properties.rsrp_class] ?? 0) + 1;
    return c;
  }, [features]);

  const status = !prefs.on
    ? null
    : (!embedded && captures.isError) || analysis.isError
      ? t("mapWorkspace.driveRsrpError")
      : (!embedded && captures.isLoading) || analysis.isLoading
        ? t("mapWorkspace.driveRsrpLoading")
        : !embedded && !captures.data?.length
          ? t("mapWorkspace.driveRsrpNone")
          : !features.length
              ? t("mapWorkspace.driveRsrpNoGps")
              : t("mapWorkspace.driveRsrpCount", { count: features.length });

  return (
    <div className={`absolute bottom-12 z-20 w-60 max-w-[calc(100%-1rem)] rounded-lg border bg-card/95 text-[11px] shadow-md ${embedded ? "right-2" : "right-14"}`}>
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
      {open && (
        <div className="space-y-2 border-t px-3 py-2">
          {status && (
            <p role="status" className="text-muted-foreground">
              {status}
            </p>
          )}
          {prefs.on && !embedded && !!captures.data?.length && (
            <select
              aria-label={t("mapWorkspace.driveRsrpCapture")}
              className="w-full rounded border bg-background px-1 py-0.5"
              value={captureId ?? ""}
              onChange={(e) => setCaptureId(e.target.value)}
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
                upper === undefined ? `≥ ${c.min}` : c.min === -Infinity ? `< ${upper}` : `${c.min} … ${upper}`;
              const hidden = prefs.hidden.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() =>
                        update({
                          hidden: hidden ? prefs.hidden.filter((h) => h !== c.id) : [...prefs.hidden, c.id],
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
