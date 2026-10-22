import { describe, expect, it } from "vitest";
import { eventTrack } from "@/features/signaling/event-track";
import { eventIcon } from "@/features/signaling/event-icons";
import { isAllowedNetworkEvent } from "@/features/signaling/network-events";
import type { RfEvent } from "@/lib/api/signaling";

/** Events as the VM really sends them: canonical lane, empty attrs. */
const vmEvent = (over: Partial<RfEvent>): RfEvent => ({
  id: "e",
  lane: "mobilite",
  type: "MEI",
  kind: "mark",
  seq: 1,
  seq_end: null,
  t_rel_s: 10,
  t_rel_end_s: null,
  duration_ms: null,
  outcome: null,
  cause: null,
  label: "MEI",
  attrs: {},
  pivot_seq: null,
  linked_seqs: [],
  link_rule: "ho_reconfig_mobility",
  seq_gap: null,
  ...over,
});

describe("VM lane resolution for the timeline", () => {
  it("maps the mobilite lane onto the mobility track when attrs are empty", () => {
    expect(eventTrack(vmEvent({ type: "HOA" }))).toBe("mobility");
    expect(eventTrack(vmEvent({ type: "ho", kind: "bar" }))).toBe("mobility");
  });

  it("keeps attrs.track as the source of truth when the rf view supplies it", () => {
    expect(
      eventTrack(
        vmEvent({ lane: "connexion", attrs: { track: "UE_STATE" }, type: "rrc_connection" }),
      ),
    ).toBe("UE_STATE");
  });

  it("leaves the other VM lanes on the network track", () => {
    expect(eventTrack(vmEvent({ lane: "connexion", type: "RRA" }))).toBe("network");
    expect(eventTrack(vmEvent({ lane: "services", type: "DAA" }))).toBe("network");
    expect(eventTrack(vmEvent({ lane: "acces", type: "RACHI" }))).toBe("network");
  });

  it("does not move VM mobility events into the Network Events allowlist", () => {
    for (const type of ["HOA", "HOS", "HOI", "MEI", "ho"])
      expect(isAllowedNetworkEvent({ type, label: type })).toBe(false);
  });
});

describe("Mobility icons for VM event codes", () => {
  it("gives every VM mobility code its own glyph", () => {
    const icons = ["HOA", "HOS", "HOI", "MEI"].map(
      (type) => eventIcon(vmEvent({ type })).icon,
    );
    expect(new Set(icons).size).toBe(4);
    expect(eventIcon(vmEvent({ type: "ho", kind: "bar", outcome: "ok" })).icon).toBeDefined();
    expect(new Set([...icons, eventIcon(vmEvent({ type: "ho", kind: "bar" })).icon]).size).toBe(5);
  });

  it("marks a failed handover procedure as an error", () => {
    const marker = eventIcon(vmEvent({ type: "ho", kind: "bar", outcome: "fail" }));
    expect(marker.role).toBe("error");
  });

  it("keeps a successful handover procedure neutral", () => {
    const marker = eventIcon(vmEvent({ type: "ho", kind: "bar", outcome: "ok" }));
    expect(marker.role).not.toBe("error");
  });
});

