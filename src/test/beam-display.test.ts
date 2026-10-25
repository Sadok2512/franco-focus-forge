import { describe, expect, it } from "vitest";
import { beamOpacity, beamPercent, beamRadiusScale } from "@/features/kpi/beam-display";

describe("Beam presentation percentages", () => {
  it("limits the size range to 0–100% and allows enlarging the original beam", () => {
    expect(beamRadiusScale(0)).toBe(0);
    expect(beamRadiusScale(50)).toBe(1);
    expect(beamRadiusScale(100)).toBe(2);
    expect(beamPercent(-1, 50)).toBe(0);
    expect(beamPercent(101, 50)).toBe(100);
  });
  it("maps colour intensity from invisible at 0% to opaque at 100%", () => {
    expect(beamOpacity(0)).toBe(0);
    expect(beamOpacity(50)).toBe(0.5);
    expect(beamOpacity(100)).toBe(1);
    expect(beamOpacity(undefined)).toBe(0.28);
  });
});