/** Presentation-only controls: 50% preserves the original sector radius. */
export function beamPercent(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : fallback;
}

export function beamRadiusScale(value: unknown): number {
  return beamPercent(value, 50) / 50;
}

export function beamOpacity(value: unknown): number {
  return beamPercent(value, 28) / 100;
}