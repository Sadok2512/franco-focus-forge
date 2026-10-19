import { describe, it, expect } from "vitest";
import {
  defaultFilters,
  filterSnapshot,
  geographicQuery,
  appliedKey,
  draftKey,
} from "@/features/dict-v2/filter-state";
import {
  identifyTrees,
  selectedParameter,
  selectionId,
} from "@/features/dict-v2/parameter-identity";
import type { DictTreeResponse, DictLeaf } from "@/lib/api/dict-v2";
const tree = (
  view: "catalog" | "raw",
  leaves: DictLeaf[],
  technology = "LTE",
  message = "RRCConnectionReconfiguration",
): DictTreeResponse => ({
  project_id: "test",
  view,
  total_rows: 10,
  distinct_param_keys: leaves.length,
  tree: [
    {
      techno: technology,
      origins: [
        {
          origin: "network_config",
          messages: [{ message, groups: [{ name: "Mobilité", kpis: leaves }] }],
        },
      ],
    },
  ],
});
const leaf = (key: string, n = 10): DictLeaf => ({
  param_key: key,
  display_name: key.split("/").at(-1)!,
  n,
});
const first = (t: DictTreeResponse | null) =>
  t!.tree[0]!.origins[0]!.messages[0]!.groups[0]!.kpis[0]!;
describe("RRC canonical parameter selection", () => {
  it("resolves raw indices/CHOICE against a unique full catalog path in the same technology/message", () => {
    const canonical = "rrc/reportConfigToAddModList/reportConfig/triggerType/eventId/a3-Offset";
    const raw =
      "rrc/reportConfigToAddModList/[0]/reportConfig/reportConfigEUTRA/triggerType/event/eventId/eventA3/a3-Offset";
    const catalog = tree("catalog", [leaf(canonical, 1129)]),
      rawTree = tree("raw", [leaf(raw, 958)]);
    const original = JSON.stringify([catalog, rawTree]);
    const identified = identifyTrees(catalog, rawTree);
    const selected = selectedParameter(first(identified.raw));
    expect(selected.param_key).toBe(canonical);
    expect(selected.n).toBe(1129);
    expect(selected["asn1_path"]).toBe(raw);
    expect(selected["mapping_error"]).toBeNull();
    expect(selectionId(selected)).toBe(selectionId(first(identified.catalog)));
    expect(JSON.stringify([catalog, rawTree])).toBe(original);
  });
  it("does not map an unrelated same-name leaf or cross technology/message", () => {
    for (const rawTree of [
      tree("raw", [leaf("other/path/a3-Offset")]),
      tree("raw", [leaf("rrc/path/a3-Offset")], "NR"),
      tree("raw", [leaf("rrc/path/a3-Offset")], "LTE", "OtherMessage"),
    ]) {
      expect(
        first(identifyTrees(tree("catalog", [leaf("rrc/path/a3-Offset")]), rawTree).raw)[
          "mapping_error"
        ],
      ).toBeTruthy();
    }
  });
  it("rejects ambiguous canonical projections instead of guessing", () => {
    const identified = identifyTrees(
      tree("catalog", [leaf("rrc/path/offset"), leaf("rrc/offset")]),
      tree("raw", [leaf("rrc/path/offset")]),
    );
    expect(first(identified.raw)["distribution_key"]).toBeNull();
  });
  it("keeps different complete paths, technologies and messages distinct", () => {
    const ids = [
      ["LTE", "Msg", "rrc/path/a3-Offset"],
      ["NR", "Msg", "rrc/path/a3-Offset"],
      ["LTE", "Other", "rrc/path/a3-Offset"],
      ["LTE", "Msg", "rrc/other/a3-Offset"],
    ].map(([tech, msg, key]) =>
      selectionId(first(identifyTrees(tree("catalog", [leaf(key!)], tech, msg), null).catalog)),
    );
    expect(new Set(ids).size).toBe(4);
  });
});
describe("RRC draft/applied snapshots", () => {
  it("isolates and freezes applied selections while edits and reset affect only draft", () => {
    const draft = {
      ...defaultFilters(),
      op: ["Orange"],
      geography: { ...defaultFilters().geography, dor: { enabled: true, values: ["Nord"] } },
    };
    const applied = filterSnapshot(draft),
      key = appliedKey(applied);
    draft.op.push("Free");
    draft.geography.dor.values.push("Sud");
    expect(applied.op).toEqual(["Orange"]);
    expect(applied.geography.dor.values).toEqual(["Nord"]);
    expect(Object.isFrozen(applied.geography.dor.values)).toBe(true);
    const reset = defaultFilters();
    expect(draftKey(reset)).not.toBe(draftKey(applied));
    expect(appliedKey(applied)).toBe(key);
  });
  it("makes Tous and disabled geography unrestricted, including previously selected values", () => {
    const base = defaultFilters();
    expect(
      geographicQuery({
        ...base,
        geography: { ...base.geography, dor: { enabled: true, values: [] } },
      }),
    ).toEqual({});
    expect(
      geographicQuery({
        ...base,
        geography: { ...base.geography, dor: { enabled: false, values: ["Nord"] } },
      }),
    ).toEqual({});
  });
  it("deduplicates and orders filters for stable query identity", () => {
    const a = filterSnapshot({
      ...defaultFilters(),
      op: ["Orange", "Free", "Orange"],
      band: ["B3", "B1"],
    });
    const b = filterSnapshot({ ...defaultFilters(), op: ["Free", "Orange"], band: ["B1", "B3"] });
    expect(appliedKey(a)).toBe(appliedKey(b));
  });
});
