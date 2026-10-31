import { AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { MeasurementPoint, Operator } from "@/lib/api/schemas";

// -------------------------------------------------------------------
// 1.14.0 — Carte dédiée Assistant (back 0.26.0 `map_metric`).
//
// Volontairement SÉPARÉE de `RadioMap` (Overview / Dictionnaire) pour
// deux raisons :
//  1. L'Assistant a sa propre grille de SEUILS dBm BC4 (6 classes),
//     qui diffèrent des 4 classes `good|fair|poor|bad` du reste de
//     l'app. Mélanger les deux ferait diverger la lecture visuelle.
//  2. L'Assistant a un toggle `colorBy` ("value" | "operator") que
//     la carte principale n'a pas.
//
// Dette technique assumée : duplique le code maplibre-gl de RadioMap.
// Si un jour une 3e carte apparaît, factoriser dans un hook partagé
// `useMaplibrePointLayer`.
// -------------------------------------------------------------------

/**
 * Seuils dBm BC4 — 6 classes bornes supérieures.
 * Lecture : si value ≥ -71 → "excellent" ; sinon si ≥ -81 → "fort" ; etc.
 * Les bornes DOIVENT rester cohérentes avec la doctrine métier.
 */
const RSRP_BINS: Array<{ max: number; key: string; label: string; range: string; color: string }> = [
  { max: Number.POSITIVE_INFINITY, key: "excellent", label: "Excellent", range: "≥ -71 dBm", color: "#1b5e20" }, // vert foncé
  { max: -71, key: "fort", label: "Fort", range: "-71..-81 dBm", color: "#66bb6a" }, // vert clair
  { max: -81, key: "moyen", label: "Moyen", range: "-81..-91 dBm", color: "#fdd835" }, // jaune
  { max: -91, key: "faible", label: "Faible", range: "-91..-101 dBm", color: "#fb8c00" }, // orange
  { max: -101, key: "critique", label: "Critique", range: "-101..-111 dBm", color: "#e53935" }, // rouge
  { max: -111, key: "nul", label: "Hors couverture", range: "< -111 dBm", color: "#7f1d1d" }, // rouge très foncé
];

function rsrpColor(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "rgba(0,0,0,0.0)";
  for (const b of RSRP_BINS) {
    if (v >= b.max) return b.color;
  }
  // v < -111 (dernière classe explicite)
  return RSRP_BINS[RSRP_BINS.length - 1]!.color;
}

const OPERATOR_COLORS: Record<string, string> = {
  Orange: "#ff7900",
  SFR: "#e2001a",
  Bouygues: "#0084d6",
  Free: "#cd2026",
};

export type ColorBy = "value" | "operator";

function colorForPoint(p: MeasurementPoint, mode: ColorBy): string {
  if (mode === "operator") return OPERATOR_COLORS[p.operator] ?? "#888";
  return rsrpColor(p.rsrp);
}

function LegendValue() {
  return (
    <div className="panel absolute bottom-2 left-2 z-10 p-2 text-[11px] shadow">
      <p className="mb-1 font-semibold">
        RSRP serving <span className="font-normal text-muted-foreground">(dBm)</span>
      </p>
      {RSRP_BINS.map((b) => (
        <div key={b.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
          <span className="w-24">{b.label}</span>
          <span className="num font-mono text-muted-foreground">{b.range}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground" /> N/D
      </div>
    </div>
  );
}

function LegendOperator({ operators }: { operators: Operator[] }) {
  return (
    <div className="panel absolute bottom-2 left-2 z-10 p-2 text-[11px] shadow">
      <p className="mb-1 font-semibold">Opérateur</p>
      {operators.map((op) => (
        <div key={op} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: OPERATOR_COLORS[op] }}
          />
          <span>{op}</span>
        </div>
      ))}
    </div>
  );
}

export function AssistantMap({
  points,
  center,
  valueRange,
}: {
  points: MeasurementPoint[];
  center: [number, number];
  valueRange?: [number, number] | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [full, setFull] = useState(false);
  const [colorBy, setColorBy] = useState<ColorBy>("value");

  const presentOperators = useMemo(() => {
    const s = new Set<Operator>();
    for (const p of points) s.add(p.operator as Operator);
    return Array.from(s) as Operator[];
  }, [points]);

  const geojson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: points.map((p) => ({
        type: "Feature" as const,
        id: undefined,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          op: p.operator,
          tech: p.tech,
          band: p.band,
          rsrp: p.rsrp,
          // n : champ ajouté par les cellules agrégées (0.26.0).
          // `undefined` sur les points non-agrégés.
          n: (p as unknown as { n?: number }).n,
          color: colorForPoint(p, colorBy),
          vLabel: p.rsrp == null ? "N/D" : `${p.rsrp.toFixed(1)} dBm`,
        },
      })),
    };
  }, [points, colorBy]);

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
        center,
        zoom: 12,
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
            {
              id: "osm",
              type: "raster",
              source: "osm",
              paint: { "raster-saturation": -0.8, "raster-opacity": 0.85 },
            },
          ],
        },
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => {
        if (String(e.error?.message ?? "").match(/tile|fetch|Failed/i)) setTileError(true);
      });
      m.on("load", () => {
        m.addSource("cells", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addLayer({
          id: "cells",
          type: "circle",
          source: "cells",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 10],
            "circle-color": ["get", "color"],
            "circle-stroke-width": 0.8,
            "circle-stroke-color": "rgba(20,34,53,0.6)",
            "circle-opacity": 0.85,
          },
        });
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
        m.on("mousemove", "cells", (e) => {
          m.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties as
            | { op?: string; tech?: string; band?: string; rsrp?: number | null; n?: number; vLabel?: string }
            | undefined;
          if (!p) return;
          const nStr = p.n != null ? `n = <b>${p.n}</b>` : "";
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font:12px IBM Plex Sans">` +
                `<b>${p.op ?? "N/D"}</b> · ${p.tech ?? ""} ${p.band ?? ""}<br/>` +
                `RSRP: <b>${p.vLabel ?? "N/D"}</b><br/>` +
                nStr +
                `</div>`,
            )
            .addTo(m);
        });
        m.on("mouseleave", "cells", () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });
        setReady(true);
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1]]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource("cells") as { setData: (d: unknown) => void } | undefined)?.setData(
      geojson,
    );
  }, [geojson, ready]);

  useEffect(() => {
    setTimeout(() => map.current?.resize(), 30);
  }, [full]);

  return (
    <div
      className={`relative overflow-hidden ${full ? "fixed inset-4 z-50 rounded-md border bg-background shadow-2xl" : "h-full"}`}
    >
      <div
        ref={el}
        className="h-full w-full bg-muted"
        role="region"
        aria-label="Carte RSRP agrégée"
      />
      {colorBy === "value" ? <LegendValue /> : <LegendOperator operators={presentOperators} />}

      {/* Toggle colorBy — groupe de 2 pastilles en haut-gauche */}
      <div
        role="radiogroup"
        aria-label="Mode de coloration"
        className="panel absolute left-2 top-2 z-10 flex gap-0.5 p-0.5 shadow"
      >
        <button
          role="radio"
          aria-checked={colorBy === "value"}
          onClick={() => setColorBy("value")}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
            colorBy === "value"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Par valeur
        </button>
        <button
          role="radio"
          aria-checked={colorBy === "operator"}
          onClick={() => setColorBy("operator")}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
            colorBy === "operator"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Par opérateur
        </button>
      </div>

      {valueRange && (
        <div className="panel absolute right-2 top-2 z-10 p-1.5 text-[10px] shadow">
          Plage observée :{" "}
          <span className="font-mono">
            [{valueRange[0].toFixed(1)}, {valueRange[1].toFixed(1)}] dBm
          </span>
        </div>
      )}

      <button
        onClick={() => setFull((f) => !f)}
        aria-label={full ? "Quitter plein écran" : "Carte plein écran"}
        className="panel absolute right-12 top-2.5 z-10 p-1.5 shadow"
      >
        {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
      {tileError && (
        <div className="absolute left-32 top-2 z-10 flex items-center gap-1.5 rounded-md bg-warning px-2 py-1 text-[11px] text-warning-foreground">
          <AlertTriangle className="h-3 w-3" /> Fond de carte indisponible — points affichés sans
          tuiles.
        </div>
      )}
    </div>
  );
}
