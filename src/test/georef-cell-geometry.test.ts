import { describe, expect, it } from "vitest";
import {
  GEOREF_RENDER_APERTURE_DEG,
  getGeorefBandColor,
  getGeorefBeamRadiusMeters,
  getGeorefSectorCoords,
} from "@/features/kpi/georef-cell-geometry";

describe("GEOREF cell beam geometry", () => {
  it("keeps the GEOREF curved wedge and closes it at the real site coordinate", () => {
    const center: [number, number] = [2.35, 48.85];
    const points = getGeorefSectorCoords(center, 0, 154, GEOREF_RENDER_APERTURE_DEG);
    expect(points).toHaveLength(23);
    expect(points[0]).toEqual(center);
    expect(points.at(-1)).toEqual(center);
    const arcMiddle = points[11]!;
    expect(arcMiddle[1]).toBeGreaterThan(center[1]);
    expect(arcMiddle[0]).toBeCloseTo(center[0], 6);
  });

  it("uses telecom azimuth: 90 degrees points east", () => {
    const center: [number, number] = [2.35, 48.85];
    const points = getGeorefSectorCoords(center, 90, 154);
    const arcMiddle = points[11]!;
    expect(arcMiddle[0]).toBeGreaterThan(center[0]);
    expect(arcMiddle[1]).toBeCloseTo(center[1], 6);
  });

  it("uses the same zoom radius rules as GEOREF", () => {
    expect(getGeorefBeamRadiusMeters(13)).toBeCloseTo(95.48);
    expect(getGeorefBeamRadiusMeters(14)).toBeCloseTo(49.126);
    expect(getGeorefBeamRadiusMeters(15)).toBeCloseTo(37.128);
  });

  it("uses the GEOREF band palette and technology fallbacks", () => {
    expect(getGeorefBandColor("B3", "LTE")).toBe("#2563EB");
    expect(getGeorefBandColor("n78", "NR")).toBe("#4F46E5");
    expect(getGeorefBandColor("n258", "NR")).toBe("#7C3AED");
    expect(getGeorefBandColor("B8", "LTE")).toBe("#F39C12");
  });

  it("does not create geometry from invalid evidence", () => {
    expect(getGeorefSectorCoords([2.35, 48.85], Number.NaN, 154)).toEqual([]);
  });
});
