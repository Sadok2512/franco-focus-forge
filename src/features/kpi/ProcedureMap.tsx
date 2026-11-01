import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";

import { Button } from "@/components/ui/button";
import { getProcedures } from "@/lib/api/client";
import { KpiMapOSM } from "./KpiMapOSM";

const SOURCE_ID = "procedure-evidence";
const LAYER_ID = "procedure-evidence-points";
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
  label,
}: {
  projectId: string;
  captureId: string | undefined;
  procedureTypes: string[];
  label: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [map, setMap] = useState<MlMap | null>(null);
  const query = useQuery({
    queryKey: ["procedure-map", projectId, captureId, procedureTypes],
    queryFn: ({ signal }) =>
      getProcedures(projectId, captureId ? [captureId] : [], procedureTypes, 1, 500, signal),
    enabled: !!captureId && procedureTypes.length > 0,
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
  const routeCoordinates = useMemo(
    () => features.map((feature) => feature.geometry.coordinates),
    [features],
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
      void navigate({
        to: "/signaling",
        search: { analysis_scope: "capture", capture_id: selectedCapture, seq },
      } as never);
    };
    map.on("click", LAYER_ID, click);
    return () => {
      map.off("click", LAYER_ID, click);
    };
  }, [features, map, navigate]);
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
        measurementStatus={query.isPending ? t("procedures.loadingMap") : null}
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
      </KpiMapOSM>
    </div>
  );
}
