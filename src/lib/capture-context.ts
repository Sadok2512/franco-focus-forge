import { useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
const values = new Map<string, string>();
// v2 intentionally drops the legacy automatically persisted "first capture".
// Signaling can now choose an API-declared drive capture on the first visit;
// every explicit selection made afterwards is preserved across BC4 pages.
const storageKey = (projectId: string) => `bc4.capture.v2.${projectId}`;
export function setCaptureContext(projectId: string, capture: string) {
  values.set(projectId, capture);
  if (typeof window !== "undefined") sessionStorage.setItem(storageKey(projectId), capture);
  listeners.forEach((fn) => fn());
}
export function useCaptureContext(projectId: string) {
  const value = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => values.get(projectId) ?? sessionStorage.getItem(storageKey(projectId)) ?? undefined,
    () => undefined,
  );
  return [value, (capture: string) => setCaptureContext(projectId, capture)] as const;
}
