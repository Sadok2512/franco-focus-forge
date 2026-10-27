import { queryOptions, useQuery } from "@tanstack/react-query";
import { getProject, getProjectKpiCatalog, getProjectKpiFilters } from "@/lib/api/client";
import { getMetrics } from "@/lib/api/metrics";

// 1.103.3 — Persist large project-scoped catalogues in localStorage so the
// 2nd visit (reload inclus) affiche la UI immédiatement, puis refetch
// silencieux (SWR). Zéro invention : si le back renvoie différent, c'est
// écrasé. ~900kB par entrée, quota localStorage = 5MB/domaine → OK pour une
// poignée de projets ouverts dans la session.
// 1.111.2 BC3 — Clé de cache **dérivée automatiquement** du sha du
// catalog_release (plus de SCHEMA_PREFIX manuel à bumper). Pour
// `/metrics` : la clé est `bc4.cache.sha.{sha10}.project-metrics.{pid}`
// où `sha10` = `catalog_release.sha256.slice(0, 10)`. Un nouveau
// catalogue produit une nouvelle clé ; les anciennes `bc4.cache.sha.*`
// pour le même pid sont **purgées à la fin du fetch** si leur sha ≠
// sha courant.
// Garde **GL1** : à `initialData`, si l'entrée cache porte un sha ≠
// celui de son propre `catalog_release.sha256` embarqué, elle est
// supprimée et ignorée (cohérence self-check).
// Pour les autres queries (kpiCatalog, …) qui n'ont pas de sha dans
// l'enveloppe, on garde l'ancien préfixe de schéma versionné `v2`.
const SCHEMA_PREFIX = "v2";
const METRICS_SHA_PREFIX = "bc4.cache.sha.";
const KEY_RE = /^bc4\.cache\.sha\.([a-f0-9]{10})\.project-metrics\.(.+)$/;

// Purge au boot des entrées orphelines (anciens préfixes legacy,
// zéro sha : `bc4.cache.project-metrics.X`, `bc4.cache.v2.project-
// metrics.X` …). On garde explicitement `bc4.cache.sha.*` (nouveau
// schéma) et `bc4.cache.v2.*` NON-metrics (kpi catalog etc.).
if (typeof window !== "undefined") {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("bc4.cache.")) continue;
      // nouveau schéma /metrics : garder
      if (k.startsWith(METRICS_SHA_PREFIX)) continue;
      // ancien schéma non-/metrics (kpi catalog…) : garder si matche v2.
      if (k.startsWith(`bc4.cache.${SCHEMA_PREFIX}.`) && !k.includes(".project-metrics.")) continue;
      // tout le reste = orphelin : supprimer
      window.localStorage.removeItem(k);
    }
  } catch { /* quota / privacy mode : ignore */ }
}

/** Résout la clé de cache /metrics pour (pid, sha256). */
function metricsCacheKey(pid: string, sha256: string): string {
  return `${METRICS_SHA_PREFIX}${sha256.slice(0, 10)}.project-metrics.${pid}`;
}

/** Scanne localStorage pour toutes les entrées /metrics d'un pid.
 *  Retourne la 1re entrée **GL1-valide** (self-consistency : le sha
 *  embarqué dans l'enveloppe matche le sha de la clé). Les entrées
 *  non-valides sont supprimées en passant. */
function readValidMetricsCache(pid: string): unknown | undefined {
  if (typeof window === "undefined") return undefined;
  const found: Array<{ key: string; keySha: string; data: {
    catalog_release?: { sha256?: string | null } | null;
  } }> = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const m = KEY_RE.exec(k);
      if (!m || m[2] !== pid) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        found.push({ key: k, keySha: m[1], data });
      } catch {
        window.localStorage.removeItem(k);
      }
    }
  } catch { return undefined; }
  for (const entry of found) {
    const payloadSha = entry.data?.catalog_release?.sha256;
    // GL1 : key.sha doit matcher le sha embarqué dans l'enveloppe
    // (préfixe 10 chars). Sinon → corruption / tampering / vieille
    // forme → delete + skip.
    if (!payloadSha || typeof payloadSha !== "string" || !payloadSha.startsWith(entry.keySha)) {
      try { window.localStorage.removeItem(entry.key); } catch { /* ignore */ }
      continue;
    }
    return entry.data;
  }
  return undefined;
}

/** Purge toutes les entrées /metrics pour `pid` dont le sha ≠ `freshSha`. */
function purgeStaleMetricsCache(pid: string, freshSha: string): void {
  if (typeof window === "undefined") return;
  const liveKey = metricsCacheKey(pid, freshSha);
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const m = KEY_RE.exec(k);
      if (!m || m[2] !== pid) continue;
      if (k !== liveKey) window.localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

/** `queryOptions` dédié `/metrics` : clé dérivée du sha du
 *  catalog_release présent dans l'enveloppe, GL1 à `initialData`,
 *  purge des entrées périmées après fetch. */
function shaKeyedMetricsQuery(pid: string) {
  return queryOptions({
    queryKey: ["project-metrics", pid],
    queryFn: async () => {
      const data = await getMetrics(pid);
      try {
        if (typeof window !== "undefined") {
          const sha = (data as unknown as { catalog_release?: { sha256?: string | null } | null })
            ?.catalog_release?.sha256;
          if (sha && typeof sha === "string") {
            window.localStorage.setItem(metricsCacheKey(pid, sha), JSON.stringify(data));
            purgeStaleMetricsCache(pid, sha);
          }
          // Si catalog_release null (fallback_legacy), on ne persiste pas
          // (pas de sha → pas de clé déterministe) ; refetch à chaque fois.
        }
      } catch { /* quota ignored */ }
      return data;
    },
    initialData: () => readValidMetricsCache(pid) as never,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
}

/** `queryOptions` persistant générique pour les queries SANS sha dans
 *  l'enveloppe (kpi catalog, …). Garde l'ancien préfixe `v2` ; bumper
 *  `SCHEMA_PREFIX` à chaque changement de forme. */
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
export const metricsCatalogQuery = (projectId: string) => shaKeyedMetricsQuery(projectId);
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
