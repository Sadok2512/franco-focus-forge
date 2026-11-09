import { useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  BarChart3, ChevronLeft, ChevronRight, Download, FileDown, FileSpreadsheet,
  Maximize2, PanelLeftClose, PanelLeftOpen, RefreshCw, Save, SlidersHorizontal,
} from "lucide-react";
import type { EChartsOption, SeriesOption } from "echarts";
import { Chart } from "@/components/bc4/Chart";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import { useActiveProject } from "@/lib/activeProject";
import { toUserMessage } from "@/lib/api/http";
import {
  getDriveTestReportData, getDriveTestReportFilters,
  type DriveTestReportData, type DriveTestReportFilters, type ReportMetric, type ReportPoint,
  type ReportSplitGroup,
} from "@/lib/api/drive-test-reports";

type ReportId = "summary" | "rrc" | "service" | "throughput" | "investigation" |
  "radio" | "fails" | "tasks" | "benchmark-operator" | "benchmark-stream" | "custom";
type PointKey = "dl" | "thrpt_ul" | "rsrp" | "rsrq" | "sinr" | "cqi" | "mimo_rank";

const REPORTS: { id: ReportId; key: string; child?: boolean }[] = [
  { id: "summary", key: "dtReports.nav.summary" },
  { id: "rrc", key: "dtReports.nav.rrc" },
  { id: "service", key: "dtReports.nav.service" },
  { id: "throughput", key: "dtReports.nav.throughput" },
  { id: "investigation", key: "dtReports.nav.investigation" },
  { id: "radio", key: "dtReports.nav.radio" },
  { id: "fails", key: "dtReports.nav.fails" },
  { id: "tasks", key: "dtReports.nav.tasks" },
  { id: "benchmark-operator", key: "dtReports.nav.operatorBenchmark", child: true },
  { id: "benchmark-stream", key: "dtReports.nav.streamBenchmark", child: true },
  { id: "custom", key: "dtReports.nav.custom" },
];
const EMPTY_FILTERS: DriveTestReportFilters = {
  capture_id: [], operator: [], rat: [], band: [], service: [], cell: [], site: [], split_by: "none",
};
const POINT_FIELDS: { key: PointKey; label: string; unit: string }[] = [
  { key: "dl", label: "DL Throughput", unit: "Mbit/s" },
  { key: "thrpt_ul", label: "UL Throughput", unit: "Mbit/s" },
  { key: "rsrp", label: "RSRP", unit: "dBm" },
  { key: "rsrq", label: "RSRQ", unit: "dB" },
  { key: "sinr", label: "SINR", unit: "dB" },
  { key: "cqi", label: "CQI", unit: "index" },
  { key: "mimo_rank", label: "Rank / Layers", unit: "rank" },
];

const fmt = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "N/A" : value.toLocaleString(undefined, { maximumFractionDigits: digits });
const metric = (data: DriveTestReportData, code: string) => data.metrics.find((item) => item.code === code);
const available = (points: ReportPoint[], key: PointKey) => points.filter((p) => p[key] != null);

export function summaryValueClass(label: string, value: string) {
  if (value === "N/A") return "bg-slate-100 text-slate-500";
  const normalized = label.toLowerCase();
  if (normalized.includes("failure") || normalized.includes("failures")) return "bg-rose-50 text-rose-700";
  if (normalized.includes("success")) return "bg-emerald-50 text-emerald-700";
  if (normalized.includes("volume")) return "bg-violet-50 text-violet-700";
  if (normalized.includes("throughput") || normalized.includes("average") || normalized.includes("p50") || normalized.includes("p90")) return "bg-blue-50 text-[#1769F5]";
  if (normalized.includes("attempt")) return "bg-amber-50 text-amber-700";
  return "bg-sky-50 text-sky-700";
}

