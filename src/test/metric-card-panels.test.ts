import { beforeEach, describe, expect, it } from "vitest";
import {
  legacyMetricCardPanels,
  newMetricCardPanel,
  readMetricCardPanels,
  writeMetricCardPanels,
} from "@/features/kpi/metric-card-panels";

describe("independent metric card panels", () => {
  beforeEach(() => localStorage.clear());

  it("persists several views of the same metric with unique identities", () => {
    const panels = [
      newMetricCardPanel("cell_rsrp@lte-type-0", "map"),
      newMetricCardPanel("cell_rsrp@lte-type-0", "graph"),
      newMetricCardPanel("cell_rsrq@lte-type-0", "graph"),
    ];
    writeMetricCardPanels("workspace-a", panels);
    expect(readMetricCardPanels("workspace-a")).toEqual(panels);
    expect(new Set(panels.map((panel) => panel.id)).size).toBe(3);
  });

  it("migrates legacy views without creating a card for table-only metrics", () => {
    expect(
      legacyMetricCardPanels(["rsrp", "rsrq", "sinr"], {
        rsrp: "map",
        rsrq: "graph",
        sinr: "table",
      }).map(({ code, view }) => ({ code, view })),
    ).toEqual([
      { code: "rsrp", view: "map" },
      { code: "rsrq", view: "graph" },
    ]);
  });
});
