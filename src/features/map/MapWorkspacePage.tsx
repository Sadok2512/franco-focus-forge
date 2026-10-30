import { useCallback, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { DriveRsrpLayer } from "@/features/kpi/DriveRsrpLayer";
import { useTranslation } from "react-i18next";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import { KpiMapOSM } from "@/features/kpi/KpiMapOSM";
import { useActiveProject } from "@/lib/activeProject";
import { getProject } from "@/lib/api/client";
import { resolveNetworkMapCenter } from "./map-center";

/** Dedicated network map. The basemap, /sites queries and GEOREF cell-beam
 * renderer remain owned by KpiMapOSM/SitesLayer; this page only supplies the
 * full-workspace composition. */
export function MapWorkspacePage() {
  const { t } = useTranslation();
  const { activeProject } = useActiveProject();
  const [map, setMap] = useState<MlMap | null>(null);
  const [route, setRoute] = useState<Array<[number, number]>>([]);
  const updateRoute = useCallback((coordinates: Array<[number, number]>) => setRoute(coordinates), []);
  const projectQuery = useQuery({
    queryKey: ["project", activeProject?.id],
    queryFn: ({ signal }) => getProject(activeProject!.id, signal),
    enabled: Boolean(activeProject),
  });

  if (!activeProject) return <NoActiveProject scope={t("mapWorkspace.title")} />;

  const center = resolveNetworkMapCenter(projectQuery.data?.center);
  return (
    <section className="h-[calc(100dvh-var(--app-header-offset))] min-h-[520px] overflow-hidden bg-background p-1.5">
      <KpiMapOSM
        center={center}
        workspace
        showOperatorLegend={false}
        measurementStatus={null}
        contextLabel={activeProject.name}
        onMapReady={setMap}
        routeCoordinates={route}
      >
        <DriveRsrpLayer map={map} projectId={activeProject.id} autoFrame={false} onRouteChange={updateRoute} />
        {projectQuery.isError && (
          <span
            role="status"
            className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-full border bg-card px-3 py-1 text-[11px] text-muted-foreground shadow"
          >
            {t("mapWorkspace.projectCenterUnavailable")}
          </span>
        )}
      </KpiMapOSM>
    </section>
  );
}
