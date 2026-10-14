import { AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { METRICS, severityOf, type MeasurementPoint, type MetricKey } from "@/lib/api/schemas";

const SEV_VARS = { good: "--sev-good", fair: "--sev-fair", poor: "--sev-poor", bad: "--sev-bad" } as const;

function toRgb(cssColor: string) {
  const c = document.createElement("canvas").getContext("2d")!;
  c.fillStyle = cssColor; c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return `rgb(${r},${g},${b})`;
}

export function MapLegend({ metric }: { metric: MetricKey }) {
  const m = METRICS[metric];
  const [a, b, c] = m.thresholds;
  type K = "good" | "fair" | "poor" | "bad";
  const rows: [K, string][] = m.higherIsBetter
    ? [["good", `≥ ${c}`], ["fair", `${b} – ${c}`], ["poor", `${a} – ${b}`], ["bad", `< ${a}`]]
    : [["good", `≤ ${a}`], ["fair", `${a} – ${b}`], ["poor", `${b} – ${c}`], ["bad", `> ${c}`]];
  const cls = { good: "bg-sev-good", fair: "bg-sev-fair", poor: "bg-sev-poor", bad: "bg-sev-bad" } as Record<string, string>;
  const lbl = { good: "Bon", fair: "Moyen", poor: "Faible", bad: "Critique" } as Record<string, string>;
  return (
    <div className="panel absolute bottom-2 left-2 z-10 p-2 text-[11px] shadow">
      <p className="mb-1 font-semibold">{m.label} <span className="font-normal text-muted-foreground">({m.unit})</span></p>
      {rows.map(([k, r]) => (
        <div key={k} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${cls[k]}`} /> <span className="w-12">{lbl[k]}</span>
          <span className="num font-mono text-muted-foreground">{r}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground" /> N/D</div>
    </div>
  );
}

export function RadioMap({
  points, metric, center, selectedId, onSelect,
}: {
  points: MeasurementPoint[]; metric: MetricKey; center: [number, number];
  selectedId?: string | null; onSelect?: (id: string | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [full, setFull] = useState(false);

  const geojson = useMemo(() => {
    const colors = Object.fromEntries(
      Object.entries(SEV_VARS).map(([k, v]) => [k, typeof window === "undefined" ? "#888" : toRgb(getComputedStyle(document.documentElement).getPropertyValue(v))]),
    );
    return {
      type: "FeatureCollection" as const,
      features: points.map((p) => {
        const v = p[metric];
        return {
          type: "Feature" as const, id: undefined,
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
          properties: { id: p.id, op: p.operator, tech: p.tech, band: p.band, v: v ?? "N/D", color: v == null ? "rgba(0,0,0,0)" : colors[severityOf(metric, v)] },
        };
      }),
    };
  }, [points, metric]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([ml, worker]) => {
      if (cancelled || !el.current) return;
      ml.setWorkerUrl(worker.default);
      const m = new ml.Map({
        container: el.current, center, zoom: 11, attributionControl: { compact: true },
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
          layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.8, "raster-opacity": 0.85 } }],
        },
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => { if (String(e.error?.message ?? "").match(/tile|fetch|Failed/i)) setTileError(true); });
      m.on("load", () => {
        m.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "pts", type: "circle", source: "pts", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 6],
          "circle-color": ["get", "color"], "circle-stroke-width": 0.6, "circle-stroke-color": "rgba(20,34,53,0.5)",
        } });
        m.addLayer({ id: "sel", type: "circle", source: "pts", filter: ["==", ["get", "id"], ""], paint: {
          "circle-radius": 9, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2.5, "circle-stroke-color": "#1769E0",
        } });
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
        m.on("mousemove", "pts", (e) => {
          m.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (p) popup.setLngLat(e.lngLat).setHTML(`<div style="font:12px IBM Plex Sans"><b>${p["op"]}</b> · ${p["tech"]} ${p["band"]}<br/>${METRICS[metric].label}: <b>${p["v"]}</b> ${p["v"] === "N/D" ? "" : METRICS[metric].unit}</div>`).addTo(m);
        });
        m.on("mouseleave", "pts", () => { m.getCanvas().style.cursor = ""; popup.remove(); });
        m.on("click", "pts", (e) => onSelect?.(String(e.features?.[0]?.properties?.["id"] ?? "")));
        setReady(true);
      });
      map.current = m;
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], metric]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource("pts") as { setData: (d: unknown) => void } | undefined)?.setData(geojson);
  }, [geojson, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.setFilter("sel", ["==", ["get", "id"], selectedId ?? ""]);
  }, [selectedId, ready]);

  useEffect(() => { setTimeout(() => map.current?.resize(), 30); }, [full]);

  return (
    <div className={`relative overflow-hidden ${full ? "fixed inset-4 z-50 rounded-md border shadow-2xl" : "h-full"}`}>
      <div ref={el} className="h-full w-full bg-muted" role="region" aria-label={`Carte ${METRICS[metric].label}`} />
      <MapLegend metric={metric} />
      <button onClick={() => setFull((f) => !f)} aria-label={full ? "Quitter plein écran" : "Carte plein écran"}
        className="panel absolute right-12 top-2.5 z-10 p-1.5 shadow">{full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
      {tileError && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md bg-warning px-2 py-1 text-[11px] text-warning-foreground">
          <AlertTriangle className="h-3 w-3" /> Fond de carte indisponible — points affichés sans tuiles.
        </div>
      )}
    </div>
  );
}
