import { queryOptions, useQuery } from "@tanstack/react-query";
import { getProject, getProjectKpiCatalog, getProjectKpiFilters } from "@/lib/api/client";
import { getMetrics } from "@/lib/api/metrics";

// Shared options make startup and page consumers join the same requests/cache.
// No draft filters or capture data: these are project-level catalogues only.
export const kpiCatalogQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-kpi", "catalog", projectId],
    queryFn: () => getProjectKpiCatalog(projectId),
    staleTime: 300_000,
  });
export const kpiFiltersQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-kpi", "filters", projectId],
    queryFn: () => getProjectKpiFilters(projectId),
    staleTime: 60_000,
  });
export const metricsCatalogQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-metrics", projectId],
    queryFn: () => getMetrics(projectId),
    staleTime: 60_000,
  });
export const analyticsProjectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    staleTime: 60_000,
  });

export function useAnalyticsBootstrap(projectId: string | undefined) {
  const id = projectId ?? "";
  const enabled = Boolean(projectId);
  useQuery({ ...kpiCatalogQuery(id), enabled });
  useQuery({ ...kpiFiltersQuery(id), enabled });
  useQuery({ ...metricsCatalogQuery(id), enabled });
  useQuery({ ...analyticsProjectQuery(id), enabled });
}
