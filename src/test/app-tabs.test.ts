import { describe, expect, it } from "vitest";
import { fullAppTabUrl, isDetachedMapView } from "@/lib/app-tabs";

describe("browser tab modes", () => {
  it("recognizes only the dedicated KPI map URL", () => {
    expect(isDetachedMapView("/kpi", "?map_panel=cell_rsrp%40lte-type-0")).toBe(true);
    expect(isDetachedMapView("/kpi", "")).toBe(false);
    expect(isDetachedMapView("/projects", "?map_panel=cell_rsrp%40lte-type-0")).toBe(false);
  });

  it("opens the complete app without detached-map parameters", () => {
    expect(
      fullAppTabUrl(
        "https://bc4.example/kpi?tech=LTE&map_panel=cell_rsrp%40lte-type-0&map_workspace=one",
      ),
    ).toBe("https://bc4.example/kpi?tech=LTE");
  });
});
