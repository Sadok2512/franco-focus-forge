import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMetricMap } from "@/lib/api/client";
import { getKpiTimeSeries } from "@/lib/api/kpi-timeseries";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { mapFeatures } from "./map-model";
import {
  classOf,
  metricClasses,
  useMetricLegendSettings,
  MIN_CLASSES,
  MAX_CLASSES,
} from "./metric-classes";
import { addMapMetric, MAP_METRIC_MIME, readMapMetric, type MapMetric } from "./map-metric-drop";

function AddedMetric({
  metric,
  map,
  projectId,
  captureId,
  filters,
  onRemove,
  legendHost,
}: {
  metric: MapMetric;
  map: MlMap | null;
  projectId: string;
  captureId: string | undefined;
  filters: KpiQueryFilters;
  onRemove: () => void;
  legendHost: HTMLDivElement | null;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);
  const [settings, setSettings] = useMetricLegendSettings(metric.code);
  const id = `bc4-dropped-${metric.kind}-${encodeURIComponent(metric.code)}`;
  const query = useQuery({
    queryKey: ["map-dropped-metric", projectId, captureId, metric.kind, metric.code, filters],
    enabled: Boolean(captureId),
    queryFn: async ({ signal }) => {
      if (!captureId) throw new Error(t("metrics.pickFromCatalogue"));
      if (metric.kind === "kpi") {
        const unsupported = Object.entries(filters)
          .filter(
            ([key, value]) =>
              key !== "capture_id" &&
              key !== "group_by" &&
              Array.isArray(value) &&
              (value.length > 0 || key === "operator"),
          )
          .map(([key]) => key);
        if (unsupported.length)
          throw new Error(t("kpi.a5bacfb3bfd4", { v0: unsupported.join(", ") }));
        const data = await getKpiTimeSeries(projectId, captureId, metric.code, 5000, signal);
        return mapFeatures(data).flatMap((f) =>
          typeof f.properties.value === "number" && Number.isFinite(f.properties.value) ? [f] : [],
        );
      }
      const data = await getMetricMap(projectId, captureId, [metric.code], filters, signal);
      return data.map_points.flatMap((p) =>
        p.code === metric.code && typeof p.value === "number" && Number.isFinite(p.value)
          ? [
              {
                type: "Feature" as const,
                geometry: {
                  type: "Point" as const,
                  coordinates: [p.lng, p.lat] as [number, number],
                },
                properties: {
                  value: p.value,
                  seq: p.seq,
                  capture_id: captureId,
                  result_id: data.result_id,
                  unit: metric.unit,
                  file: "",
                },
              },
            ]
          : [],
      );
    },
  });
  const classes = useMemo(
    () =>
      metricClasses(
        metric.code,
        (query.data ?? []).map((f) => Number(f.properties.value)),
        settings,
      ),
    [metric.code, query.data, settings],
  );
  const features = useMemo(
    () =>
      (query.data ?? []).flatMap((f) => {
        const c = classOf(classes, Number(f.properties.value));
        return c ? [{ ...f, properties: { ...f.properties, color: c.color, cls: c.id } }] : [];
      }),
    [query.data, classes],
  );
  useEffect(() => {
    if (!map) return;
    const data = { type: "FeatureCollection" as const, features };
    const source = map.getSource(id) as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource(id, { type: "geojson", data });
      map.addLayer({
        id,
        source: id,
        type: "circle",
        paint: { "circle-color": ["get", "color"], "circle-radius": 5, "circle-opacity": 1 },
      });
    }
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }, [map, id, features, visible]);
  useEffect(
    () => () => {
      if (!map) return;
      try {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      } catch {
        /* Map may already have been disposed. */
      }
    },
    [map, id],
  );
  return legendHost
    ? createPortal(
        <section className="border-t border-border pt-2" data-map-added-metric={metric.code}>
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 break-words font-semibold">
              {metric.label}
              {metric.unit ? ` · ${metric.unit}` : ""}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              aria-label={t("mapMetricDrop.visibility", { metric: metric.label })}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              aria-label={t("mapMetricDrop.remove", { metric: metric.label })}
              onClick={onRemove}
            >
              <X size={14} />
            </Button>
          </div>
          {query.isFetching && (
            <div
              role="progressbar"
              aria-label={t("mapMetricDrop.loading", { metric: metric.label })}
              className="h-1 animate-pulse bg-primary"
            />
          )}
          {query.isError && (
            <div role="alert">
              <span>{query.error.message}</span>
              <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          )}
          {!query.isFetching && !query.isError && !features.length && (
            <span className="text-muted-foreground">{t("mapMetricDrop.noGps")}</span>
          )}
          {[...classes].reverse().map((c, reverseIndex) => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <input
                type="color"
                aria-label={`${t("mapWorkspace.legendSettings")} · ${metric.label} · ${reverseIndex + 1}`}
                value={c.color}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    colors: {
                      ...settings.colors,
                      [classes.length - 1 - reverseIndex]: e.target.value,
                    },
                  })
                }
                className="h-4 w-4 border-0 p-0"
              />
              <span className="flex-1">
                {c.min === -Infinity && c.max === Infinity
                  ? t("common.all")
                  : c.min === -Infinity
                    ? `< ${Number(c.max.toPrecision(3))}`
                    : c.max === Infinity
                      ? `≥ ${Number(c.min.toPrecision(3))}`
                      : `${Number(c.min.toPrecision(3))} – ${Number(c.max.toPrecision(3))}`}
              </span>
              <span className="tabular-nums">
                {features.filter((f) => f.properties.cls === c.id).length}
              </span>
            </div>
          ))}
          {classes.length > 0 && (
            <label className="flex items-center justify-between gap-2 text-xs">
              {t("mapWorkspace.legendCount")}
              <select
                className="border border-border bg-background"
                value={settings.count ?? 5}
                onChange={(e) => setSettings({ count: Number(e.target.value), colors: {} })}
              >
                {Array.from(
                  { length: MAX_CLASSES - MIN_CLASSES + 1 },
                  (_, i) => i + MIN_CLASSES,
                ).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>,
        legendHost,
      )
    : null;
}

export function MapMetricDropTarget({
  base,
  map,
  projectId,
  captureId,
  filters,
  workspaceId,
  children,
}: {
  base: MapMetric;
  map: MlMap | null;
  projectId: string;
  captureId: string | undefined;
  filters: KpiQueryFilters;
  workspaceId: string;
  children: (legend: ReactNode) => ReactNode;
}) {
  const key = `bc4.map.added-metrics.v1.${projectId}.${workspaceId}.${base.kind}.${base.code}`;
  const [metrics, setMetrics] = useState<MapMetric[]>([]);
  const [over, setOver] = useState(false);
  const [legendHost, setLegendHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      setMetrics(
        Array.isArray(raw)
          ? raw.reduce<MapMetric[]>((all, item) => {
              const m = readMapMetric(JSON.stringify(item));
              return m ? addMapMetric(all, m, base) : all;
            }, [])
          : [],
      );
    } catch {
      setMetrics([]);
    }
  }, [key]);
  const save = (next: MapMetric[]) => {
    setMetrics(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Memory-only fallback. */
    }
  };
  return (
    <div
      className={`relative flex h-full min-h-0 flex-1 flex-col ${over ? "ring-2 ring-inset ring-primary" : ""}`}
      data-map-drop-target={base.code}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MAP_METRIC_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        const metric = readMapMetric(e.dataTransfer.getData(MAP_METRIC_MIME));
        setOver(false);
        if (!metric) return;
        e.preventDefault();
        e.stopPropagation();
        save(addMapMetric(metrics, metric, base));
      }}
    >
      {children(<div ref={setLegendHost} />)}
      {metrics.map((metric) => (
        <AddedMetric
          key={`${metric.kind}:${metric.code}`}
          metric={metric}
          map={map}
          projectId={projectId}
          captureId={captureId}
          filters={filters}
          legendHost={legendHost}
          onRemove={() => save(metrics.filter((m) => m !== metric))}
        />
      ))}
    </div>
  );
}
