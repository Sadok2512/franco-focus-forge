import { describe, expect, it } from "vitest";
import {
  NAME_TAG_RADIUS,
  clampNameTagX,
  nearestNameTag,
  type NameTagSeries,
} from "@/features/signaling/name-tag";

// Pixel map: RSRP sits at y=50 and RSRQ at y=120, one pixel per 0.1 s of capture time.
const toPixel = (code: string, time: number): [number, number] =>
  code === "cell_rsrp" ? [100 + time * 10, 50] : [100 + time * 10, 120];

const series: NameTagSeries[] = [
  {
    code: "cell_rsrp",
    label: "RSRP",
    points: [
      { t_rel_s: 1, value: -98.2 },
      { t_rel_s: 2, value: -99 },
    ],
  },
  { code: "cell_rsrq", label: "RSRQ", points: [{ t_rel_s: 1, value: -11.5 }] },
];

describe("Signaling click name tag", () => {
  it("names the measurement clicked, not a farther one", () => {
    expect(nearestNameTag(series, toPixel, 110, 51)).toEqual({
      name: "RSRP",
      code: "cell_rsrp",
      x: 110,
      y: 50,
    });
    expect(nearestNameTag(series, toPixel, 110, 119)).toEqual({
      name: "RSRQ",
      code: "cell_rsrq",
      x: 110,
      y: 120,
    });
  });

  it("names nothing when the click misses every point", () => {
    expect(nearestNameTag(series, toPixel, 110, 50 + NAME_TAG_RADIUS + 1)).toBeNull();
    expect(nearestNameTag([], toPixel, 110, 50)).toBeNull();
  });

  it("skips measurements without a value", () => {
    const gaps: NameTagSeries[] = [
      { code: "cell_rsrp", label: "RSRP", points: [{ t_rel_s: 1, value: null }] },
    ];
    expect(nearestNameTag(gaps, toPixel, 110, 50)).toBeNull();
  });

  it("ignores points whose pixels are not ready", () => {
    const broken = () => null;
    expect(nearestNameTag(series, broken, 110, 50)).toBeNull();
  });

  it("keeps the chip inside the chart width", () => {
    expect(clampNameTagX(4, 400)).toBe(70);
    expect(clampNameTagX(396, 400)).toBe(330);
    expect(clampNameTagX(200, 400)).toBe(200);
    expect(clampNameTagX(12, 100)).toBe(12);
  });
});
