import { describe, expect, it } from "vitest";
import {
  buildMessageTree,
  checkState,
  messageTypes,
  searchMessageTree,
} from "@/features/signaling/message-filter";
import type { SignalingLine } from "@/lib/api/signaling";

const row = (o: Partial<SignalingLine>): SignalingLine => ({
  capture_id: "c",
  seq: 1,
  t_rel_s: 0,
  protocol: "RRC LTE",
  layer: "rrc_lte",
  technology: "LTE",
  direction: "DL",
  message_name: "RRCConnectionRelease",
  ecgi: null,
  pci: null,
  size_bytes: null,
  procedure_id: null,
  procedure_ids: [],
  has_tree: false,
  source: "s",
  ...o,
});
const rows = [
  row({ channel: "DL-DCCH" }),
  row({ channel: "DL-DCCH" }),
  row({ message_name: "MeasurementReport", channel: "UL-DCCH" }),
  row({ protocol: "RRC NR", layer: "rrc_nr", message_name: "RRCReconfiguration" }),
  row({ protocol: "NAS", layer: "nas", message_name: "Attach request" }),
];
describe("hierarchical message filter", () => {
  const tree = buildMessageTree(messageTypes(rows));
  it("groups Technology → Channel with real occurrence counts", () => {
    expect(tree.map((t) => t.technology)).toEqual(["LTE", "NR", "NAS"]);
    expect(tree[0]!.count).toBe(3);
    expect(tree[0]!.channels.find((c) => c.channel === "DL-DCCH")!.count).toBe(2);
  });
  it("never guesses a channel from the message name", () => {
    expect(tree[1]!.channels.map((c) => c.channel)).toEqual([null]);
  });
  it("search by channel keeps its technology and messages", () => {
    const r = searchMessageTree(tree, "dl-dcch");
    expect(r).toHaveLength(1);
    expect(r[0]!.channels[0]!.types[0]!.name).toBe("RRCConnectionRelease");
  });
  it("parent checkbox is indeterminate on partial selection", () => {
    const lte = tree[0]!.channels.flatMap((c) => c.types);
    expect(checkState(lte, new Set([lte[0]!.key]))).toBe("indeterminate");
    expect(checkState(lte, new Set(lte.map((t) => t.key)))).toBe(true);
  });
});
