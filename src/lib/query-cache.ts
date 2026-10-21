import { QueryCache, QueryClient } from "@tanstack/react-query";

const analyticalKeys = ["overview", "dict-v2", "dict", "project-kpi", "project-metrics", "kpi"];

// Keep completed analytical results across page navigation. Explicit invalidation
// still reloads them; a different project/filter key always gets its own result.
export function createQueryClient() {
  let projectSnapshot: string | undefined;
  const client = new QueryClient({
    queryCache: new QueryCache({
      onSuccess(data, query) {
        if (query.queryKey.length !== 1 || query.queryKey[0] !== "projects") return;
        const nextSnapshot = JSON.stringify(data);
        const changed = projectSnapshot !== undefined && projectSnapshot !== nextSnapshot;
        projectSnapshot = nextSnapshot;
        // Imports/deletions/status updates must invalidate cached populations.
        // The projects list retains its existing refresh and import polling.
        if (changed) {
          void client.invalidateQueries({
            predicate: (entry) => analyticalKeys.includes(String(entry.queryKey[0])),
          });
        }
      },
    }),
  });
  for (const key of analyticalKeys) {
    client.setQueryDefaults([key], {
      gcTime: 30 * 60_000,
      refetchOnMount: (query) => query.state.isInvalidated,
      refetchOnWindowFocus: false,
    });
  }
  return client;
}
