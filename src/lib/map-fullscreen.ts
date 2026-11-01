import { useCallback, useEffect, useState } from "react";
import { useElementFullscreen } from "./element-fullscreen";

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