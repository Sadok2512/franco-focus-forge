import { describe, expect, it } from "vitest";
import { arrangeRows, orderedColumns } from "@/features/kpi/table-settings";

describe("table settings", () => {
  const rows = [{ values: { a: 3 } }, { values: { a: null } }, { values: { a: 1 } }];
  it("sorts descending with missing values last, without changing values", () => {
    expect(arrangeRows(rows, { sort: { col: "a", dir: "desc" } }).map((r) => r.values.a)).toEqual([3, 1, null]);
  });
  it("hides and reorders columns", () => {
    const cols = [{ code: "x" }, { code: "y" }, { code: "z" }];
    expect(orderedColumns(cols, { order: ["z", "x"], hidden: ["y"] }).map((c) => c.code)).toEqual(["z", "x"]);
  });
});
