import { queryOptions, useQuery } from "@tanstack/react-query";
import { getProject, getProjectKpiCatalog, getProjectKpiFilters } from "@/lib/api/client";
import { getMetrics } from "@/lib/api/metrics";

// 1.103.3 — Persist large project-scoped catalogues in localStorage so the
// 2nd visit (reload inclus) affiche la UI immédiatement, puis refetch
// silencieux (SWR). Zéro invention : si le back renvoie différent, c'est
// écrasé. ~900kB par entrée, quota localStorage = 5MB/domaine → OK pour une
// poignée de projets ouverts dans la session.
// 1.111.1 BC3 — Préfixe de schéma injecté dans la clé pour **buster**
// la cache localStorage à chaque bump de forme de payload /metrics.
// Avant ça, un bump catalog_release (ex. 2.51.1 → 2.53.0 : ajout racine
// CAPTURE + dédoublonnage Shared) laissait l'ancien arbre v6 persisté
// côté client — fallback_legacy baked-in indéfiniment. v2 ciblée dans
// la clé → les anciennes entrées `bc4.cache.*` deviennent orphelines
// (non lues) et sont écrasées à la prochaine lecture par les nouvelles
// `bc4.cache.v2.*`. Bumper ce suffixe à chaque changement de schéma.
const SCHEMA_PREFIX = "v2";

// Purge opportuniste des entrées orphelines (ancien préfixe sans vN).
// Zéro invention : on supprime uniquement ce que le navigateur sait
// être du cache BC4 (`bc4.cache.`) qui n'a pas le préfixe `vN.` requis
// par la version courante.
if (typeof window !== "undefined") {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("bc4.cache.") && !k.startsWith(`bc4.cache.${SCHEMA_PREFIX}.`)) {
        window.localStorage.removeItem(k);
      }
    }
  } catch { /* quota / privacy mode : ignore */ }
}

function persistedQuery<T>(key: string, fetcher: () => Promise<T>, staleTime: number) {
  const cacheKey = `bc4.cache.${SCHEMA_PREFIX}.${key}`;
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
