import { beforeEach, describe, expect, it, vi } from "vitest";

const { kpiFetch } = vi.hoisted(() => ({ kpiFetch: vi.fn() }));
vi.mock("@/lib/api/project-kpi", () => ({ kpiFetch }));

import { getMetricSeries } from "@/lib/api/metrics";

describe("KPI leaf series budget", () => {
  beforeEach(() => kpiFetch.mockReset());

  it("always asks Metrics series for max_points=2000", () => {
    getMetricSeries("p", "capture", ["rsrp"]);
    expect(kpiFetch).toHaveBeenCalledOnce();
    expect(kpiFetch.mock.calls[0]?.[0]).toContain("max_points=2000");
  });
});
