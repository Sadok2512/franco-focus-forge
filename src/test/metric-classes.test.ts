import { describe, expect, it } from "vitest";
import { classOf, metricClasses } from "@/features/kpi/metric-classes";

describe("metric map colour classes", () => {
  it("uses RSRP coverage classes for RSRP", () => {
    const c = metricClasses("cell_rsrp@0", []);
    expect(classOf(c, -75)?.id).toBe("excellent");
    expect(classOf(c, -120)?.id).toBe("bad");
  });
  it("splits other metrics into 5 bins covering min and max", () => {
    const c = metricClasses("LTE_DL_BLER", [0, 10]);
    expect(c).toHaveLength(5);
    expect(classOf(c, 0)?.id).toBe("c0");
    expect(classOf(c, 10)?.id).toBe("c4");
  });
});
