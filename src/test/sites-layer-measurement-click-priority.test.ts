import { describe, expect, it, vi } from "vitest";
import {
  MEASUREMENT_CLICK_LAYER_IDS,
  measurementOwnsMapClick,
} from "@/features/kpi/SitesLayer";

describe("SitesLayer measurement click priority", () => {
  it("lets a KPI measurement own a click superposed with a site", () => {
    const getLayer = vi.fn((id: string) =>
      ["metrics-v3", "bc4-sites-site"].includes(id) ? { id } : undefined,
    );
    const queryRenderedFeatures = vi.fn(() => [{ layer: { id: "metrics-v3" } }]);

    expect(
      measurementOwnsMapClick(
        { getLayer, queryRenderedFeatures } as never,
        { x: 10, y: 20 } as never,
      ),
    ).toBe(true);
    expect(queryRenderedFeatures).toHaveBeenCalledWith(
      { x: 10, y: 20 },
      { layers: ["metrics-v3"] },
    );
  });

  it("keeps the serving endpoint available to the Sites/Cells handler", () => {
    const getLayer = vi.fn((id: string) =>
      id === "bc4-drive-rsrp-serving-site" ? { id } : undefined,
    );
    const queryRenderedFeatures = vi.fn(() => []);

    expect(
      measurementOwnsMapClick(
        { getLayer, queryRenderedFeatures } as never,
        { x: 10, y: 20 } as never,
      ),
    ).toBe(false);
    expect(MEASUREMENT_CLICK_LAYER_IDS).not.toContain("bc4-drive-rsrp-serving-site");
    expect(queryRenderedFeatures).not.toHaveBeenCalled();
  });
});
