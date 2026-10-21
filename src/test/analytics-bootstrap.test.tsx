import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createQueryClient } from "@/lib/query-cache";
import { kpiCatalogQuery, useAnalyticsBootstrap } from "@/lib/analytics-bootstrap";
import { getProject, getProjectKpiCatalog, getProjectKpiFilters } from "@/lib/api/client";
import { getMetrics } from "@/lib/api/metrics";
vi.mock("@/lib/api/client", () => ({
  getProject: vi.fn(async () => ({})),
  getProjectKpiCatalog: vi.fn(),
  getProjectKpiFilters: vi.fn(async () => ({})),
}));
vi.mock("@/lib/api/metrics", () => ({ getMetrics: vi.fn(async () => []) }));

describe("analytics startup", () => {
  it("starts all catalogues before KPI navigation, joins in-flight work and isolates projects", async () => {
    const client = createQueryClient();
    const finish = new Map<string, (value: unknown) => void>();
    vi.mocked(getProjectKpiCatalog).mockImplementation(
      (id) => new Promise((resolve) => finish.set(id, resolve as (v: unknown) => void)),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const boot = renderHook(({ id }) => useAnalyticsBootstrap(id), {
      wrapper,
      initialProps: { id: undefined as string | undefined },
    });
    expect(getProjectKpiCatalog).not.toHaveBeenCalled();
    boot.rerender({ id: "TEST-A" });
    await waitFor(() => expect(getProjectKpiCatalog).toHaveBeenCalledTimes(1));
    expect(getMetrics).toHaveBeenCalledWith("TEST-A");
    expect(getProjectKpiFilters).toHaveBeenCalledWith("TEST-A");
    expect(getProject).toHaveBeenCalledWith("TEST-A");
    const page = renderHook(({ id }) => useQuery(kpiCatalogQuery(id)), {
      wrapper,
      initialProps: { id: "TEST-A" },
    });
    expect(getProjectKpiCatalog).toHaveBeenCalledTimes(1);
    boot.rerender({ id: "TEST-B" });
    page.rerender({ id: "TEST-B" });
    await waitFor(() => expect(getProjectKpiCatalog).toHaveBeenCalledTimes(2));
    await act(async () => {
      finish.get("TEST-B")?.({ project_id: "TEST-B" });
      finish.get("TEST-A")?.({ project_id: "TEST-A" });
    });
    await waitFor(() => expect(page.result.current.data?.project_id).toBe("TEST-B"));
    page.unmount();
    const returned = renderHook(() => useQuery(kpiCatalogQuery("TEST-A")), { wrapper });
    expect(returned.result.current.data?.project_id).toBe("TEST-A");
    expect(returned.result.current.isPending).toBe(false);
    expect(getProjectKpiCatalog).toHaveBeenCalledTimes(2);
    returned.unmount();
    boot.unmount();
    client.clear();
  });
});
