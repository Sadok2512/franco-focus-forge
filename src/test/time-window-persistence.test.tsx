import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTimeWindow } from "@/features/signaling/time-window";

describe("KPI timeline window persistence", () => {
  beforeEach(() => localStorage.clear());

  it("restores the exact capture window after remount", async () => {
    const first = renderHook(() => useTimeWindow("capture-a", 100, 30, "timeline.workspace"));
    act(() => first.result.current.setWindow([7.5, 22.5]));
    await waitFor(() =>
      expect(localStorage.getItem("timeline.workspace.capture-a")).toBe(
        JSON.stringify({ start: 7.5, width: 15 }),
      ),
    );
    first.unmount();

    const restored = renderHook(() => useTimeWindow("capture-a", 100, 30, "timeline.workspace"));
    expect(restored.result.current.window).toEqual([7.5, 22.5]);
  });

  it("isolates persisted windows by capture", () => {
    localStorage.setItem("timeline.workspace.capture-a", JSON.stringify({ start: 7.5, width: 15 }));
    const other = renderHook(() => useTimeWindow("capture-b", 100, 30, "timeline.workspace"));
    expect(other.result.current.window).toEqual([0, 30]);
  });
});
