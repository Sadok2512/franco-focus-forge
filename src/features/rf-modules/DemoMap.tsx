// -----------------------------------------------------------------------
// 1.20.2 — Carte **DÉMO** SVG locale (fallback géographique sans tiles).
//
// Ce composant NE PRÉTEND PAS être une vraie carte street. Les axes sont
// étiquetés `lat` / `lng` (coordonnées), le fond est un canvas neutre
// avec grille, et un badge "MODE DÉMO" est permanent. Jamais utilisé en
// mode REAL (le mode REAL garde le panneau "cell_ref lat/lng missing").
//
// Points :
// - serving_cell (triangle bleu)
// - candidate_cell (losange orange)
// - ue_observation (petit cercle gris)
// - ligne serving→candidate (preuve de pairage, 1 par observation)
//
// Interactions :
// - highlightedObs : met en évidence une observation (depuis clic table/histo).
// - onPointClick(obs_id) : remonte au parent pour sync la table.
// -----------------------------------------------------------------------
import { useMemo } from "react";
import type { DemoObservation } from "./fixtures/rfDemo";

type Props = {
  observations: readonly DemoObservation[];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  highlightedObsId: string | null;
  onObsClick: (obsId: string) => void;
};

export function DemoMap({ observations, bounds, highlightedObsId, onObsClick }: Props) {
  const W = 480;
  const H = 320;
  const PAD = 28;
  const { xy, gridLat, gridLng } = useMemo(() => {
    const latRange = Math.max(0.0001, bounds.maxLat - bounds.minLat);
    const lngRange = Math.max(0.0001, bounds.maxLng - bounds.minLng);
    const xy = (lat: number, lng: number) => ({
      x: PAD + ((lng - bounds.minLng) / lngRange) * (W - 2 * PAD),
      y: PAD + (1 - (lat - bounds.minLat) / latRange) * (H - 2 * PAD),
    });
    const gridLat = Array.from({ length: 4 }, (_, i) => bounds.minLat + ((i + 1) / 5) * latRange);
    const gridLng = Array.from({ length: 4 }, (_, i) => bounds.minLng + ((i + 1) / 5) * lngRange);
    return { xy, gridLat, gridLng };
  }, [bounds]);

  // Opérateur → couleur serving (code pays BC4)
  const opColor: Record<DemoObservation["operator"], string> = {
    Orange: "#FF7900",
    SFR: "#E2001A",
    Bouygues: "#1E6EC1",
    Free: "#CD1F2A",
  };

  return (
    <div className="relative">
      <div className="absolute left-2 top-2 z-10 rounded border border-sev-warn/40 bg-sev-warn/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sev-warn">
        MODE DÉMO — Données fictives
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Carte démo RF : positions fictives autour d'un point de démonstration"
        className="h-full w-full"
      >
        {/* Fond canvas */}
        <rect x={0} y={0} width={W} height={H} fill="#F7FAFC" />
        {/* Grille */}
        {gridLng.map((lng, i) => {
          const { x } = xy(bounds.minLat, lng);
          return <line key={`vl-${i}`} x1={x} y1={PAD} x2={x} y2={H - PAD} stroke="#E1E8F0" strokeWidth={0.5} />;
        })}
        {gridLat.map((lat, i) => {
          const { y } = xy(lat, bounds.minLng);
          return <line key={`hl-${i}`} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#E1E8F0" strokeWidth={0.5} />;
        })}
        {/* Axes labels (coords fictives) */}
        <text x={PAD} y={H - 10} fontSize="8" fill="#94A3B8" fontFamily="monospace">
          lng {bounds.minLng.toFixed(3)}
        </text>
        <text x={W - PAD - 50} y={H - 10} fontSize="8" fill="#94A3B8" fontFamily="monospace">
          lng {bounds.maxLng.toFixed(3)}
        </text>
        <text x={2} y={PAD + 4} fontSize="8" fill="#94A3B8" fontFamily="monospace">
          lat {bounds.maxLat.toFixed(3)}
        </text>
        <text x={2} y={H - PAD} fontSize="8" fill="#94A3B8" fontFamily="monospace">
          lat {bounds.minLat.toFixed(3)}
        </text>
        {/* Lignes serving → candidate (preuve de pairage) */}
        {observations.map((o) => {
          const a = xy(o.serving_position.lat, o.serving_position.lng);
          const b = xy(o.candidate_position.lat, o.candidate_position.lng);
          const hl = o.obs_id === highlightedObsId;
          return (
            <line
              key={`l-${o.obs_id}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={hl ? "#1769E0" : "#CBD5E1"}
              strokeWidth={hl ? 1.6 : 0.6}
              strokeOpacity={hl ? 1 : 0.5}
              strokeDasharray="2 2"
            />
          );
        })}
        {/* UE observations (petits cercles gris) */}
        {observations.map((o) => {
          const p = xy(o.ue_observation_position.lat, o.ue_observation_position.lng);
          const hl = o.obs_id === highlightedObsId;
          return (
            <circle
              key={`u-${o.obs_id}`}
              cx={p.x} cy={p.y} r={hl ? 3.5 : 2}
              fill={hl ? "#1769E0" : "#94A3B8"} fillOpacity={0.7}
              onClick={() => onObsClick(o.obs_id)}
              style={{ cursor: "pointer" }}
            >
              <title>{`${o.obs_id} · UE observation · margin +${o.margin_db} dB`}</title>
            </circle>
          );
        })}
        {/* Serving cells (triangles couleur opérateur) */}
        {observations.map((o) => {
          const p = xy(o.serving_position.lat, o.serving_position.lng);
          const hl = o.obs_id === highlightedObsId;
          const size = hl ? 6 : 4;
          return (
            <polygon
              key={`s-${o.obs_id}`}
              points={`${p.x},${p.y - size} ${p.x - size},${p.y + size} ${p.x + size},${p.y + size}`}
              fill={opColor[o.operator]} stroke="#142235" strokeWidth={hl ? 1 : 0.4}
              onClick={() => onObsClick(o.obs_id)}
              style={{ cursor: "pointer" }}
            >
              <title>{`${o.serving_cell} · serving · ${o.operator} · RSRP ${o.serving_rsrp_dbm} dBm`}</title>
            </polygon>
          );
        })}
        {/* Candidate cells (losanges orange foncé) */}
        {observations.map((o) => {
          const p = xy(o.candidate_position.lat, o.candidate_position.lng);
          const hl = o.obs_id === highlightedObsId;
          const size = hl ? 5 : 3.5;
          const confirmed = o.classification === "OVERSHOOTING_CONFIRMED";
          return (
            <polygon
              key={`c-${o.obs_id}`}
              points={`${p.x},${p.y - size} ${p.x + size},${p.y} ${p.x},${p.y + size} ${p.x - size},${p.y}`}
              fill={confirmed ? "#DC2626" : "#F59E0B"} stroke="#142235" strokeWidth={hl ? 1 : 0.4}
              onClick={() => onObsClick(o.obs_id)}
              style={{ cursor: "pointer" }}
            >
              <title>{`${o.candidate_cell} · candidate · RSRP ${o.candidate_rsrp_dbm} dBm${confirmed ? " · OVERSHOOTING_CONFIRMED" : ""}`}</title>
            </polygon>
          );
        })}
      </svg>
      {/* Légende */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 text-[10px]">
        <LegendDot shape="triangle" color="#1E6EC1" label="Serving cell (▲ couleur opérateur)" />
        <LegendDot shape="diamond" color="#F59E0B" label="Candidate cell (◆ ambre)" />
        <LegendDot shape="diamond" color="#DC2626" label="Overshooting confirmed (◆ rouge)" />
        <LegendDot shape="circle" color="#94A3B8" label="UE observation (●)" />
      </div>
    </div>
  );
}

function LegendDot({ shape, color, label }: { shape: "triangle" | "diamond" | "circle"; color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <svg width={10} height={10} viewBox="0 0 10 10">
        {shape === "triangle" && <polygon points="5,1 1,9 9,9" fill={color} />}
        {shape === "diamond" && <polygon points="5,1 9,5 5,9 1,5" fill={color} />}
        {shape === "circle" && <circle cx={5} cy={5} r={3} fill={color} />}
      </svg>
      <span>{label}</span>
    </span>
  );
}
