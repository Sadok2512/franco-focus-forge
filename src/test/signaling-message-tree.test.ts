import { describe, expect, it } from "vitest";
import {
  buildMessageTree,
  checkState,
  filterMessageRows,
  messageTypes,
  searchMessageTree,
} from "@/features/signaling/message-filter";
import { classifyRrc } from "@/features/signaling/rrc-channels";
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
const lte = (name: string) => classifyRrc("LTE", name).logicalChannel;
const nr = (name: string) => classifyRrc("NR", name).logicalChannel;

describe("3GPP catalogue classification", () => {
  it("G1–G8 LTE (TS 36.331)", () => {
    expect(lte("MasterInformationBlock")).toBe("BCCH-BCH");
    expect(lte("SystemInformation - SIB2,SIB3")).toBe("BCCH-DL-SCH");
    expect(lte("SystemInformationBlockType1")).toBe("BCCH-DL-SCH");
    expect(lte("Paging")).toBe("PCCH");
    expect(lte("RRCConnectionRequest")).toBe("UL-CCCH");
    expect(lte("RRCConnectionSetup")).toBe("DL-CCCH");
    expect(lte("RRCConnectionSetupComplete")).toBe("UL-DCCH");
    expect(lte("MeasurementReport")).toBe("UL-DCCH");
    expect(lte("RRCConnectionRelease")).toBe("DL-DCCH");
    expect(lte("RRCConnectionReconfiguration")).toBe("DL-DCCH");
    expect(lte("RRCConnectionReconfigurationComplete")).toBe("UL-DCCH");
    expect(lte("UEInformationResponse-r9")).toBe("UL-DCCH");
  });
  it("G9–G10 NR (TS 38.331) and no LTE/NR confusion", () => {
    expect(nr("RRCSetupRequest")).toBe("UL-CCCH");
    expect(nr("RRCReconfiguration")).toBe("DL-DCCH");
    expect(nr("RRCReestablishment")).toBe("DL-DCCH");
    expect(nr("MIB")).toBe("BCCH-BCH");
    expect(lte("RRCReconfiguration")).toBeNull();
    expect(nr("RRCConnectionRelease")).toBeNull();
  });
  it("G12 unknown or near-miss names stay unclassified", () => {
    expect(classifyRrc("LTE", "RRCConnectionReleaseX").classificationSource).toBe("UNCLASSIFIED");
    expect(lte("Foo")).toBeNull();
  });
  it("G17 decoded channel wins and conflicts are reported", () => {
    const c = classifyRrc("LTE", "Paging", "dl_dcch-Message");
    expect(c).toMatchObject({
      logicalChannel: "DL-DCCH",
      classificationSource: "DECODED_CHANNEL",
      conflict: "PCCH",
    });
  });
});

describe("tree integrity", () => {
  const rows = [
    row({}),
    row({}),
    row({ message_name: "MeasurementReport" }),
    row({ message_name: "Paging" }),
    row({ message_name: "UnknownThing" }),
    row({ protocol: "RRC NR", layer: "rrc_nr", message_name: "RRCReconfiguration" }),
    row({ protocol: "NAS", layer: "nas", message_name: "Attach request" }),
    row({ protocol: "Événements Nemo", layer: "event", message_name: "Paging" }),
  ];
  const tree = buildMessageTree(messageTypes(rows));
  it("G13–G16 each occurrence in exactly one leaf; sums reconcile", () => {
    let leaves = 0;
    for (const tech of tree) {
      expect(tech.count).toBe(tech.channels.reduce((s, c) => s + c.count, 0));
      for (const c of tech.channels) {
        expect(c.count).toBe(c.types.reduce((s, t) => s + t.count, 0));
        leaves += c.count;
      }
    }
    expect(leaves).toBe(rows.length);
    expect(tree[0]!.channels.map((c) => c.channel)).toEqual(["PCCH", "UL-DCCH", "DL-DCCH", null]);
  });
  it("G11 NAS and Nemo are never placed in RRC channels", () => {
    for (const tech of tree.filter((t) => t.technology === "NAS" || t.technology === "NEMO"))
      expect(tech.channels.map((c) => c.channel)).toEqual([null]);
  });
  it("G19–G20 selecting a channel filters only its messages", () => {
    const pcch = tree[0]!.channels.find((c) => c.channel === "PCCH")!.types.map((t) => t.key);
    expect(filterMessageRows(rows, pcch).map((r) => r.message_name)).toEqual(["Paging"]);
    const dl = tree[0]!.channels.find((c) => c.channel === "DL-DCCH")!.types.map((t) => t.key);
    expect(filterMessageRows(rows, dl)).toHaveLength(2);
  });
  it("search by channel and indeterminate parent", () => {
    expect(searchMessageTree(tree, "pcch")[0]!.channels[0]!.channel).toBe("PCCH");
    const all = tree[0]!.channels.flatMap((c) => c.types);
    expect(checkState(all, new Set([all[0]!.key]))).toBe("indeterminate");
  });
});
