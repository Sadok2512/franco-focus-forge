import { useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Brush, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Eye, EyeOff, Maximize2, Settings2, X, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getMetricSeries } from "@/lib/api/client";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { WorkspacePanelMenu } from "./WorkspacePanelMenu";
import { useActiveEvents } from "./active-events";
import { downloadCsv } from "./workspace-model";
import { formatTick, tooltipTriple, type TimeAxisMode } from "./time-axis";
import { METRIC_DRAG_TYPE, addGraphMetric, metricAxes, normalizeUnit, seriesColor, validateMetricDrop, type GraphMetric, type MetricGraphSettings } from "./multi-metric-model";

export function MultiMetricGraph({ projectId, captureId, root, title, settings, filters, timeAxisMode, onChange, onRemove, onSeparate }: {
  projectId: string; captureId: string; root: GraphMetric; title: string; settings?: MetricGraphSettings | undefined;
  filters: KpiQueryFilters; timeAxisMode: TimeAxisMode; onChange: (settings: MetricGraphSettings) => void;
  onRemove: () => void; onSeparate?: (code: string) => void;
}) {
  const { t } = useTranslation();
  const config = settings ?? { metrics: [root] };
  const metrics = config.metrics;
  const panel = useRef<HTMLElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<{ reason: string; metric?: GraphMetric }>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(config);
  const [highlight, setHighlight] = useState<string>();
  const [windowRange, setWindowRange] = useState<{ capture: string; start: number; end: number }>();
  const { active } = useActiveEvents();
  const queries = useQueries({ queries: metrics.map((metric) => ({
    queryKey: ["metric-series", projectId, captureId, metric.selection, filters],
    queryFn: ({ signal }: { signal: AbortSignal }) => getMetricSeries(projectId, captureId, [metric.selection], signal, undefined, filters),
    staleTime: 60_000,
  })) });
  const first = queries.find((q) => q.data)?.data;
  const ready = metrics.flatMap((metric, index) => {
    const data = queries[index]?.data;
    const [code, cell = "all"] = metric.selection.split("@");
    const series = data?.series.find((s) => s.code === metric.selection || (s.code === code && (cell === "all" || s.cell === cell)));
    if (!data || !series || data.capture_id !== captureId || data.project_id !== projectId || data.origin_ts !== first?.origin_ts || series.kind !== "numeric" || normalizeUnit(series.unit) !== normalizeUnit(metric.unit)) return [];
    return [{ metric, index, data, series }];
  });
  const axes = metricAxes(ready.map((s) => s.metric));
  const points = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    for (const item of ready) for (const p of item.series.points) {
      if (typeof p.value !== "number" || !Number.isFinite(p.t_rel_s)) continue;
      const row = rows.get(p.t_rel_s) ?? { time: p.t_rel_s };
      row[item.metric.selection] = p.value;
      rows.set(p.t_rel_s, row);
    }
    return [...rows.values()].sort((a, b) => (a["time"] ?? 0) - (b["time"] ?? 0));
  }, [ready]);
  const meta = first ? { origin_ts: first.origin_ts, nmf_start_at: first.nmf_start_at, utc_offset_min: first.utc_offset_min, capture_date: first.capture_date } : undefined;
  const removeMetric = (selection: string) => onChange({ ...config, metrics: metrics.filter((m) => m.selection !== selection) });
  const drop = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(METRIC_DRAG_TYPE)) return;
    event.preventDefault(); event.stopPropagation(); setOver(false);
    try {
      const metric: GraphMetric = JSON.parse(event.dataTransfer.getData(METRIC_DRAG_TYPE));
      if (typeof metric.selection !== "string" || typeof metric.unit !== "string" || typeof metric.label !== "string") return;
      const reason = validateMetricDrop(metrics, metric);
      if (reason === "duplicate") return;
      if (reason) { setRejected({ reason, metric }); return; }
      setRejected(undefined); onChange(addGraphMetric(config, metric));
    } catch { setRejected({ reason: "unavailable" }); }
  };
  const startIndex = windowRange?.capture === captureId ? Math.max(0, points.findIndex((p) => (p["time"] ?? 0) >= windowRange.start)) : 0;
  const endIndex = windowRange?.capture === captureId ? Math.max(startIndex, points.reduce((last, p, i) => (p["time"] ?? 0) <= windowRange.end ? i : last, 0)) : Math.max(0, points.length - 1);
  return <article ref={panel} className={`kpi-graph-card metric-multi-graph${over ? " metric-drop-active" : ""}`} data-metric-code={root.selection} data-view="graph" data-series-count={metrics.length}
    onDragOver={(e) => { if (e.dataTransfer.types.includes(METRIC_DRAG_TYPE)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }} onDrop={drop}>
    <header className="kpi-card-header"><h3 title={config.title ?? title}>{config.title ?? title}</h3>
      <WorkspacePanelMenu label={t("panel.actions")}>
        <DropdownMenuItem onSelect={() => { setDraft(config); setEditing(true); }}><Settings2 size={14} />{t("kpi.a9b06cf1234b")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadCsv("metric-series.csv", ["metric,time_s,value,unit", ...ready.flatMap((s) => s.series.points.map((p) => `${JSON.stringify(s.metric.selection)},${p.t_rel_s},${p.value},${JSON.stringify(s.metric.unit)}`))].join("\n"))}><Download size={14} />{t("panel.export_csv")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void panel.current?.requestFullscreen?.()}><Maximize2 size={14} />{t("panel.fullscreen")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onRemove}><X size={14} />{t("panel.remove")}</DropdownMenuItem>
      </WorkspacePanelMenu>
    </header>
    <div className="metric-series-legend">{metrics.map((metric, index) => <div key={metric.selection} className="metric-legend-item" onMouseEnter={() => setHighlight(metric.selection)} onMouseLeave={() => setHighlight(undefined)}>
      <Button variant="ghost" size="sm" className="min-w-0 h-7" aria-pressed={!metric.hidden} onClick={() => onChange({ ...config, metrics: metrics.map((m) => m.selection === metric.selection ? { ...m, hidden: !m.hidden } : m) })}>
        <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill={seriesColor(metric, index)} /></svg>
        <span className={`truncate ${metric.hidden ? "opacity-40" : ""}`} title={metric.label}>{metric.label} ({normalizeUnit(metric.unit)})</span>
      </Button>
      <WorkspacePanelMenu label={`${t("metrics.catalogMenu")} ${metric.label}`}><DropdownMenuItem onSelect={() => removeMetric(metric.selection)}><X size={14} />{t("metrics.68144408eb29")}</DropdownMenuItem></WorkspacePanelMenu>
    </div>)}</div>
    {over && <div className="metric-drop-hint">{t("multiMetric.drop")}</div>}
    {rejected && <div className="px-3 text-xs text-destructive" role="alert">{t(`multiMetric.${rejected.reason}`)}{rejected.reason === "thirdUnit" && rejected.metric && <Button size="sm" variant="outline" onClick={() => { if (rejected.metric) onSeparate?.(rejected.metric.selection); setRejected(undefined); }}>{t("multiMetric.separate")}</Button>}</div>}
    <div className="metric-multi-plot" data-testid="metric-multi-plot" data-capture-id={captureId} data-result-ids={ready.map((s) => s.data.result_id).join(",")} data-axis-units={axes.join(",")}>
      <ResponsiveContainer width="100%" height="100%"><LineChart data={points} syncId={`metrics-charts-${captureId}`} syncMethod="value" margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => formatTick(v, timeAxisMode, meta)} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
        {axes.map((unit, i) => <YAxis key={unit} yAxisId={unit} orientation={i ? "right" : "left"} width={58} domain={[config.ranges?.[unit]?.min ?? "auto", config.ranges?.[unit]?.max ?? "auto"]} label={{ value: unit, angle: i ? 90 : -90, position: i ? "insideRight" : "insideLeft", fill: "var(--muted-foreground)", fontSize: 10 }} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />)}
        <Tooltip content={({ active: shown, label, payload }) => shown && typeof label === "number" ? <div className="border bg-popover text-popover-foreground rounded p-2 text-xs shadow-sm"><strong>{tooltipTriple(label, meta)[timeAxisMode === "clock-local" ? "local" : timeAxisMode === "clock-utc" ? "utc" : "capture"] ?? tooltipTriple(label, meta).capture}</strong>{payload?.filter((p) => typeof p.value === "number").map((p) => { const item = ready.find((s) => s.metric.selection === p.dataKey); return item ? <p key={item.metric.selection}>{item.metric.label}: {String(p.value)} {normalizeUnit(item.metric.unit)} · {label.toFixed(3)} s · Δt 0 s</p> : null; })}</div> : null} />
        {ready.filter((s) => !s.metric.hidden).map((s) => <Line key={s.metric.selection} dataKey={s.metric.selection} name={s.metric.label} yAxisId={normalizeUnit(s.metric.unit)} type="linear" stroke={seriesColor(s.metric, s.index)} strokeOpacity={highlight && highlight !== s.metric.selection ? 0.25 : 1} strokeWidth={config.curve === "points" ? 0 : 1.4} dot={config.curve === "line" || !config.curve ? false : { r: 2 }} connectNulls={false} isAnimationActive={false} />)}
        {axes[0] && active.filter((e) => e.captureId === captureId).map((e) => <ReferenceLine key={e.id} yAxisId={axes[0]} x={e.t_rel_s} stroke={e.color} strokeWidth={2} label={{ value: e.label, fontSize: 9 }} />)}
        {points.length > 1 && <Brush dataKey="time" height={18} stroke="var(--border)" fill="var(--muted)" startIndex={startIndex} endIndex={endIndex} onChange={(range) => { const a = points[range.startIndex ?? 0]?.["time"]; const b = points[range.endIndex ?? points.length - 1]?.["time"]; if (a !== undefined && b !== undefined) setWindowRange({ capture: captureId, start: a, end: b }); }} />}
      </LineChart></ResponsiveContainer>
      {queries.some((q) => q.isFetching) && <LoaderCircle className="metric-local-spinner animate-spin text-primary" size={18} aria-label={t("metrics.d90f3037b488")} />}
    </div>
    {metrics.map((metric, i) => queries[i]?.isError || (queries[i]?.data && !ready.some((s) => s.metric.selection === metric.selection)) ? <div key={metric.selection} role="alert" className="flex items-center gap-2 px-3 text-xs text-destructive"><span>{metric.label} · {t("multiMetric.unavailable")}</span><Button variant="ghost" size="sm" onClick={() => void queries[i]?.refetch()}>{t("common.retry")}</Button></div> : null)}
    {!metrics.length && <p className="px-3 text-xs text-muted-foreground">{t("multiMetric.empty")}</p>}
    <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogTitle>{t("kpi.a9b06cf1234b")}</DialogTitle><DialogDescription className="sr-only">{title}</DialogDescription>
      <label>{t("panel.rename")}<input className="border bg-background rounded p-2 w-full" value={draft.title ?? title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>{t("kpi.8d1d4c5be066")}<select className="border bg-background p-2 w-full" value={draft.curve ?? "line"} onChange={(e) => setDraft({ ...draft, curve: e.target.value as NonNullable<MetricGraphSettings["curve"]> })}><option value="line">{t("kpi.909f8f071b0f")}</option><option value="points">{t("multiMetric.points")}</option><option value="line_points">{t("kpi.dd8d44e93faf")}</option></select></label>
      {draft.metrics.map((metric, i) => <div key={metric.selection} className="flex gap-2 items-center min-w-0"><label className="shrink-0" title={t("multiMetric.color")}><input type="color" aria-label={`${t("multiMetric.color")} ${metric.label}`} value={metric.color ?? ""} onChange={(e) => setDraft({ ...draft, metrics: draft.metrics.map((m, j) => j === i ? { ...m, color: e.target.value } : m) })} /></label><span className="min-w-0 flex-1 break-words">{metric.label} · {normalizeUnit(metric.unit)}</span><Button variant="ghost" size="icon" aria-label={t("multiMetric.visibility")} onClick={() => setDraft({ ...draft, metrics: draft.metrics.map((m, j) => j === i ? { ...m, hidden: !m.hidden } : m) })}>{metric.hidden ? <EyeOff size={16} /> : <Eye size={16} />}</Button></div>)}
      {metricAxes(draft.metrics).map((unit) => <fieldset key={unit} className="flex gap-2"><legend>{unit}</legend>{(["min", "max"] as const).map((key) => <label key={key} className="min-w-0">{t(`multiMetric.${key}`)}<input type="number" className="border bg-background p-2 w-full" value={draft.ranges?.[unit]?.[key] ?? ""} onChange={(e) => setDraft({ ...draft, ranges: { ...draft.ranges, [unit]: { ...draft.ranges?.[unit], [key]: e.target.value === "" ? undefined : Number(e.target.value) } } })} /></label>)}</fieldset>)}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(false)}>{t("wss.cancel")}</Button><Button onClick={() => { onChange(draft); setEditing(false); }}>{t("wss.apply")}</Button></div>
    </DialogContent></Dialog>
  </article>;
}