import { createQueryClient } from "./lib/query-cache";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After a new publish, old pages reference chunk files that no longer exist.
// Reload once to fetch the fresh HTML instead of showing a blank screen.
if (typeof window !== "undefined") {
  const KEY = "bc4.chunkReload";
  const reloadOnce = () => {
    // A stale HTML document can recover after one reload. If the chunk is
    // still unavailable after that reload, retrying every 10s creates a
    // permanent refresh loop and makes the app appear unusable/heavy.
    if (sessionStorage.getItem(KEY) === "1") return;
    sessionStorage.setItem(KEY, "1");
    window.location.reload();
  };
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnce();
  });
  window.addEventListener("unhandledrejection", (event) => {
    const msg = String((event.reason as Error)?.message ?? event.reason ?? "");
    if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg))
      reloadOnce();
  });
}

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
