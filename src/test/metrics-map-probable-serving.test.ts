import { describe, expect, it } from "vitest";
import { MetricMapResponseSchema } from "@/lib/api/metrics-schemas";

describe("metrics map probable serving contract", () => {
  it("does not strip the 0.118.1 probable serving evidence", () => {
    const response = MetricMapResponseSchema.parse({
      project_id: "43e81a34a073",
      capture_id: "a4b0c321c52e",
      result_id: "result",
      decoder_version: "test",
      total_points: 1,
      map_points: [
        {
          seq: 23,
          lat: 50.39,
          lng: 2.98,
          code: "cell_rsrp@lte-type-0",
          value: -84,
          t_rel_s: 1,
          tooltip: "RSRP -84 dBm",
          probable_serving_cell_ref_id: "466486624",
          probable_serving_site_id: "00034893F5",
          probable_serving_site_name: "HENIN BEAUMONT",
          probable_serving_cell_lat: 50.392,
          probable_serving_cell_lng: 2.977,
          probable_serving_pci: 195,
          probable_serving_band_mhz: 1800,
          probable_serving_distance_m: 692.5,
        },
      ],
    });
    expect(response.map_points[0]).toMatchObject({
      probable_serving_cell_ref_id: "466486624",
      probable_serving_cell_lat: 50.392,
      probable_serving_cell_lng: 2.977,
      probable_serving_pci: 195,
      probable_serving_distance_m: 692.5,
    });
  });
});
