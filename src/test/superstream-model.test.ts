import { describe, expect, it } from "vitest";
import { mergeSelection, parsePastedFilenames, validateName, type SuperstreamLog } from "@/features/projects/superstream-model";

const log = (id: string, filename = id): SuperstreamLog => ({
  id, filename, n_captures: 1, n_events: 1, n_gps: null, imported_at: null,
});
const logs = [log("a.nmf"), log("b.nmf"), log("dup.nmf"), log("dup.nmf#1", "dup.nmf")];

describe("superstream name", () => {
  it("is required after trimming", () => expect(validateName("   ", [])).toBe("required"));
  it("is unique per project, case-insensitive", () => expect(validateName(" deep 1.5.0 ", ["Deep 1.5.0"])).toBe("duplicate"));
  it("allows letters, digits, spaces, dashes, underscores and dots", () => expect(validateName("Deep_1.5.0-a b", [])).toBeNull());
  it("rejects other characters", () => expect(validateName("Deep/1", [])).toBe("invalid"));
  it("keeps its own name when editing", () => expect(validateName("Deep 1", ["Deep 1"], "Deep 1")).toBeNull());
});

describe("pasted filenames", () => {
  it("splits, trims, drops empties and dedupes", () => {
    expect(parsePastedFilenames(" a.nmf, ,b.nmf , a.nmf", logs)).toEqual({ ids: ["a.nmf", "b.nmf"], unknown: [], ambiguous: [] });
  });
  it("reports unknown names instead of creating logs", () => {
    expect(parsePastedFilenames("zz.nmf", logs).unknown).toEqual(["zz.nmf"]);
  });
  it("reports ambiguous names", () => {
    expect(parsePastedFilenames("dup.nmf", logs)).toEqual({ ids: [], unknown: [], ambiguous: ["dup.nmf"] });
  });
  it("merges with checkbox selection without duplicates", () => {
    expect(mergeSelection(new Set(["a.nmf"]), ["a.nmf", "b.nmf"])).toEqual(["a.nmf", "b.nmf"]);
  });
});
