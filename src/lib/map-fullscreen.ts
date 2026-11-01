import { useCallback, useEffect, useState, type RefObject } from "react";
import { useElementFullscreen } from "./element-fullscreen";

/** Viewport insets of the app frame a map may expand into. */
export type MapFrameInsets = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

/**
 * Outermost resizable panel around the map: the application content area
 * (catalogue/filters sidebar excluded). Nested panels are ignored so the
 * expansion keeps the sidebar visible instead of filling the whole window.
 */
function outermostPanel(el: HTMLElement | null): HTMLElement | null {
  let found: HTMLElement | null = null;
  let node = el?.parentElement ?? null;
  while (node) {
    if (node.hasAttribute("data-panel")) found = node;
    node = node.parentElement;
  }
  return found;
}

/**
 * Insets of the content frame while the map is expanded at level one.
 * Returns null outside a panel layout, where the CSS full-width rule applies.
 */
export function useMapFrameInsets<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
): MapFrameInsets | null {
  const [insets, setInsets] = useState<MapFrameInsets | null>(null);

  useEffect(() => {
    if (!active) {
      setInsets(null);
      return;
    }
    const panel = outermostPanel(ref.current);
    if (!panel) {
      setInsets(null);
      return;
    }
    const measure = () => {
      const rect = panel.getBoundingClientRect();
      const styles = getComputedStyle(document.documentElement);
      const read = (name: string) => Number.parseFloat(styles.getPropertyValue(name)) || 0;
      setInsets({
        top: Math.max(rect.top, read("--app-header-offset"), read("--project-header-clearance")),
        left: Math.max(rect.left, 0),
        right: Math.max(window.innerWidth - rect.right, 0),
        bottom: Math.max(window.innerHeight - rect.bottom, 0),
      });
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(panel);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, ref]);

  return insets;
}

/** Keep the map mounted: frame expansion is local; only level two uses the browser API. */
export function useMapFullscreen(initialExpanded = false) {
  const native = useElementFullscreen<HTMLDivElement>();
  const [expanded, setExpanded] = useState(initialExpanded);
  const level = native.active ? 2 : expanded ? 1 : 0;
  const advance = useCallback(async () => {
    if (!expanded) {
      setExpanded(true);
      return true;
    }
    return native.toggle();
  }, [expanded, native.toggle]);
  const restore = useCallback(async () => {
    if (native.active) await native.toggle();
    setExpanded(false);
  }, [native.active, native.toggle]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  return { ...native, expanded, level, advance, restore, setExpanded };
}
