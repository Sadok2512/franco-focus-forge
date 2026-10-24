import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { SigCapture } from "@/lib/api/signaling-schemas-v2";
import { SEV_COLOR } from "./Timeline";
import { Button } from "@/components/ui/button";
import { fmtSec } from "./shared";
import { MAP_GLYPHS, useSitesLayer } from "@/features/kpi/SitesLayer";
import { SitesLayerControls, useSitesLayerState } from "@/features/kpi/SitesLayerControls";

/** Relie la couche Sites (bbox lazy, clusters/site/cell) au contrôle persistant. */
function SitesLayerHarness({ map }: { map: MlMap | null }) {
  const { enabled, filters, setEnabled, toggleTechno, toggleBand, toggleOperator } =
    useSitesLayerState();
  const status = useSitesLayer(map, enabled, filters);
  return (
    <SitesLayerControls
      enabled={enabled}
      filters={filters}
      onToggleEnabled={setEnabled}
      onToggleTechno={toggleTechno}
      onToggleBand={toggleBand}
      onToggleOperator={toggleOperator}
      status={{
        loading: status.loading,
        error: status.error,
        ...(status.data?.n_returned != null ? { n_returned: status.data.n_returned } : {}),
        ...(status.data?.n_total_in_bbox != null ? { n_total: status.data.n_total_in_bbox } : {}),
        truncated: Boolean(status.data?.reason?.startsWith("truncated")),
      }}
    />
  );
}

/** Carte GPS synchronisée : trajet réel, événements géolocalisés, sélection. */
export function SignalingMap({
  capture,
  selectedEventId,
  onSelectEvent,
}: {
  capture: SigCapture;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string, t: number, messageIndex: number | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);
  const [mapInstance, setMapInstance] = useState<MlMap | null>(null);

  const trackGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: capture.track.map((p) => [p.lng, p.lat]),
          },
          properties: {},
        },
      ],
    }),
    [capture.track],
  );

  const eventsGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: capture.events_gps.map((g) => {
        const ev = capture.events.find((e) => e.id === g.event_id);
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [g.lng, g.lat] },
          properties: {
            id: g.event_id,
            t: g.t,
            name: ev?.name ?? "Événement",
            color: SEV_COLOR[ev?.severity ?? "info"] ?? "#1769E0",
            message_index: ev?.message_index ?? null,
          },
        };
      }),
    }),
    [capture.events_gps, capture.events],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]).then(([ml, worker]) => {
      if (cancelled || !el.current) return;
      ml.setWorkerUrl(worker.default);
      const m = new ml.Map({
        container: el.current,
        center: [2.219, 48.902],
        zoom: 12,
        attributionControl: { compact: true },
        style: {
          version: 8,
          glyphs: MAP_GLYPHS,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.4, "raster-opacity": 0.9 } }],
        },
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-left");
      m.on("load", () => {
        m.addSource("track", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "track",
          type: "line",
          source: "track",
          paint: { "line-color": "#1769E0", "line-width": 2.5, "line-opacity": 0.75 },
        });
        m.addSource("events", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "events",
          type: "circle",
          source: "events",
          paint: {
            "circle-radius": 7,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#FFFFFF",
          },
        });
        m.addLayer({
          id: "sel",
          type: "circle",
          source: "events",
          filter: ["==", ["get", "id"], ""],
          paint: { "circle-radius": 12, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2.5, "circle-stroke-color": "#0F172A" },
        });
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
        m.on("mousemove", "events", (e) => {
          m.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (p) popup.setLngLat(e.lngLat).setHTML(`<div style="font:12px Inter"><b>${p["name"]}</b><br/>${Number(p["t"]).toLocaleString("fr-FR", { minimumFractionDigits: 3 })} s</div>`).addTo(m);
        });
        m.on("mouseleave", "events", () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });
        m.on("click", "events", (e) => {
          const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
          if (p) onSelectEvent(String(p["id"]), Number(p["t"]), p["message_index"] == null ? null : Number(p["message_index"]));
        });
        // Cadrage initial sur le trajet réel.
        const lngs = capture.track.map((p) => p.lng);
        const lats = capture.track.map((p) => p.lat);
        if (capture.track.length) m.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 40, duration: 0 },
        );
        setReady(true);
        setMapInstance(m);
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
      setMapInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.id]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource("track") as { setData: (d: unknown) => void } | undefined)?.setData(trackGeo);
    (map.current.getSource("events") as { setData: (d: unknown) => void } | undefined)?.setData(eventsGeo);
  }, [trackGeo, eventsGeo, ready]);

  // Clic timeline → mise en évidence du point GPS prouvé, zoom conservé.
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.setFilter("sel", ["==", ["get", "id"], selectedEventId ?? ""]);

  }, [selectedEventId, ready, capture.events_gps]);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const observer = new ResizeObserver(() => map.current?.resize());
    observer.observe(node);
    map.current?.resize();
    return () => observer.disconnect();
  }, [full]);

  return (
    <div className={`relative overflow-hidden ${full ? "fixed inset-4 z-50 rounded-md border bg-card shadow-2xl" : "h-full"}`}>
      <div ref={el} className="h-full w-full bg-muted" role="region" aria-label="Carte — Trajet GPS" />
      <div className="panel absolute left-2 top-2 z-10 px-2 py-1 text-[11px] font-semibold shadow">Carte - Trajet GPS</div>
      <SitesLayerHarness map={mapInstance} />
      <Button variant="outline" size="sm"
        onClick={() => setFull((f) => !f)}
        aria-label={full ? "Quitter plein écran" : "Carte plein écran"}
        className="panel absolute right-24 top-2 z-10 p-1.5 shadow"
      >
        {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </Button>
      {selectedEventId && !capture.events_gps.some((g) => g.event_id === selectedEventId) && (
        <p role="status" className="absolute bottom-2 right-2 rounded border bg-card px-2 py-1 text-[10px] text-muted-foreground">GPS de l’événement : N/D</p>
      )}
      <div className="panel absolute bottom-2 left-2 z-10 p-2 text-[10px] shadow">
        <p className="mb-1 font-semibold">Événements géolocalisés</p>
        {capture.events_gps.slice(0, 5).map((g) => {
          const ev = capture.events.find((e) => e.id === g.event_id);
          return (
            <div key={g.event_id} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: SEV_COLOR[ev?.severity ?? "info"] }} />
              <span>{ev?.name}</span>
              <span className="num font-mono text-muted-foreground">{fmtSec(g.t)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
