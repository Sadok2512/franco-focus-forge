import { describe, expect, it } from "vitest";
import {
  EXPLICIT_NETWORK_EVENT_TYPES,
  eventTypeCounts,
  isAllowedNetworkEvent,
} from "@/features/signaling/network-events";

describe("Network Events presentation allowlist", () => {
  it("includes LTE and NR RRC Request events", () => {
    for (const type of ["RRC Request", "RRCConnectionRequest", "RRCSetupRequest", "rrc_request"])
      expect(isAllowedNetworkEvent({ type, label: "" })).toBe(true);
    expect(isAllowedNetworkEvent({ type: "rrc_setup", label: "RRC Request" })).toBe(true);
  });

  it("includes RRC Release events", () => {
    for (const type of ["RRC Release", "RRCConnectionRelease", "RRCRelease", "rrc_release"])
      expect(isAllowedNetworkEvent({ type, label: "" })).toBe(true);
  });

  it("includes SCG events", () => {
    for (const type of ["SCG", "scg_addition", "SCGFailureInformation", "scg_release"])
      expect(isAllowedNetworkEvent({ type, label: "" })).toBe(true);
  });

  it("explicitly includes every Mobilité 3b event type", () => {
    expect(EXPLICIT_NETWORK_EVENT_TYPES).toEqual([
      "PSCELL_CHANGE",
      "SCG_ADD",
      "SCG_RELEASE",
      "RRRE",
      "RRF",
      "TUF",
      "LUF",
      "PBF",
    ]);
    for (const type of EXPLICIT_NETWORK_EVENT_TYPES)
      expect(isAllowedNetworkEvent({ type, label: type })).toBe(true);
  });

  it("counts exactly the API population by type", () => {
    expect(eventTypeCounts([{ type: "HOS" }, { type: "HOA" }, { type: "HOS" }])).toEqual([
      { type: "HOA", count: 1 },
      { type: "HOS", count: 2 },
    ]);
  });

  it("excludes other network events and does not mutate source data", () => {
    const events = [
      "RRCConnectionSetupComplete",
      "RRCReconfiguration",
      "NAS Attach Request",
      "handover",
      "measurement_report",
    ].map((type) => ({ type, label: type }));
    expect(events.filter(isAllowedNetworkEvent)).toEqual([]);
    expect(events).toHaveLength(5);
  });
});
