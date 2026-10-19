import { describe, expect, it } from "vitest";
import { OverviewPointSchema } from "@/lib/api/schemas";

describe("overview nullable measurement contract", () => {
  const point = {
    id: "TEST-overview",
    lat: null,
    lng: null,
    operator: null,
    tech: null,
    service: null,
    band: null,
    dep: null,
    site: null,
    ts: "TEST-capture-time",
    dl: 0,
    rsrp: null,
    sinr: null,
    latency: null,
  };
  it("preserves missing attribution and GPS without inventing zero; keeps real zero", () => {
    expect(OverviewPointSchema.parse(point)).toEqual(point);
    expect(OverviewPointSchema.parse({ ...point, lat: 0, lng: 0 }).lat).toBe(0);
  });
  it("still rejects invalid coordinates and operator names", () => {
    expect(OverviewPointSchema.safeParse({ ...point, lat: "unknown" }).success).toBe(false);
    expect(OverviewPointSchema.safeParse({ ...point, operator: "TEST-unknown" }).success).toBe(
      false,
    );
  });
});
