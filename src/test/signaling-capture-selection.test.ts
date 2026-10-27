import { describe, expect, it } from "vitest";
import { selectSignalingCapture } from "@/features/signaling/capture-selection";

const captures = [
  { capture_id: "first", env: null },
  { capture_id: "drive", env: "incar" },
  { capture_id: "indoor", env: "indoor" },
];

describe("Signaling capture selection", () => {
  it("opens the API-declared drive capture on a fresh session", () => {
    expect(selectSignalingCapture(captures)).toBe("drive");
  });

  it("preserves an explicit valid capture", () => {
    expect(selectSignalingCapture(captures, "indoor")).toBe("indoor");
  });

  it("falls back to the first capture when no drive metadata exists", () => {
    expect(selectSignalingCapture([{ capture_id: "only", env: null }])).toBe("only");
  });
});
