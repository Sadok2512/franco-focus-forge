// Logique du curseur temporel interactif (BC4_SIGNALING_INTERACTIVE_TIME_CURSOR_V1).
// Règles strictes : jamais d'interpolation entre mesures, jamais de valeur
// inventée — on utilise la dernière observation prouvée à ou avant `t`
// (règle d'association temporelle validée de l'application).

import type { SigCall, SigCapture, SigEvent, SigSeries, SigTask } from "@/lib/api/signaling-schemas";

/** Dernière observation prouvée à ou avant `t` (null si aucune). */
export function prevPoint(s: SigSeries, t: number): { t: number; v: number } | null {
  let best: { t: number; v: number } | null = null;
  for (const p of s.points) {
    if (p.v != null && p.t <= t && (!best || p.t > best.t)) best = { t: p.t, v: p.v };
  }
  return best;
}

export type RfReading = { label: string; unit: string; value: number | null; dt: number | null };

/** Valeurs RF au temps du curseur : mesure précédente + écart, ou null. */
export function rfReadings(capture: SigCapture, t: number): RfReading[] {
  return capture.measurements.map((s) => {
    const p = prevPoint(s, t);
    return p
      ? { label: s.label, unit: s.unit, value: p.v, dt: t - p.t }
      : { label: s.label, unit: s.unit, value: null, dt: null };
  });
}

/** États de connectivité prouvés contenant `t` (LTE et NSA peuvent se chevaucher). */
export function connectivityAt(capture: SigCapture, t: number): string[] {
  return capture.connectivity.filter((s) => t >= s.start_s && t <= s.end_s).map((s) => s.state);
}

/** Tâches dont l'intervalle prouvé contient `t`. */
export function tasksAt(capture: SigCapture, t: number): SigTask[] {
  return capture.tasks.filter((k) => t >= k.start_s && t <= k.end_s);
}

/** Appels confirmés (start/end prouvés) contenant `t`. */
export function callsAt(capture: SigCapture, t: number): SigCall[] {
  return capture.calls.filter((c) => c.start_s != null && c.end_s != null && t >= c.start_s && t <= c.end_s);
}

/** Événements dont le timestamp exact correspond à `t` (snap). */
export function eventsAt(capture: SigCapture, t: number, eps = 1e-6): SigEvent[] {
  return capture.events.filter((e) => Math.abs(e.t - t) <= eps);
}

/** Only a proven message reference links a selected message to an event. */
export function eventForMessage(capture: SigCapture, index: number): SigEvent | null {
  return capture.events.find((event) => event.message_index === index) ?? null;
}

/** Instants « snappables » pour la navigation clavier : événements, mobilité, bornes de tâches, appels. */
export function snapTimes(capture: SigCapture): number[] {
  const ts = new Set<number>();
  for (const e of capture.events) ts.add(e.t);
  for (const m of capture.mobility) ts.add(m.t);
  for (const k of capture.tasks) {
    ts.add(k.start_s);
    ts.add(k.end_s);
  }
  for (const c of capture.calls) {
    ts.add(c.attempt_s);
    if (c.start_s != null) ts.add(c.start_s);
    if (c.end_s != null) ts.add(c.end_s);
  }
  for (const series of capture.measurements) {
    for (const point of series.points) if (point.v != null) ts.add(point.t);
  }
  return [...ts].sort((a, b) => a - b);
}

/** Pas clavier : événement/échantillon précédent ou suivant, sans arrondi. */
export function stepTime(times: number[], t: number | null, dir: 1 | -1, fallback: number): number {
  if (t == null) return fallback;
  if (dir === 1) return times.find((x) => x > t + 1e-6) ?? t;
  for (let i = times.length - 1; i >= 0; i--) {
    const previous = times[i];
    if (previous != null && previous < t - 1e-6) return previous;
  }
  return t;
}