function downloadBlob(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

function Card({ label, value, unit, note }: { label: string; value: string; unit?: string | undefined; note?: string | undefined }) {
  return <article className="rounded-lg border border-[#DCE4EF] bg-white p-3 shadow-[0_1px_3px_rgba(23,36,58,.06)]">
    <p className="truncate text-[11px] font-medium text-[#637188]">{label}</p>
    <div className="mt-1 flex items-baseline gap-1"><strong className={`rounded-md px-1.5 py-0.5 text-xl ${summaryValueClass(label, value)}`}>{value}</strong>{unit && <span className="text-[11px] text-[#637188]">{unit}</span>}</div>
    {note && <p className="mt-1 truncate text-[10px] text-[#8793A5]" title={note}>{note}</p>}
  </article>;
}

function Panel({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <section className="rounded-lg border border-[#DCE4EF] bg-white shadow-[0_1px_3px_rgba(23,36,58,.06)]">
    <header className="border-b border-[#E7EDF5] px-3 py-2"><h3 className="text-xs font-semibold text-[#17243A]">{title}</h3>{note && <p className="text-[10px] text-[#718096]">{note}</p>}</header>
    <div className="p-3">{children}</div>
  </section>;
}

function SummaryTable({ data }: { data: DriveTestReportData }) {
  return <Panel title="KPI Summary" note={data.methodology}>
    <div className="overflow-auto"><table className="w-full min-w-[680px] text-left text-[11px]">
      <thead className="bg-[#F4F7FB] text-[#637188]"><tr>{["KPI", "Unit", "Average", "P10", "P50", "P90", "Max", "Samples", "Status"].map(h => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{data.metrics.map(m => <tr key={m.code} className="border-t border-[#E7EDF5]">
        <td className="px-2 py-2 font-medium text-[#17243A]">{m.label}</td><td className="px-2 py-2">{m.unit}</td>
        {[m.avg, m.p10, m.p50, m.p90, m.max].map((v, i) => { const value=fmt(v); return <td key={i} className="px-2 py-2 tabular-nums"><span className={`rounded px-1.5 py-0.5 font-medium ${summaryValueClass(["Average","P10","P50","P90","Max"][i]!, value)}`}>{value}</span></td>; })}
        <td className="px-2 py-2 tabular-nums"><span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">{m.n}</span></td><td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 ${m.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`} title={m.reason ?? ""}>{m.status === "AVAILABLE" ? "Available" : "N/A"}</span></td>
      </tr>)}</tbody>
    </table></div>
  </Panel>;
}

function metricCards(data: DriveTestReportData) {
  const dl = metric(data, "dl"), ul = metric(data, "thrpt_ul");
  const successRate = data.task_summary.attempts ? data.task_summary.successes / data.task_summary.attempts * 100 : null;
  return [
    { label: "Task Attempts", value: String(data.task_summary.attempts) },
    { label: "Service Success Rate", value: fmt(successRate), unit: "%" },
    { label: "DL Throughput Avg", value: fmt(dl?.avg), unit: dl?.unit, note: `${dl?.n ?? 0} samples` },
    { label: "DL Throughput P90", value: fmt(dl?.p90), unit: dl?.unit },
    { label: "UL Throughput Avg", value: fmt(ul?.avg), unit: ul?.unit, note: `${ul?.n ?? 0} samples` },
    { label: "UL Throughput P90", value: fmt(ul?.p90), unit: ul?.unit },
    { label: "Transferred Volume", value: fmt(data.task_summary.volume_bytes == null ? null : data.task_summary.volume_bytes / 1e9), unit: "GB" },
    { label: "Failure Count", value: String(data.task_summary.failures) },
  ];
}

function timeOption(data: DriveTestReportData): EChartsOption {
  const rows = data.points.filter(p => p.dl != null || p.thrpt_ul != null);
  return { tooltip: { trigger: "axis" }, legend: { data: ["DL", "UL"], bottom: 0 }, grid: { left: 48, right: 18, top: 20, bottom: 38 }, xAxis: { type: "category", data: rows.map(p => p.ts ?? `${p.capture_id}:${p.seq}`), axisLabel: { hideOverlap: true } }, yAxis: { type: "value", name: "Mbit/s" }, series: [
    { name: "DL", type: "line", showSymbol: false, connectNulls: false, data: rows.map(p => p.dl), lineStyle: { color: "#1769F5", width: 1.5 } },
    { name: "UL", type: "line", showSymbol: false, connectNulls: false, data: rows.map(p => p.thrpt_ul), lineStyle: { color: "#18A77A", width: 1.5 } },
  ] };
}

function scatterOption(points: ReportPoint[], x: PointKey, y: PointKey): EChartsOption {
  const xf = POINT_FIELDS.find(f => f.key === x)!, yf = POINT_FIELDS.find(f => f.key === y)!;
  const rows = points.filter(p => p[x] != null && p[y] != null);
  return { tooltip: { formatter: (raw: unknown) => { const p = raw as { value: number[] }; return `${xf.label}: ${fmt(p.value[0])}<br/>${yf.label}: ${fmt(p.value[1])}`; } }, grid: { left: 55, right: 20, top: 20, bottom: 42 }, xAxis: { type: "value", name: `${xf.label} (${xf.unit})`, nameLocation: "middle", nameGap: 28 }, yAxis: { type: "value", name: `${yf.label} (${yf.unit})` }, series: [{ type: "scatter", symbolSize: 5, large: rows.length > 1500, itemStyle: { color: "#1769F5", opacity: .42 }, data: rows.map(p => [p[x], p[y]]) }] };
}

function histogramOption(points: ReportPoint[], key: PointKey): EChartsOption {
  const values = available(points, key).map(p => p[key] as number).sort((a, b) => a - b);
  if (!values.length) return { title: { text: "N/A", left: "center", top: "middle" } };
  const min = values[0]!, max = values[values.length - 1]!, bins = 20, width = (max - min || 1) / bins;
  const counts = Array.from({ length: bins }, () => 0); values.forEach(v => { const index = Math.min(bins - 1, Math.floor((v - min) / width)); counts[index] = (counts[index] ?? 0) + 1; });
  let cumulative = 0; const cdf = counts.map(n => (cumulative += n) / values.length * 100);
  const pct = (q: number) => values[Math.round((values.length - 1) * q)]!;
  return { tooltip: { trigger: "axis" }, legend: { data: ["Histogram", "CDF"], bottom: 0 }, grid: { left: 50, right: 48, top: 25, bottom: 42 }, xAxis: { type: "category", data: counts.map((_, i) => fmt(min + (i + .5) * width, 1)) }, yAxis: [{ type: "value", name: "Count" }, { type: "value", name: "CDF %", max: 100 }], series: [
    { name: "Histogram", type: "bar", data: counts, barWidth: "88%", itemStyle: { color: "#8BB6FF" }, markLine: { symbol: "none", data: [{ xAxis: fmt(pct(.1), 1), name: "P10" }, { xAxis: fmt(pct(.5), 1), name: "P50" }, { xAxis: fmt(pct(.9), 1), name: "P90" }] } },
    { name: "CDF", type: "line", yAxisIndex: 1, data: cdf, showSymbol: false, lineStyle: { color: "#1769F5", width: 2 } },
  ] };
}

function DataCoverage({ data }: { data: DriveTestReportData }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#DCE4EF] bg-white px-3 py-2 text-[11px] text-[#637188]">
    <span><b className="text-[#17243A]">{data.population.samples.toLocaleString()}</b> filtered samples</span>
    <span><b className="text-[#17243A]">{data.population.returned.toLocaleString()}</b> plotted</span>
    <span>Sampling: <b className="text-[#17243A]">{data.population.sampling}</b></span>
    <span>Sources: <b className="text-[#17243A]">{data.sources.length}</b></span>
  </div>;
}

function SummaryView({ data }: { data: DriveTestReportData }) {
  const cards = metricCards(data);
  return <><div className="grid grid-cols-2 gap-2 lg:grid-cols-4 2xl:grid-cols-8">{cards.map(c => <Card key={c.label} {...c} />)}</div>
    <DataCoverage data={data}/><SummaryTable data={data}/>
    <div className="grid gap-3 xl:grid-cols-2">
      <Chart title="Throughput Over Time" subtitle="No interpolation" exportName="throughput-time" build={() => timeOption(data)} />
      <Chart title="Throughput vs RSRP" subtitle={`${data.points.filter(p => p.dl != null && p.rsrp != null).length} paired samples`} exportName="throughput-rsrp" build={() => scatterOption(data.points, "rsrp", "dl")} />
      <Chart title="SINR vs Throughput" subtitle={`${data.points.filter(p => p.sinr != null && p.dl != null).length} paired samples`} exportName="sinr-throughput" build={() => scatterOption(data.points, "sinr", "dl")} />
      <Chart title="RSRP Distribution + CDF + Percentiles" exportName="rsrp-distribution" build={() => histogramOption(data.points, "rsrp")} />
    </div></>;
}

function UnsupportedTable({ data, kind }: { data: DriveTestReportData; kind?: "rrc" | "radio" }) {
  const rows = kind === "radio" ? data.unsupported.filter(x => /bler|mcs|prb/.test(x.code)) : data.unsupported.filter(x => /erab|pdu/.test(x.code));
  return <Panel title="Decoded procedure availability" note="Unavailable sources are never converted to zero.">
    <table className="w-full text-left text-[11px]"><thead><tr className="bg-[#F4F7FB]"><th className="p-2">KPI</th><th className="p-2">Value</th><th className="p-2">Status / source note</th></tr></thead><tbody>{rows.map(row => <tr className="border-t" key={row.code}><td className="p-2 font-medium">{row.code.replaceAll("_", " ").toUpperCase()}</td><td className="p-2">N/A</td><td className="p-2 text-[#637188]">{row.reason}</td></tr>)}</tbody></table>
  </Panel>;
}

function ServiceView({ data }: { data: DriveTestReportData }) {
  return <><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{metricCards(data).slice(0, 4).map(c => <Card key={c.label} {...c}/>)}</div>
    <div className="grid gap-3 xl:grid-cols-2"><Chart title="Service Success Rate by Task" exportName="service-success" build={() => ({ grid: { left: 55, right: 20, top: 15, bottom: 35 }, xAxis: { type: "category", data: data.services.map(s => s.service) }, yAxis: { type: "value", max: 100, name: "%" }, series: [{ type: "bar", itemStyle: { color: "#1769F5" }, data: data.services.map(s => s.attempts ? s.successes / s.attempts * 100 : null) }] })}/><Chart title="Task Duration Distribution" exportName="task-duration" build={() => histogramFromNumbers(data.tasks.map(t => t.duration_s).filter((v): v is number => v != null), "Duration")}/></div>
    <TaskTable data={data}/></>;
}

function histogramFromNumbers(values: number[], name: string): EChartsOption {
  const pts = values.map((v, i) => ({ dl: v, capture_id: "", seq: i, ts: null, operator: null, rat: null, band: null, service: null, cell: null, site: null, thrpt_ul: null, rsrp: null, rsrq: null, sinr: null, cqi: null, mimo_rank: null, population: values.length })) as ReportPoint[];
  const option = histogramOption(pts, "dl");
  return { ...option, title: { text: name, left: 8, top: 4, textStyle: { fontSize: 11 } } };
}

function TaskTable({ data, failures = false }: { data: DriveTestReportData; failures?: boolean }) {
  const rows = failures ? data.failures : data.tasks;
  return <Panel title={failures ? "Failure / Dropped Task Events" : "Task / NEM Sessions"} note={`${rows.length} rows from decoded task boundaries`}><div className="max-h-[420px] overflow-auto"><table className="w-full min-w-[850px] text-left text-[11px]"><thead className="sticky top-0 bg-[#F4F7FB]"><tr>{["Stream", "Task", "Start", "End", "Operator", "Technology", "Band", "Duration", "Volume", "Status", "Reason"].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(t => <tr className="border-t" key={t.id}><td className="p-2">{t.capture_id}</td><td className="p-2 font-medium">{t.task_type ?? "N/A"}</td><td className="p-2">{t.seq_start}</td><td className="p-2">{t.seq_end}</td><td className="p-2">{t.operator ?? "N/A"}</td><td className="p-2">{t.tech ?? "N/A"}</td><td className="p-2">{t.band ?? "N/A"}</td><td className="p-2">{fmt(t.duration_s)} s</td><td className="p-2">{t.bytes_dcomp == null ? "N/A" : `${fmt(t.bytes_dcomp / 1e6)} MB`}</td><td className="p-2">{t.status}</td><td className="p-2">{t.reason ?? "—"}</td></tr>)}</tbody></table></div></Panel>;
}

function InvestigationView({ data }: { data: DriveTestReportData }) {
  const [x, setX] = useState<PointKey>("rsrp"), [y, setY] = useState<PointKey>("dl"), [mode, setMode] = useState("scatter");
  const pairs = data.points.filter(p => p[x] != null && p[y] != null).length;
  return <><Panel title="Correlation controls"><div className="flex flex-wrap gap-3 text-[11px]"><label>X KPI <select value={x} onChange={e => setX(e.target.value as PointKey)} className="ml-1 h-8 rounded border px-2">{POINT_FIELDS.map(f => <option value={f.key} key={f.key}>{f.label}</option>)}</select></label><label>Y KPI <select value={y} onChange={e => setY(e.target.value as PointKey)} className="ml-1 h-8 rounded border px-2">{POINT_FIELDS.map(f => <option value={f.key} key={f.key}>{f.label}</option>)}</select></label><label>Chart <select value={mode} onChange={e => setMode(e.target.value)} className="ml-1 h-8 rounded border px-2"><option value="scatter">Scatter</option><option value="histogram">Histogram + CDF + percentiles</option></select></label></div></Panel>
    <DataCoverage data={data}/><Chart title={mode === "scatter" ? `${POINT_FIELDS.find(f => f.key === y)?.label} vs ${POINT_FIELDS.find(f => f.key === x)?.label}` : `${POINT_FIELDS.find(f => f.key === x)?.label} Distribution`} subtitle={`${pairs} paired samples · missing values excluded · no interpolation`} height={460} exportName="throughput-investigation" build={() => mode === "scatter" ? scatterOption(data.points, x, y) : histogramOption(data.points, x)}/>
    <SummaryTable data={data}/></>;
}

function RadioView({ data }: { data: DriveTestReportData }) {
  return <><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{["rsrp","rsrq","sinr","cqi"].map(code => { const m = metric(data, code)!; return <Card key={code} label={m.label} value={fmt(m.avg)} unit={m.unit} note={`${m.n} samples`}/>; })}</div><div className="grid gap-3 xl:grid-cols-2">{(["rsrp","rsrq","sinr","cqi"] as PointKey[]).map(key => <Chart key={key} title={`${POINT_FIELDS.find(f => f.key === key)?.label} Distribution`} exportName={`${key}-distribution`} build={() => histogramOption(data.points, key)}/>)}</div><UnsupportedTable data={data} kind="radio"/></>;
}

function BenchmarkView({ data, mode }: { data: DriveTestReportData; mode: "operator" | "capture_id" }) {
  const choices = [...new Set(data.points.map(p => p[mode]).filter((v): v is string => !!v))];
  const [a, setA] = useState(choices[0] ?? ""), [b, setB] = useState(choices[1] ?? "");
  const [kpi, setKpi] = useState<PointKey>("dl");
  const group = (name: string) => data.points.filter(p => p[mode] === name && p[kpi] != null).map(p => p[kpi] as number);
  const av = (v: number[]) => v.length ? v.reduce((s, n) => s + n, 0) / v.length : null;
  const va = group(a), vb = group(b), aa = av(va), ab = av(vb), comparable = !!a && !!b && va.length > 0 && vb.length > 0;
  return <><Panel title="Comparison selectors"><div className="flex flex-wrap gap-3 text-[11px]"><label>Dataset A <select value={a} onChange={e => setA(e.target.value)} className="ml-1 h-8 rounded border px-2">{choices.map(v => <option key={v}>{v}</option>)}</select></label><label>Dataset B <select value={b} onChange={e => setB(e.target.value)} className="ml-1 h-8 rounded border px-2">{choices.map(v => <option key={v}>{v}</option>)}</select></label><label>KPI <select value={kpi} onChange={e => setKpi(e.target.value as PointKey)} className="ml-1 h-8 rounded border px-2">{POINT_FIELDS.map(f => <option value={f.key} key={f.key}>{f.label}</option>)}</select></label></div></Panel>
    <Panel title="Benchmark result" note="Winner is shown only for comparable samples and a higher-is-better KPI."><table className="w-full text-left text-[11px]"><thead className="bg-[#F4F7FB]"><tr>{["KPI","Dataset A","Dataset B","Delta","Delta %","Samples A / B","Comparability","Winner"].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody><tr className="border-t"><td className="p-2 font-medium">{POINT_FIELDS.find(f => f.key === kpi)?.label}</td><td className="p-2">{fmt(aa)}</td><td className="p-2">{fmt(ab)}</td><td className="p-2">{aa == null || ab == null ? "N/A" : fmt(aa-ab)}</td><td className="p-2">{aa == null || ab == null || ab === 0 ? "N/A" : `${fmt((aa-ab)/ab*100)}%`}</td><td className="p-2">{va.length} / {vb.length}</td><td className="p-2">{comparable ? "Comparable with coverage warning" : "Not comparable"}</td><td className="p-2 font-semibold text-[#1769F5]">{comparable && aa != null && ab != null ? (aa === ab ? "Tie" : aa > ab ? a : b) : "N/A"}</td></tr></tbody></table></Panel>
    <div className="grid gap-3 xl:grid-cols-2"><Chart title="Side-by-side KPI Average" exportName="benchmark-bars" build={() => ({ grid:{left:50,right:20,top:20,bottom:35},xAxis:{type:"category",data:[a,b]},yAxis:{type:"value"},series:[{type:"bar",data:[aa,ab],itemStyle:{color:"#1769F5"}}] })}/><Chart title="Dual Histogram + CDF" exportName="benchmark-distribution" build={() => dualDistribution(va,vb,a,b)}/></div></>;
}

function dualDistribution(a: number[], b: number[], an: string, bn: string): EChartsOption {
  const all = [...a,...b].sort((x,y)=>x-y); if (!all.length) return { title:{text:"N/A",left:"center",top:"middle"} };
  const min=all[0]!, max=all[all.length-1]!, bins=16, width=(max-min||1)/bins;
  const count=(v:number[])=>{const c:number[]=Array(bins).fill(0);v.forEach(x=>{const index=Math.min(bins-1,Math.floor((x-min)/width));c[index]=(c[index]??0)+1;});return c;};
  const ca=count(a),cb=count(b); return { tooltip:{trigger:"axis"},legend:{bottom:0},grid:{left:45,right:20,top:20,bottom:40},xAxis:{type:"category",data:ca.map((_,i)=>fmt(min+(i+.5)*width,1))},yAxis:{type:"value"},series:[{name:an,type:"bar",data:ca,itemStyle:{color:"#1769F5",opacity:.65}},{name:bn,type:"bar",data:cb,itemStyle:{color:"#18A77A",opacity:.65}}] };
}

function CustomView({ data }: { data: DriveTestReportData }) {
  const [selected, setSelected] = useState<string[]>(["dl","rsrp","sinr"]);
  const metrics = data.metrics.filter(m => selected.includes(m.code));
  return <><Panel title="Custom report builder" note="The widget selection is included when the report template is saved."><MultiSelect label="KPI cards" options={data.metrics.map(m=>m.code)} value={selected} onChange={setSelected}/></Panel><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{metrics.map(m=><Card key={m.code} label={m.label} value={fmt(m.avg)} unit={m.unit} note={`${m.n} samples`}/>)}</div><div className="grid gap-3 xl:grid-cols-2">{metrics.slice(0,4).map(m=><Chart key={m.code} title={`${m.label} Distribution`} exportName={`custom-${m.code}`} build={()=>histogramOption(data.points,m.code as PointKey)}/>)}</div><SummaryTable data={{...data,metrics}}/></>;
}

function ReportBody({ report, data }: { report: ReportId; data: DriveTestReportData }) {
  if (report === "summary" || report === "throughput") return <SummaryView data={data}/>;
  if (report === "service") return <ServiceView data={data}/>;
  if (report === "investigation") return <InvestigationView data={data}/>;
  if (report === "radio") return <RadioView data={data}/>;
  if (report === "fails") return <TaskTable data={data} failures/>;
  if (report === "tasks") return <><DataCoverage data={data}/><TaskTable data={data}/></>;
  if (report === "benchmark-operator") return <BenchmarkView data={data} mode="operator"/>;
  if (report === "benchmark-stream") return <BenchmarkView data={data} mode="capture_id"/>;
  if (report === "custom") return <CustomView data={data}/>;
  return <><div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Card label="RRC Attempts" value="N/A" note="Use catalog-backed decoded procedure source"/><Card label="RRC Success Rate" value="N/A" note="Numerator / denominator unavailable in this report dataset"/><Card label="E-RAB Attempts (LTE)" value="N/A"/><Card label="NR PDU Session Setup" value="N/A"/></div><UnsupportedTable data={data}/></>;
}

const SPLIT_COLORS = ["#1769F5", "#18A77A", "#F59E0B", "#8B5CF6", "#E34F6F", "#0EA5E9", "#64748B"];
const groupPoint = (data: DriveTestReportData, point: ReportPoint) =>
  (data.split_by === "operator" ? point.operator : point.capture_id) ?? "Unassigned";

function SplitKpiTable({ groups }: { groups: ReportSplitGroup[] }) {
  const codes = groups[0]?.metrics.map(item => item.code) ?? [];
  return <Panel title="KPI comparison by split" note="Each value is aggregated by the backend from the same filtered population.">
    <div className="overflow-auto"><table className="w-full min-w-[900px] text-left text-[11px]">
      <thead className="bg-[#F4F7FB] text-[#52647C]"><tr><th rowSpan={2} className="border-r px-2 py-2">KPI</th><th rowSpan={2} className="border-r px-2 py-2">Unit</th>{groups.map(group=><th key={group.key} colSpan={4} className="border-r px-2 py-2 text-center text-[#17243A]">{group.label}<span className="ml-1 font-normal text-[#718096]">({group.population.samples.toLocaleString()})</span></th>)}</tr><tr>{groups.flatMap(group=>["Avg","P50","P90","N"].map(column=><th key={`${group.key}-${column}`} className="border-r px-2 py-1.5 text-right font-medium">{column}</th>))}</tr></thead>
      <tbody>{codes.map(code=>{const base=groups[0]?.metrics.find(item=>item.code===code);return <tr key={code} className="border-t border-[#E7EDF5]"><td className="border-r px-2 py-2 font-medium text-[#17243A]">{base?.label}</td><td className="border-r px-2 py-2">{base?.unit}</td>{groups.flatMap(group=>{const item=group.metrics.find(metricItem=>metricItem.code===code);return [item?.avg,item?.p50,item?.p90,item?.n].map((value,index)=>{const displayed=index===3?String(value??0):fmt(value as number|null|undefined);return <td key={`${group.key}-${index}`} className="border-r px-2 py-2 text-right tabular-nums"><span className={`rounded px-1.5 py-0.5 font-medium ${summaryValueClass(["Average","P50","P90","Samples"][index]!,displayed)}`}>{displayed}</span></td>;});})}</tr>;})}</tbody>
    </table></div>
  </Panel>;
}

function SplitTaskSummary({ groups }: { groups: ReportSplitGroup[] }) {
  const rows = [
    { label:"Attempts", value:(group:ReportSplitGroup)=>String(group.task_summary.attempts) },
    { label:"Success rate", value:(group:ReportSplitGroup)=>group.task_summary.attempts ? `${fmt(group.task_summary.successes/group.task_summary.attempts*100)}%` : "N/A" },
    { label:"Failures", value:(group:ReportSplitGroup)=>String(group.task_summary.failures) },
    { label:"Average duration", value:(group:ReportSplitGroup)=>group.task_summary.avg_duration_s == null ? "N/A" : `${fmt(group.task_summary.avg_duration_s)} s` },
    { label:"Transferred volume", value:(group:ReportSplitGroup)=>group.task_summary.volume_bytes == null ? "N/A" : `${fmt(group.task_summary.volume_bytes/1e9)} GB` },
  ];
  return <Panel title="Task / service comparison"><div className="overflow-auto"><table className="w-full min-w-[620px] text-left text-[11px]"><thead className="bg-[#F4F7FB]"><tr><th className="px-2 py-2">Metric</th>{groups.map(group=><th key={group.key} className="px-2 py-2 text-right">{group.label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.label} className="border-t"><td className="px-2 py-2 font-medium">{row.label}</td>{groups.map(group=>{const value=row.value(group);return <td key={group.key} className="px-2 py-2 text-right tabular-nums"><span className={`rounded px-1.5 py-0.5 font-semibold ${summaryValueClass(row.label,value)}`}>{value}</span></td>;})}</tr>)}</tbody></table></div></Panel>;
}

function splitTimeOption(data: DriveTestReportData): EChartsOption {
  const groups=data.groups;
  const series=groups.flatMap((group,index)=>{
    const points=data.points.filter(point=>groupPoint(data,point)===group.key);
    const color=SPLIT_COLORS[index%SPLIT_COLORS.length]!;
    const output:SeriesOption[]=[{name:`${group.label} · DL`,type:"line",showSymbol:false,connectNulls:false,itemStyle:{color},lineStyle:{color,width:1.8},data:points.filter(point=>point.dl!=null).map(point=>[point.ts??`${point.capture_id}:${point.seq}`,point.dl!])}];
    if(points.some(point=>point.thrpt_ul!=null)) output.push({name:`${group.label} · UL`,type:"line",showSymbol:false,connectNulls:false,itemStyle:{color},lineStyle:{color,width:1.2,type:"dashed"},data:points.filter(point=>point.thrpt_ul!=null).map(point=>[point.ts??`${point.capture_id}:${point.seq}`,point.thrpt_ul!])});
    return output;
  });
  return {tooltip:{trigger:"axis"},legend:{type:"scroll",bottom:0},grid:{left:50,right:20,top:20,bottom:50},xAxis:{type:"category",axisLabel:{hideOverlap:true}},yAxis:{type:"value",name:"Mbit/s"},series};
}

function splitScatterOption(data: DriveTestReportData, x: PointKey, y: PointKey): EChartsOption {
  const xf=POINT_FIELDS.find(field=>field.key===x)!,yf=POINT_FIELDS.find(field=>field.key===y)!;
  return {tooltip:{formatter:(raw:unknown)=>{const item=raw as {seriesName:string;value:number[]};return `${item.seriesName}<br/>${xf.label}: ${fmt(item.value[0])}<br/>${yf.label}: ${fmt(item.value[1])}`;}},legend:{type:"scroll",bottom:0},grid:{left:58,right:20,top:20,bottom:52},xAxis:{type:"value",name:`${xf.label} (${xf.unit})`,nameLocation:"middle",nameGap:30},yAxis:{type:"value",name:`${yf.label} (${yf.unit})`},series:data.groups.map((group,index)=>({name:group.label,type:"scatter",symbolSize:6,large:true,itemStyle:{color:SPLIT_COLORS[index%SPLIT_COLORS.length]!,opacity:.5},data:data.points.filter(point=>groupPoint(data,point)===group.key&&point[x]!=null&&point[y]!=null).map(point=>[point[x] as number,point[y] as number])}))};
}

function splitDistributionOption(data: DriveTestReportData, key: PointKey): EChartsOption {
  const grouped=data.groups.map(group=>data.points.filter(point=>groupPoint(data,point)===group.key&&point[key]!=null).map(point=>point[key] as number));
  const all=grouped.flat().sort((a,b)=>a-b); if(!all.length)return {title:{text:"N/A",left:"center",top:"middle"}};
  const min=all[0]!,max=all[all.length-1]!,bins=18,width=(max-min||1)/bins,labels=Array.from({length:bins},(_,index)=>fmt(min+(index+.5)*width,1));
  const counts=grouped.map(values=>{const result:number[]=Array(bins).fill(0);values.forEach(value=>{const index=Math.min(bins-1,Math.floor((value-min)/width));result[index]=(result[index]??0)+1;});return result;});
  const series:SeriesOption[]=data.groups.flatMap((group,index)=>{let sum=0;const cdf=counts[index]!.map(count=>(sum+=count)/(grouped[index]!.length||1)*100);const color=SPLIT_COLORS[index%SPLIT_COLORS.length]!;return [{name:`${group.label} · Histogram`,type:"bar" as const,data:counts[index]!,barGap:"-100%",itemStyle:{color,opacity:.25}},{name:`${group.label} · CDF`,type:"line" as const,yAxisIndex:1,data:cdf,showSymbol:false,lineStyle:{color,width:2}}];});
  return {tooltip:{trigger:"axis"},legend:{type:"scroll",bottom:0},grid:{left:50,right:50,top:20,bottom:55},xAxis:{type:"category",data:labels},yAxis:[{type:"value",name:"Count"},{type:"value",name:"CDF %",max:100}],series};
}

function SplitComparisonReport({ report, data }: { report: ReportId; data: DriveTestReportData }) {
  const kind=data.split_by==="operator"?"operator":"stream";
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#BFD3F5] bg-[#EAF2FF] px-3 py-2"><div className="mr-auto"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#1769F5]">Comparison report split by {kind}</p><h3 className="text-sm font-semibold">{data.groups.length} {kind}{data.groups.length===1?"":"s"} side by side</h3></div>{data.groups.map((group,index)=><span key={group.key} className="flex items-center gap-1 text-[11px]"><i className="h-2.5 w-2.5 rounded-full" style={{background:SPLIT_COLORS[index%SPLIT_COLORS.length]}}/>{group.label} · {group.population.samples.toLocaleString()}</span>)}</div>
    <DataCoverage data={data}/><SplitKpiTable groups={data.groups}/><SplitTaskSummary groups={data.groups}/>
    <div className="grid gap-3 xl:grid-cols-2"><Chart title="Throughput over time · all splits" subtitle="Solid: DL · dashed: UL · no interpolation" exportName="split-throughput-time" build={()=>splitTimeOption(data)}/><Chart title="Throughput vs RSRP · all splits" subtitle="One color per split" exportName="split-throughput-rsrp" build={()=>splitScatterOption(data,"rsrp","dl")}/><Chart title="RSRP histogram + CDF · all splits" exportName="split-rsrp-distribution" build={()=>splitDistributionOption(data,"rsrp")}/><Chart title="SINR vs Throughput · all splits" subtitle="One color per split" exportName="split-sinr-throughput" build={()=>splitScatterOption(data,"sinr","dl")}/></div>
    {(report==="tasks"||report==="service")&&<TaskTable data={data}/>} {report==="fails"&&<TaskTable data={data} failures/>} {report==="rrc"&&<UnsupportedTable data={data}/>} {report==="radio"&&<UnsupportedTable data={data} kind="radio"/>}
  </div>;
}

function GeneratedReport({ report, data }: { report: ReportId; data: DriveTestReportData }) {
  return data.split_by === "none" ? <ReportBody report={report} data={data}/> : <SplitComparisonReport report={report} data={data}/>;
}

export function DriveTestReportsPage() {
  const { t } = useTranslation(); const { activeProject } = useActiveProject();
  const [report, setReport] = useState<ReportId>("summary"), [sidebar, setSidebar] = useState(true);
  const [draft, setDraft] = useState<DriveTestReportFilters>(EMPTY_FILTERS), [applied, setApplied] = useState<DriveTestReportFilters>(EMPTY_FILTERS);
  const projectId = activeProject?.id ?? "";
  const filterQuery = useQuery({ queryKey:["drive-test-reports","filters",projectId], queryFn:({signal})=>getDriveTestReportFilters(projectId,signal), enabled:!!projectId });
  const dataQuery = useQuery({ queryKey:["drive-test-reports","data",projectId,applied], queryFn:({signal})=>getDriveTestReportData(projectId,applied,signal), enabled:!!projectId });
  const build = useCallback((key: keyof Pick<DriveTestReportFilters,"capture_id"|"operator"|"rat"|"band"|"service"|"cell"|"site">, value:string[])=>setDraft(d=>({...d,[key]:value})),[]);
  const exportCsv = () => { if (!dataQuery.data) return; const data=dataQuery.data; const rows=data.points.map(row=>({split_group:data.split_by === "operator" ? row.operator ?? "Unassigned" : data.split_by === "stream" ? row.capture_id ?? "Unassigned" : "Overall",...row})); const heads = rows.length ? Object.keys(rows[0]!) : []; downloadBlob(`bc4-${report}-${data.split_by}.csv`, [heads.join(","),...rows.map(row=>heads.map(h=>JSON.stringify(row[h as keyof typeof row]??"")).join(","))].join("\n"), "text/csv;charset=utf-8"); };
  const exportExcel = async () => { if (!dataQuery.data) return; const data=dataQuery.data; const XLSX = await import("xlsx"); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.metrics),"KPI Summary"); if(data.groups.length) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.groups.flatMap(group=>group.metrics.map(item=>({split_by:data.split_by,split_group:group.label,...item})))),"Split KPI Summary"); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.tasks),"Tasks"); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.points.map(row=>({split_group:data.split_by === "operator" ? row.operator ?? "Unassigned" : data.split_by === "stream" ? row.capture_id ?? "Unassigned" : "Overall",...row}))),"Chart source data"); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{project:activeProject?.name,report,...applied,split_by:data.split_by,methodology:data.methodology}]),"Filter metadata"); XLSX.writeFile(wb,`bc4-${report}-${data.split_by}.xlsx`); };
  const saveTemplate = () => { localStorage.setItem("bc4.driveTestReportTemplate",JSON.stringify({report,filters:draft,savedAt:new Date().toISOString()})); };
  const openTemplate = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("bc4.driveTestReportTemplate") ?? "null") as { report?: ReportId; filters?: DriveTestReportFilters } | null;
      if (!saved?.filters) return;
      const filters = { ...saved.filters, split_by: saved.filters.split_by ?? "none" };
      setDraft(filters); setApplied(filters);
      if (saved.report && REPORTS.some(item => item.id === saved.report)) setReport(saved.report);
    } catch { /* an invalid local template is ignored */ }
  };
  const setTime = (key: "time_start" | "time_end", value: string) => setDraft(current => {
    const next = { ...current };
    if (value) next[key] = value;
    else delete next[key];
    return next;
  });
  if (!activeProject) return <NoActiveProject scope="Drive Test Reports"/>;
  const opts=filterQuery.data;
  return <div className="dt-report-shell flex h-[calc(100dvh-var(--app-header-offset))] min-h-[620px] bg-[#F4F7FB] text-[#17243A]">
    <aside className={`${sidebar?"w-[250px]":"w-0"} shrink-0 overflow-hidden border-r border-[#DCE4EF] bg-white transition-[width]`}><div className="w-[250px] p-3"><Link to="/rf" search={s=>s} className="mb-3 flex items-center gap-1 text-[11px] text-[#637188] hover:text-[#1769F5]"><ChevronLeft className="h-3.5 w-3.5"/>RF Modules</Link><div className="mb-2 flex items-center gap-2"><span className="rounded-md bg-[#1769F5] p-1.5 text-white"><BarChart3 className="h-4 w-4"/></span><div><h1 className="text-sm font-semibold">Drive Test Reports</h1><p className="text-[10px] text-[#718096]">{activeProject.name}</p></div></div><nav className="space-y-0.5">{REPORTS.map(item=><button key={item.id} onClick={()=>setReport(item.id)} className={`flex h-8 w-full items-center rounded-md px-2 text-left text-[11px] ${item.child?"pl-7":""} ${report===item.id?"bg-[#EAF2FF] font-semibold text-[#1769F5]":"hover:bg-[#F4F7FB]"}`}>{item.child&&<ChevronRight className="mr-1 h-3 w-3"/>}{t(item.key)}</button>)}</nav></div></aside>
    <main className="min-w-0 flex-1 overflow-auto"><div className="sticky top-0 z-30 border-b border-[#DCE4EF] bg-white/95 shadow-sm backdrop-blur"><div className="flex min-h-12 items-center gap-2 px-3"><button onClick={()=>setSidebar(v=>!v)} className="rounded p-1.5 hover:bg-[#F4F7FB]" title="Toggle sidebar">{sidebar?<PanelLeftClose className="h-4 w-4"/>:<PanelLeftOpen className="h-4 w-4"/>}</button><div className="mr-auto"><p className="text-[10px] text-[#718096]">RF Modules / Drive Test Reports</p><h2 className="text-sm font-semibold">{t(REPORTS.find(r=>r.id===report)!.key)}</h2></div><button onClick={openTemplate} className="dt-action"><FileDown/> {t("dtReports.actions.open")}</button><button onClick={saveTemplate} className="dt-action"><Save/> {t("dtReports.actions.save")}</button><button onClick={()=>window.print()} className="dt-action"><FileDown/> PDF</button><button onClick={()=>void exportExcel()} className="dt-action"><FileSpreadsheet/> Excel</button><button onClick={exportCsv} className="dt-action"><Download/> CSV</button><button onClick={()=>void document.documentElement.requestFullscreen()} className="dt-icon" title="Fullscreen"><Maximize2/></button></div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[#E7EDF5] px-3 py-2"><SlidersHorizontal className="mr-1 h-3.5 w-3.5 text-[#637188]"/><label className="flex h-7 items-center rounded border border-[#AFC8EF] bg-[#F4F8FF] px-2 text-[10px] font-semibold text-[#315C96]">Split report<select aria-label="Split report" value={draft.split_by} onChange={e=>setDraft(current=>({...current,split_by:e.target.value as DriveTestReportFilters["split_by"]}))} className="ml-1 bg-transparent text-[#17243A]"><option value="none">None</option><option value="operator">Operator</option><option value="stream">Stream</option></select></label><MultiSelect label="Technology" options={opts?.rats??[]} value={draft.rat} onChange={v=>build("rat",v)}/><MultiSelect label="Operator" options={opts?.operators??[]} value={draft.operator} onChange={v=>build("operator",v)}/><MultiSelect label="Stream / Capture" options={opts?.captures??[]} value={draft.capture_id} onChange={v=>build("capture_id",v)}/><MultiSelect label="Site" options={opts?.sites??[]} value={draft.site} onChange={v=>build("site",v)}/><MultiSelect label="Cell" options={opts?.cells??[]} value={draft.cell} onChange={v=>build("cell",v)}/><MultiSelect label="Service / Task" options={opts?.services??[]} value={draft.service} onChange={v=>build("service",v)}/><MultiSelect label="Band / Frequency" options={opts?.bands??[]} value={draft.band} onChange={v=>build("band",v)}/><label className="flex h-7 items-center rounded border px-2 text-[10px] text-[#637188]">From<input type="datetime-local" value={draft.time_start??""} onChange={e=>setTime("time_start",e.target.value)} className="ml-1 w-[150px] bg-transparent text-[#17243A]"/></label><label className="flex h-7 items-center rounded border px-2 text-[10px] text-[#637188]">To<input type="datetime-local" value={draft.time_end??""} onChange={e=>setTime("time_end",e.target.value)} className="ml-1 w-[150px] bg-transparent text-[#17243A]"/></label><button onClick={()=>setApplied({...draft})} className="ml-auto flex h-7 items-center gap-1 rounded bg-[#1769F5] px-3 text-[11px] font-semibold text-white"><RefreshCw className="h-3 w-3"/>Generate Report</button><button onClick={()=>{setDraft(EMPTY_FILTERS);setApplied(EMPTY_FILTERS)}} className="h-7 rounded border px-2 text-[11px]">Reset</button></div></div>
      <div className="space-y-3 p-3">{dataQuery.isLoading&&<div className="rounded-lg border bg-white p-10 text-center text-sm text-[#637188]">Loading filtered report data…</div>}{dataQuery.error&&<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{toUserMessage(dataQuery.error)}</div>}{dataQuery.data&&<GeneratedReport report={report} data={dataQuery.data}/>}</div>
    </main>
  </div>;
}
