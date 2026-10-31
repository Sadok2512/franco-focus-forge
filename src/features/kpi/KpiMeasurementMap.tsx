import { useTranslation } from "react-i18next";
import { mapFeatures } from "./map-model";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { getKpiCaptures, getKpiTimeSeries } from "@/lib/api/kpi-timeseries";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { KpiMapOSM } from "./KpiMapOSM";
import {
  MAX_CLASSES,
  MIN_CLASSES,
  classOf,
  metricClasses,
  useMetricLegendSettings,
} from "./metric-classes";
import { DriveRsrpLayer } from "./DriveRsrpLayer";

export function KpiMeasurementMap({
  projectId,
  code,
  captureId,
  onCaptureChange,
  filters,
}: {
  projectId: string;
  code: string;
  captureId: string | undefined;
  onCaptureChange: (capture: string) => void;
  filters: KpiQueryFilters;
}) {
  const { t: translate, i18n: locale } = useTranslation();
  // The capture endpoint has no analytical filter arguments. Never silently ignore them.
  const unsupported = Object.entries(filters)
    .filter(
      ([key, value]) =>
        key !== "capture_id" &&
        key !== "group_by" &&
        Array.isArray(value) &&
        (value.length > 0 || key === "operator"),
    )
    .map(([key]) => key);
  const allowed = unsupported.length === 0;
  const captures = useQuery({
    queryKey: ["kpi-captures", projectId, code],
    queryFn: ({ signal }) => getKpiCaptures(projectId, code, signal),
    enabled: allowed,
  });
  useEffect(() => {
    const first = [...(captures.data ?? [])].sort((a, b) => b.n_observations - a.n_observations)[0];
    if (allowed && !captureId && first) onCaptureChange(first.capture_id);
  }, [allowed, captureId, captures.data, onCaptureChange]);
  const query = useQuery({
    queryKey: ["kpi-timeseries", projectId, captureId, code, 5000],
    queryFn: ({ signal }) => getKpiTimeSeries(projectId, captureId!, code, 5000, signal),
    enabled: allowed && !!captureId,
  });
  const features = useMemo(() => (allowed ? mapFeatures(query.data) : []), [allowed, query.data]);
  const routeCoordinates = useMemo(
    () => features.map((feature) => feature.geometry.coordinates),
    [features],
  );
  const [map, setMap] = useState<MlMap | null>(null);
  const recenter = () => {
    if (!map || !features.length) return;
    const xs = features.map((f) => f.geometry.coordinates[0]);
    const ys = features.map((f) => f.geometry.coordinates[1]);
    map.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: 40, maxZoom: 15, duration: 0 },
    );
  };
  const [hidden, setHidden] = useState<string[]>([]);
  const [legendSettings, setLegendSettings] = useMetricLegendSettings(code);
  const classes = useMemo(
    () => metricClasses(code, features.map((f) => Number(f.properties.value)), legendSettings),
    [code, features, legendSettings],
  );
  useEffect(() => setHidden([]), [classes.length]);
  const colored = useMemo(
    () =>
      features.flatMap((f) => {
        const c = classOf(classes, Number(f.properties.value));
        return c ? [{ ...f, properties: { ...f.properties, cls: c.id, color: c.color } }] : [];
      }),
    [features, classes],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of colored) m.set(f.properties.cls, (m.get(f.properties.cls) ?? 0) + 1);
    return m;
  }, [colored]);
  useEffect(() => {
    if (!map) return;
    const data = { type: "FeatureCollection" as const, features: colored };
    if (map.getSource("kpi-measures"))
      (map.getSource("kpi-measures") as GeoJSONSource).setData(data);
    else {
      // Every measurement is an individual point coloured by its value (no clustering).
      map.addSource("kpi-measures", { type: "geojson", data });
      map.addLayer({
        id: "kpi-measures",
        type: "circle",
        source: "kpi-measures",
        paint: {
          // Same look as the Signaling drive points: solid fill in the legend
          // colour, thin dark outline so light basemaps never wash it out.
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 6, 18, 9],
          "circle-color": ["get", "color"],
          "circle-opacity": 1,
          "circle-stroke-color": "rgba(15,23,42,0.55)",
          "circle-stroke-width": 0.5,
        },
      });
    }
    recenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, colored]);
  useEffect(() => {
    if (!map?.getLayer("kpi-measures")) return;
    map.setFilter(
      "kpi-measures",
      hidden.length ? ["!", ["in", ["get", "cls"], ["literal", hidden]]] : null,
    );
  }, [map, hidden, colored]);
  const fmtNum = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(3)).toString() : "");
  const unit = features[0]?.properties.unit ?? "";
  const legend = classes.length ? (
    <div className="space-y-0.5">
      <div className="font-semibold">
        {code}
        {unit ? ` (${unit})` : ""}
      </div>
      {[...classes].reverse().map((c, ri) => {
        const index = classes.length - 1 - ri;
        const off = hidden.includes(c.id);
        const range =
          c.min === -Infinity
            ? `< ${fmtNum(c.max)}`
            : c.max === Infinity
              ? `≥ ${fmtNum(c.min)}`
              : `${fmtNum(c.min)} – ${fmtNum(c.max)}`;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={!off}
            onClick={() =>
              setHidden((h) => (off ? h.filter((x) => x !== c.id) : [...h, c.id]))
            }
            className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted ${off ? "opacity-40" : ""}`}
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} data-index={index} />
            <span className="flex-1">{range}</span>
            <span className="tabular-nums text-muted-foreground">
              {(counts.get(c.id) ?? 0).toLocaleString()}
            </span>
          </button>
        );
      })}
      <div className="mt-2 space-y-1 border-t pt-2">
        <div className="font-semibold">{translate("mapWorkspace.legendSettings")}</div>
        <label className="flex items-center justify-between gap-2">
          {translate("mapWorkspace.legendCount")}
          <select
            className="rounded border bg-background px-1 py-0.5"
            value={classes.length}
            onChange={(e) => setLegendSettings({ count: Number(e.target.value), colors: {} })}
          >
            {Array.from({ length: MAX_CLASSES - MIN_CLASSES + 1 }, (_, i) => i + MIN_CLASSES).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          {classes.map((c, i) => (
            <input
              key={c.id}
              type="color"
              aria-label={c.id}
              value={c.color}
              onChange={(e) =>
                setLegendSettings({
                  ...legendSettings,
                  colors: { ...legendSettings.colors, [i]: e.target.value },
                })
              }
              className="h-5 w-6 cursor-pointer rounded border p-0"
            />
          ))}
        </div>
        <button
          type="button"
          className="text-primary underline"
          onClick={() => setLegendSettings({ count: null, colors: {} })}
        >
          {translate("mapWorkspace.legendReset")}
        </button>
      </div>
    </div>
  ) : null;
  useEffect(() => {
    if (!map) return;
    let disposed = false;
    let popup: import("maplibre-gl").Popup | undefined;
    const click = async (event: import("maplibre-gl").MapLayerMouseEvent) => {
      const p = event.features?.[0]?.properties;
      if (!p) return;
      const { Popup } = await import("maplibre-gl");
      if (disposed) return;
      const content = document.createElement("div");
      content.style.whiteSpace = "pre-line";
      content.textContent = translate("kpi.e4b37c222c49", {
        v0: code,
        v1: p["value"],
        v2: p["unit"],
        v3: p["capture_id"],
        v4: p["seq"],
        v5: p["result_id"],
        v6: p["file"],
      });
      popup?.remove();
      popup = new Popup().setLngLat(event.lngLat).setDOMContent(content).addTo(map);
    };
    map.on("click", "kpi-measures", click);
    return () => {
      disposed = true;
      popup?.remove();
      map.off("click", "kpi-measures", click);
    };
  }, [map, code, features, translate]);
  const message = !allowed
    ? translate("kpi.a5bacfb3bfd4", { v0: unsupported.join(", ") })
    : captures.isError || query.isError
      ? translate("kpi.aa502d0dbdf4")
      : (!captureId && captures.isPending) || (!!captureId && query.isPending)
        ? translate("kpi.db30f893cb8b")
        : query.data && query.data.status !== "AVAILABLE"
          ? (query.data.reason ?? "Mesures indisponibles.")
          : features.length
            ? translate("kpi.f3625a33de19", {
                v0: features.length.toLocaleString(
                  locale.resolvedLanguage === "fr" ? "fr-FR" : "en-GB",
                ),
                v1: query.data?.n_returned.toLocaleString(
                  locale.resolvedLanguage === "fr" ? "fr-FR" : "en-GB",
                ),
                v2:
                  query.data?.sampling?.method !== "none" && query.data?.sampling
                    ? translate("kpi.apiSampling")
                    : "",
              })
            : translate("kpi.912d53fb4f88");
  // No capture selector (user request): the card follows the active capture,
  // defaulting to the first one returned by the API.
  return (
    <div>
      {(captures.isError || query.isError) && (
        <button
          className="kpi-button"
          onClick={() => {
            void captures.refetch();
            if (captureId) void query.refetch();
          }}
        >
          {" "}
          {translate("kpi.af273d956b5b")}{" "}
        </button>
      )}
      <KpiMapOSM
        workspace
        showOperatorLegend={false}
        measurementStatus={null}
        onMapReady={setMap}
        onRecenter={recenter}
        layersLegend={legend}
        routeCoordinates={routeCoordinates}
      >
        {/* Same drive layer as Signaling View: RSRP points, serving/neighbour
            lines to the API-published cells and the blinking serving site. */}
        <DriveRsrpLayer map={map} projectId={projectId} activeCaptureId={captureId ?? ""} autoFrame={false} />
        <div
          role="status"
          className="absolute bottom-7 left-2 right-2 z-10 w-fit max-w-[calc(100%-1rem)] rounded border bg-card/95 px-2 py-1 text-[10px] shadow-sm"
        >
          {message}
        </div>
      </KpiMapOSM>
    </div>
  );
}
