// 1.72.0 (BC3) — Ruban d'événements en couloirs, consomme /signaling/events
// (shape α : lane, kind, outcome, pivot_seq, linked_seqs, link_rule, seq_gap).
// Spec /home/devmat/BC4/specs/signaling_timeline.html.
// Clic événement → onSelect(event) : parent surlignes messages liés dans la
// liste et ouvre l'arbre ASN.1 sur pivot_seq. Pas de ts, uniquement t_rel_s.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSignaling } from "@/lib/api/client";

type Lane = "radio" | "connexion" | "mobilite" | "endc" | "ca" | "services" | "acces" | "contexte";
type Kind = "mark" | "bar" | "band" | "fail" | "tri" | "x";

type EventRow = {
  id: string;
  lane: Lane;
  type: string;
  kind: Kind;
  seq: number;
  seq_end: number | null;
  t_rel_s: number | null;
  t_rel_end_s: number | null;
  duration_ms: number | null;
  outcome: "ok" | "fail" | "incomplete" | null;
  cause: string | null;
  label: string;
  attrs: Record<string, unknown>;
  pivot_seq: number | null;
  linked_seqs: number[];
  link_rule: string;
  seq_gap: number | null;
};

const LANES: { key: Lane; label: string; color: string }[] = [
  { key: "radio", label: "Radio", color: "#64748b" },
  { key: "connexion", label: "Connexion", color: "#2563eb" },
  { key: "mobilite", label: "Mobilité", color: "#7c3aed" },
  { key: "endc", label: "5G / EN-DC", color: "#9333ea" },
  { key: "ca", label: "CA", color: "#0891b2" },
  { key: "services", label: "Services", color: "#16a34a" },
  { key: "acces", label: "Accès / échecs", color: "#dc2626" },
  { key: "contexte", label: "Contexte", color: "#9a6700" },
];

const OUTCOME_COLORS: Record<string, string> = {
  ok: "#16a34a",
  fail: "#dc2626",
  incomplete: "#d97706",
};

