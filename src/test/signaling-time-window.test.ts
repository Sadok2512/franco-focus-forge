import { describe, it, expect } from "vitest";
import { clampWindow, followMessage } from "@/features/signaling/time-window";
describe("Signaling time navigator rules", () => {
  it("G1 opens a 546.905-second capture at 0–30 seconds", () =>
    expect(clampWindow(546.905, 0)).toEqual([0, 30]));
  it("G2 shows a short capture completely", () => expect(clampWindow(12, 0)).toEqual([0, 12]));
  it("G3 moves without changing window size", () =>
    expect(clampWindow(546.905, 120, 30)).toEqual([120, 150]));
  it.each([10, 30, 60, 120])("G4 supports %s-second windows", (width) =>
    expect(clampWindow(546.905, 0, width)).toEqual([0, width]),
  );
  it("clamps at capture end", () =>
    expect(clampWindow(546.905, 999, 30)).toEqual([516.905, 546.905]));
  it("clamps negative start", () => expect(clampWindow(546.905, -20, 30)).toEqual([0, 30]));
  it("G7 centers the selected message at 245.318 without changing zoom", () =>
    expect(followMessage([0, 30], 245.318, 546.905)).toEqual([230.318, 260.318]));
  it("does not move for a visible message", () => {
    const window: [number, number] = [120, 150];
    expect(followMessage(window, 135.318, 546.905)).toBe(window);
  });
  it("does not follow unavailable timestamps", () =>
    expect(followMessage([0, 30], null, 546.905)).toEqual([0, 30]));
});
