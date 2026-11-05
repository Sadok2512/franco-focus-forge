import { describe, expect, it } from "vitest";
import { preferredPointFromClickStack } from "@/features/kpi/DriveRsrpLayer";
import type { DriveRsrpPoint } from "@/features/kpi/drive-rsrp";

const point = (seq: number, extra: Partial<DriveRsrpPoint> = {}): DriveRsrpPoint => ({
  seq,
  lat: 50.37,
  lng: 3.01,
  value: -100,
  cell: 0,
  t_rel_s: 1,
  position_source: "map",
  ...extra,
});

describe("drive point click stack", () => {
  it("prefers a superposed point with published serving evidence", () => {
    const points = [
      point(217668),
      point(217205, {
        probable_serving_cell_ref_id: "466265799",
        probable_serving_cell_lat: 50.38,
        probable_serving_cell_lng: 3.02,
      }),
    ];

    expect(preferredPointFromClickStack(points, [217668, 217205])?.seq).toBe(217205);
  });

  it("preserves MapLibre order when no point has radio-link evidence", () => {
    const points = [point(10), point(11)];
    expect(preferredPointFromClickStack(points, [11, 10])?.seq).toBe(11);
  });
});
