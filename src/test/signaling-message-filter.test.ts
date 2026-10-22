import { describe, expect, it } from "vitest";
import {
  filterMessageRows,
  messageTypes,
  searchMessageTypes,
  setVisibleTypes,
  reconcileMessageSelection,
  messagePage,
  messageRowsCsv,
} from "@/features/signaling/message-filter";
import { getAllSignalingRows } from "@/lib/api/signaling-message-types";
import type { SignalingLine, SignalingRows } from "@/lib/api/signaling";

const row = (seq: number, name = "Paging", protocol = "RRC LTE"): SignalingLine => ({
  capture_id: "capture",
  seq,
  message_name: name,
  protocol,
  t_rel_s: seq,
  technology: "LTE",
  direction: "DL",
  ecgi: null,
  pci: null,
  size_bytes: null,
  procedure_id: null,
  procedure_ids: [],
  has_tree: true,
  source: "nmf",
});
const rows = [row(1), row(2), row(3, "Paging", "RRC NR"), row(4, "RRCConnectionRequest")];
const types = messageTypes(rows);
const paging = types.find((type) => type.name === "Paging" && type.protocol === "RRC LTE");
if (!paging) throw new Error("Missing fixture type");

describe("capture message filter", () => {
  it("counts all occurrences and distinguishes the same name in two layers", () => {
    expect(types).toHaveLength(3);
    expect(paging.count).toBe(2);
    expect(types.find((type) => type.protocol === "RRC NR")?.count).toBe(1);
  });
  it("search is local, case insensitive and does not change selected hidden types", () => {
    const visible = searchMessageTypes(types, "rrcCONNECTION");
    expect(visible.map((type) => type.name)).toEqual(["RRCConnectionRequest"]);
    expect(setVisibleTypes([paging.key], visible, true)).toHaveLength(2);
    expect(setVisibleTypes([paging.key, visible[0]?.key ?? "missing"], visible, false)).toEqual([
      paging.key,
    ]);
  });
  it("zero selected types is not unrestricted", () => {
    expect(filterMessageRows(rows, [])).toEqual([]);
    expect(filterMessageRows(rows, null)).toHaveLength(4);
  });
  it("matches exact type+layer and not a substring or current page", () => {
    expect(filterMessageRows(rows, [paging.key]).map((r) => r.seq)).toEqual([1, 2]);
  });
  it("removes incompatible capture types while preserving explicit empty and unrestricted", () => {
    expect(reconcileMessageSelection([paging.key, "absent"], types)).toEqual([paging.key]);
    expect(reconcileMessageSelection([paging.key], messageTypes([row(6, "Other")]))).toEqual([]);
    expect(reconcileMessageSelection(null, [])).toBeNull();
  });
  it("clamps pagination when filtered results shrink", () => {
    expect(messagePage(rows, 9, 2)).toEqual({
      rows: rows.slice(2),
      total: 4,
      page: 2,
      size: 2,
      pages: 2,
    });
    expect(messagePage([], 9, 100).page).toBe(1);
  });
  it("CSV exports the same complete selected rows", () => {
    const csv = messageRowsCsv(filterMessageRows(rows, [paging.key]));
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).not.toContain("RRCConnectionRequest");
  });
});

const batch = (page: number, pageRows: SignalingLine[], total = 4): SignalingRows => ({
  project_id: "p",
  capture_id: "capture",
  result_id: "r",
  rows: pageRows,
  total,
  page,
  size: 2,
  pages: 2,
  protocol_counts: {},
  procedures: [],
  selected_page: null,
});
it("loads every actual VM page before publishing counts", async () => {
  const calls: number[] = [];
  const data = await getAllSignalingRows(
    "p",
    { capture_id: "capture" },
    undefined,
    async (_p, _k, params) => {
      calls.push(Number(params["page"]));
      return Number(params["page"]) === 1 ? batch(1, rows.slice(0, 2)) : batch(2, rows.slice(2));
    },
  );
  expect(calls).toEqual([1, 2]);
  expect(data.rows).toHaveLength(4);
});
it("rejects partial or duplicate rows rather than publishing false counts", async () => {
  await expect(
    getAllSignalingRows("p", {}, undefined, async () => batch(1, rows.slice(0, 2))),
  ).rejects.toThrow("Incomplete");
});
it("rejects changing capture totals", async () => {
  await expect(
    getAllSignalingRows("p", {}, undefined, async (_p, _k, params) =>
      Number(params["page"]) === 1 ? batch(1, rows.slice(0, 2)) : batch(2, rows.slice(2), 5),
    ),
  ).rejects.toThrow("changing");
});
