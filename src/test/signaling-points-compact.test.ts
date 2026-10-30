import { describe, expect, it } from "vitest";
import { signalingSchemas } from "@/lib/api/signaling";

describe("signaling compact points", () => {
  it("reconstructs every map point and protocol", () => {
    const parsed = signalingSchemas.points.parse({
      project_id: "project",
      capture_id: "capture",
      result_id: "result",
      format: "compact-v1",
      point_fields: ["seq", "t_rel_s", "lat", "lng", "protocol_index", "gps_seq", "seq_gap"],
      marker_fields: ["seq", "t_rel_s", "lat", "lng", "protocol_index", "counts"],
      protocols: ["RRC LTE", "NAS"],
      points: [
        [11, 1.25, 50.1, 2.2, 1, 10, 1],
        [12, 1.5, null, null, 0, null, null],
      ],
      markers: [[11, 1.25, 50.1, 2.2, 1, [0, 1]]],
      positioned_count: 1,
      indoor: false,
      floorplan_id: null,
      reason: null,
      total: 2,
      returned: 2,
      truncated: false,
    });
    expect(parsed.points).toEqual([
      { seq: 11, t_rel_s: 1.25, lat: 50.1, lng: 2.2, protocol: "NAS", gps_seq: 10, seq_gap: 1 },
      {
        seq: 12,
        t_rel_s: 1.5,
        lat: null,
        lng: null,
        protocol: "RRC LTE",
        gps_seq: null,
        seq_gap: null,
      },
    ]);
    expect(parsed.markers[0]?.counts).toEqual({ "RRC LTE": 0, NAS: 1 });
  });
});
