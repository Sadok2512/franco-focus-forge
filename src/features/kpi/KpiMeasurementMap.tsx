import { useTranslation } from "react-i18next";
import { mapFeatures } from "./map-model";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { getKpiCaptures, getKpiTimeSeries } from "@/lib/api/kpi-timeseries";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { KpiMapOSM } from "./KpiMapOSM";

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
  useEffect(() => {
    if (!map) return;
    const data = { type: "FeatureCollection" as const, features };
    if (map.getSource("kpi-measures"))
      (map.getSource("kpi-measures") as GeoJSONSource).setData(data);
    else {
      map.addSource("kpi-measures", { type: "geojson", data });
      map.addLayer({
        id: "kpi-measures",
        type: "circle",
        source: "kpi-measures",
        paint: {
          "circle-radius": 5,
          "circle-color": "#1769E0",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
    }
    recenter();
    // recenter uses exactly the current map and API features.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, features]);
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
  return (
    <div>
      {allowed && !!captures.data?.length && (
        <label className="kpi-select-label mb-2">
          Capture
          <select
            aria-label={`Capture carte ${code}`}
            value={captureId ?? ""}
            onChange={(event) => onCaptureChange(event.target.value)}
          >
            <option value="" disabled>
              {" "}
              {translate("kpi.b07b688a46b7")}{" "}
            </option>
            {captureId && !captures.data.some((c) => c.capture_id === captureId) && (
              <option value={captureId}>{captureId}</option>
            )}
            {captures.data.map((c) => (
              <option key={c.capture_id} value={c.capture_id}>
                {c.capture_id}
              </option>
            ))}
          </select>
        </label>
      )}
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
        premium
        showOperatorLegend={false}
        measurementStatus={null}
        onMapReady={setMap}
        onRecenter={recenter}
      >
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
