import { describe, expect, it } from "vitest";
import {
  mergeTimelineEvents,
  shouldLoadTimelineDetail,
} from "@/features/signaling/timeline-loading";

describe("Signaling timeline progressive loading", () => {
  it("keeps the full capture on the single overview request", () => {
    expect(shouldLoadTimelineDetail(true, 4857, [0, 4857])).toBe(false);
  });

  it("loads event details only after the visible window is narrowed", () => {
    expect(shouldLoadTimelineDetail(true, 4857, [120, 150])).toBe(true);
    expect(shouldLoadTimelineDetail(false, 4857, [120, 150])).toBe(false);
  });

  it("keeps task intervals in the full-capture overview without detail events", () => {
    const state = [{ id: "state-1", label: "RRC Connected" }];
    const task = [{ id: "task-1", label: "HTTP_DL", start: 10, end: 20 }];
    expect(mergeTimelineEvents(state, task, [])).toEqual([...state, ...task]);
  });

  it("uses the detail copy once a zoom window returns the same task", () => {
    const overview = { id: "task-1", source: "overview" };
    const detail = { id: "task-1", source: "detail" };
    expect(mergeTimelineEvents([], [overview], [detail])).toEqual([detail]);
  });
});
