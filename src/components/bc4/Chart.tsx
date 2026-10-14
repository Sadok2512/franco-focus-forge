import { Download, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EChartsOption, ECharts } from "echarts";

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Lazy-loaded ECharts wrapper. Options builder receives resolved theme colors. */
export function Chart({
  title, subtitle, build, height = 220, exportName,
}: {
  title: string; subtitle?: string; height?: number; exportName: string;
  build: (c: { fg: string; muted: string; border: string }) => EChartsOption;
}) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<ECharts | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | undefined;
    import("echarts").then((echarts) => {
      if (disposed || !el.current) return;
      inst.current = echarts.init(el.current, undefined, { renderer: "canvas" });
      const c = { fg: cssVar("--foreground"), muted: cssVar("--muted-foreground"), border: cssVar("--border") };
      inst.current.setOption({
        textStyle: { fontFamily: "Inter", color: c.fg },
        animationDuration: 180,
        ...build(c),
      });
      ro = new ResizeObserver(() => inst.current?.resize());
      ro.observe(el.current);
    });
    return () => { disposed = true; ro?.disconnect(); inst.current?.dispose(); inst.current = null; };
  }, [build]);

  useEffect(() => { setTimeout(() => inst.current?.resize(), 20); }, [full]);

  const exportPng = () => {
    const url = inst.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: cssVar("--card") });
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = `${exportName}_${new Date().toISOString().slice(0, 19)}.png`; a.click();
  };

  return (
    <section className={`panel flex flex-col ${full ? "fixed inset-4 z-50 shadow-2xl" : ""}`} aria-label={title}>
      <header className="flex items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold">{title}</h3>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button aria-label="Exporter PNG" onClick={exportPng} className="rounded p-1 text-muted-foreground hover:bg-muted"><Download className="h-3.5 w-3.5" /></button>
          <button aria-label={full ? "Quitter plein écran" : "Plein écran"} onClick={() => setFull((f) => !f)} className="rounded p-1 text-muted-foreground hover:bg-muted">
            {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>
      <div ref={el} style={{ height: full ? undefined : height }} className={full ? "flex-1" : ""} />
    </section>
  );
}
