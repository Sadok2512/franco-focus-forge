import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  API_LEAN_STALE_MS,
  metricCapturesKey,
  metricTableKey,
} from "@/features/kpi/query-keys";

describe("API lean React Query keys", () => {
  it("deduplicates capture lists across capture choice and filter order", () => {
    expect(metricCapturesKey("p", { operator:["SFR","Orange"], capture_id:"a" }))
      .toEqual(metricCapturesKey("p", { operator:["Orange","SFR"], capture_id:"b" }));
  });

  it("keeps table pages and captures distinct", () => {
    expect(metricTableKey(["p","a",["rsrp"],1])).not
      .toEqual(metricTableKey(["p","b",["rsrp"],1]));
  });

  it("coalesces concurrent and fresh capture requests", async () => {
    const client = new QueryClient();
    const queryFn = vi.fn(async () => ["capture"]);
    const firstKey = metricCapturesKey("p", { capture_id: "a", rat: ["NR", "LTE"] });
    const secondKey = metricCapturesKey("p", { rat: ["LTE", "NR"], capture_id: "b" });

    await Promise.all([
      client.fetchQuery({ queryKey: firstKey, queryFn, staleTime: API_LEAN_STALE_MS }),
      client.fetchQuery({ queryKey: secondKey, queryFn, staleTime: API_LEAN_STALE_MS }),
    ]);
    await client.fetchQuery({ queryKey: firstKey, queryFn, staleTime: API_LEAN_STALE_MS });

    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