export function EventRibbon({
  projectId,
  captureId,
  selectedSeq,
  onSelect,
}: {
  projectId: string;
  captureId: string;
  selectedSeq?: number | undefined;
  onSelect: (event: EventRow) => void;
}) {
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [enabledLanes, setEnabledLanes] = useState<Set<Lane>>(
    () => new Set(LANES.map((l) => l.key)),
  );
  // Curseur temporel rouge : état local au ruban, jamais une clé de requête.
  const [cursorT, setCursorT] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["signaling-events", projectId, captureId, failuresOnly],
    queryFn: ({ signal }) =>
      getSignaling(
        projectId,
        "events",
        { capture_id: captureId, failures_only: failuresOnly ? "true" : "false" },
        signal,
      ),
    enabled: !!captureId,
  });

  const toggleLane = (k: Lane) =>
    setEnabledLanes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const { events, maxT } = useMemo(() => {
    const d = q.data as { events?: EventRow[] } | undefined;
    const all = (d?.events ?? []).filter((e) => enabledLanes.has(e.lane));
    const maxT = all.reduce((acc, e) => Math.max(acc, e.t_rel_end_s ?? e.t_rel_s ?? 0), 0);
    return { events: all, maxT: Math.max(maxT, 1) };
  }, [q.data, enabledLanes]);

  const W = 1000;
  const L_LABEL = 110;
  const R_PAD = 20;
  const LANE_H = 28;
  const TOP = 32;
  const H = TOP + LANES.length * LANE_H + 10;
  const X = (t: number) => L_LABEL + (t / maxT) * (W - L_LABEL - R_PAD);

  const counts =
    (q.data as { counts_by_lane?: Record<string, number> } | undefined)?.counts_by_lane ?? {};

  if (q.isPending)
    return (
      <p role="status" className="p-6 text-xs text-muted-foreground">
        Chargement du ruban événements…
      </p>
    );
  if (q.isError)
    return (
      <p role="alert" className="p-3 text-xs text-red-600">
        /signaling/events indisponible : {String((q.error as Error).message)}
      </p>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="event-ribbon">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {LANES.map((l) => {
          const on = enabledLanes.has(l.key);
          const n = counts[l.key] ?? 0;
          return (
            <button
              key={l.key}
              type="button"
              className={`rounded-full border px-2 py-0.5 ${
                on
                  ? "border-transparent bg-primary/15 text-primary"
                  : "border-muted-foreground/30 bg-background text-muted-foreground"
              }`}
              onClick={() => toggleLane(l.key)}
              aria-pressed={on}
              data-testid={`ribbon-chip-${l.key}`}
            >
              {l.label} <span className="font-mono text-[10px] opacity-70">{n}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`ml-auto rounded-full border px-2 py-0.5 ${
            failuresOnly
              ? "border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
              : "border-muted-foreground/30 bg-background text-muted-foreground"
          }`}
          onClick={() => setFailuresOnly((v) => !v)}
          aria-pressed={failuresOnly}
          data-testid="ribbon-failures-only"
        >
          Échecs seulement
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="none"
          style={{ minHeight: H, maxHeight: H * 1.4 }}
          aria-label="Ruban des événements de signalisation"
          tabIndex={0}
          onClick={(ev) => {
            const rect = ev.currentTarget.getBoundingClientRect();
            const px = ((ev.clientX - rect.left) / rect.width) * W;
            const t = ((px - L_LABEL) / (W - L_LABEL - R_PAD)) * maxT;
            setCursorT(Math.max(0, Math.min(maxT, t)));
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") setCursorT(null);
          }}
        >
          {/* Axis labels at top */}
          {Array.from({ length: 11 }, (_, i) => {
            const t = (i / 10) * maxT;
            return (
              <g key={i}>
                <line
                  x1={X(t)}
                  y1={TOP - 6}
                  x2={X(t)}
                  y2={H - 6}
                  stroke="currentColor"
                  strokeOpacity={0.06}
                />
                <text x={X(t)} y={TOP - 10} fontSize={9} fill="#64748b" textAnchor="middle">
                  {t.toFixed(1)}s
                </text>
              </g>
            );
          })}
          {/* Lane strips */}
          {LANES.map((l, i) => {
            const y = TOP + i * LANE_H;
            return (
              <g key={l.key}>
                <rect
                  x={0}
                  y={y}
                  width={W}
                  height={LANE_H}
                  fill={i % 2 ? "currentColor" : "none"}
                  fillOpacity={0.03}
                />
                <text x={6} y={y + LANE_H / 2 + 3} fontSize={10} fontWeight={600} fill="#334155">
                  {l.label}
                </text>
              </g>
            );
          })}
          {/* Events */}
          {events.map((e) => {
            const laneIdx = LANES.findIndex((l) => l.key === e.lane);
            if (laneIdx < 0) return null;
            const y = TOP + laneIdx * LANE_H + LANE_H / 2;
            const t0 = e.t_rel_s ?? 0;
            const t1 = e.t_rel_end_s ?? t0;
            const x0 = X(t0);
            const x1 = X(t1);
            const laneColor = LANES[laneIdx]!.color;
            const col = e.outcome ? (OUTCOME_COLORS[e.outcome] ?? laneColor) : laneColor;
            const selected =
              selectedSeq != null && (e.seq === selectedSeq || e.linked_seqs.includes(selectedSeq));
            const common = {
              className: "cursor-pointer",
              onClick: (ev: { stopPropagation(): void }) => {
                ev.stopPropagation();
                if (e.t_rel_s !== null) setCursorT(e.t_rel_s);
                onSelect(e);
              },
              "data-testid": `ribbon-event-${e.id}`,
            };
            if (e.kind === "bar" || t1 > t0) {
              return (
                <g key={e.id} {...common}>
                  <title>{`${e.label} · lane=${e.lane} · seq=${e.seq}${
                    e.duration_ms != null ? ` · ${e.duration_ms.toFixed(0)} ms` : ""
                  } · ${e.link_rule}`}</title>
                  <rect
                    x={x0}
                    y={y - 7}
                    width={Math.max(2, x1 - x0)}
                    height={14}
                    rx={3}
                    fill={col}
                    fillOpacity={selected ? 0.9 : 0.4}
                    stroke={col}
                    strokeWidth={selected ? 2 : 1}
                  />
                </g>
              );
            }
            // mark / tri / x / fail → symbol
            if (e.outcome === "fail" || e.kind === "fail" || e.kind === "x") {
              return (
                <g key={e.id} {...common}>
                  <title>{`${e.label} · lane=${e.lane} · seq=${e.seq}${e.cause ? ` · ${e.cause}` : ""} · ${e.link_rule}`}</title>
                  <text
                    x={x0}
                    y={y + 5}
                    fontSize={14}
                    fontWeight={700}
                    fill={col}
                    textAnchor="middle"
                    stroke={selected ? "#000" : "none"}
                    strokeWidth={selected ? 0.6 : 0}
                  >
                    ✕
                  </text>
                </g>
              );
            }
            if (e.kind === "tri") {
              return (
                <g key={e.id} {...common}>
                  <title>{`${e.label} · lane=${e.lane} · seq=${e.seq} · ${e.link_rule}`}</title>
                  <path
                    d={`M${x0} ${y - 6} l6 11 l-12 0 z`}
                    fill={col}
                    stroke={selected ? "#000" : "none"}
                    strokeWidth={selected ? 1 : 0}
                  />
                </g>
              );
            }
            // mark (default)
            return (
              <g key={e.id} {...common}>
                <title>{`${e.label} · lane=${e.lane} · seq=${e.seq} · ${e.link_rule}`}</title>
                <circle
                  cx={x0}
                  cy={y}
                  r={selected ? 5 : 3.5}
                  fill={col}
                  stroke={selected ? "#000" : "#fff"}
                  strokeWidth={selected ? 1.5 : 0.5}
                />
              </g>
            );
          })}
          {/* Curseur temporel rouge (clic pour placer, Échap pour effacer) */}
          {cursorT !== null && (
            <g data-testid="ribbon-cursor" pointerEvents="none">
              <line
                x1={X(cursorT)}
                y1={TOP - 6}
                x2={X(cursorT)}
                y2={H - 6}
                stroke="#EF4444"
                strokeWidth={2}
              />
              <text
                x={X(cursorT)}
                y={TOP - 18}
                fontSize={9}
                fontWeight={700}
                fill="#EF4444"
                textAnchor="middle"
              >
                {cursorT.toFixed(3)}s
              </text>
            </g>
          )}
        </svg>
      </div>
      <footer className="text-[10px] text-muted-foreground">
        {events.length} événements rendus · appartenance via `linked_seqs` (règles
        d'app/signaling/links.py)
      </footer>
    </div>
  );
}
