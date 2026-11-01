/** Shared slot for the RF Parameters tab of a workspace map's left sidebar.
 * The map chrome owns the tab and its always-mounted host element; drive
 * layers portal the selected point's RF details into it, so switching tabs
 * never remounts the map or drops the selection. */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type MapRfPanel = {
  host: HTMLDivElement | null;
  setHost: (node: HTMLDivElement | null) => void;
  /** Incremented on every new point selection so the chrome can show the tab. */
  selectionTick: number;
  notifySelection: () => void;
};

const Ctx = createContext<MapRfPanel | null>(null);

export function MapRfPanelProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [selectionTick, setTick] = useState(0);
  const value = useMemo<MapRfPanel>(
    () => ({ host, setHost, selectionTick, notifySelection: () => setTick((n) => n + 1) }),
    [host, selectionTick],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMapRfPanel(): MapRfPanel | null {
  return useContext(Ctx);
}

/** A metric value a host map knows for the exact selected sequence. */
export type RfPointMetric = {
  label: string;
  unit?: string | null | undefined;
  value: string | number | null | undefined;
  active?: boolean;
};

/** Initial bearing (degrees, 0 = north) from the UE to a site, from real coordinates. */
export function bearingDeg(from: [number, number], to: [number, number]): number {
  const rad = Math.PI / 180;
  const [lng1, lat1] = [from[0] * rad, from[1] * rad];
  const [lng2, lat2] = [to[0] * rad, to[1] * rad];
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
