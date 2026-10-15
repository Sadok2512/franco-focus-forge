import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { GeoImportReport } from "@/lib/api/settings-schemas";

export function GeoPreviewMap({ points }: { points: GeoImportReport["points"] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]).then(([ml, worker]) => {
      if (cancelled || !el.current) return;
      ml.setWorkerUrl(worker.default);
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.fillStyle =
        getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
        "#1F5FD6";
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, bl] = ctx.getImageData(0, 0, 1, 1).data;
      const color = `rgb(${r},${g},${bl})`;
      const m = new ml.Map({
        container: el.current,
        center: [points[0]!.lng, points[0]!.lat],
        zoom: 6,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap",
            },
          },
          layers: [
            { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.8 } },
          ],
        },
      });
      m.on("load", () => {
        m.addSource("p", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: points.map((p) => ({
              type: "Feature",
              properties: { s: p.site },
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            })),
          },
        });
        m.addLayer({
          id: "p",
          type: "circle",
          source: "p",
          paint: {
            "circle-radius": 5,
            "circle-color": color,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          },
        });
        const b = new ml.LngLatBounds();
        points.forEach((p) => b.extend([p.lng, p.lat]));
        m.fitBounds(b, { padding: 30, maxZoom: 12, duration: 0 });
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [points]);
  return (
    <div
      ref={el}
      className="h-64 w-full overflow-hidden rounded-md border"
      aria-label={`Carte de ${points.length} sites importés`}
      role="img"
    />
  );
}
