import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { getMetricMap } from "@/lib/api/client";
import { getKpiTimeSeries } from "@/lib/api/kpi-timeseries";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { mapFeatures } from "./map-model";
import {
  classOf,
  metricClasses,
  useMetricLegendSettings,
  useMetricLegendPresentation,
  type MetricClass,
} from "./metric-classes";
import {
  addMapMetric,
  mapLegendScope,
  MAP_METRIC_MIME,
  readMapMetric,
  type MapMetric,
} from "./map-metric-drop";
import {
  MapLegendHeaderActions,
  MapLegendList,
  MapLegendRow,
  MapLegendSection,
  MetricLegendSettingsPanel,
} from "./map-legend";

function classRange(c: MetricClass): string {
  if (c.min === -Infinity && c.max === Infinity) return "all";
  if (c.min === -Infinity) return `< ${Number(c.max.toPrecision(3))}`;
  if (c.max === Infinity) return `≥ ${Number(c.min.toPrecision(3))}`;
  return `${Number(c.min.toPrecision(3))} – ${Number(c.max.toPrecision(3))}`;
}

function AddedMetric({
  metric,
  map,
  projectId,
  captureId,
  filters,
  onRemove,
  legendHost,
  scope,
}: {
  metric: MapMetric;
  map: MlMap | null;
  projectId: string;
  captureId: string | undefined;
  filters: KpiQueryFilters;
  onRemove: () => void;
  legendHost: HTMLDivElement | null;
  scope: string;
}) {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presentation, setPresentation] = useMetricLegendPresentation(scope, metric.code);
  const [settings, setSettings] = useMetricLegendSettings(metric.code, scope);
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
  // A new class set invalidates the rows the technician had hidden.
  useEffect(() => {
    if (presentation.hidden.some((id) => !classes.some((item) => item.id === id)))
      setPresentation({ ...presentation, hidden: [] });
    // Only reset stale class identities, not a user's still-valid selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.length]);
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
    map.setLayoutProperty(id, "visibility", presentation.visible ? "visible" : "none");
    if (typeof map.setFilter === "function")
      map.setFilter(
        id,
        presentation.hidden.length
          ? ["!", ["in", ["get", "cls"], ["literal", presentation.hidden]]]
          : null,
      );
  }, [map, id, features, presentation.visible, presentation.hidden]);
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
        <section
          className="space-y-2 border-t border-border pt-2"
          data-map-added-metric={metric.code}
        >
          {
            <MapLegendSection
              title={`${metric.label}${metric.unit ? ` · ${metric.unit}` : ""}`}
              action={
                <MapLegendHeaderActions
                  expanded={presentation.expanded}
                  onToggleExpanded={() =>
                    setPresentation({ ...presentation, expanded: !presentation.expanded })
                  }
                  visible={presentation.visible}
                  onToggleVisible={() =>
                    setPresentation({ ...presentation, visible: !presentation.visible })
                  }
                  settingsOpen={settingsOpen}
                  onToggleSettings={() => setSettingsOpen((open) => !open)}
                  onClose={onRemove}
                  visibilityLabel={t("mapWorkspace.legendVisibility", { metric: metric.label })}
                  closeLabel={t("mapMetricDrop.remove", { metric: metric.label })}
                />
              }
            >
              {presentation.expanded && (
                <>
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
                  <MapLegendList label={metric.label}>
                    {[...classes].reverse().map((c) => (
                      <MapLegendRow
                        key={c.id}
                        color={c.color}
                        label={classRange(c)}
                        meta={(() => {
                          const count = features.filter((f) => f.properties.cls === c.id).length;
                          const parts = [];
                          if (settings.showCount) parts.push(count.toLocaleString());
                          if (settings.showPercent)
                            parts.push(
                              `${features.length ? ((count / features.length) * 100).toFixed(1) : "0.0"}%`,
                            );
                          return parts.join(" · ");
                        })()}
                        checked={!presentation.hidden.includes(c.id)}
                        onToggle={() =>
                          setPresentation({
                            ...presentation,
                            hidden: presentation.hidden.includes(c.id)
                              ? presentation.hidden.filter((x) => x !== c.id)
                              : [...presentation.hidden, c.id],
                          })
                        }
                      />
                    ))}
                  </MapLegendList>
                  {settings.gradient && classes.length > 0 && (
                    <div
                      className="h-1.5 rounded"
                      aria-hidden="true"
                      style={{
                        background: `linear-gradient(90deg, ${classes.map((item) => item.color).join(",")})`,
                      }}
                    />
                  )}
                </>
              )}
              {settingsOpen && (
                <MetricLegendSettingsPanel
                  metric={metric.label}
                  classes={classes}
                  settings={settings}
                  onChange={setSettings}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </MapLegendSection>
          }
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
  const { t } = useTranslation();
  const baseKind = base.kind;
  const baseCode = base.code;
  const key = `bc4.map.added-metrics.v1.${projectId}.${workspaceId}.${base.kind}.${base.code}`;
  const scope = mapLegendScope(projectId, workspaceId, base);
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
              return m
                ? addMapMetric(all, m, { kind: baseKind, code: baseCode, label: "", unit: "" })
                : all;
            }, [])
          : [],
      );
    } catch {
      setMetrics([]);
    }
  }, [baseCode, baseKind, key]);
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
      {children(
        <div className="space-y-2">
          <div
            className="flex justify-end gap-2 text-[10px]"
            data-testid="map-legend-global-actions"
          >
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("bc4-map-legend-expand", { detail: { scope, expanded: true } }),
                )
              }
            >
              {t("mapLegend.expandAll")}
            </button>
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("bc4-map-legend-expand", { detail: { scope, expanded: false } }),
                )
              }
            >
              {t("mapLegend.collapseAll")}
            </button>
          </div>
          <div ref={setLegendHost} className="max-h-[48vh] space-y-2 overflow-y-auto pr-1" />
        </div>,
      )}
      {metrics.map((metric) => (
        <AddedMetric
          key={`${metric.kind}:${metric.code}`}
          metric={metric}
          map={map}
          projectId={projectId}
          captureId={captureId}
          filters={filters}
          legendHost={legendHost}
          scope={scope}
          onRemove={() => save(metrics.filter((m) => m !== metric))}
        />
      ))}
    </div>
  );
}
