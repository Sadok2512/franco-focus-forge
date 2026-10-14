import { AlertTriangle, Crosshair, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { EmptyState } from "@/components/bc4/States";
import type { ParamMap } from "@/lib/api/dictionary-schemas";

function rgb(css: string): [number, number, number] {
  const c = document.createElement("canvas").getContext("2d")!;
  c.fillStyle = css; c.fillRect(0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data;
  return [d[0]!, d[1]!, d[2]!];
}
const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((x, i) => Math.round(x * t + b[i]! * (1 - t))).join(",")})`;
const CAT_VARS = ["--primary", "--op-orange", "--sev-good", "--op-sfr", "--sev-fair", "--muted-foreground"];

/** Presentation-only palette: numeric = sequential ramp; categorical = fixed palette by class index. */
function palette(legend: ParamMap["legend"]): string[] {
  if (legend.kind === "categorical") return (legend.classes ?? []).map((_, i) => `rgb(${rgb(v(CAT_VARS[i % CAT_VARS.length]!)).join(",")})`);
  const n = legend.stops?.length ?? 0, p = rgb(v("--primary")), bg = rgb(v("--card"));
  return Array.from({ length: n }, (_, i) => mix(p, bg, 0.25 + (0.75 * i) / Math.max(1, n - 1)));
}

export function ParameterMapPanel({ data, center }: { data: ParamMap; center: [number, number] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [full, setFull] = useState(false);
  const colors = useMemo(() => palette(data.legend), [data.legend]);

  const geo = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: data.features.map((f) => {
      let idx = 0;
      if (data.legend.kind === "numeric") (data.legend.stops ?? []).forEach((s, i) => { if (typeof f.properties.value === "number" && f.properties.value >= s.value) idx = i; });
      else idx = Math.max(0, (data.legend.classes ?? []).findIndex((c) => c.value === String(f.properties.value)));
      return { type: "Feature" as const, geometry: f.geometry, properties: { ...f.properties, color: colors[idx] ?? "rgb(128,128,128)" } };
    }),
  }), [data, colors]);

  const fit = () => {
    if (!map.current || !geo.features.length) return;
    const xs = geo.features.map((f) => f.geometry.coordinates[0]), ys = geo.features.map((f) => f.geometry.coordinates[1]);
    map.current.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 30, duration: 0 });
  };

  useEffect(() => {
    if (!data.features.length) return;
    let cancelled = false;
    Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([ml, worker]) => {
      if (cancelled || !el.current) return;
      ml.setWorkerUrl(worker.default);
      const m = new ml.Map({
        container: el.current, center, zoom: 10, attributionControl: { compact: true },
        style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
          layers: [{ id: "bg", type: "background", paint: { "background-color": `rgb(${rgb(v("--muted")).join(",")})` } }, { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.8, "raster-opacity": 0.85 } }] },
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => { if (String(e.error?.message ?? "").match(/tile|fetch|Failed|load/i)) setTileError(true); });
      m.on("load", () => {
        m.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "pts", type: "circle", source: "pts", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 7], "circle-color": ["get", "color"],
          "circle-stroke-width": 0.7, "circle-stroke-color": "rgba(20,34,53,0.55)" } });
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
        m.on("mousemove", "pts", (e) => {
          m.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (p) popup.setLngLat(e.lngLat).setText(`Valeur : ${p["display"]}`).addTo(m);
        });
        m.on("mouseleave", "pts", () => { m.getCanvas().style.cursor = ""; popup.remove(); });
        setReady(true);
      });
      map.current = m;
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], data.features.length > 0]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource("pts") as { setData: (d: unknown) => void } | undefined)?.setData(geo);
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, ready]);
  useEffect(() => { setTimeout(() => { map.current?.resize(); fit(); }, 40); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [full]);

  if (!data.features.length) return (
    <div className="p-2">
      <EmptyState title="Aucune position géographique disponible pour ce paramètre">Aucune coordonnée GPS n'est associée à ces observations. Aucune position n'est inventée.</EmptyState>
      <p className="text-center text-[10px] text-muted-foreground">Plan indoor indisponible</p>
    </div>
  );

  const legendRows = data.legend.kind === "numeric" ? (data.legend.stops ?? []).map((s) => s.label) : (data.legend.classes ?? []).map((c) => c.label);
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className={`relative overflow-hidden rounded-md border ${full ? "fixed inset-4 z-50 shadow-2xl" : "h-[340px]"}`}>
        <div ref={el} className="h-full w-full bg-muted" role="region" aria-label={`Carte du paramètre, ${data.features.length} points`} />
        <div className="panel absolute bottom-2 left-2 z-10 max-w-[60%] p-2 text-[10.5px] shadow">
          <p className="mb-1 font-semibold">Légende ({data.legend.kind === "numeric" ? "numérique" : "catégorielle"})</p>
          {legendRows.map((l, i) => (
            <div key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full border" style={{ background: colors[i] }} /><span className="truncate font-mono">{l}</span></div>
          ))}
        </div>
        <div className="absolute right-12 top-2.5 z-10 flex gap-1">
          <button onClick={fit} aria-label="Recentrer sur les données" className="panel p-1.5 shadow"><Crosshair className="h-3.5 w-3.5" /></button>
          <button onClick={() => setFull((f) => !f)} aria-label={full ? "Quitter plein écran" : "Carte plein écran"} className="panel p-1.5 shadow">{full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        </div>
        {tileError && (
          <div role="status" className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md bg-warning px-2 py-1 text-[11px] text-warning-foreground">
            <AlertTriangle className="h-3 w-3" /> Fond de carte indisponible — points affichés sans tuiles.
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">{data.features.length.toLocaleString("fr-FR")} points géolocalisés · Plan indoor indisponible (aucune ressource validée fournie).</p>
    </div>
  );
}
