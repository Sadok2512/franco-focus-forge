/** Workspace map height preference (BC4 MAP UI corrections).
 * Persisted per workspace scope so a reopened workspace restores the chosen
 * height. "default" keeps the existing flexible height (no inline style). */
export type MapHeightSetting = "compact" | "default" | "large" | "xl";

export const MAP_HEIGHT_OPTIONS: readonly MapHeightSetting[] = [
  "compact",
  "default",
  "large",
  "xl",
] as const;

/** Pixel height per option; "default" has none (current flexible height). */
export const MAP_HEIGHT_PX: Record<Exclude<MapHeightSetting, "default">, number> = {
  compact: 300,
  large: 600,
  xl: 800,
};

const key = (scope: string) => `bc4.map.height.v1.${scope}`;

export function readMapHeight(scope: string): MapHeightSetting {
  try {
    const saved = localStorage.getItem(key(scope));
    return MAP_HEIGHT_OPTIONS.includes(saved as MapHeightSetting)
      ? (saved as MapHeightSetting)
      : "default";
  } catch {
    return "default";
  }
}

export function writeMapHeight(scope: string, value: MapHeightSetting): void {
  try {
    localStorage.setItem(key(scope), value);
  } catch {
    /* storage unavailable */
  }
}
