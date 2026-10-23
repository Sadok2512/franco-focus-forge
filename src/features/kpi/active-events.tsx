// Shared click-to-toggle event selection for one KPI workspace. Graphs and
// tables read the same active set; toggling never touches queries or data.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ActiveEvent = { id: string; captureId: string; t_rel_s: number; label: string; type: string; color: string };

/** Spec colours: Info blue, Success green, Warning orange, Error red, Event purple. */
export const EVENT_TYPE_COLORS: Record<string, string> = {
  task: "#2563eb",
  rrc: "#16a34a",
  rlf: "#ea580c",
  ho: "#dc2626",
};
export const DEFAULT_EVENT_COLOR = "#7c3aed";
export const eventColor = (type: string) => EVENT_TYPE_COLORS[type] ?? DEFAULT_EVENT_COLOR;
/** Stable id from capture + type + seq, never an array index. */
export const eventId = (captureId: string, type: string, seq: number) => `${captureId}:${type}:${seq}`;

export function toggleIn(prev: Map<string, ActiveEvent>, ev: ActiveEvent): Map<string, ActiveEvent> {
  const next = new Map(prev);
  if (next.has(ev.id)) next.delete(ev.id);
  else next.set(ev.id, ev);
  return next;
}

/** Events of this capture that fall exactly on a table row time; no nearest match. */
export function eventsAt(active: ActiveEvent[], captureId: string, t_rel_s: number): ActiveEvent[] {
  return active.filter((e) => e.captureId === captureId && e.t_rel_s === t_rel_s);
}

type Ctx = { active: ActiveEvent[]; isActive: (id: string) => boolean; toggle: (ev: ActiveEvent) => void };
const ActiveEventsContext = createContext<Ctx>({ active: [], isActive: () => false, toggle: () => {} });

export function ActiveEventsProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Map<string, ActiveEvent>>(new Map());
  const toggle = useCallback((ev: ActiveEvent) => setMap((p) => toggleIn(p, ev)), []);
  const value = useMemo(
    () => ({ active: [...map.values()], isActive: (id: string) => map.has(id), toggle }),
    [map, toggle],
  );
  return <ActiveEventsContext.Provider value={value}>{children}</ActiveEventsContext.Provider>;
}

export const useActiveEvents = () => useContext(ActiveEventsContext);
