// Name shown when a timeline item or an RF measurement is clicked.
// The chip carries the name only; every other detail stays in its own view.

export type NameTagPoint = { t_rel_s: number; value: number | null };
export type NameTagSeries = { code: string; label: string; points: NameTagPoint[] };
export type NameTag = { name: string; code: string; x: number; y: number };

// A click must land within this many pixels of a measurement to name it.
export const NAME_TAG_RADIUS = 14;

/**
 * Returns the label of the measurement closest to the click, or null when the
 * click is farther than `radius` pixels from every plotted point.
 */
export function nearestNameTag(
  series: NameTagSeries[],
  toPixel: (code: string, time: number, value: number) => [number, number] | null,
  x: number,
  y: number,
  radius = NAME_TAG_RADIUS,
): NameTag | null {
  let best: NameTag | null = null;
  let bestDistance = Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (p.value === null) continue;
      const pixel = toPixel(s.code, p.t_rel_s, p.value);
      if (!pixel) continue;
      const [px, py] = pixel;
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const distance = Math.hypot(px - x, py - y);
      if (distance <= radius && distance < bestDistance) {
        best = { name: s.label, code: s.code, x: px, y: py };
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** Keeps a centred chip fully inside the chart width. */
export function clampNameTagX(x: number, width: number, halfWidth = 70): number {
  if (width <= halfWidth * 2) return Math.max(0, x);
  return Math.max(halfWidth, Math.min(width - halfWidth, x));
}
