import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { parseMetricSelection } from "@/features/kpi/metric-selection";
import { isRsrpPointCode, RSRP_SELECTION } from "@/features/kpi/drive-rsrp";
import { eventTrack } from "@/features/signaling/event-track";
import { provenState, stateTrack } from "@/features/signaling/state-evidence";
import {
  getAllSignalingEvents,
  signalingSchemas,
  type RfEvent,
  type RfEvents,
} from "@/lib/api/signaling";

const metricAudit = JSON.parse(
  readFileSync("audit/bc4-kpi-parameters-tab/metrics-leaves-max-points-2000.json", "utf8"),
) as {
  projectId: string;
  captureId: string;
  results: { code: string }[];
};

const stateEvent = (track: "RRC_STATE" | "UE_STATE", seq: number): RfEvent => ({
  id: `${track}:${seq}`,
  lane: "connexion",
  type: track === "RRC_STATE" ? "RRC Connected" : "LTE Connected",
  kind: "band",
  seq,
  seq_end: seq + 2,
  t_rel_s: seq,
  t_rel_end_s: seq + 1,
  duration_ms: 1000,
  outcome: null,
  cause: null,
  label: track,
  attrs: {
    track,
    technology: "LTE",
    state: track === "RRC_STATE" ? "CONNECTED" : "LTE",
    source_seqs: [seq - 1, seq, seq + 2],
    evidence_status: "PROVEN",
    rule_id: "nemo_context_connected",
    rule_version: "1.0.0",
    capture_id: "a4b0c321c52e",
    protocol: "Procedures",
  },
  pivot_seq: seq,
  linked_seqs: [seq - 1, seq, seq + 2],
  link_rule: "nemo_context_connected",
  seq_gap: 0,
  context_id: seq,
  session_id: `context:a4b0c321c52e:${seq}`,
});

const page = (events: RfEvent[], truncated: boolean, nextSeq: number | null): RfEvents => ({
  project_id: "43e81a34a073",
  capture_id: "a4b0c321c52e",
  result_id: "g55",
  events,
  total: 3,
  lanes: ["connexion"],
  counts_by_lane: { connexion: events.length },
  link_rule_counts: { nemo_context_connected: events.length },
  rule_version: "1.0.0",
  unavailable: {},
  missing_time: 0,
  returned: events.length,
  truncated,
  next_seq: nextSeq,
});

describe("G55 — live front contracts", () => {
  it("recognises every selector measured from /metrics on Test_6", () => {
    expect(metricAudit.projectId).toBe("43e81a34a073");
    expect(metricAudit.captureId).toBe("a4b0c321c52e");
    const codes = [...new Set(metricAudit.results.map(({ code }) => code))];
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.filter((code) => parseMetricSelection(code) === null)).toEqual([]);
    expect(RSRP_SELECTION).toBe("cell_rsrp@lte-type-0");
    expect(codes.filter((code) => code.startsWith("cell_rsrp@lte-")).every(isRsrpPointCode)).toBe(
      true,
    );
  });

  it("reads RRC_STATE and UE_STATE from attrs.track when lane is connexion", () => {
    const events = [
      ...Array.from({ length: 132 }, (_, index) => stateEvent("RRC_STATE", 3 * index + 2)),
      ...Array.from({ length: 132 }, (_, index) => stateEvent("UE_STATE", 3 * index + 500)),
    ];
    const response = signalingSchemas.events.parse(page(events, false, null));
    expect(response.events.filter((event) => eventTrack(event) === "RRC_STATE")).toHaveLength(132);
    expect(response.events.filter((event) => eventTrack(event) === "UE_STATE")).toHaveLength(132);
    expect(response.events.filter((event) => stateTrack(event) === "RRC_STATE")).toHaveLength(132);
    expect(response.events.filter((event) => stateTrack(event) === "UE_STATE")).toHaveLength(132);
    expect(response.events.every((event) => provenState(event, "a4b0c321c52e") !== null)).toBe(
      true,
    );
  });

  it("continues a full-capture RF request while the server says truncated", async () => {
    const e1 = stateEvent("RRC_STATE", 2);
    const e2 = stateEvent("UE_STATE", 5);
    const e3 = stateEvent("RRC_STATE", 8);
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([e1, e2], true, 5))
      .mockResolvedValueOnce(page([e3], false, null));
    const response = await getAllSignalingEvents(
      "43e81a34a073",
      { capture_id: "a4b0c321c52e", view: "rf", from_s: 0, to_s: 4857, limit: 2000 },
      undefined,
      fetchPage,
    );
    expect(fetchPage).toHaveBeenNthCalledWith(
      1,
      "43e81a34a073",
      "events",
      expect.objectContaining({ from_s: 0, to_s: 4857, limit: 2000, after_seq: undefined }),
      undefined,
    );
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      "43e81a34a073",
      "events",
      expect.objectContaining({ from_s: 0, to_s: 4857, limit: 2000, after_seq: 5 }),
      undefined,
    );
    expect(response.events.map((event) => event.seq)).toEqual([2, 5, 8]);
    expect(response).toMatchObject({
      returned: 3,
      truncated: false,
      next_seq: null,
      counts_by_lane: { connexion: 3 },
      link_rule_counts: { nemo_context_connected: 3 },
    });
  });
});
