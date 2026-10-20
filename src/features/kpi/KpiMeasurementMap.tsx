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
      content.textContent = `${code}\nValeur : ${p["value"]} ${p["unit"]}\nCapture : ${p["capture_id"]}\nSéquence : ${p["seq"]}\nSource : ${p["result_id"]}\nFichier : ${p["file"]}`;
      popup?.remove();
      popup = new Popup().setLngLat(event.lngLat).setDOMContent(content).addTo(map);
    };
    map.on("click", "kpi-measures", click);
    return () => {
      disposed = true;
      popup?.remove();
      map.off("click", "kpi-measures", click);
    };
  }, [map, code, features]);
  const message = !allowed
    ? `Points indisponibles avec ces filtres : ${unsupported.join(", ")}. L’API cartographique par capture ne les prend pas en charge.`
    : captures.isError || query.isError
      ? "Échec du chargement des points KPI."
      : (!captureId && captures.isPending) || (!!captureId && query.isPending)
        ? "Chargement des observations géolocalisées…"
        : query.data && query.data.status !== "AVAILABLE"
          ? (query.data.reason ?? "Mesures indisponibles.")
          : features.length
            ? `${features.length.toLocaleString("fr-FR")} points géolocalisés sur ${query.data?.n_returned.toLocaleString("fr-FR")} observations retournées${query.data?.sampling?.method !== "none" && query.data?.sampling ? " · échantillonnage API" : ""}`
            : "Aucune observation avec coordonnées et preuve disponibles pour cette capture.";
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
              Choisir une capture
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
          Réessayer
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
