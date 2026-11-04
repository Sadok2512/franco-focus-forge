import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";

import { Button } from "@/components/ui/button";
import { getProcedures, resultsForProcedureMeasure } from "@/lib/api/client";
import { KpiMapOSM } from "./KpiMapOSM";
import {
  FAILURE_RESULTS,
  procedureIncidentLayer,
  type IncidentLayerKey,
} from "./procedure-map-layers";

const SOURCE_ID = "procedure-evidence";
const LAYER_ID = "procedure-evidence-points";
const INCIDENT_SOURCE_ID = "procedure-incidents";
const INCIDENT_LAYERS: Array<{
  key: IncidentLayerKey;
  color: string;
  labelKey: string;
}> = [
  { key: "drops", color: "#be123c", labelKey: "procedures.layers.drops" },
  { key: "rlf", color: "#dc2626", labelKey: "procedures.layers.rlf" },
  { key: "ho_failures", color: "#f97316", labelKey: "procedures.layers.hoFailures" },
  { key: "scg_failures", color: "#7c3aed", labelKey: "procedures.layers.scgFailures" },
];
const COLORS: Record<string, string> = {
  SUCCESS: "#16a34a",
  FAILURE: "#dc2626",
  ABNORMAL_RELEASE: "#ea580c",
  DROP: "#be123c",
  TIMEOUT: "#9333ea",
  UNKNOWN: "#64748b",
  ATTEMPT: "#2563eb",
};

