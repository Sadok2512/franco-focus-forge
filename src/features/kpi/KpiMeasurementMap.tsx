import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";
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
import { DriveRsrpLayer, type SelectedDrivePoint } from "./DriveRsrpLayer";
import { MapMetricDropTarget } from "./MapMetricDropTarget";
import {
  MapLegendHeaderActions,
  MapLegendList,
  MapLegendReopen,
  MapLegendRow,
  MapLegendSection,
  MapLegendSettings,
} from "./map-legend";

const KPI_MEASURES_LAYER = "kpi-measures";

export function KpiMeasurementMap({
  projectId,
  code,
  label,
  declaredUnit,
  captureId,
  onCaptureChange,
  filters,
  workspaceId = "kpi",
}: {
  projectId: string;
  code: string;
  label?: string;
  declaredUnit?: string | null;
  captureId: string | undefined;
  onCaptureChange: (capture: string) => void;
  filters: KpiQueryFilters;
  workspaceId?: string | undefined;
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
    queryFn: ({ signal }) => {
      if (!captureId) throw new Error(translate("kpi.b07b688a46b7"));
      return getKpiTimeSeries(projectId, captureId, code, 5000, signal);
    },
    enabled: allowed && !!captureId,
  });
  const features = useMemo(() => (allowed ? mapFeatures(query.data) : []), [allowed, query.data]);
  const routeCoordinates = useMemo(
    () => features.map((feature) => feature.geometry.coordinates),
    [features],
  );
  const [map, setMap] = useState<MlMap | null>(null);
  // The map legend mounts only while its Legend tab is open. Keep the drive
  // layer outside that tab and portal its RSRP/link controls into this host,
  // matching the Signaling map without unmounting or refetching the layer.
  const [legendHost, setLegendHost] = useState<HTMLDivElement | null>(null);
  // The drive layer owns the click; the KPI map only needs to know which point
  // was picked so the selection ring can take the colour of the point it shows.
  const [selectedPoint, setSelectedPoint] = useState<SelectedDrivePoint | null>(null);
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
  const [visible, setVisible] = useState(true);
  const [closed, setClosed] = useState(false);

  const [legendSettings, setLegendSettings] = useMetricLegendSettings(code);
  const classes = useMemo(
    () =>
      metricClasses(
        code,
        features.map((f) => Number(f.properties.value)),
        legendSettings,
      ),
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
  // Colour of the selection ring: the legend colour of the visible metric point
  // at the selected position. Same sequence first, then a point that really is
  // at that spot (never a far-away colour, never an invented one).
  const selectedRingColor = useMemo(() => {
    if (!selectedPoint) return undefined;
    const exact = colored.find((f) => Number(f.properties.seq) === selectedPoint.seq);
    if (exact) return String(exact.properties.color);
    let best: { color: string; d: number } | undefined;
    for (const f of colored) {
      const [lng, lat] = f.geometry.coordinates;
      const d = (lng - selectedPoint.lng) ** 2 + (lat - selectedPoint.lat) ** 2;
      if (!best || d < best.d) best = { color: String(f.properties.color), d };
    }
    return best && Math.sqrt(best.d) < 0.0005 ? best.color : undefined;
  }, [colored, selectedPoint]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of colored) m.set(f.properties.cls, (m.get(f.properties.cls) ?? 0) + 1);
    return m;
  }, [colored]);
  useEffect(() => {
    if (!map) return;
    const data = { type: "FeatureCollection" as const, features: colored };
    if (map.getSource(KPI_MEASURES_LAYER))
      (map.getSource(KPI_MEASURES_LAYER) as GeoJSONSource).setData(data);
    else {
      // Every measurement is an individual point coloured by its value (no clustering).
      map.addSource(KPI_MEASURES_LAYER, { type: "geojson", data });
      map.addLayer({
        id: KPI_MEASURES_LAYER,
        type: "circle",
        source: KPI_MEASURES_LAYER,
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
    if (!map?.getLayer(KPI_MEASURES_LAYER)) return;
    map.setFilter(
      KPI_MEASURES_LAYER,
      hidden.length ? ["!", ["in", ["get", "cls"], ["literal", hidden]]] : null,
    );
  }, [map, hidden, colored]);
  // The legend's visibility switch hides every measurement point without
  // unmounting the layer, so the camera, filters and selection survive.
  useEffect(() => {
    if (!map?.getLayer(KPI_MEASURES_LAYER)) return;
    map.setLayoutProperty(KPI_MEASURES_LAYER, "visibility", visible && !closed ? "visible" : "none");
  }, [map, visible, closed, colored]);

  const fmtNum = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(3)).toString() : "");
  const unit = features[0]?.properties.unit ?? declaredUnit ?? "";
  const legendLabel = label ?? code;
  const legend = classes.length ? (
    closed ? null : (
      <MapLegendSection
        title={`${legendLabel}${unit ? ` (${unit})` : ""}`}
        action={
          <MapLegendHeaderActions
            visible={visible}
            onToggleVisible={() => setVisible((v) => !v)}
            onClose={() => setClosed(true)}
            visibilityLabel={translate("mapWorkspace.legendVisibility", { metric: legendLabel })}
            closeLabel={translate("mapWorkspace.legendClose", { metric: legendLabel })}
          />
        }
      >
        <MapLegendList label={translate("mapWorkspace.metricLegend")}>
          {[...classes].reverse().map((c) => {
            const range =
              c.min === -Infinity
                ? `< ${fmtNum(c.max)}`
                : c.max === Infinity
                  ? `≥ ${fmtNum(c.min)}`
                  : `${fmtNum(c.min)} – ${fmtNum(c.max)}`;
            return (
              <MapLegendRow
                key={c.id}
                color={c.color}
                label={range}
                meta={(counts.get(c.id) ?? 0).toLocaleString()}
                checked={!hidden.includes(c.id)}
                onToggle={() =>
                  setHidden((h) => (h.includes(c.id) ? h.filter((x) => x !== c.id) : [...h, c.id]))
                }
              />
            );
          })}
        </MapLegendList>
        <MapLegendSettings title={translate("mapWorkspace.legendSettings")}>
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
        </MapLegendSettings>
      </MapLegendSection>
    )
  ) : null;

  // No measurement popup: clicking a point must not open an info card (user request).
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
    <div className="flex h-full min-h-[280px] flex-col">
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
      <div className="relative min-h-0 flex-1">
        <MapMetricDropTarget
          base={{ kind: "kpi", code, label: code, unit }}
          map={map}
          projectId={projectId}
          captureId={captureId}
          filters={filters}
          workspaceId={workspaceId}
        >
          {(addedLegend) => (
            <KpiMapOSM
              workspace
              showOperatorLegend={false}
              measurementStatus={null}
              heightKey={workspaceId ?? "kpi"}
              onMapReady={setMap}
              onRecenter={recenter}
              layersLegend={
                <>
                  {legend}
                  {addedLegend}
                  <div ref={setLegendHost} />
                </>
              }
              routeCoordinates={routeCoordinates}
            >
              {/* Same drive layer as Signaling View: RSRP points, serving/neighbour
            lines to the API-published cells and the blinking serving site. */}
              <DriveRsrpLayer
                map={map}
                projectId={projectId}
                activeCaptureId={captureId ?? ""}
                autoFrame={false}
                hidePoints
                hideControls
                selectedRingColor={selectedRingColor}
                onSelectedChange={setSelectedPoint}
                legendHost={legendHost}
                selectionLayerId={KPI_MEASURES_LAYER}
              />
              {allowed && !!captureId && query.isPending && (
                <div
                  className="kpi-metric-map-status"
                  role="status"
                  aria-live="polite"
                  data-testid="kpi-map-loading"
                >
                  <LoaderCircle className="animate-spin" size={15} />
                  {translate("kpi.db30f893cb8b")}
                </div>
              )}
              <div
                role="status"
                className="absolute bottom-7 left-2 right-2 z-10 w-fit max-w-[calc(100%-1rem)] rounded border bg-card/95 px-2 py-1 text-[10px] shadow-sm"
              >
                {message}
              </div>
            </KpiMapOSM>
          )}
        </MapMetricDropTarget>
      </div>
    </div>
  );
}
