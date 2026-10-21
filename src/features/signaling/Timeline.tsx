import { Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo } from "react";
import type { SigCapture, SigEvent, SigMobilityEvent, SigTask } from "@/lib/api/signaling-schemas";
import { clusterEvents, fmtSec, fmtTick, ticksFor } from "./shared";

export type View = { start: number; end: number };
export type HoverState = { x: number; y: number; title: string; lines: string[] };

// Couleurs imposées par la maquette (attributs SVG, pas de classes Tailwind).
export const SEV_COLOR: Record<string, string> = {
  info: "#1769E0",
  success: "#16A34A",
  warning: "#F97316",
  error: "#DC2626",
  event: "#9333EA",
};
const CONN_COLOR: Record<string, string> = { LTE: "#1769E0", "EN-DC": "#9333EA", "NR-SA": "#16A34A" };
const CONN_LABEL: Record<string, string> = { LTE: "LTE CONNECTED", "EN-DC": "NSA (EN-DC)", "NR-SA": "NR SA" };
const MOB_COLOR: Record<string, string> = { ho: "#1769E0", success: "#16A34A", failure: "#DC2626", drop: "#DC2626" };
const TASK_COLOR: Record<string, string> = { DL: "#1769E0", UL: "#16A34A" };
const CALL_COLOR: Record<string, string> = { VoLTE: "#F97316", VoNR: "#9333EA" };

const LABEL_W = 132;
const VIEW_W = 1000;
const LANE_W = VIEW_W - LABEL_W;

const CELL_PATHS = ["M0 -8 V8", "M-7 -4 H7", "M-5 0 H5", "M-3 4 H3"];
const EVENT_ICON_PATHS = ["M0 -6 L6 0 L0 6 L-6 0 Z", "M-6 0 A6 6 0 1 0 6 0 A6 6 0 1 0 -6 0", "M0 -7 L7 6 H-7 Z"];

