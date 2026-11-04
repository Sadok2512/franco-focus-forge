import { describe, expect, it } from "vitest";
import {
  activePointCellLinks,
  activeServingPointLink,
  type MeasurementPointIdentity,
} from "@/features/kpi/DriveRsrpLayer";
import type { DriveRsrpPoint } from "@/features/kpi/drive-rsrp";
import type { RadioCellLink } from "@/features/kpi/measurement-point-popup";

const point = (seq: number): DriveRsrpPoint =>
  ({ seq, lat: 48.1, lng: 2.1, value: -91, cell: 0, position_source: "map" }) as DriveRsrpPoint;

const serving: RadioCellLink = {
  kind: "serving",
  lat: 48.2,
  lng: 2.2,
  confidence: "proven",
};

const neighbour: RadioCellLink = {
  kind: "neighbour",
  lat: 48.3,
  lng: 2.3,
  confidence: "probable",
};

const anchor: RadioCellLink = {
  kind: "nr_anchor",
  lat: 48.4,
  lng: 2.4,
  confidence: "proven",
};

const selected = (seq: number): MeasurementPointIdentity => ({
  projectId: "project-a",
  captureId: "capture-a",
  seq,
});

describe("active serving point link", () => {
  const entries = [
    { point: point(10), links: [serving, neighbour, anchor] },
    { point: point(20), links: [neighbour] },
  ];

  it("returns no line until a point is selected", () => {
    expect(activeServingPointLink(entries, null, "project-a", "capture-a")).toBeUndefined();
  });

  it("returns only the selected point serving link", () => {
    const active = activeServingPointLink(entries, selected(10), "project-a", "capture-a");
    expect(active).toEqual({ point: entries[0]?.point, link: serving });
    expect(active?.link.kind).toBe("serving");
  });

  it("keeps serving, neighbour and NR anchor evidence for the selected point", () => {
    const active = activePointCellLinks(entries, selected(10), "project-a", "capture-a");
    expect(active).toEqual({ point: entries[0]?.point, links: [serving, neighbour, anchor] });
  });

  it("returns no line when the selected point has no serving evidence", () => {
    expect(activeServingPointLink(entries, selected(20), "project-a", "capture-a")).toBeUndefined();
  });

  it("rejects a selection from another project or capture", () => {
    expect(activeServingPointLink(entries, selected(10), "project-b", "capture-a")).toBeUndefined();
    expect(activeServingPointLink(entries, selected(10), "project-a", "capture-b")).toBeUndefined();
    expect(activePointCellLinks(entries, selected(10), "project-b", "capture-a")).toBeUndefined();
    expect(activePointCellLinks(entries, selected(10), "project-a", "capture-b")).toBeUndefined();
  });
});
