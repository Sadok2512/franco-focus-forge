import { describe, expect, it } from "vitest";
import { findRsrpKpi, rsrpClass } from "@/features/kpi/drive-rsrp";

describe("drive RSRP classes", () => {
  it("classifies by dBm thresholds", () => {
    expect(rsrpClass(-80)).toBe("excellent");
    expect(rsrpClass(-80.1)).toBe("good");
    expect(rsrpClass(-100)).toBe("fair");
    expect(rsrpClass(-110)).toBe("poor");
    expect(rsrpClass(-125)).toBe("bad");
  });
  it("never classifies a missing value", () => {
    expect(rsrpClass(null)).toBeNull();
    expect(rsrpClass(Number.NaN)).toBeNull();
  });
  it("picks the LTE RSRP KPI from the catalogue", () => {
    const k = (code: string) => ({ code, name: code, nature: "", unit: "dBm", source: null, formula: null, status: "AVAILABLE", reason: null });
    const catalog = {
      project_id: "p", catalog_version: "1",
      tree: [
        { techno: "NR", families: [{ family: "Radio", kpis: [k("NR_RSRP")] }] },
        { techno: "LTE", families: [{ family: "Radio", kpis: [k("SINR"), k("LTE_RSRP")] }] },
      ],
    } as never;
    expect(findRsrpKpi(catalog)?.code).toBe("LTE_RSRP");
  });
});

import { isRsrpPointCode, RSRP_SELECTION } from "@/features/kpi/drive-rsrp";
describe("RSRP map point codes", () => {
  it("requests the PCell selection and accepts the echoed selection code", () => {
    expect(RSRP_SELECTION).toBe("cell_rsrp@0");
    expect(isRsrpPointCode("cell_rsrp@0")).toBe(true);
    expect(isRsrpPointCode("cell_rsrp")).toBe(true);
    expect(isRsrpPointCode("cell_rsrp@1")).toBe(false);
    expect(isRsrpPointCode("cell_rsrq@0")).toBe(false);
  });
});
