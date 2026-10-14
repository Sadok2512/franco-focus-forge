import { AlertTriangle, Check, Copy, Database, Download, RotateCw } from "lucide-react";
import { lazy, memo, Suspense, useCallback, useState } from "react";
import { Chart } from "@/components/bc4/Chart";
import { DemoBadge, LoadingSkeleton } from "@/components/bc4/States";
import type { AssistantResponse, Block, EvidenceKind } from "@/lib/api/assistant-schemas";
import { OPERATORS } from "@/lib/api/schemas";

const RadioMap = lazy(() => import("@/components/bc4/RadioMap").then((m) => ({ default: m.RadioMap })));

export const fmtNum = (v: unknown) =>
  v == null ? "N/D" : typeof v === "number" ? v.toLocaleString("fr-FR") : String(v);

const KIND: Record<EvidenceKind, { label: string; cls: string }> = {
  OBSERVED: { label: "Observé", cls: "border-sev-good/50 text-foreground" },
  CALCULATED: { label: "Calculé", cls: "border-primary/50 text-primary" },
  INTERPRETED: { label: "Interprété", cls: "border-sev-fair/60 text-foreground" },
  UNAVAILABLE: { label: "Indisponible", cls: "border-muted-foreground/50 text-muted-foreground" },
};
export function EvidenceTag({ kind }: { kind: EvidenceKind }) {
  const k = KIND[kind];
  return (
    <span data-evidence={kind} title={kind} className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0 font-mono text-[10px] font-medium uppercase ${k.cls}`}>
      {k.label}
    </span>
  );
}

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const opVar = (name: string) =>
  (OPERATORS as readonly string[]).includes(name) ? `--op-${name.toLowerCase()}` : null;

const ChartBlock = memo(function ChartBlock({ b }: { b: Extract<Block, { type: "chart" }> }) {
  const build = useCallback((c: { muted: string; border: string; fg: string }) => {
    const palette = [css("--primary"), css("--sev-fair"), css("--sev-good"), css("--muted-foreground")];
    const axis = { axisLabel: { color: c.muted, fontSize: 11 }, axisLine: { lineStyle: { color: c.border } } };
    return {
      grid: { left: 56, right: 16, top: 30, bottom: 44 },
      tooltip: { trigger: b.chart === "boxplot" ? ("item" as const) : ("axis" as const) },
      legend: b.series.length > 1 ? { top: 0, textStyle: { color: c.fg, fontSize: 11 } } : undefined,
      xAxis: { type: "category" as const, data: b.categories, name: b.x_label, nameLocation: "middle" as const, nameGap: 28, nameTextStyle: { color: c.muted }, ...axis },
      yAxis: { type: "value" as const, name: `${b.y_label} (${b.unit})`, nameLocation: "middle" as const, nameGap: 42, nameTextStyle: { color: c.muted }, scale: b.chart !== "bar", ...axis, splitLine: { lineStyle: { color: c.border } } },
      series: b.series.map((s, i) => {
        const v = opVar(s.name);
        const color = v ? css(v) : palette[i % palette.length];
        if (b.chart === "boxplot") return { type: "boxplot" as const, name: s.name, data: s.data as number[][], itemStyle: { color: css("--accent"), borderColor: color } };
        return { type: b.chart, name: s.name, data: s.data as (number | null)[], connectNulls: false, itemStyle: { color }, lineStyle: { color }, barMaxWidth: 36 };
      }),
    };
  }, [b]);
  return (
    <div>
      <Chart title={b.heading} subtitle={`${b.y_label} (${b.unit}) · n = ${fmtNum(b.sample_count)}${b.chart === "boxplot" ? " · moustaches = P10/P90" : ""}`} build={build as never} height={240} exportName={`assistant_${b.source_id}`} />
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">Source : {b.source_id}</p>
    </div>
  );
});

function toCsv(b: Extract<Block, { type: "table" }>) {
  const head = b.columns.map((c) => c.label + (c.unit ? ` (${c.unit})` : "")).join(";");
  return [head, ...b.rows.map((r) => b.columns.map((c) => (r[c.key] == null ? "N/D" : String(r[c.key]))).join(";"))].join("\n");
}
function download(name: string, content: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
}

function TableBlock({ b }: { b: Extract<Block, { type: "table" }> }) {
  return (
    <section aria-label={b.heading}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{b.heading}</h4>
        <button onClick={() => download(`${b.heading}.csv`, toCsv(b), "text/csv")} aria-label={`Exporter ${b.heading} en CSV`} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"><Download className="h-3 w-3" /> CSV</button>
      </div>
      <div className="max-w-full overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>{b.columns.map((c) => <th key={c.key} scope="col" className={`whitespace-nowrap px-2 py-1.5 font-medium ${c.numeric ? "text-right" : "text-left"}`}>{c.label}{c.unit && <span className="font-normal"> ({c.unit})</span>}</th>)}</tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i} className="border-t">
                {b.columns.map((c) => (
                  <td key={c.key} className={`px-2 py-1.5 ${c.numeric ? "num text-right font-mono" : c.key === "path" ? "font-mono text-[11px] text-muted-foreground" : ""} ${r[c.key] == null ? "text-muted-foreground" : ""}`}>{fmtNum(r[c.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">Source : {b.source_id}{b.formula && <> · <EvidenceTag kind="CALCULATED" /> {b.formula}</>}</p>
    </section>
  );
}

export function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case "text":
      return (
        <section aria-label={b.heading}>
          <h4 className="mb-1 text-xs font-semibold">{b.heading}</h4>
          <ul className="space-y-1">
            {b.claims.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed"><EvidenceTag kind={c.kind} /><span>{c.text}</span></li>
            ))}
          </ul>
        </section>
      );
    case "summary":
      return (
        <section aria-label={b.heading}>
          <h4 className="mb-1 text-xs font-semibold">{b.heading}</h4>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
            {b.items.map((it) => (
              <div key={it.label} className="rounded-md border p-2">
                <div className="flex items-center justify-between gap-1"><span className="text-[11px] text-muted-foreground">{it.label}</span><EvidenceTag kind={it.kind} /></div>
                <p className="num mt-1 font-mono text-lg font-semibold">{fmtNum(it.value)} <span className="text-xs font-normal text-muted-foreground">{it.unit}</span></p>
                <p className="text-[10px] text-muted-foreground">n = {fmtNum(it.n)}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "table":
      return <TableBlock b={b} />;
    case "chart":
      return <ChartBlock b={b} />;
    case "map":
      return (
        <section aria-label={b.heading}>
          <h4 className="mb-1 text-xs font-semibold">{b.heading}</h4>
          {b.points.length ? (
            <div className="relative h-72 overflow-hidden rounded-md border">
              <Suspense fallback={<LoadingSkeleton />}><RadioMap points={b.points} metric={b.metric} center={b.center} /></Suspense>
            </div>
          ) : <p className="rounded-md border p-3 text-xs text-muted-foreground">Aucune donnée disponible</p>}
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">Source : {b.source_id} · {fmtNum(b.points.length)} points</p>
        </section>
      );
  }
}

export function ResponseCard({ r, onFollowUp, onRetry }: { r: AssistantResponse; onFollowUp: (q: string) => void; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  if (r.status === "cancelled")
    return <p className="text-xs italic text-muted-foreground">Analyse annulée. <button onClick={onRetry} className="text-primary underline">Relancer</button></p>;
  if (r.status === "failed")
    return (
      <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-xs">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
        <div><p className="font-medium">Échec de l'analyse</p><p className="text-muted-foreground">{r.error?.message}</p>
          <button onClick={onRetry} className="mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-muted"><RotateCw className="h-3 w-3" /> Réessayer</button></div>
      </div>
    );
  const text = r.blocks.flatMap((b) => (b.type === "text" ? [b.heading, ...b.claims.map((c) => `[${c.kind}] ${c.text}`)] : b.type === "table" ? [b.heading, toCsv(b)] : [b.heading])).join("\n");
  return (
    <article className="space-y-4" aria-label="Réponse de l'assistant">
      <div className="flex flex-wrap items-center gap-2"><DemoBadge /><span className="font-mono text-[10px] text-muted-foreground">scénario {r.scenario}</span></div>
      {r.warnings.length > 0 && (
        <ul className="space-y-1" aria-label="Avertissements">
          {r.warnings.map((w) => <li key={w} className="flex items-start gap-2 rounded-md bg-warning px-2.5 py-1.5 text-xs text-warning-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}
        </ul>
      )}
      {r.blocks.map((b, i) => <BlockView key={i} b={b} />)}
      {r.evidence.length > 0 && (
        <section aria-label="Sources">
          <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold"><Database className="h-3.5 w-3.5" /> Sources</h4>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {r.evidence.map((e) => <li key={e.source_id}><span className="font-mono text-foreground">{e.source_id}</span> — {e.label} · n = {fmtNum(e.sample_count)} · {e.aggregation} · {e.period.start} → {e.period.end}</li>)}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {r.follow_ups.map((q) => <button key={q} onClick={() => onFollowUp(q)} className="rounded-full border px-2.5 py-1 text-[11px] text-primary hover:bg-accent">{q}</button>)}
        <span className="ml-auto flex gap-0.5">
          <button aria-label="Copier la réponse" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="rounded p-1 text-muted-foreground hover:bg-muted">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
          <button aria-label="Exporter la réponse (JSON)" onClick={() => download(`bc4_assistant_${r.message_id}.json`, JSON.stringify(r, null, 2), "application/json")} className="rounded p-1 text-muted-foreground hover:bg-muted"><Download className="h-3.5 w-3.5" /></button>
          <button aria-label="Relancer" onClick={onRetry} className="rounded p-1 text-muted-foreground hover:bg-muted"><RotateCw className="h-3.5 w-3.5" /></button>
        </span>
      </div>
    </article>
  );
}