function TrackIcon({ kind, color, x = 10, y = 0 }: { kind: string; color: string; x?: number; y?: number }) {
  if (kind === "dl")
    return (
      <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 -6 V3" />
        <path d="M-4 -1 L0 4 L4 -1" />
        <path d="M-5 7 H5" />
      </g>
    );
  if (kind === "ul")
    return (
      <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 6 V-3" />
        <path d="M-4 1 L0 -4 L4 1" />
        <path d="M-5 -7 H5" />
      </g>
    );
  if (kind === "phone")
    return (
      <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-5 -6 H-1 L1 -2 L-1 0 C0 2 2 4 4 5 L6 3 L8 5 V7 H6 C-1 6 -4 1 -5 -6 Z" transform="scale(0.85)" />
      </g>
    );
  if (kind === "swap")
    return (
      <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-6 -3 H4 L1 -6" />
        <path d="M6 3 H-4 L-1 6" />
      </g>
    );
  // "cell"
  return (
    <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round">
      {CELL_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

export function Timeline({
  capture,
  view,
  onView,
  compact,
  cursorT,
  onSelectTime,
  onHover,
}: {
  capture: SigCapture;
  view: View;
  onView: (v: View) => void;
  compact: boolean;
  cursorT: number | null;
  onSelectTime: (t: number, messageIndex: number | null) => void;
  onHover: (h: HoverState | null) => void;
}) {
  const span = Math.max(view.end - view.start, 1e-6);
  const scale = (t: number) => LABEL_W + ((t - view.start) / span) * LANE_W;
  const inView = (t: number) => t >= view.start && t <= view.end;
  const ticks = useMemo(() => ticksFor(view.start, view.end), [view.start, view.end]);

  const zoom = (factor: number) => {
    const c = (view.start + view.end) / 2;
    const half = Math.max((span * factor) / 2, 2);
    const start = Math.max(0, c - half);
    const end = Math.min(capture.duration_s, c + half);
    onView(end - start < 4 ? { start: Math.max(0, c - 2), end: Math.min(capture.duration_s, c + 2) } : { start, end });
  };
  const reset = () => onView({ start: 0, end: capture.duration_s });

  const rows: { key: string; h: number }[] = [
    { key: "conn", h: compact ? 24 : 34 },
    { key: "events", h: compact ? 44 : 72 },
    { key: "dl", h: compact ? 22 : 32 },
    { key: "ul", h: compact ? 22 : 32 },
    ...(capture.calls.some((c) => c.kind === "VoLTE") ? [{ key: "volte", h: compact ? 22 : 32 }] : []),
    ...(capture.calls.some((c) => c.kind === "VoNR") ? [{ key: "vonr", h: compact ? 22 : 32 }] : []),
    ...(capture.mobility.length ? [{ key: "mob", h: compact ? 30 : 52 }] : []),
  ];
  const axisH = 26;
  const sep = 4;
  let acc = axisH;
  const top: Record<string, number> = {};
  for (const r of rows) {
    top[r.key] = acc;
    acc += r.h + sep;
  }
  const totalH = acc + 4;

  const barY = (lane: string, h: number) => top[lane]! + (rows.find((r) => r.key === lane)!.h - h) / 2;

  const timeLabel = (t: number, anchor: "start" | "end", prefer: "left" | "right") => {
    const x = scale(t);
    const fitsRight = x + 62 <= VIEW_W - 4;
    const fitsLeft = x - 62 >= LABEL_W + 4;
    if (anchor === "start") {
      if (prefer === "right") return fitsRight ? { x: x + 4, anchor: "start" as const } : { x: x - 4, anchor: "end" as const };
      return fitsLeft ? { x: x - 4, anchor: "end" as const } : { x: x + 4, anchor: "start" as const };
    }
    if (prefer === "left") return fitsLeft ? { x: x - 4, anchor: "end" as const } : { x: x + 4, anchor: "start" as const };
    return fitsRight ? { x: x + 4, anchor: "start" as const } : { x: x - 4, anchor: "end" as const };
  };

  const eventTooltip = (ev: SigEvent) => ({
    title: `t = ${fmtSec(ev.t)}`,
    lines: [
      `${ev.name}${ev.tech ? ` — ${ev.tech}` : ""}`,
      ...(ev.ecgi ? [`ECGI : ${ev.ecgi}`] : []),
      ...(ev.pci != null ? [`PCI : ${ev.pci}`] : []),
      "Mesures radio : voir message associé",
    ],
  });

  const groups = useMemo(
    () => clusterEvents(capture.events.filter((e) => inView(e.t)), (t) => scale(t), 110),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capture.events, view.start, view.end],
  );
  const evTop = top["events"]!;
  const evH = rows.find((r) => r.key === "events")!.h;

  const renderTask = (lane: string, dir: "DL" | "UL") => {
    const color = TASK_COLOR[dir]!;
    const h = compact ? 8 : 12;
    const y = barY(lane, h);
    const cy = y + h / 2;
    const tasks = capture.tasks.filter((t) => t.dir === dir);
    if (!tasks.length)
      return (
        <text x={LABEL_W + 8} y={cy + 3} fontSize={8.5} fill="#94A3B8">
          Aucune tâche {dir}
        </text>
      );
    return tasks.map((task) => {
      const x1 = Math.max(LABEL_W, scale(task.start_s));
      const x2 = Math.min(VIEW_W, scale(task.end_s));
      if (x2 <= LABEL_W || x1 >= VIEW_W) return null;
      const w = x2 - x1;
      const sLbl = timeLabel(task.start_s, "start", "left");
      const eLbl = timeLabel(task.end_s, "end", "right");
      return (
        <g
          key={task.id}
          className="cursor-pointer"
          onClick={() => onSelectTime(task.start_s, task.message_index)}
          onMouseMove={(e) =>
            onHover({
              x: e.clientX,
              y: e.clientY,
              title: task.label,
              lines: [
                `Début : ${fmtSec(task.start_s)} — Fin : ${fmtSec(task.end_s)}`,
                `Durée : ${fmtSec(task.end_s - task.start_s)}`,
                task.throughput ? `Volume : ${task.throughput}` : "Débit : N/D",
              ],
            })
          }
          onMouseLeave={() => onHover(null)}
        >
          <rect x={x1} y={y} width={Math.max(w, 3)} height={h} rx={h / 2} fill={color} opacity={0.16} />
          <rect x={x1} y={y} width={Math.max(w, 3)} height={h} rx={h / 2} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1} />
          {w > 110 && (
            <text x={(x1 + x2) / 2} y={cy + 3} textAnchor="middle" fontSize={9} fontWeight={600} fill={color}>
              {task.label}
            </text>
          )}
          <circle cx={x1} cy={cy} r={compact ? 4 : 7} fill={color} />
          <circle cx={x2} cy={cy} r={compact ? 4 : 7} fill={color} />
          {!compact && (
            <>
              <text x={sLbl.x} y={cy - 8} textAnchor={sLbl.anchor} fontSize={8} fill="#64748B">
                Start {fmtSec(task.start_s)}
              </text>
              <text x={eLbl.x} y={cy - 8} textAnchor={eLbl.anchor} fontSize={8} fill="#64748B">
                End {fmtSec(task.end_s)}
              </text>
            </>
          )}
        </g>
      );
    });
  };

  const renderCall = (lane: string, kind: "VoLTE" | "VoNR") => {
    const color = CALL_COLOR[kind]!;
    const h = compact ? 8 : 12;
    const y = barY(lane, h);
    const cy = y + h / 2;
    return capture.calls
      .filter((c) => c.kind === kind)
      .map((call) => {
        // Un appel non confirmé ne s'affiche jamais comme connecté :
        // sans start_s prouvé, seul le marqueur « Attempt » est rendu.
        if (call.start_s == null || call.end_s == null) {
          const x = scale(call.attempt_s);
          if (!inView(call.attempt_s)) return null;
          return (
            <g
              key={call.id}
              className="cursor-pointer"
              onClick={() => onSelectTime(call.attempt_s, call.message_index)}
              onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, title: `${kind} — tentative`, lines: [`t = ${fmtSec(call.attempt_s)}`, "Appel non confirmé : jamais affiché connecté"] })}
              onMouseLeave={() => onHover(null)}
            >
              <path d={EVENT_ICON_PATHS[2]} transform={`translate(${x} ${cy})`} fill={color} />
              {!compact && (
                <text x={x} y={cy - 10} textAnchor="middle" fontSize={8} fill={color}>
                  Attempt {fmtSec(call.attempt_s)}
                </text>
              )}
            </g>
          );
        }
        const startS = call.start_s;
        const endS = call.end_s;
        const x1 = Math.max(LABEL_W, scale(startS));
        const x2 = Math.min(VIEW_W, scale(endS));
        if (x2 <= LABEL_W || x1 >= VIEW_W) return null;
        const w = x2 - x1;
        const aLbl = timeLabel(call.attempt_s, "start", "left");
        const eLbl = timeLabel(endS, "end", "right");
        return (
          <g
            key={call.id}
            className="cursor-pointer"
            onClick={() => onSelectTime(startS, call.message_index)}
            onMouseMove={(e) =>
              onHover({
                x: e.clientX,
                y: e.clientY,
                title: `${kind} — ${call.state === "dropped" ? "Drop" : "Released"}`,
                lines: [`Attempt : ${fmtSec(call.attempt_s)}`, `Connecté : ${fmtSec(startS)} — Fin : ${fmtSec(endS)}`, `Durée : ${fmtSec(endS - startS)}`],
              })
            }
            onMouseLeave={() => onHover(null)}
          >
            <rect x={x1} y={y} width={Math.max(w, 3)} height={h} rx={h / 2} fill={color} opacity={0.8} />
            {w > 90 && (
              <text x={(x1 + x2) / 2} y={cy + 3} textAnchor="middle" fontSize={9} fontWeight={600} fill="#FFFFFF">
                {kind} Call ({(endS - startS).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s)
              </text>
            )}
            <path d={EVENT_ICON_PATHS[0]} transform={`translate(${Math.max(LABEL_W, scale(call.attempt_s))} ${cy}) scale(0.8)`} fill={color} />
            <circle cx={x2} cy={cy} r={compact ? 4 : 6} fill={call.state === "dropped" ? "#DC2626" : color} />
            {!compact && (
              <>
                <text x={aLbl.x} y={cy - 8} textAnchor={aLbl.anchor} fontSize={8} fill="#64748B">
                  Attempt {fmtSec(call.attempt_s)}
                </text>
                <text x={eLbl.x} y={cy - 8} textAnchor={eLbl.anchor} fontSize={8} fill="#64748B">
                  {call.state === "dropped" ? "Dropped" : "Released"} {fmtSec(call.end_s)}
                </text>
              </>
            )}
          </g>
        );
      });
  };

  const renderMobility = () => {
    const laneTop = top["mob"]!;
    const laneH = rows.find((r) => r.key === "mob")!.h;
    const labeled = capture.mobility.filter((m) => inView(m.t));
    return labeled.map((m: SigMobilityEvent, i: number) => {
      const x = scale(m.t);
      const color = MOB_COLOR[m.kind]!;
      const cy = laneTop + (compact ? laneH / 2 : 18);
      const placeLeft = x + 70 > VIEW_W;
      return (
        <g
          key={m.id}
          className="cursor-pointer"
          onClick={() => onSelectTime(m.t, m.message_index)}
          onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, title: `t = ${fmtSec(m.t)}`, lines: [m.name] })}
          onMouseLeave={() => onHover(null)}
        >
          <line x1={x} y1={laneTop + 2} x2={x} y2={laneTop + laneH - 2} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          <circle cx={x} cy={cy} r={compact ? 6 : 9} fill={color} />
          <path d="M-4 0 H4 M0 -4 V4" transform={`translate(${x} ${cy})`} stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" />
          {!compact && (
            <>
              <text x={placeLeft ? x - 12 : x + 12} y={cy - 1} textAnchor={placeLeft ? "end" : "start"} fontSize={9} fontWeight={600} fill={color}>
                {m.name}
              </text>
              <text x={placeLeft ? x - 12 : x + 12} y={cy + 10} textAnchor={placeLeft ? "end" : "start"} fontSize={8} fill="#64748B">
                {fmtSec(m.t)}
              </text>
            </>
          )}
          {compact && i === 0 && null}
        </g>
      );
    });
  };

  const laneLabel = (lane: string, icon: string, color: string, text: string, sub?: string) => (
    <g>
      <TrackIcon kind={icon} color={color} x={12} y={top[lane]! + rows.find((r) => r.key === lane)!.h / 2} />
      <text x={26} y={top[lane]! + rows.find((r) => r.key === lane)!.h / 2 + (sub ? -1 : 3)} fontSize={9.5} fontWeight={600} fill="currentColor">
        {text}
      </text>
      {sub && (
        <text x={26} y={top[lane]! + rows.find((r) => r.key === lane)!.h / 2 + 10} fontSize={7.5} fill="#94A3B8">
          {sub}
        </text>
      )}
    </g>
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5">
        <h3 className="text-xs font-semibold">Timeline des événements, connectivité et mesures radio</h3>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2.5 lg:flex" aria-label="Légende">
            {(
              [
                ["Info", SEV_COLOR["info"]],
                ["Succès", SEV_COLOR["success"]],
                ["Avertissement", SEV_COLOR["warning"]],
                ["Échec", SEV_COLOR["error"]],
                ["Événement", SEV_COLOR["event"]],
              ] as const
            ).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <button aria-label="Zoom avant" onClick={() => zoom(0.5)} className="rounded p-1 text-muted-foreground hover:bg-muted">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button aria-label="Zoom arrière" onClick={() => zoom(2)} className="rounded p-1 text-muted-foreground hover:bg-muted">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button aria-label="Réinitialiser le zoom" onClick={reset} className="rounded p-1 text-[10px] font-medium text-muted-foreground hover:bg-muted">
              1:1
            </button>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${VIEW_W} ${totalH}`} preserveAspectRatio="none" className="block w-full text-foreground" style={{ height: compact ? 280 : 430 }} role="img" aria-label="Timeline des événements, connectivité et mesures radio">
        {/* Axe X unique en haut + grille verticale partagée par toutes les pistes */}
        {ticks.map((t) => {
          const x = scale(t);
          return (
            <g key={t}>
              <line x1={x} y1={axisH - 6} x2={x} y2={axisH} stroke="#CBD5E1" strokeWidth={1} />
              <text x={x} y={axisH - 9} textAnchor="middle" fontSize={8.5} fill="#64748B">
                {fmtTick(t)}
              </text>
              <line x1={x} y1={axisH} x2={x} y2={totalH} stroke="#F1F5F9" strokeWidth={1} />
            </g>
          );
        })}
        <line x1={0} y1={axisH} x2={VIEW_W} y2={axisH} stroke="#E2E8F0" strokeWidth={1} />
        {rows.map((r) => (
          <line key={r.key} x1={0} y1={top[r.key]! + r.h + sep / 2} x2={VIEW_W} y2={top[r.key]! + r.h + sep / 2} stroke="#F1F5F9" strokeWidth={1} />
        ))}

        {/* Connectivité LTE / NR — les états peuvent se chevaucher, jamais prolongés sans preuve */}
        {laneLabel("conn", "cell", "#1769E0", "Connectivité LTE / NR")}
        {capture.connectivity.map((seg, i) => {
          const x1 = Math.max(LABEL_W, scale(seg.start_s));
          const x2 = Math.min(VIEW_W, scale(seg.end_s));
          if (x2 <= LABEL_W || x1 >= VIEW_W) return null;
          const h = compact ? 10 : 14;
          const y = barY("conn", h);
          return (
            <g key={i} onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, title: CONN_LABEL[seg.state]!, lines: [`${fmtSec(seg.start_s)} → ${fmtSec(seg.end_s)}`] })} onMouseLeave={() => onHover(null)}>
              <rect x={x1} y={y} width={Math.max(x2 - x1, 2)} height={h} rx={h / 2} fill={CONN_COLOR[seg.state]} opacity={0.85} />
              {x2 - x1 > 80 && !compact && (
                <text x={(x1 + x2) / 2} y={y + h / 2 + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill="#FFFFFF">
                  {CONN_LABEL[seg.state]}
                </text>
              )}
            </g>
          );
        })}
        {!capture.connectivity.some((s) => s.state !== "LTE") && (
          <text x={VIEW_W - 8} y={barY("conn", 14) + 10} textAnchor="end" fontSize={8} fill="#94A3B8">
            NR : Non prouvé
          </text>
        )}

        {/* Événements réseau — icône + libellé + temps, regroupés à faible zoom */}
        {laneLabel("events", "cell", "#9333EA", "Événements réseau")}
        {groups.map((g) => {
          const ev = g.items[0]!;
          const x = scale(ev.t);
          const color = SEV_COLOR[ev.severity]!;
          if (g.items.length > 1) {
            return (
              <g
                key={g.items.map((i) => i.id).join("+")}
                className="cursor-pointer"
                onClick={() => onSelectTime(ev.t, ev.message_index)}
                onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, title: `${g.items.length} événements regroupés`, lines: g.items.slice(0, 5).map((i) => `${i.name} — ${fmtSec(i.t)}`) })}
                onMouseLeave={() => onHover(null)}
              >
                <circle cx={x} cy={evTop + evH / 2} r={8} fill="#E2E8F0" stroke="#94A3B8" strokeWidth={1} />
                <text x={x} y={evTop + evH / 2 + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#475569">
                  {g.items.length}
                </text>
              </g>
            );
          }
          const iconY = compact ? evTop + evH / 2 : evTop + 16;
          const lbl = timeLabel(ev.t, "start", "right");
          return (
            <g
              key={ev.id}
              className="cursor-pointer"
              onClick={() => onSelectTime(ev.t, ev.message_index)}
              onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, ...eventTooltip(ev) })}
              onMouseLeave={() => onHover(null)}
            >
              <line x1={x} y1={iconY + 6} x2={x} y2={evTop + evH} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
              <path d={EVENT_ICON_PATHS[1]} transform={`translate(${x} ${iconY}) scale(0.9)`} fill="none" stroke={color} strokeWidth={1.6} />
              <path d="M-3 0 L-1 2 L3 -2" transform={`translate(${x} ${iconY})`} stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
              {!compact && (
                <>
                  <text x={lbl.x} y={evTop + 38} textAnchor={lbl.anchor} fontSize={9} fontWeight={600} fill={color}>
                    {ev.name}
                  </text>
                  <text x={lbl.x} y={evTop + 49} textAnchor={lbl.anchor} fontSize={8} fill="#64748B">
                    {fmtSec(ev.t)}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Tâches Data */}
        {laneLabel("dl", "dl", TASK_COLOR["DL"]!, "DL Data", "Tâches Data")}
        {renderTask("dl", "DL")}
        {laneLabel("ul", "ul", TASK_COLOR["UL"]!, "UL Data")}
        {renderTask("ul", "UL")}

        {/* Appels VoLTE / VoNR */}
        {rows.some((r) => r.key === "volte") && laneLabel("volte", "phone", CALL_COLOR["VoLTE"]!, "VoLTE", "Appels")}
        {rows.some((r) => r.key === "volte") && renderCall("volte", "VoLTE")}
        {rows.some((r) => r.key === "vonr") && laneLabel("vonr", "phone", CALL_COLOR["VoNR"]!, "VoNR")}
        {rows.some((r) => r.key === "vonr") && renderCall("vonr", "VoNR")}

        {/* Mobilité */}
        {rows.some((r) => r.key === "mob") && laneLabel("mob", "swap", "#1769E0", "Mobilité")}
        {rows.some((r) => r.key === "mob") && renderMobility()}

        {/* Curseur temporel partagé */}
        {cursorT != null && inView(cursorT) && (
          <g pointerEvents="none">
            <line x1={scale(cursorT)} y1={axisH} x2={scale(cursorT)} y2={totalH} stroke="#0F172A" strokeWidth={1.2} strokeDasharray="4 3" />
            <path d="M-4 0 L4 0 L0 6 Z" transform={`translate(${scale(cursorT)} ${axisH})`} fill="#0F172A" />
          </g>
        )}
      </svg>
    </div>
  );
}
