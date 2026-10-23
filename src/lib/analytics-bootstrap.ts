import { queryOptions, useQuery } from "@tanstack/react-query";
import { getProject, getProjectKpiCatalog, getProjectKpiFilters } from "@/lib/api/client";
import { getMetrics } from "@/lib/api/metrics";

// 1.103.3 — Persist large project-scoped catalogues in localStorage so the
// 2nd visit (reload inclus) affiche la UI immédiatement, puis refetch
// silencieux (SWR). Zéro invention : si le back renvoie différent, c'est
// écrasé. ~900kB par entrée, quota localStorage = 5MB/domaine → OK pour une
// poignée de projets ouverts dans la session.
function persistedQuery<T>(key: string, fetcher: () => Promise<T>, staleTime: number) {
  const cacheKey = `bc4.cache.${key}`;
  return queryOptions({
    queryKey: [key.split(".")[0], ...key.split(".").slice(1)],
    queryFn: async () => {
      const data = await fetcher();
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(cacheKey, JSON.stringify(data));
        }
      } catch { /* quota ignored */ }
      return data;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      try {
        const raw = window.localStorage.getItem(cacheKey);
        return raw ? (JSON.parse(raw) as T) : undefined;
      } catch { return undefined; }
    },
    initialDataUpdatedAt: 0,
    staleTime,
  });
}

// Shared options make startup and page consumers join the same requests/cache.
// No draft filters or capture data: these are project-level catalogues only.
export const kpiCatalogQuery = (projectId: string) =>
  queryOptions({
    ...persistedQuery(`project-kpi.catalog.${projectId}`, () => getProjectKpiCatalog(projectId), 300_000),
    queryKey: ["project-kpi", "catalog", projectId],
  });
export const kpiFiltersQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-kpi", "filters", projectId],
    queryFn: () => getProjectKpiFilters(projectId),
    staleTime: 60_000,
  });
export const metricsCatalogQuery = (projectId: string) =>
  queryOptions({
    ...persistedQuery(`project-metrics.${projectId}`, () => getMetrics(projectId), 60_000),
    queryKey: ["project-metrics", projectId],
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