export function ProcedureMap({
  projectId,
  captureId,
  procedureTypes,
  measure,
  label,
}: {
  projectId: string;
  captureId: string | undefined;
  procedureTypes: string[];
  measure?: string | undefined;
  label: string;
}) {
  const { t } = useTranslation();
  const [map, setMap] = useState<MlMap | null>(null);
  const [incidentVisibility, setIncidentVisibility] = useState<Record<IncidentLayerKey, boolean>>({
    drops: true,
    rlf: true,
    ho_failures: true,
    scg_failures: true,
  });
  const results = resultsForProcedureMeasure(measure);
  const query = useQuery({
    queryKey: ["procedure-map", projectId, captureId, procedureTypes, results],
    queryFn: ({ signal }) =>
      getProcedures(
        projectId,
        captureId ? [captureId] : [],
        procedureTypes,
        results,
        1,
        500,
        signal,
      ),
    enabled: !!captureId && procedureTypes.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const incidentQuery = useQuery({
    queryKey: ["procedure-map-incidents", projectId, captureId],
    queryFn: ({ signal }) =>
      getProcedures(projectId, captureId ? [captureId] : [], [], FAILURE_RESULTS, 1, 500, signal),
    enabled: !!captureId,
    staleTime: 60_000,
    retry: false,
  });
  const features = useMemo(
    () =>
      (query.data?.rows ?? []).flatMap((row) =>
        row.latitude == null || row.longitude == null
          ? []
          : [
              {
                type: "Feature" as const,
                id: row.procedure_id,
                geometry: {
                  type: "Point" as const,
                  coordinates: [row.longitude, row.latitude] as [number, number],
                },
                properties: {
                  procedure_id: row.procedure_id,
                  capture_id: row.capture_id,
                  seq: row.start_seq,
                  result: row.result,
                  evidence: row.evidence_level,
                  cause: row.failure_cause ?? "",
                  color: COLORS[row.result] ?? COLORS["UNKNOWN"],
                },
              },
            ],
      ),
    [query.data],
  );
  const incidentCounts = useMemo(() => {
    const counts = Object.fromEntries(
      INCIDENT_LAYERS.map(({ key }) => [key, { detected: 0, geolocated: 0 }]),
    ) as Record<IncidentLayerKey, { detected: number; geolocated: number }>;
    for (const row of incidentQuery.data?.rows ?? []) {
      const layer = procedureIncidentLayer(row);
      if (!layer) continue;
      counts[layer].detected += 1;
      if (row.latitude != null && row.longitude != null) counts[layer].geolocated += 1;
    }
    return counts;
  }, [incidentQuery.data]);
  const incidentFeatures = useMemo(
    () =>
      (incidentQuery.data?.rows ?? []).flatMap((row) => {
        const incidentLayer = procedureIncidentLayer(row);
        if (!incidentLayer || row.latitude == null || row.longitude == null) return [];
        return [
          {
            type: "Feature" as const,
            id: `incident-${row.procedure_id}`,
            geometry: {
              type: "Point" as const,
              coordinates: [row.longitude, row.latitude] as [number, number],
            },
            properties: {
              incident_layer: incidentLayer,
              procedure_id: row.procedure_id,
              capture_id: row.capture_id,
              seq: row.start_seq,
              result: row.result,
              evidence: row.evidence_level,
              cause: row.failure_cause ?? "",
            },
          },
        ];
      }),
    [incidentQuery.data],
  );
  const routeCoordinates = useMemo(
    () => [
      ...features.map((feature) => feature.geometry.coordinates),
      ...incidentFeatures.map((feature) => feature.geometry.coordinates),
    ],
    [features, incidentFeatures],
  );
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    const collection = { type: "FeatureCollection" as const, features };
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) source.setData(collection);
    else {
      map.addSource(SOURCE_ID, { type: "geojson", data: collection });
      map.addLayer({
        id: LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 15, 9],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }
    const click = (event: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
      const properties = event.features?.[0]?.properties;
      const selectedCapture = String(properties?.["capture_id"] ?? "");
      const seq = Number(properties?.["seq"]);
      if (!selectedCapture || !Number.isInteger(seq)) return;
      window.dispatchEvent(
        new CustomEvent("bc4:open-l3-signaling", {
          detail: { captureId: selectedCapture, seq },
        }),
      );
    };
    map.on("click", LAYER_ID, click);
    return () => {
      map.off("click", LAYER_ID, click);
    };
  }, [features, map]);
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    const collection = { type: "FeatureCollection" as const, features: incidentFeatures };
    const source = map.getSource(INCIDENT_SOURCE_ID) as GeoJSONSource | undefined;
    if (source) source.setData(collection);
    else map.addSource(INCIDENT_SOURCE_ID, { type: "geojson", data: collection });

    const click = (event: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
      const properties = event.features?.[0]?.properties;
      const selectedCapture = String(properties?.["capture_id"] ?? "");
      const seq = Number(properties?.["seq"]);
      if (!selectedCapture || !Number.isInteger(seq)) return;
      window.dispatchEvent(
        new CustomEvent("bc4:open-l3-signaling", {
          detail: { captureId: selectedCapture, seq },
        }),
      );
    };
    for (const layer of INCIDENT_LAYERS) {
      const id = `procedure-incidents-${layer.key}`;
      if (!map.getLayer(id)) {
        map.addLayer({
          id,
          type: "circle",
          source: INCIDENT_SOURCE_ID,
          filter: ["==", ["get", "incident_layer"], layer.key],
          layout: { visibility: incidentVisibility[layer.key] ? "visible" : "none" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 6, 15, 10],
            "circle-color": layer.color,
            "circle-opacity": 0.95,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.5,
          },
        });
      } else {
        map.setLayoutProperty(id, "visibility", incidentVisibility[layer.key] ? "visible" : "none");
      }
      map.on("click", id, click);
    }
    return () => {
      for (const layer of INCIDENT_LAYERS) {
        const id = `procedure-incidents-${layer.key}`;
        map.off("click", id, click);
      }
    };
  }, [incidentFeatures, incidentVisibility, map]);
  const legend = (
    <div className="space-y-1 text-xs">
      <strong>{label}</strong>
      {Object.entries(COLORS).map(([result, color]) => (
        <div key={result} className="flex items-center gap-2">
          <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {result}
        </div>
      ))}
      <p className="text-muted-foreground">
        {t("procedures.geolocated", { count: features.length, total: query.data?.total ?? 0 })}
      </p>
      <div className="border-t pt-2">
        <strong>{t("procedures.layers.title")}</strong>
        {INCIDENT_LAYERS.map((layer) => (
          <label key={layer.key} className="mt-1 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={incidentVisibility[layer.key]}
              onChange={(event) =>
                setIncidentVisibility((current) => ({
                  ...current,
                  [layer.key]: event.target.checked,
                }))
              }
            />
            <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: layer.color }} />
            <span className="flex-1">{t(layer.labelKey)}</span>
            <span className="tabular-nums text-muted-foreground">
              {incidentCounts[layer.key].geolocated}/{incidentCounts[layer.key].detected}
            </span>
          </label>
        ))}
        <p className="mt-1 text-[10px] text-muted-foreground">{t("procedures.layers.countHint")}</p>
      </div>
    </div>
  );
  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-md">
      <KpiMapOSM
        workspace
        showOperatorLegend={false}
        onMapReady={setMap}
        routeCoordinates={routeCoordinates}
        layersLegend={legend}
        measurementStatus={
          query.isPending || incidentQuery.isPending ? t("procedures.loadingMap") : null
        }
      >
        {query.isPending && (
          <div className="kpi-metric-map-status" role="status">
            <LoaderCircle className="animate-spin" size={15} /> {t("procedures.loadingMap")}
          </div>
        )}
        {query.isError && (
          <div className="kpi-metric-map-status" role="alert">
            {query.error.message}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RefreshCw size={14} /> {t("procedures.retry")}
            </Button>
          </div>
        )}
        {incidentQuery.isError && (
          <div className="kpi-metric-map-status" role="alert">
            {incidentQuery.error.message}
            <Button variant="outline" size="sm" onClick={() => void incidentQuery.refetch()}>
              <RefreshCw size={14} /> {t("procedures.retry")}
            </Button>
          </div>
        )}
        {!query.isPending && !query.isError && (
          <div
            data-testid="procedure-map-count"
            className="pointer-events-none absolute bottom-7 left-1/2 z-10 -translate-x-1/2 rounded border bg-card/95 px-2 py-1 text-[10px] shadow-sm"
          >
            {t("procedures.geolocated", {
              count: features.length,
              total: query.data?.total ?? 0,
            })}
          </div>
        )}
      </KpiMapOSM>
    </div>
  );
}
