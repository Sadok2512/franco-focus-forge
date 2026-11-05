import { describe, expect, it } from "vitest";
import { DRIVE_CELL_LINK_LAYER_SPECS, cellLinkVisualOffset } from "@/features/kpi/DriveRsrpLayer";
import {
  CELL_LINK_COLORS,
  CELL_LINK_STYLE,
  cellLinkDasharray,
  cellLinkWidth,
  type RadioCellLink,
} from "@/features/kpi/measurement-point-popup";

describe("Drive RSRP cell-link presentation", () => {
  it("paints neighbour, NR PSCell, then LTE Serving", () => {
    expect(DRIVE_CELL_LINK_LAYER_SPECS.map((layer) => layer.kind)).toEqual([
      "neighbour",
      "nr_anchor",
      "serving",
    ]);
  });

  it("uses the approved per-kind line grammar", () => {
    expect(CELL_LINK_COLORS.serving).toBe("#2563eb");
    expect(CELL_LINK_COLORS.nr_anchor).toBe("#7c3aed");
    expect(CELL_LINK_COLORS.neighbour).toBe("#64748b");
    expect(cellLinkWidth("serving")).toBe(2);
    expect(cellLinkWidth("nr_anchor")).toBe(2);
    expect(cellLinkWidth("neighbour")).toBe(1.25);
    expect(cellLinkDasharray("serving")).toBeUndefined();
    expect(cellLinkDasharray("nr_anchor")).toEqual(CELL_LINK_STYLE.nrDash);
    expect(cellLinkDasharray("neighbour")).toEqual(CELL_LINK_STYLE.neighbourDash);
  });

  it("uses only a restrained presentation offset for coincident endpoints", () => {
    const links: RadioCellLink[] = [
      { kind: "serving", lat: 50.4, lng: 2.95, confidence: "proven" },
      { kind: "neighbour", lat: 50.4, lng: 2.95, confidence: "proven" },
      { kind: "nr_anchor", lat: 50.4, lng: 2.95, confidence: "proven" },
      { kind: "nr_anchor", lat: 50.41, lng: 2.96, confidence: "proven" },
    ];

    expect(links.map((link) => cellLinkVisualOffset(link, links))).toEqual([0, -2, 2, 0]);
    expect(links.map((link) => [link.lat, link.lng])).toEqual([
      [50.4, 2.95],
      [50.4, 2.95],
      [50.4, 2.95],
      [50.41, 2.96],
    ]);
  });
});
