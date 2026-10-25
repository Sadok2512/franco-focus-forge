export const DEFAULT_NETWORK_MAP_CENTER: [number, number] = [2.4, 46.6];

/** Imported projects can carry the legacy sentinel [0, 0] when no centre was
 * proven. It must not be treated as a usable viewport: doing so opens the map
 * in the Gulf of Guinea and the bbox-based /sites request legitimately returns
 * no French sites. */
export function resolveNetworkMapCenter(center: [number, number] | undefined): [number, number] {
  if (!center) return DEFAULT_NETWORK_MAP_CENTER;
  const [lng, lat] = center;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return DEFAULT_NETWORK_MAP_CENTER;
  if (lng === 0 && lat === 0) return DEFAULT_NETWORK_MAP_CENTER;
  return center;
}
