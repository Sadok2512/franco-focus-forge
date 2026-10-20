import { useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
const values = new Map<string, string>();
export function setCaptureContext(projectId: string, capture: string) {
  values.set(projectId, capture);
  if (typeof window !== "undefined") sessionStorage.setItem(`bc4.capture.${projectId}`, capture);
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
    () => values.get(projectId) ?? sessionStorage.getItem(`bc4.capture.${projectId}`) ?? undefined,
    () => undefined,
  );
  return [value, (capture: string) => setCaptureContext(projectId, capture)] as const;
}
