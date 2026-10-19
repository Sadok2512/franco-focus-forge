import type { Map as MlMap } from "maplibre-gl";
import type { DictMapPoint } from "@/lib/api/dict-v2";
export function fitRrcPoints(map: MlMap | null, points: DictMapPoint[]) {
  if (!map || !points.length) return;
  const xs = points.map((p) => p.lon),
    ys = points.map((p) => p.lat);
  map.fitBounds(
    [
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    ],
    { padding: 60, maxZoom: 16, duration: 350 },
  );
}
