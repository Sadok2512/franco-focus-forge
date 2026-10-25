import { useQuery } from "@tanstack/react-query";
import { MapPinned } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import { KpiMapOSM } from "@/features/kpi/KpiMapOSM";
import { useActiveProject } from "@/lib/activeProject";
import { getProject } from "@/lib/api/client";

/** Dedicated network map. The basemap, /sites queries and GEOREF cell-beam
 * renderer remain owned by KpiMapOSM/SitesLayer; this page only supplies the
 * full-workspace composition. */
export function MapWorkspacePage() {
  const { t } = useTranslation();
  const { activeProject } = useActiveProject();
  const projectQuery = useQuery({
    queryKey: ["project", activeProject?.id],
    queryFn: ({ signal }) => getProject(activeProject!.id, signal),
    enabled: Boolean(activeProject),
  });

  if (!activeProject) return <NoActiveProject scope={t("mapWorkspace.title")} />;

  const center = projectQuery.data?.center;
  return (
    <section className="flex h-[calc(100dvh-3.5rem)] min-h-[560px] flex-col overflow-hidden bg-slate-100 p-2 dark:bg-slate-950">
      <header className="flex h-11 shrink-0 items-center justify-between px-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MapPinned className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{t("mapWorkspace.title")}</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {activeProject.name} · {t("mapWorkspace.subtitle")}
            </p>
          </div>
        </div>
        {projectQuery.isError && (
          <span className="text-[11px] text-amber-700" role="status">
            {t("mapWorkspace.projectCenterUnavailable")}
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1">
        <KpiMapOSM
          center={center ?? [2.4, 46.6]}
          zoom={11}
          premium
          workspace
          showOperatorLegend={false}
          measurementStatus={null}
          contextLabel={activeProject.name}
        />
      </div>
    </section>
  );
}
