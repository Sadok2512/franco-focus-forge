import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMapFrameInsets } from "@/lib/map-fullscreen";

/** jsdom has no layout: the panel box is supplied by the test. */
function panelWithMap(left: number, top: number, right: number, bottom: number) {
  const panel = document.createElement("div");
  panel.setAttribute("data-panel", "");
  const map = document.createElement("div");
  panel.appendChild(map);
  document.body.appendChild(panel);
  panel.getBoundingClientRect = () =>
    ({ top, left, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) }) as DOMRect;
  return { panel, map };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("map frame insets", () => {
  it("keeps the sidebar: the map stops at the content panel edges", () => {
    const { map } = panelWithMap(300, 56, 1024, 768);
    const ref = { current: map };
    const { result } = renderHook(() => useMapFrameInsets(ref, true));
    expect(result.current).toEqual({ top: 56, left: 300, right: 0, bottom: 0 });
  });

  it("never covers the header band", () => {
    document.documentElement.style.setProperty("--app-header-offset", "56px");
    const { map } = panelWithMap(0, 0, 1024, 768);
    const ref = { current: map };
    const { result } = renderHook(() => useMapFrameInsets(ref, true));
    expect(result.current?.top).toBe(56);
    document.documentElement.style.removeProperty("--app-header-offset");
  });

  it("uses the outermost panel, so nested panels do not shrink the frame", () => {
    const outer = document.createElement("div");
    outer.setAttribute("data-panel", "");
    const inner = document.createElement("div");
    inner.setAttribute("data-panel", "");
    const map = document.createElement("div");
    inner.appendChild(map);
    outer.appendChild(inner);
    document.body.appendChild(outer);
    outer.getBoundingClientRect = () =>
      ({ top: 56, left: 300, right: 1024, bottom: 768, x: 300, y: 56, width: 724, height: 712, toJSON: () => ({}) }) as DOMRect;
    inner.getBoundingClientRect = () =>
      ({ top: 56, left: 700, right: 1024, bottom: 400, x: 700, y: 56, width: 324, height: 344, toJSON: () => ({}) }) as DOMRect;
    const ref = { current: map };
    const { result } = renderHook(() => useMapFrameInsets(ref, true));
    expect(result.current).toEqual({ top: 56, left: 300, right: 0, bottom: 0 });
  });

  it("returns no insets outside a panel layout", () => {
    const map = document.createElement("div");
    document.body.appendChild(map);
    const ref = { current: map };
    const { result } = renderHook(() => useMapFrameInsets(ref, true));
    expect(result.current).toBeNull();
  });

  it("clears the frame when the map is collapsed", () => {
    const { map } = panelWithMap(300, 56, 1024, 768);
    const ref = { current: map };
    const { result, rerender } = renderHook(({ active }) => useMapFrameInsets(ref, active), {
      initialProps: { active: true },
    });
    expect(result.current).not.toBeNull();
    rerender({ active: false });
    expect(result.current).toBeNull();
  });
});
