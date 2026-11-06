import { describe, expect, it } from "vitest";
import {
  messageCategories,
  messagePreset,
  selectionForMessageFilter,
  type MessageType,
} from "@/features/signaling/message-filter";
import {
  DEFAULT_MESSAGE_COLORING,
  messageRowColor,
  parseMessageColoring,
} from "@/features/signaling/message-coloring";
import type { SignalingLine } from "@/lib/api/signaling";

const types: MessageType[] = [
  {
    key: "lte-request",
    name: "RRCConnectionRequest",
    protocol: "RRC LTE",
    count: 3,
    technology: "LTE",
    channel: "UL-CCCH",
  },
  {
    key: "lte-paging",
    name: "Paging",
    protocol: "RRC LTE",
    count: 2,
    technology: "LTE",
    channel: "PCCH",
  },
  {
    key: "nr-reconfiguration",
    name: "RRCReconfiguration",
    protocol: "RRC NR",
    count: 4,
    technology: "NR",
    channel: "DL-DCCH",
  },
  {
    key: "nas",
    name: "AttachRequest",
    protocol: "NAS",
    count: 5,
    technology: "NAS",
    channel: null,
    radioTechnology: "LTE",
  },
];

const row = (patch: Partial<SignalingLine> = {}): SignalingLine => ({
  capture_id: "capture",
  seq: 1,
  t_rel_s: 1,
  protocol: "RRC LTE",
  layer: "rrc_lte",
  technology: "LTE",
  direction: "UL",
  message_name: "RRCConnectionRequest",
  channel: "UL-CCCH",
  ecgi: null,
  pci: null,
  size_bytes: null,
  procedure_id: null,
  procedure_ids: [],
  has_tree: true,
  source: "test",
  ...patch,
});

describe("L3 filter and coloring V2", () => {
  it("uses decoded/catalogued categories and ANDs category with exact name", () => {
    expect(messageCategories(types[0]!)).toEqual(expect.arrayContaining(["RRC_LTE", "UL_CCCH"]));
    expect(
      selectionForMessageFilter(types, {
        categories: ["RRC_LTE"],
        names: ["Paging"],
        preset: null,
      }),
    ).toEqual(["lte-paging"]);
  });

  it("builds presets from types that actually exist", () => {
    expect(selectionForMessageFilter(types, messagePreset("paging", types))).toEqual([
      "lte-paging",
    ]);
    expect(selectionForMessageFilter(types, messagePreset("mobility", types))).toEqual([
      "nr-reconfiguration",
    ]);
  });

  it("gives an explicit custom rule priority over the category color", () => {
    const coloring = parseMessageColoring(
      JSON.stringify({
        ...DEFAULT_MESSAGE_COLORING,
        rules: [
          {
            id: "one",
            enabled: true,
            field: "message",
            operator: "contains",
            value: "ConnectionRequest",
            color: "#abcdef",
          },
        ],
      }),
    );
    expect(messageRowColor(row(), coloring)).toBe("#abcdef");
    expect(messageRowColor(row(), { ...coloring, enabled: false })).toBeUndefined();
  });
});
