/** 1.97.0 (Phase 2 Charts) — Ribbon horizontal au-dessus de la grille de
 * cartes Metrics. Affiche les markers RRC / HO / RLF / Task du capture
 * actif comme icônes positionnées sur l'axe temporel (t_rel_s). Partage
 * `syncId` Recharts avec les cartes → le curseur de hover se synchronise
 * entre ribbon et toutes les cartes.
 *
 * Source back : `GET /projects/{p}/captures/{cap}/events?types=task,ho,rlf,rrc`.
 * Jamais fabriqué : si l'endpoint ne retourne rien, le ribbon affiche un
 * placeholder « No capture events ».
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCaptureEvents } from "@/lib/api/client";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import {
  formatTick as formatTimeTick,
  tooltipTriple,
  type TimeAxisMeta,
  type TimeAxisMode,
} from "./time-axis";

import { eventColor, eventId, useActiveEvents } from "./active-events";

type Pt = { id: string; t_rel_s: number; y: number; label: string; type: string };

export function MetricsEventsRibbon({
  projectId,
  captureId,
  filters,
  syncId,
  timeAxisMode,
  timeMeta,
}: {
  projectId: string;
  captureId: string;
  filters: KpiQueryFilters;
  syncId?: string | undefined;
  timeAxisMode?: TimeAxisMode | undefined;
  timeMeta?: TimeAxisMeta | undefined;
}) {
  const q = useQuery({
    queryKey: ["capture-events", projectId, captureId, filters],
    queryFn: ({ signal }) => getCaptureEvents(projectId, captureId, signal, filters),
    enabled: !!captureId,
  });
  // Un group par type pour affecter une couleur et une "lane" y fixe.
  const { isActive, toggle } = useActiveEvents();
  const byType = useMemo(() => {
    const buckets: Record<string, Pt[]> = {
      task: [],
      ho: [],
      rlf: [],
      rrc: [],
    };
    const yByType: Record<string, number> = { task: 1, ho: 2, rlf: 3, rrc: 4 };
    for (const m of q.data?.markers ?? []) {
      const y = yByType[m.type] ?? 1;
      (buckets[m.type] ??= []).push({ id: eventId(captureId, m.type, m.seq), t_rel_s: m.t_rel_s, y, label: m.label, type: m.type });
    }
    return buckets;
  }, [q.data, captureId]);
  const totalMarkers = (q.data?.markers ?? []).length;
  const header = `Events · ${totalMarkers} marker${totalMarkers === 1 ? "" : "s"}`;
  if (q.isPending) {
    return (
      <div className="kpi-metrics-events-ribbon" data-testid="metrics-events-ribbon">
        <small className="text-muted-foreground">Loading events…</small>
      </div>
    );
  }
  if (q.isError || totalMarkers === 0) {
    return (
      <div className="kpi-metrics-events-ribbon" data-testid="metrics-events-ribbon">
        <small className="text-muted-foreground">
          {q.isError ? `Events unavailable (${q.error.message})` : "No capture events"}
        </small>
      </div>
    );
  }
  return (
    <div
      className="kpi-metrics-events-ribbon"
      data-testid="metrics-events-ribbon"
      data-markers={totalMarkers}
    >
      <small className="kpi-metrics-events-header text-muted-foreground">{header}</small>
      <div style={{ height: 38 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{ top: 4, right: 14, left: 4, bottom: 16 }}
            {...(syncId ? { syncId } : {})}
          >
            <XAxis
              type="number"
              dataKey="t_rel_s"
              domain={[0, "dataMax"]}
              tickCount={6}
              tick={{ fontSize: 9, fill: "#64748b" }}
              tickFormatter={(v: number) =>
                typeof v === "number" ? formatTimeTick(v, timeAxisMode ?? "capture", timeMeta) : String(v)
              }
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0.5, 4.5]}
              hide
            />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeDasharray: "2 2" }}
              contentStyle={{ fontSize: 10, padding: "3px 6px" }}
              formatter={(_v, _n, item: unknown) => {
                const d = (item as { payload?: { label?: string; type?: string } })?.payload;
                return [d?.label ?? "", d?.type?.toUpperCase() ?? ""];
              }}
              labelFormatter={(l: number) => {
                if (typeof l !== "number") return String(l);
                const trip = tooltipTriple(l, timeMeta);
                return [trip.local && `Local ${trip.local}`, trip.utc && `UTC ${trip.utc}`, trip.capture]
                  .filter(Boolean)
                  .join(" · ");
              }}
            />
            {Object.entries(byType).map(([type, pts]) =>
              pts.length === 0 ? null : (
                <Scatter
                  key={type}
                  data={pts}
                  fill={eventColor(type)}
                  isAnimationActive={false}
                  cursor="pointer"
                  onClick={(d: unknown) => {
                    const p = ((d as { payload?: Pt }).payload ?? d) as Pt;
                    if (!p?.id) return;
                    toggle({ id: p.id, captureId, t_rel_s: p.t_rel_s, label: p.label, type: p.type, color: eventColor(p.type) });
                  }}
                  shape={(props: unknown) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: Pt };
                    const on = isActive(payload.id);
                    return (
                      <g data-event-id={payload.id} data-active={on || undefined} style={{ cursor: "pointer" }}>
                        {on && <circle cx={cx} cy={cy} r={5.5} fill="none" stroke={eventColor(payload.type)} strokeOpacity={0.45} strokeWidth={1.5} />}
                        <circle cx={cx} cy={cy} r={on ? 3 : 2.5} fill={eventColor(payload.type)} fillOpacity={on ? 1 : 0.7} />
                      </g>
                    );
                  }}
                />
              ),
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
