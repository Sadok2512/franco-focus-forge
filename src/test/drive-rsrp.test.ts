import { describe, expect, it } from "vitest";
import {
  driveRsrpDiagnostics,
  driveRsrpPoints,
  findRsrpKpi,
  isRsrpPointCode,
  rsrpClass,
  RSRP_SELECTION,
  rsrpPositionsFrom,
} from "@/features/kpi/drive-rsrp";

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

describe("RSRP map point codes", () => {
  it("requests the PCell selection and accepts any cell index the API echoes", () => {
    expect(RSRP_SELECTION).toBe("cell_rsrp@0");
    expect(isRsrpPointCode("cell_rsrp@0")).toBe(true);
    expect(isRsrpPointCode("cell_rsrp")).toBe(true);
    expect(isRsrpPointCode("cell_rsrp@1")).toBe(true);
    expect(isRsrpPointCode("cell_rsrp@12")).toBe(true);
    expect(isRsrpPointCode("cell_rsrq@0")).toBe(false);
    expect(isRsrpPointCode("srs_rsrp@0")).toBe(false);
  });
});

describe("drive RSRP points from table rows", () => {
  const row = (lat: number | null, lon: number | null, v: number | null) => ({
    seq_first: 1, lat, lon, values: { "cell_rsrp@0": v },
  });
  it("uses rows with GPS and RSRP when map_points is empty", () => {
    const pts = driveRsrpPoints({ map_points: [], rows: [row(50.378, 3.478, -92), row(null, null, -80), row(50.4, 3.5, null)] });
    expect(pts).toEqual([{ seq: 1, lat: 50.378, lng: 3.478, value: -92, cell: 0, position_source: "row" }]);
  });
  it("prefers API map_points when present", () => {
    const pts = driveRsrpPoints({
      map_points: [{ seq: 9, lat: 1, lng: 2, code: "cell_rsrp@0", value: -70 }],
      rows: [row(50, 3, -90)],
    });
    expect(pts).toEqual([{ seq: 9, lat: 1, lng: 2, value: -70, cell: 0, position_source: "map" }]);
  });
  it("keeps an exact CHI to cell_ref serving-cell proof", () => {
    const pts = driveRsrpPoints({
      map_points: [
        {
          seq: 9,
          lat: 50.37,
          lng: 3.47,
          code: "cell_rsrp@0",
          value: -84,
          serving_cell_id: "11745802",
          serving_cell_seq: 7,
          serving_cell_ref_id: "ref-1",
          serving_site_id: "site-1",
          serving_site_name: "SITE ONE",
          serving_cell_lat: 50.38,
          serving_cell_lng: 3.48,
          serving_cell_source: "chi_previous_seq_cell_ref_exact",
        },
      ],
    });
    expect(pts[0]).toMatchObject({
      serving_cell_id: "11745802",
      serving_cell_seq: 7,
      serving_cell_ref_id: "ref-1",
      serving_site_id: "site-1",
      serving_site_name: "SITE ONE",
      serving_cell_lat: 50.38,
      serving_cell_lng: 3.48,
      serving_cell_source: "chi_previous_seq_cell_ref_exact",
    });
  });
  it("drops unproved serving coordinates even if coordinates are present", () => {
    const pts = driveRsrpPoints({
      map_points: [
        {
          seq: 9,
          lat: 50.37,
          lng: 3.47,
          code: "cell_rsrp@0",
          value: -84,
          serving_cell_lat: 50.38,
          serving_cell_lng: 3.48,
        },
      ],
    });
    expect(pts[0]?.serving_cell_lat).toBeUndefined();
    expect(pts[0]?.serving_cell_lng).toBeUndefined();
  });
  it("reads the RSRP of any cell column, lowest cell first", () => {
    const pts = driveRsrpPoints({
      map_points: [],
      rows: [
        { seq_first: 4, lat: 50.3, lon: 3.4, values: { "cell_rsrq@0": -10, "cell_rsrp@2": -88 } },
        { seq_first: 5, lat: 50.31, lon: 3.41, values: { "cell_rsrp@0": null, "cell_rsrp@1": -95 } },
      ],
    });
    expect(pts).toEqual([
      { seq: 4, lat: 50.3, lng: 3.4, value: -88, cell: 2, position_source: "row" },
      { seq: 5, lat: 50.31, lng: 3.41, value: -95, cell: 1, position_source: "row" },
    ]);
  });
});

describe("drive RSRP paired with the capture's GPS log", () => {
  const rows = [
    { seq_first: 14, lat: null, lon: null, values: { "cell_rsrp@0": -95 } },
    { seq_first: 15, lat: null, lon: null, values: { "cell_rsrp@0": -97 } },
  ];
  it("places a row without its own GPS on the capture position of the same sequence", () => {
    const pts = driveRsrpPoints({ map_points: [], rows }, [
      { seq: 14, lat: 50.378, lng: 3.478 },
      { seq: 15, lat: 50.379, lng: 3.479 },
    ]);
    expect(pts).toEqual([
      { seq: 14, lat: 50.378, lng: 3.478, value: -95, cell: 0, position_source: "capture" },
      { seq: 15, lat: 50.379, lng: 3.479, value: -97, cell: 0, position_source: "capture" },
    ]);
  });
  it("never borrows a neighbouring position", () => {
    expect(driveRsrpPoints({ map_points: [], rows }, [{ seq: 14, lat: 50.378, lng: 3.478 }])).toEqual([
      { seq: 14, lat: 50.378, lng: 3.478, value: -95, cell: 0, position_source: "capture" },
    ]);
  });
  it("drops a row whose capture position has no coordinates", () => {
    expect(driveRsrpPoints({ map_points: [], rows }, [
      { seq: 14, lat: null, lng: null },
      { seq: 15, lat: Number.NaN, lng: 3.479 },
    ])).toEqual([]);
  });
  it("expands a grouped marker over the sequences the server attached to it", () => {
    const positions = rsrpPositionsFrom(
      [{ seq: 1, lat: 50.37, lng: 3.47 }],
      [{ lat: 50.38, lng: 3.48, seqs: [2, 3] }],
    );
    expect(positions).toEqual([
      { seq: 1, lat: 50.37, lng: 3.47 },
      { seq: 2, lat: 50.38, lng: 3.48 },
      { seq: 3, lat: 50.38, lng: 3.48 },
    ]);
  });
});

describe("drive RSRP diagnostics", () => {
  it("states which part of the reply is missing", () => {
    const diag = driveRsrpDiagnostics(
      {
        map_points: [],
        rows: [
          { seq_first: 1, lat: 50.37, lon: 3.47, values: { "cell_rsrp@0": -90 } },
          { seq_first: 2, lat: null, lon: null, values: { "cell_rsrp@0": -91 } },
          { seq_first: 3, lat: null, lon: null, values: { "cell_rsrp@0": null } },
          { seq_first: 4, lat: null, lon: null, values: { "cell_rsrp@0": -93 } },
        ],
      },
      [{ seq: 2, lat: 50.38, lng: 3.48 }],
    );
    expect(diag).toEqual({
      rows: 4,
      rowsWithRsrp: 3,
      rowsWithGps: 1,
      paired: 1,
      mapPoints: 0,
      rsrpMapPoints: 0,
    });
  });
});
