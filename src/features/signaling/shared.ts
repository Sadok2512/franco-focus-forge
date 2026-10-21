// Helpers partagés Signaling View : formatage FR, graduations temporelles
// et regroupement des événements proches à faible zoom (sans perdre leurs
// références — le groupe garde la liste des événements qu'il contient).

export const fmtNum = (v: number) => v.toLocaleString("fr-FR");

export const fmtSec = (t: number) =>
  t.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " s";

export const fmtTick = (t: number) =>
  `${t.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;

/** Graduations « rondes » sur la fenêtre visible [start, end]. */
export function ticksFor(start: number, end: number): number[] {
  const span = Math.max(end - start, 1e-6);
  const target = span / 7;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => s >= target) ?? Math.ceil(target / 500) * 500;
  const out: number[] = [];
  for (let t = Math.ceil(start / step) * step; t <= end + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

export type EventLike = { t: number };

/**
 * Regroupe les événements dont l'espacement projeté est < minPx px.
 * `toPx` convertit un temps en abscisse écran. Chaque groupe conserve
 * ses événements (références jamais perdues).
 */
export function clusterEvents<T extends EventLike>(events: T[], toPx: (t: number) => number, minPx: number) {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const groups: { t: number; items: T[] }[] = [];
  for (const ev of sorted) {
    const last = groups[groups.length - 1];
    if (last && toPx(ev.t) - toPx(last.t) < minPx) {
      last.items.push(ev);
      last.t = last.items[0]!.t;
    } else {
      groups.push({ t: ev.t, items: [ev] });
    }
  }
  return groups;
}
