/** GEOREF cell geometry, ported without changing its telecom projection. */
export const GEOREF_RENDER_APERTURE_DEG = 60;

const GEOREF_BAND_COLORS: Record<string, string> = {
  NR3500: "#4F46E5",
  NR700: "#0EA5E9",
  NR2100: "#7C3AED",
  L2600: "#F39C12",
  L2100: "#8B5CF6",
  L1800: "#2563EB",
  L800: "#14B8A6",
  L700: "#22C55E",
};

/** GEOREF normalizeBandKey + DEFAULT_BAND_COLORS for the supported cell bands. */
export function getGeorefBandColor(band: unknown, technology: unknown): string {
  const normalized = String(band ?? "")
    .replace(/[\s_-]+/g, "")
    .replace(/MHZ/gi, "")
    .toUpperCase();
  const tech = String(technology ?? "").toUpperCase();
  const is5g = tech.includes("5G") || tech === "NR" || /^N\d+$/i.test(normalized);
  let key: string | null = null;
  if (normalized.includes("3500") || normalized.includes("N78")) key = "NR3500";
  else if (normalized.includes("NR2100") || normalized === "N1") key = "NR2100";
  else if (normalized.includes("NR700") || normalized === "N28") key = "NR700";
  else if (!is5g && (normalized.includes("2600") || normalized.includes("B7"))) key = "L2600";
  else if (!is5g && (normalized.includes("1800") || normalized.includes("B3"))) key = "L1800";
  else if (!is5g && (normalized.includes("2100") || normalized === "B1")) key = "L2100";
  else if (!is5g && (normalized.includes("800") || normalized.includes("B20"))) key = "L800";
  else if (!is5g && (normalized.includes("700") || normalized === "B28")) key = "L700";
  return (key && GEOREF_BAND_COLORS[key]) || (is5g ? "#7C3AED" : "#F39C12");
}

const getGeorefCompactCellScale = (zoom: number): number => {
  if (zoom >= 15) return 0.68;
  if (zoom >= 14) return 0.58;
  if (zoom >= 13) return 0.62;
  if (zoom >= 12) return 0.72;
  return 1;
};

/** GEOREF DetailedSectorsLayer radius at a given zoom. */
export function getGeorefBeamRadiusMeters(zoom: number): number {
  const effectiveZoom = Math.min(zoom, 13);
  let baseMeters: number;
  if (effectiveZoom <= 9) baseMeters = 150;
  else if (effectiveZoom <= 10) baseMeters = 200;
  else if (effectiveZoom <= 11) baseMeters = 240;
  else if (effectiveZoom <= 12) baseMeters = 260;
  else baseMeters = 280;
  if (zoom > 13) {
    const boost = zoom === 14 ? 1.1 : 1.2;
    baseMeters = (baseMeters * boost) / 2 ** (zoom - 13);
  }
  const sectorScale = zoom < 13 ? 0.4 : zoom < 15 ? 0.55 : 0.65;
  return Math.max(1, baseMeters) * getGeorefCompactCellScale(zoom) * sectorScale;
}

/** Curved wedge between two telecom azimuths (0° north, 90° east). */
function sectorArc(
  center: [number, number],
  radiusMeters: number,
  startAngle: number,
  endAngle: number,
): Array<[number, number]> {
  const [lng, lat] = center;
  const steps = 20;
  const points: Array<[number, number]> = [[lng, lat]];
  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + (endAngle - startAngle) * (index / steps);
    const radians = angle * (Math.PI / 180);
    const dlat = (radiusMeters / 111320) * Math.cos(radians);
    const dlng = (radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(radians);
    points.push([lng + dlng, lat + dlat]);
  }
  points.push([lng, lat]);
  return points;
}

/**
 * GEOREF getSectorCoords, adapted only from Leaflet [lat,lng] to GeoJSON
 * [lng,lat]. Azimuth follows the telecom convention: 0° north, 90° east.
 */
export function getGeorefSectorCoords(
  center: [number, number],
  azimuth: number,
  radiusMeters: number,
  aperture = GEOREF_RENDER_APERTURE_DEG,
): Array<[number, number]> {
  if (![...center, azimuth, radiusMeters, aperture].every(Number.isFinite)) return [];
  if (radiusMeters <= 0 || aperture <= 0) return [];
  return sectorArc(center, radiusMeters, azimuth - aperture / 2, azimuth + aperture / 2);
}

/**
 * One colored slice of a multi-band sector: slice `sliceIndex` (0-based) of
 * `sliceCount` contiguous parts covering the full aperture. Adjacent slices
 * share their edge, so the split sector has neither gaps nor overlaps.
 */
export function getGeorefSectorSliceCoords(
  center: [number, number],
  azimuth: number,
  radiusMeters: number,
  sliceIndex: number,
  sliceCount: number,
  aperture = GEOREF_RENDER_APERTURE_DEG,
): Array<[number, number]> {
  if (![...center, azimuth, radiusMeters, sliceIndex, sliceCount, aperture].every(Number.isFinite))
    return [];
  if (radiusMeters <= 0 || aperture <= 0) return [];
  if (sliceCount < 1 || sliceIndex < 0 || sliceIndex >= sliceCount) return [];
  const start = azimuth - aperture / 2;
  const width = aperture / sliceCount;
  return sectorArc(center, radiusMeters, start + width * sliceIndex, start + width * (sliceIndex + 1));
}
