import { describe, expect, it } from "vitest";
import {
  DRIVE_CELL_LINK_LAYER_SPECS,
  DRIVE_SERVING_LINK_CASING_SPECS,
  cellLinkDasharray,
  cellLinkVisualOffset,
  servingCasingFilter,
} from "@/features/kpi/DriveRsrpLayer";
import {
  CELL_LINK_COLORS,
  CELL_LINK_STYLE,
  type RadioCellLink,
} from "@/features/kpi/measurement-point-popup";

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

  it("keeps probable links dashed, including serving links", () => {
    expect(cellLinkDasharray("probable")).toEqual([3, 1.5]);
    expect(cellLinkDasharray("proven")).toBeUndefined();
  });

  it("keeps selected radio evidence visible over dense map overlays", () => {
    expect(CELL_LINK_COLORS.serving).toBe("#00b8ff");
    expect(CELL_LINK_STYLE.selectedWidth).toBe(7);
    expect(CELL_LINK_STYLE.casingWidth).toBe(13);
    expect(CELL_LINK_STYLE.casingWidth - CELL_LINK_STYLE.selectedWidth).toBe(6);
    expect(CELL_LINK_STYLE.casingColor).toBe("#0f172a");
    expect(CELL_LINK_STYLE.selectedOpacity).toBe(1);
    expect(CELL_LINK_STYLE.casingOpacity).toBeGreaterThanOrEqual(0.9);
  });

  it("keeps a contrast casing for both serving confidence styles", () => {
    expect(DRIVE_SERVING_LINK_CASING_SPECS.map((layer) => layer.confidence)).toEqual([
      "probable",
      "proven",
    ]);
    expect(DRIVE_SERVING_LINK_CASING_SPECS.map((layer) => layer.linkId)).toEqual([
      "bc4-drive-rsrp-serving-links-probable",
      "bc4-drive-rsrp-serving-links-proven",
    ]);
    expect(servingCasingFilter("proven")).toContainEqual(["==", ["get", "selected"], true]);
  });

  it("separates only links that share the same server endpoint", () => {
    const links: RadioCellLink[] = [
      { kind: "serving", lat: 50.4, lng: 2.95, confidence: "probable" },
      { kind: "neighbour", lat: 50.4, lng: 2.95, confidence: "probable" },
      { kind: "nr_anchor", lat: 50.4, lng: 2.95, confidence: "probable" },
      { kind: "nr_anchor", lat: 50.41, lng: 2.96, confidence: "probable" },
    ];

    expect(links.map((link) => cellLinkVisualOffset(link, links))).toEqual([0, -6, 6, 0]);
    expect(links.map((link) => [link.lat, link.lng])).toEqual([
      [50.4, 2.95],
      [50.4, 2.95],
      [50.4, 2.95],
      [50.41, 2.96],
    ]);
  });
});
