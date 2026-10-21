// 1.76.0 (BC3) — Spec v2 G6 : plusieurs KPI dans UN seul graphique.
// Règle d'unité : 1 unité distincte → axe Y partagé ; 2 unités → double
// axe Y (yAxisId left/right) ; ≥ 3 unités → refus explicite avec raison
// (CLAUDE.md Rule 2 : écart déclaré, pas fabriqué).
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";
import type { AnalyticRow, Entry } from "./workspace-model";

const SERIES_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#be185d",
  "#4b5563",
];

export type OverlayPanel = {
  entry: Entry;
  rows: AnalyticRow[];
};

export function KpiOverlayCard({
  panels,
  onDisable,
}: {
  panels: OverlayPanel[];
  onDisable: () => void;
}) {
  const unitsBreakdown = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of panels) {
      const unit = (p.entry.item.unit ?? "").trim() || "—";
      map.set(unit, [...(map.get(unit) ?? []), p.entry.item.code]);
    }
    return Array.from(map.entries());
  }, [panels]);
  const dataset = useMemo(() => {
    // Build keyed rows across all panels. Key = operator+band when both
    // present, else operator or band or "all".
    const keyOf = (r: AnalyticRow) =>
      [r.operator, r.band].filter(Boolean).join(" / ") || "all";
    const combined = new Map<string, Record<string, number | string | null>>();
    for (const p of panels) {
      const code = p.entry.item.code;
      for (const r of p.rows) {
        const k = keyOf(r);
        const existing = combined.get(k) ?? { group: k };
        existing[code] = r.value ?? null;
        combined.set(k, existing);
      }
    }
    return Array.from(combined.values());
  }, [panels]);
  if (panels.length < 2) return null;
  if (unitsBreakdown.length > 2) {
    return (
      <section className="kpi-graph-card kpi-overlay-card" data-testid="kpi-overlay-card">
        <header className="kpi-overlay-header">
          <h3>Overlay</h3>
          <button
            type="button"
            className="kpi-icon"
            onClick={onDisable}
            aria-label="Disable overlay"
          >
            <X size={14} />
          </button>
        </header>
        <p
          role="alert"
          className="kpi-overlay-refusal"
          data-testid="kpi-overlay-incompatible"
        >
          Unités incompatibles : {unitsBreakdown.map(([u]) => u).join(" · ")}. Overlay
          supporte au plus 2 unités distinctes (axes gauche/droite). Désactiver
          l'overlay ou retirer les KPIs incompatibles.
        </p>
      </section>
    );
  }
  const [unitLeft, unitRight] = unitsBreakdown;
  const leftCodes = unitLeft?.[1] ?? [];
  const rightCodes = unitRight?.[1] ?? [];
  const useBar = panels.every((p) => (p.entry.item.unit ?? "").trim() === "");
  return (
    <section className="kpi-graph-card kpi-overlay-card" data-testid="kpi-overlay-card">
      <header className="kpi-overlay-header">
        <h3>
          Overlay <small>· {panels.length} KPI</small>
        </h3>
        <button
          type="button"
          className="kpi-icon"
          onClick={onDisable}
          aria-label="Disable overlay"
        >
          <X size={14} />
        </button>
      </header>
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer>
          {useBar ? (
            <BarChart data={dataset} margin={{ top: 12, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="group" tick={{ fontSize: 10 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10 }}
                label={{
                  value: unitLeft?.[0] ?? "",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 10,
                }}
              />
              {rightCodes.length > 0 && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: unitRight?.[0] ?? "",
                    angle: 90,
                    position: "insideRight",
                    fontSize: 10,
                  }}
                />
              )}
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {panels.map((p, i) => {
                const color = SERIES_COLORS[i % SERIES_COLORS.length];
                const axisId = rightCodes.includes(p.entry.item.code) ? "right" : "left";
                return (
                  <Bar
                    key={p.entry.item.code}
                    dataKey={p.entry.item.code}
                    name={p.entry.item.name}
                    fill={color}
                    yAxisId={axisId}
                  />
                );
              })}
            </BarChart>
          ) : (
            <LineChart data={dataset} margin={{ top: 12, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="group" tick={{ fontSize: 10 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10 }}
                label={{
                  value: unitLeft?.[0] ?? "",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 10,
                }}
              />
              {rightCodes.length > 0 && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: unitRight?.[0] ?? "",
                    angle: 90,
                    position: "insideRight",
                    fontSize: 10,
                  }}
                />
              )}
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {panels.map((p, i) => {
                const color = SERIES_COLORS[i % SERIES_COLORS.length];
                const axisId = rightCodes.includes(p.entry.item.code) ? "right" : "left";
                return (
                  <Line
                    key={p.entry.item.code}
                    type="monotone"
                    dataKey={p.entry.item.code}
                    name={p.entry.item.name}
                    stroke={color}
                    yAxisId={axisId}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <footer className="kpi-overlay-footer">
        {unitsBreakdown.map(([unit, codes], i) => (
          <span key={unit} className="kpi-overlay-axis-chip">
            <span
              className="kpi-overlay-dot"
              style={{ background: SERIES_COLORS[i === 0 ? 0 : 2] }}
            />
            {i === 0 ? "L" : "R"}
            {" · "}
            {unit}
            {" · "}
            {codes.length} KPI
          </span>
        ))}
      </footer>
    </section>
  );
}
