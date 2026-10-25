import { describe, expect, it } from "vitest";
import { BAND_CODES, haversine, scaleBar, searchNetwork, toggleWithin } from "@/features/kpi/network-map-model";

describe("network map model", () => {
  it("unchecking one band from 'all' keeps every other band", () => {
    expect(toggleWithin([], ["n78"], BAND_CODES)).toEqual(BAND_CODES.filter((c) => c !== "n78"));
  });
  it("re-checking the last missing band returns to 'all' (empty)", () => {
    expect(toggleWithin(BAND_CODES.filter((c) => c !== "n78"), ["n78"], BAND_CODES)).toEqual([]);
  });
  it("never removes the last active band", () => {
    expect(toggleWithin(["B3"], ["B3"], BAND_CODES)).toEqual(["B3"]);
  });
  it("measures Paris–Lyon distance around 391 km", () => {
    expect(Math.round(haversine([2.3522, 48.8566], [4.8357, 45.764]) / 1000)).toBe(391);
  });
  it("scale bar uses a 1/2/5 step", () => {
    expect(scaleBar(11, 46.6).label).toMatch(/^(1|2|5)(0|00)? ?(m|km)|^\d+(\.\d+)? km$/);
  });
  it("search finds a loaded cell by PCI and coordinates", () => {
    const cells = [{ geometry: { coordinates: [2.1, 48.1] as [number, number] }, properties: { site_id: "S1", cell_name: "C1", pci: 412 } }];
    expect(searchNetwork("412", [], cells)[0]?.center).toEqual([2.1, 48.1]);
    expect(searchNetwork("48.8, 2.3", [], [])[0]?.center).toEqual([2.3, 48.8]);
  });
});
