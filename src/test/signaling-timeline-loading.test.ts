import { describe, expect, it } from "vitest";
import { shouldLoadTimelineDetail } from "@/features/signaling/timeline-loading";

describe("Signaling timeline progressive loading", () => {
  it("keeps the full capture on the single overview request", () => {
    expect(shouldLoadTimelineDetail(true, 4857, [0, 4857])).toBe(false);
  });

  it("loads event details only after the visible window is narrowed", () => {
    expect(shouldLoadTimelineDetail(true, 4857, [120, 150])).toBe(true);
    expect(shouldLoadTimelineDetail(false, 4857, [120, 150])).toBe(false);
  });
});
