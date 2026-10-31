import { describe, expect, it } from "vitest";
import { DRIVE_CELL_LINK_LAYER_SPECS } from "@/features/kpi/DriveRsrpLayer";

describe("Drive RSRP cell-link layer order", () => {
  it("paints serving links after neighbour and NR links for both confidences", () => {
    const firstServing = DRIVE_CELL_LINK_LAYER_SPECS.findIndex((layer) => layer.serving);
    const lastOther = DRIVE_CELL_LINK_LAYER_SPECS.reduce(
      (index, layer, current) => (!layer.serving ? current : index),
      -1,
    );

    expect(firstServing).toBeGreaterThan(lastOther);
    expect(
      DRIVE_CELL_LINK_LAYER_SPECS.filter((layer) => layer.serving).map((layer) => layer.confidence),
    ).toEqual(["probable", "proven"]);
  });
});
