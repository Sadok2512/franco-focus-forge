import { describe, expect, it } from "vitest";
import { mapFeatures } from "@/features/kpi/map-model";
import type { KpiTimeSeries } from "@/lib/api/kpi-timeseries";
import { CELLS_VISIBLE_ZOOM, MAP_INITIAL_ZOOM, MAP_MIN_ZOOM } from "@/features/kpi/SitesLayer";

const data: KpiTimeSeries = {
  status: "AVAILABLE",
  reason: null,
  metric_code: "TEST_KPI",
  metric_name: "TEST KPI",
  capture_id: "TEST_CAPTURE",
  x_axis: { field: "time_s", unit: "s" },
  y_axis: { field: "value", unit: "%" },
  n_total: 4,
  n_returned: 4,
  sampling: null,
  evidence: {
    source_view: null,
    source_table: "TEST_TABLE",
    source_column: "TEST_VALUE",
    metric_code_nmf: "TEST",
    n: 4,
    result_id: "TEST_RESULT",
    decoder_version: null,
    schema_version: null,
    decode_level: null,
    origin_seq: 1,
    origin_ts: null,
  },
  points: [
    { seq: 1, time_s: 0, value: 0, longitude: 0, latitude: 0 },
    { seq: 2, time_s: 1, value: 5, longitude: null, latitude: 0 },
    { seq: 3, time_s: 2, value: 6, longitude: 0, latitude: 91 },
    { seq: 4, time_s: 3, value: 7, longitude: 0, latitude: 1 },
  ],
};
describe("KPI geographic observations", () => {
  it("uses the approved site/cell zoom thresholds", () => {
    expect(MAP_MIN_ZOOM).toBe(6);
    expect(MAP_INITIAL_ZOOM).toBe(11);
    expect(CELLS_VISIBLE_ZOOM).toBe(11);
  });
  it("keeps proven zero coordinates and values, rejects missing/invalid GPS, retains evidence", () => {
    const before = JSON.stringify(data);
    const points = mapFeatures(data);
    expect(points).toHaveLength(2);
    expect(points[0]!.geometry.coordinates).toEqual([0, 0]);
    expect(points[0]!.properties).toMatchObject({
      value: 0,
      seq: 1,
      capture_id: "TEST_CAPTURE",
      result_id: "TEST_RESULT",
    });
    expect(JSON.stringify(data)).toBe(before);
  });
  it("never maps unvalidated observations or observations without evidence", () => {
    expect(mapFeatures({ ...data, status: "UNVALIDATED" })).toEqual([]);
    expect(mapFeatures({ ...data, evidence: { ...data.evidence, result_id: null } })).toEqual([]);
    expect(mapFeatures(undefined)).toEqual([]);
  });
});
