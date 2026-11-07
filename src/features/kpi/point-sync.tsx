import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type SyncedPoint = {
  projectId: string;
  workspaceId: string;
  captureId: string;
  seq: number;
  seqLast?: number;
  tRelS?: number | null;
  lat?: number;
  lng?: number;
  source: "map" | "graph" | "table" | "signaling";
};

type PointSyncContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  selection: SyncedPoint | null;
  select: (selection: SyncedPoint | null) => void;
};

type PointSyncMessage =
  { type: "enabled"; enabled: boolean } | { type: "selection"; selection: SyncedPoint | null };

const PointSyncContext = createContext<PointSyncContextValue | null>(null);

export function pointSyncStorageKey(projectId: string) {
  return `bc4.kpi.pointSync.v2.${projectId}`;
}

export function pointSyncChannelName(projectId: string) {
  return `bc4:kpi-point-sync:v2:${projectId}`;
}

export function pointMatchesRange(
  selection: SyncedPoint | null,
  projectId: string,
  captureId: string,
  seqFirst: number,
  seqLast = seqFirst,
) {
  if (!selection || selection.projectId !== projectId || selection.captureId !== captureId)
    return false;
  const selectedLast = selection.seqLast ?? selection.seq;
  return selection.seq <= seqLast && selectedLast >= seqFirst;
}

function readEnabled(projectId: string) {
  try {
    const current = localStorage.getItem(pointSyncStorageKey(projectId));
    if (current !== null) return current === "true";
    // Preserve an existing ON preference while moving from workspace-local
    // synchronization to the project-wide synchronization contract.
    const legacyPrefix = `bc4.kpi.pointSync.v1.${projectId}.`;
    return Object.keys(localStorage).some(
      (key) => key.startsWith(legacyPrefix) && localStorage.getItem(key) === "true",
    );
  } catch {
    return false;
  }
}

export function PointSyncProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const [enabled, setEnabledState] = useState(() => readEnabled(projectId));
  const [selection, setSelection] = useState<SyncedPoint | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    setEnabledState(readEnabled(projectId));
    setSelection(null);
  }, [projectId]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const next = new BroadcastChannel(pointSyncChannelName(projectId));
    channel.current = next;
    next.onmessage = (event: MessageEvent<PointSyncMessage>) => {
      const message = event.data;
      if (message?.type === "enabled") {
        setEnabledState(message.enabled);
        try {
          localStorage.setItem(
            pointSyncStorageKey(projectId),
            String(message.enabled),
          );
        } catch {
          /* storage unavailable */
        }
        if (!message.enabled) setSelection(null);
        return;
      }
      if (message?.type !== "selection" || !readEnabled(projectId)) return;
      const value = message.selection;
      if (value === null || value.projectId === projectId) {
        setSelection(value);
      }
    };
    return () => {
      channel.current = null;
      next.close();
    };
  }, [projectId]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      try {
        localStorage.setItem(pointSyncStorageKey(projectId), String(next));
      } catch {
        /* storage unavailable */
      }
      channel.current?.postMessage({ type: "enabled", enabled: next } satisfies PointSyncMessage);
      if (!next) {
        setSelection(null);
        channel.current?.postMessage({
          type: "selection",
          selection: null,
        } satisfies PointSyncMessage);
      }
    },
    [projectId],
  );

  const select = useCallback(
    (next: SyncedPoint | null) => {
      if (!enabled) return;
      setSelection(next);
      channel.current?.postMessage({
        type: "selection",
        selection: next,
      } satisfies PointSyncMessage);
    },
    [enabled],
  );

  const value = useMemo(
    () => ({ enabled, setEnabled, selection, select }),
    [enabled, select, selection, setEnabled],
  );
  return <PointSyncContext.Provider value={value}>{children}</PointSyncContext.Provider>;
}

export function usePointSync() {
  const value = useContext(PointSyncContext);
  if (!value) {
    return {
      enabled: false,
      setEnabled: () => undefined,
      selection: null,
      select: () => undefined,
    } satisfies PointSyncContextValue;
  }
  return value;
}
