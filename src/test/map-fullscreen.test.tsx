import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapFullscreen } from "@/lib/map-fullscreen";

describe("two-level map fullscreen", () => {
  let current: Element | null;
  let request: ReturnType<typeof vi.fn<(this: Element) => Promise<void>>>;
  beforeEach(() => {
    current = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => current });
    request = vi.fn(async function (this: Element) {
      current = this;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Element.prototype.requestFullscreen = request;
    document.exitFullscreen = vi.fn(async () => {
      current = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
  });
  function setup() {
    const hook = renderHook(() => useMapFullscreen());
    hook.result.current.ref.current = document.createElement("div");
    return hook;
  }
  it("first click expands within the frame without browser fullscreen", async () => {
    const { result } = setup();
    await act(async () => { await result.current.advance(); });
    expect(result.current.level).toBe(1);
    expect(request).not.toHaveBeenCalled();
    expect(document.fullscreenElement).toBeNull();
  });
  it("second click enters total fullscreen on the same map element", async () => {
    const { result } = setup();
    const map = result.current.ref.current;
    await act(async () => { await result.current.advance(); });
    await act(async () => { await result.current.advance(); });
    expect(result.current.level).toBe(2);
    expect(document.fullscreenElement).toBe(map);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("browser exit returns to the frame and restore returns to the panel", async () => {
    const { result } = setup();
    await act(async () => { await result.current.advance(); });
    await act(async () => { await result.current.advance(); });
    await act(async () => { await document.exitFullscreen(); });
    expect(result.current.level).toBe(1);
    await act(async () => { await result.current.restore(); });
    expect(result.current.level).toBe(0);
  });
  it("a rejected native request preserves frame expansion", async () => {
    const { result } = setup();
    request.mockRejectedValueOnce(new Error("blocked"));
    await act(async () => { await result.current.advance(); });
    await act(async () => { await result.current.advance(); });
    expect(result.current.level).toBe(1);
    expect(result.current.failed).toBe(true);
  });
});