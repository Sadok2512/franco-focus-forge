import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fullscreen for a single element (panel, table, map) rather than the whole
 * document. The element gets the native :fullscreen styles; Escape and the
 * browser UI exit it, and `fullscreenchange` keeps the state honest.
 */
export function useElementFullscreen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setActive(Boolean(ref.current) && document.fullscreenElement === ref.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const supported =
    typeof document !== "undefined" &&
    Boolean(document.documentElement.requestFullscreen);

  const toggle = useCallback(async () => {
    const el = ref.current;
    if (!el || !supported) return false;
    setFailed(false);
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }, [supported]);

  return { ref, active, failed, supported, toggle };
}
