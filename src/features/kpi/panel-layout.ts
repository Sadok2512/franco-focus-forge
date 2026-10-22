// Unified workspace panel layout: one ordered collection of heterogeneous
// panels (KPI cards + Metrics cards) per workspace tab. Presentation only —
// never alters codes, filters, queries or data. Persisted in localStorage.
import { useEffect, useState } from "react";

export type PanelSpan = 1 | 2 | 3;
export interface PanelLayoutState {
  order: string[];
  span: Record<string, PanelSpan>;
  height: Record<string, number>;
  collapsed: Record<string, boolean>;
  titles: Record<string, string>;
  syncTime: boolean;
}
export const EMPTY_LAYOUT: PanelLayoutState = {
  order: [],
  span: {},
  height: {},
  collapsed: {},
  titles: {},
  syncTime: false,
};

const key = (ws: string) => `bc4.panelLayout.${ws}`;
const EVT = "bc4-panel-layout";

export function loadLayout(ws: string): PanelLayoutState {
  try {
    const raw = localStorage.getItem(key(ws));
    if (raw) return { ...EMPTY_LAYOUT, ...(JSON.parse(raw) as Partial<PanelLayoutState>) };
  } catch {
    /* ignore */
  }
  return EMPTY_LAYOUT;
}
export function saveLayout(ws: string, s: PanelLayoutState) {
  try {
    localStorage.setItem(key(ws), JSON.stringify(s));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: ws }));
}

/** Position of a panel: saved order first, unknown panels keep natural order after. */
export function panelOrder(s: PanelLayoutState, id: string, natural: number): number {
  const i = s.order.indexOf(id);
  return i < 0 ? 1000 + natural : i;
}

/** Move `from` onto `to` within the full list of present panel ids. */
export function movePanel(
  s: PanelLayoutState,
  present: string[],
  from: string,
  to: string,
): PanelLayoutState {
  const ids = [...present].sort(
    (a, b) => panelOrder(s, a, present.indexOf(a)) - panelOrder(s, b, present.indexOf(b)),
  );
  const fi = ids.indexOf(from),
    ti = ids.indexOf(to);
  if (fi < 0 || ti < 0 || fi === ti) return s;
  ids.splice(ti, 0, ids.splice(fi, 1)[0]!);
  return { ...s, order: ids };
}

export function usePanelLayout(ws: string) {
  const [s, setS] = useState<PanelLayoutState>(() => loadLayout(ws));
  useEffect(() => {
    setS(loadLayout(ws));
    const h = (e: Event) => {
      if ((e as CustomEvent).detail === ws) setS(loadLayout(ws));
    };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [ws]);
  const update = (fn: (prev: PanelLayoutState) => PanelLayoutState) =>
    saveLayout(ws, fn(loadLayout(ws)));
  return [s, update] as const;
}

/** Registry of panel ids currently rendered (for drag reordering across groups). */
export const presentPanels = new Set<string>();
