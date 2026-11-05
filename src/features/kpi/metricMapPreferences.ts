export const MAP_PALETTES = {
  coverage: ["#b91c1c", "#f97316", "#facc15", "#84cc16", "#15803d"],
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  ocean: ["#172554", "#1e40af", "#0284c7", "#06b6d4", "#a7f3d0"],
} as const;

export type MetricMapPalette = keyof typeof MAP_PALETTES;
export type MetricMapPreferences = {
  palette: MetricMapPalette;
  pointSize: number;
  links: Record<"serving" | "neighbour" | "nr_anchor", boolean>;
};
export const DEFAULT_MAP_PREFERENCES: MetricMapPreferences = {
  palette: "coverage",
  pointSize: 3,
  links: { serving: true, neighbour: false, nr_anchor: true },
};
export function metricMapPreferenceKey(workspaceId: string, selection: string) {
  return `bc4.metric-map.v3.${workspaceId}.${selection}`;
}
function legacyMetricMapPreferenceKeys(workspaceId: string, selection: string) {
  return [
    `bc4.metric-map.v2.${workspaceId}.${selection}`,
    `bc4.metric-map.v1.${workspaceId}.${selection}`,
  ];
}

export function readMetricMapPreferences(
  workspaceId: string,
  selection: string,
): MetricMapPreferences {
  try {
    const key = metricMapPreferenceKey(workspaceId, selection);
    const current = localStorage.getItem(key);
    const legacy =
      current === null
        ? (legacyMetricMapPreferenceKeys(workspaceId, selection)
            .map(
              (legacyKey) =>
                JSON.parse(
                  localStorage.getItem(legacyKey) ?? "null",
                ) as Partial<MetricMapPreferences> | null,
            )
            .find((candidate) => candidate !== null) ?? null)
        : null;
    const value = JSON.parse(current ?? "null") as Partial<MetricMapPreferences> | null;
    const source = value ?? legacy;
    const palette =
      source?.palette && source.palette in MAP_PALETTES
        ? source.palette
        : DEFAULT_MAP_PREFERENCES.palette;
    const pointSize =
      typeof source?.pointSize === "number" && source.pointSize >= 1 && source.pointSize <= 10
        ? source.pointSize
        : DEFAULT_MAP_PREFERENCES.pointSize;
    const preferences = {
      palette,
      pointSize,
      links: value
        ? { ...DEFAULT_MAP_PREFERENCES.links, ...value.links }
        : { ...DEFAULT_MAP_PREFERENCES.links },
    };
    if (current === null) localStorage.setItem(key, JSON.stringify(preferences));
    return preferences;
  } catch {
    return DEFAULT_MAP_PREFERENCES;
  }
}

export function writeMetricMapPreferences(
  workspaceId: string,
  selection: string,
  preferences: MetricMapPreferences,
) {
  try {
    localStorage.setItem(
      metricMapPreferenceKey(workspaceId, selection),
      JSON.stringify(preferences),
    );
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(
    new CustomEvent("bc4-metric-map-preferences", { detail: { workspaceId, selection } }),
  );
}
