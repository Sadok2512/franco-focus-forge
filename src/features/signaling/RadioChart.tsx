import { useEffect, useRef } from "react";
import type { ECharts } from "echarts";
import type { SigSeries } from "@/lib/api/signaling-schemas";
import { prevPoint } from "./cursor";
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
  previewT = null,
  height = 150,
}: {
  series: SigSeries[];
  view: View;
  cursorT: number | null;
  /** Curseur de prévisualisation (survol) — pointillé, jamais de sélection. */
  previewT?: number | null;
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
        grid: { left: "13.2%", right: 8, top: 6, bottom: 4 },
        legend: { show: false },
        tooltip: {
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

  // Curseur vertical partagé.
  useEffect(() => {
    inst.current?.setOption({
      series: series.map((s) => ({
        name: s.label,
        markLine:
          cursorT == null
            ? { data: [] }
            : {
                silent: true,
                symbol: "none",
                label: { show: false },
                lineStyle: { color: "#0F172A", width: 1, type: "dashed" },
                data: [{ xAxis: cursorT * 1000 }],
              },
      })),
    });
  }, [cursorT, series]);

  return (
    <div className="border-t">
      <div className="flex items-center gap-3 px-3 py-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Mesures radio</span>
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-[3px] w-3 rounded" style={{ background: SERIES_STYLE[s.key]?.color ?? "#64748B" }} />
            {s.label} <span className="text-[9px]">({SERIES_STYLE[s.key]?.unit ?? s.unit})</span>
          </span>
        ))}
      </div>
      <div ref={el} style={{ height }} role="img" aria-label="Mesures radio (RSRP, RSRQ, SINR)" />
    </div>
  );
}
