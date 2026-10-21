import { useEffect, useRef } from "react";
import type { ECharts } from "echarts";
import type { SigSeries } from "@/lib/api/signaling-schemas";
import { prevPoint } from "./cursor";
import { timeAtClientX } from "./time-scale";
import type { View } from "./Timeline";

// Couleurs de référence de la maquette : RSRP NR rouge, RSRP LTE bleu,
// RSRQ NR vert, SINR NR orange.
const SERIES_STYLE: Record<string, { color: string; unit: string }> = {
  rsrp_nr: { color: "#DC2626", unit: "dBm" },
  rsrp_lte: { color: "#1769E0", unit: "dBm" },
  rsrq_nr: { color: "#16A34A", unit: "dB" },
  rsrq_lte: { color: "#16A34A", unit: "dB" },
  sinr_nr: { color: "#F97316", unit: "dB" },
  sinr_lte: { color: "#F97316", unit: "dB" },
};

/** Bloc « Mesures radio » intégré sous les pistes — même axe X que la timeline. */
export function RadioChart({
  series,
  view,
  cursorT,
  onHoverTime,
  onSelectTime,
  height = 150,
}: {
  series: SigSeries[];
  view: View;
  cursorT: number | null;
  /** Curseur de prévisualisation (survol) — pointillé, jamais de sélection. */
  onHoverTime: (t: number | null, x: number, y: number) => void;
  onSelectTime: (t: number) => void;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<ECharts | null>(null);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | undefined;
    import("echarts").then((echarts) => {
      if (disposed || !el.current) return;
      inst.current = echarts.init(el.current, undefined, { renderer: "canvas" });
      inst.current.setOption({
        textStyle: { fontFamily: "Inter", fontSize: 10 },
        animationDuration: 120,
        grid: { left: "13.2%", right: "0.8%", top: 6, bottom: 4 },
        legend: { show: false },
        tooltip: {
          show: false,
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: "#0F172A", width: 1, type: "dashed" } },
          valueFormatter: (v: unknown) => (v == null ? "N/D" : String(v)),
        },
        xAxis: {
          type: "time",
          min: view.start * 1000,
          max: view.end * 1000,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { show: false },
          splitLine: { show: true, lineStyle: { color: "#F1F5F9" } },
        },
        yAxis: {
          type: "value",
          scale: true,
          axisLabel: { fontSize: 9, color: "#64748B" },
          splitLine: { show: true, lineStyle: { color: "#F1F5F9" } },
        },
        series: series.map((s) => ({
          type: "line" as const,
          name: s.label,
          data: s.points.map((p) => [p.t * 1000, p.v]),
          showSymbol: false,
          connectNulls: false, // gaps conservés, jamais de lissage ni de zéro
          lineStyle: { width: 1.4, color: SERIES_STYLE[s.key]?.color ?? "#64748B" },
          itemStyle: { color: SERIES_STYLE[s.key]?.color ?? "#64748B" },
          emphasis: { disabled: true },
        })),
      });
      ro = new ResizeObserver(() => inst.current?.resize());
      ro.observe(el.current);
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      inst.current?.dispose();
      inst.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  // Fenêtre visible partagée avec la timeline SVG.
  useEffect(() => {
    inst.current?.setOption({ xAxis: { min: view.start * 1000, max: view.end * 1000 } });
  }, [view.start, view.end]);

  // Curseur vertical partagé : rouge plein (sélection), rouge pointillé (survol),
  // marqueurs sur les courbes à la dernière mesure prouvée (jamais interpolée).
  useEffect(() => {
    inst.current?.setOption({
      series: series.map((s) => {

        const rd = cursorT != null ? prevPoint(s, cursorT) : null;
        return {
          name: s.label,
          markPoint:
            rd != null
              ? {
                  silent: true,
                  symbol: "circle",
                  symbolSize: 6,
                  itemStyle: { color: SERIES_STYLE[s.key]?.color ?? "#64748B", borderColor: "#FFFFFF", borderWidth: 1.5 },
                  label: { show: false },
                  data: [{ coord: [rd.t * 1000, rd.v] }],
                }
              : { data: [] },
        };
      }),
    });
  }, [cursorT, view.start, view.end, series]);

  return (
    <div className="border-t">
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Mesures radio</span>
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-[3px] w-3 rounded" style={{ background: SERIES_STYLE[s.key]?.color ?? "#64748B" }} />
            {s.label} <span className="text-[9px]">({SERIES_STYLE[s.key]?.unit ?? s.unit})</span>
          </span>
        ))}
      </div>
      <div ref={el} style={{ height }} role="img" aria-label="Mesures radio (RSRP, RSRQ, SINR)"
        onMouseMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); onHoverTime(timeAtClientX(e.clientX, rect.left, rect.width, view.start, view.end), e.clientX, e.clientY); }}
        onMouseLeave={() => onHoverTime(null, 0, 0)}
        onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); onSelectTime(timeAtClientX(e.clientX, rect.left, rect.width, view.start, view.end)); }} />
    </div>
  );
}
