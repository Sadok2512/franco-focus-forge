import { QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/lib/query-cache";

describe("navigation cache", () => {
  it("finishes an unmounted request without replacing a newer filter context", async () => {
    const client = createQueryClient();
    let finish!: (data: string) => void;
    const first = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const oldKey = ["dict-v2", "distribution", "TEST", "old-filter"];
    const newKey = ["dict-v2", "distribution", "TEST", "new-filter"];
    const observer = new QueryObserver(client, { queryKey: oldKey, queryFn: first });
    const unsubscribe = observer.subscribe(() => {});
    try {
      observer.setOptions({ queryKey: newKey, queryFn: async () => "new-result" });
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("new-result"));
      finish("old-result");
      await vi.waitFor(() => expect(client.getQueryData(oldKey)).toBe("old-result"));
      expect(observer.getCurrentResult().data).toBe("new-result");
      unsubscribe();
      const returned = new QueryObserver(client, { queryKey: oldKey, queryFn: first });
      const stop = returned.subscribe(() => {});
      expect(returned.getCurrentResult().data).toBe("old-result");
      stop();
      expect(first).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      client.clear();
    }
  });
  it("invalidates analytical populations when refreshed project metadata changes", async () => {
    const client = createQueryClient();
    try {
      await client.fetchQuery({
        queryKey: ["projects"],
        queryFn: async () => [{ id: "TEST", captures: 1 }],
      });
      client.setQueryData(["dict-v2", "tree", "TEST"], { count: 1 });
      await client.fetchQuery({
        queryKey: ["projects"],
        queryFn: async () => [{ id: "TEST", captures: 2 }],
      });
      expect(client.getQueryState(["dict-v2", "tree", "TEST"])?.isInvalidated).toBe(true);
    } finally {
      client.clear();
    }
  });
  for (const prefix of ["overview", "dict-v2", "project-kpi"]) {
    it(`${prefix}: reuses stale results, reloads invalidated results and isolates filters`, async () => {
      const client = createQueryClient();
      const queryFn = vi.fn(async () => ({ count: 7 }));
      const key = [prefix, "TEST-project", { operator: "TEST-op" }];
      const options = { queryKey: key, queryFn, staleTime: 0 };
      try {
        await client.fetchQuery(options);
        const observer = new QueryObserver(client, options);
        let unsubscribe = observer.subscribe(() => {});
        await Promise.resolve();
        expect(queryFn).toHaveBeenCalledTimes(1);
        expect(observer.getCurrentResult().data).toEqual({ count: 7 });
        unsubscribe();
        await client.invalidateQueries({ queryKey: key, refetchType: "none" });
        unsubscribe = observer.subscribe(() => {});
        await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
        unsubscribe();
        await client.fetchQuery({ ...options, queryKey: [prefix, "TEST-other", {}] });
        await client.fetchQuery({ ...options, queryKey: [prefix, "TEST-project", {}] });
        expect(queryFn).toHaveBeenCalledTimes(4);
        expect(client.getQueryDefaults([prefix]).gcTime).toBe(30 * 60_000);
      } finally {
        client.clear();
      }
    });
  }
});
