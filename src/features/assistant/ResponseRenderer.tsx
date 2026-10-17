import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Inbox,
  Info,
  RotateCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { lazy, memo, Suspense, useCallback, useMemo, useState } from "react";
import { Chart } from "@/components/bc4/Chart";
import { DemoBadge, LoadingSkeleton } from "@/components/bc4/States";
import type { AssistantResponse, Block, EvidenceKind } from "@/lib/api/assistant-schemas";
import { OPERATORS } from "@/lib/api/schemas";

const RadioMap = lazy(() =>
  import("@/components/bc4/RadioMap").then((m) => ({ default: m.RadioMap })),
);

// 1.14.0 — AssistantMap dédié (seuils dBm BC4 + colorBy value/operator).
// Chargement paresseux pour éviter d'importer maplibre-gl si la réponse
// n'a pas de BlockMap.
const AssistantMap = lazy(() =>
  import("./AssistantMap").then((m) => ({ default: m.AssistantMap })),
);

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
    <span
      data-evidence={kind}
      title={kind}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0 font-mono text-[10px] font-medium uppercase ${k.cls}`}
    >
      {k.label}
    </span>
  );
}

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const opVar = (name: string) =>
  (OPERATORS as readonly string[]).includes(name) ? `--op-${name.toLowerCase()}` : null;

const ChartBlock = memo(function ChartBlock({ b }: { b: Extract<Block, { type: "chart" }> }) {
  const build = useCallback(
    (c: { muted: string; border: string; fg: string }) => {
      const palette = [
        css("--primary"),
        css("--sev-fair"),
        css("--sev-good"),
        css("--muted-foreground"),
      ];
      const axis = {
        axisLabel: { color: c.muted, fontSize: 11 },
        axisLine: { lineStyle: { color: c.border } },
      };
      return {
        grid: { left: 56, right: 16, top: 30, bottom: 44 },
        tooltip: { trigger: b.chart === "boxplot" ? ("item" as const) : ("axis" as const) },
        legend:
          b.series.length > 1 ? { top: 0, textStyle: { color: c.fg, fontSize: 11 } } : undefined,
        xAxis: {
          type: "category" as const,
          data: b.categories,
          name: b.x_label,
          nameLocation: "middle" as const,
          nameGap: 28,
          nameTextStyle: { color: c.muted },
          ...axis,
        },
        yAxis: {
          type: "value" as const,
          name: `${b.y_label} (${b.unit})`,
          nameLocation: "middle" as const,
          nameGap: 42,
          nameTextStyle: { color: c.muted },
          scale: b.chart !== "bar",
          ...axis,
          splitLine: { lineStyle: { color: c.border } },
        },
        series: b.series.map((s, i) => {
          const v = opVar(s.name);
          const color = v ? css(v) : palette[i % palette.length];
          if (b.chart === "boxplot")
            return {
              type: "boxplot" as const,
              name: s.name,
              data: s.data as number[][],
              itemStyle: { color: css("--accent"), borderColor: color },
            };
          return {
            type: b.chart,
            name: s.name,
            data: s.data as (number | null)[],
            connectNulls: false,
            itemStyle: { color },
            lineStyle: { color },
            barMaxWidth: 36,
          };
        }),
      };
    },
    [b],
  );
  return (
    <div>
      <Chart
        title={b.heading}
        subtitle={`${b.y_label} (${b.unit}) · n = ${fmtNum(b.sample_count)}${b.chart === "boxplot" ? " · moustaches = P10/P90" : ""}`}
        build={build as never}
        height={240}
        exportName={`assistant_${b.source_id}`}
      />
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">Source : {b.source_id}</p>
    </div>
  );
});

function toCsv(b: Extract<Block, { type: "table" }>) {
  const head = b.columns.map((c) => c.label + (c.unit ? ` (${c.unit})` : "")).join(";");
  return [
    head,
    ...b.rows.map((r) =>
      b.columns.map((c) => (r[c.key] == null ? "N/D" : String(r[c.key]))).join(";"),
    ),
  ].join("\n");
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
        <button
          onClick={() => download(`${b.heading}.csv`, toCsv(b), "text/csv")}
          aria-label={`Exporter ${b.heading} en CSV`}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
        >
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      <div className="max-w-full overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {b.columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`whitespace-nowrap px-2 py-1.5 font-medium ${c.numeric ? "text-right" : "text-left"}`}
                >
                  {c.label}
                  {c.unit && <span className="font-normal"> ({c.unit})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i} className="border-t">
                {b.columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 ${c.numeric ? "num text-right font-mono" : c.key === "path" ? "font-mono text-[11px] text-muted-foreground" : ""} ${r[c.key] == null ? "text-muted-foreground" : ""}`}
                  >
                    {fmtNum(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        Source : {b.source_id}
        {b.formula && (
          <>
            {" "}
            · <EvidenceTag kind="CALCULATED" /> {b.formula}
          </>
        )}
      </p>
    </section>
  );
}

// -------------------------------------------------------------------
// 1.13.0 — Détections de contenu pour sous-variantes de BlockText.
// Le back 0.25.1 émet trois formes particulières via des BlockText :
//   - « Verdict de comparabilité » (claim : `[COMPARABLE…] raison`)
//   - « Contexte projet » (plusieurs claims OBSERVED metadata)
//   - « n=0 — donnée indisponible … » (claim unique, kind=OBSERVED)
// On les détecte au CONTENU, jamais à une étiquette magique (règle
// « par le contenu, jamais l'étiquette »). Si rien ne matche →
// rendu générique (claims + EvidenceTag) inchangé.
// -------------------------------------------------------------------

type Verdict = "COMPARABLE" | "COMPARABLE_WITH_LIMITATIONS" | "NOT_COMPARABLE";
const VERDICT_RE = /^\[(COMPARABLE|COMPARABLE_WITH_LIMITATIONS|NOT_COMPARABLE)\]\s*(.+)$/s;

function parseVerdict(text: string): { verdict: Verdict; reason: string } | null {
  const m = text.match(VERDICT_RE);
  if (!m) return null;
  const v = (m[1] ?? "") as Verdict;
  const reason = (m[2] ?? "").trim();
  return { verdict: v, reason };
}

const VERDICT_STYLE: Record<Verdict, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  COMPARABLE: {
    cls: "border-sev-good/60 bg-sev-good/10 text-sev-good",
    label: "COMPARABLE",
    Icon: CheckCircle2,
  },
  COMPARABLE_WITH_LIMITATIONS: {
    cls: "border-warning-foreground/50 bg-warning text-warning-foreground",
    label: "COMPARABLE avec limites",
    Icon: ShieldAlert,
  },
  NOT_COMPARABLE: {
    cls: "border-destructive/60 bg-destructive/10 text-destructive",
    label: "NON COMPARABLE",
    Icon: XCircle,
  },
};

function VerdictBadge({ v, source_id }: { v: Verdict; source_id?: string | undefined }) {
  const s = VERDICT_STYLE[v];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}
      aria-label={`Verdict : ${s.label}`}
      data-verdict={v}
      data-source-id={source_id}
    >
      <s.Icon className="h-3 w-3" aria-hidden /> {s.label}
    </span>
  );
}

function VerdictBlock({
  heading,
  claims,
}: {
  heading: string;
  claims: Extract<Block, { type: "text" }>["claims"];
}) {
  // Un BlockText « Verdict … » peut contenir plusieurs claims (le back
  // en 0.25.1 émet parfois une liste de verdicts quand plusieurs
  // compare_distributions ont été appelés). On rend chaque verdict
  // comme badge+raison, dans l'ordre d'arrivée.
  return (
    <section aria-label={heading} className="space-y-1">
      <h4 className="mb-1 text-xs font-semibold">{heading}</h4>
      <ul className="space-y-1.5">
        {claims.map((c, i) => {
          const p = parseVerdict(c.text);
          if (!p) {
            return (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                <EvidenceTag kind={c.kind} />
                <span>{c.text}</span>
              </li>
            );
          }
          return (
            <li key={i} className="flex items-start gap-2">
              <VerdictBadge v={p.verdict} source_id={c.source_id} />
              <span className="text-xs leading-relaxed text-muted-foreground">{p.reason}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ContextBlock({
  heading,
  claims,
}: {
  heading: string;
  claims: Extract<Block, { type: "text" }>["claims"];
}) {
  const source = claims.find((c) => c.source_id)?.source_id;
  return (
    <section
      aria-label={heading}
      className="rounded-md border border-dashed bg-muted/40 p-3"
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Info className="h-3.5 w-3.5" /> {heading}
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
        {claims.map((c, i) => {
          // Format attendu : "Label : valeur" (back 0.25.1).
          const idx = c.text.indexOf(" : ");
          if (idx <= 0) {
            return (
              <div key={i} className="col-span-full">
                {c.text}
              </div>
            );
          }
          return (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{c.text.slice(0, idx)}</dt>
              <dd className="font-mono text-foreground">{c.text.slice(idx + 3)}</dd>
            </div>
          );
        })}
      </dl>
      {source && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">Source : {source}</p>
      )}
    </section>
  );
}

function EmptyDataBlock({
  heading,
  claim,
}: {
  heading: string;
  claim: Extract<Block, { type: "text" }>["claims"][number];
}) {
  return (
    <section
      aria-label={heading}
      className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3"
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {heading}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{claim.text}</p>
      {claim.source_id && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          Source : {claim.source_id}
        </p>
      )}
    </section>
  );
}

function isVerdictHeading(h: string): boolean {
  return /^Verdict\b/i.test(h);
}
function isContextHeading(h: string): boolean {
  return /^Contexte\s+projet$/i.test(h);
}
function isSingleEmptyData(
  claims: Extract<Block, { type: "text" }>["claims"],
): boolean {
  const c = claims[0];
  return claims.length === 1 && !!c && c.kind === "OBSERVED" && /^n=0\b/.test(c.text);
}

export function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case "text": {
      // 1.13.0 — Sous-variantes typées (verdict / contexte / empty).
      if (isVerdictHeading(b.heading)) {
        return <VerdictBlock heading={b.heading} claims={b.claims} />;
      }
      if (isContextHeading(b.heading)) {
        return <ContextBlock heading={b.heading} claims={b.claims} />;
      }
      if (isSingleEmptyData(b.claims) && b.claims[0]) {
        return <EmptyDataBlock heading={b.heading} claim={b.claims[0]} />;
      }
      return (
        <section aria-label={b.heading}>
          <h4 className="mb-1 text-xs font-semibold">{b.heading}</h4>
          <ul className="space-y-1">
            {b.claims.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                <EvidenceTag kind={c.kind} />
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "summary":
      return (
        <section aria-label={b.heading}>
          <h4 className="mb-1 text-xs font-semibold">{b.heading}</h4>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
            {b.items.map((it) => (
              <div key={it.label} className="rounded-md border p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] text-muted-foreground">{it.label}</span>
                  <EvidenceTag kind={it.kind} />
                </div>
                <p className="num mt-1 font-mono text-lg font-semibold">
                  {fmtNum(it.value)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{it.unit}</span>
                </p>
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
    case "map": {
      // 1.14.0 — AssistantMap pour les BlockMap émis par /assistant.
      // Si b.points est vide → encart dédié (jamais une carte vide).
      if (b.points.length === 0) {
        return (
          <section
            aria-label={b.heading}
            className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3"
          >
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
              <Inbox className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {b.heading}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Aucune donnée dans le périmètre (jamais une carte vide ni un 0).
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">Source : {b.source_id}</p>
          </section>
        );
      }
      // Si la métrique est "rsrp" ET les points proviennent de l'Assistant
      // (shape avec champ `n` injecté par map_metric), on utilise la carte
      // dédiée Assistant. Sinon fallback RadioMap historique.
      const isAssistantMap = b.metric === "rsrp" && b.points.some((p) =>
        typeof (p as unknown as { n?: unknown }).n === "number",
      );
      return (
        <section aria-label={b.heading}>
          <h4 className="mb-1 text-xs font-semibold">{b.heading}</h4>
          <div className="relative h-80 overflow-hidden rounded-md border">
            <Suspense fallback={<LoadingSkeleton />}>
              {isAssistantMap ? (
                <AssistantMap
                  points={b.points}
                  center={b.center}
                  valueRange={b.value_range ?? null}
                />
              ) : (
                <RadioMap points={b.points} metric={b.metric} center={b.center} />
              )}
            </Suspense>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Source : {b.source_id} · {fmtNum(b.points.length)} cellules
            {b.unit && <> · unité : {b.unit}</>}
            {b.grid?.bins_decimals != null && <> · grille {b.grid.bins_decimals} décimales</>}
          </p>
        </section>
      );
    }
  }
}

/**
 * 1.13.0 — Groupe visuellement chart+table partageant le même source_id.
 * Le back 0.25.1 émet un chart suivi de sa table compagnon avec le MÊME
 * `source_id = result_id`. On les rend alors dans un conteneur commun
 * (bordure + espace) pour signaler leur lien ; le reste est rendu
 * individuellement.
 */
function GroupedBlocks({ blocks }: { blocks: Block[] }) {
  const groups = useMemo(() => {
    type Group =
      | { kind: "pair"; primary: Block; table: Block }
      | { kind: "single"; block: Block };
    const out: Group[] = [];
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i] as Block;
      const nxt = i + 1 < blocks.length ? (blocks[i + 1] as Block) : null;
      // 1.13.0 — chart + table partageant le même source_id.
      // 1.14.0 — map + table partageant le même source_id (BlockMap /
      // map_metric émet une table compagnon sous la carte).
      const canPair =
        !!nxt &&
        nxt.type === "table" &&
        (b.type === "chart" || b.type === "map") &&
        b.source_id === nxt.source_id;
      if (canPair) {
        out.push({ kind: "pair", primary: b, table: nxt! });
        i += 2;
        continue;
      }
      out.push({ kind: "single", block: b });
      i += 1;
    }
    return out;
  }, [blocks]);

  return (
    <div className="space-y-4">
      {groups.map((g, idx) =>
        g.kind === "pair" ? (
          <section
            key={idx}
            className="rounded-md border bg-card p-3 space-y-3"
            data-source-id={
              (g.primary as Extract<Block, { type: "chart" | "map" }>).source_id
            }
            aria-label={(g.primary as Extract<Block, { type: "chart" | "map" }>).heading}
          >
            <BlockView b={g.primary} />
            <BlockView b={g.table} />
          </section>
        ) : (
          <BlockView key={idx} b={g.block} />
        ),
      )}
    </div>
  );
}

export function ResponseCard({
  r,
  onFollowUp,
  onRetry,
}: {
  r: AssistantResponse;
  onFollowUp: (q: string) => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (r.status === "cancelled")
    return (
      <p className="text-xs italic text-muted-foreground">
        Analyse annulée.{" "}
        <button onClick={onRetry} className="text-primary underline">
          Relancer
        </button>
      </p>
    );
  if (r.status === "failed")
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-xs"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
        <div>
          <p className="font-medium">Échec de l'analyse</p>
          <p className="text-muted-foreground">{r.error?.message}</p>
          <button
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-muted"
          >
            <RotateCw className="h-3 w-3" /> Réessayer
          </button>
        </div>
      </div>
    );
  const text = r.blocks
    .flatMap((b) =>
      b.type === "text"
        ? [b.heading, ...b.claims.map((c) => `[${c.kind}] ${c.text}`)]
        : b.type === "table"
          ? [b.heading, toCsv(b)]
          : [b.heading],
    )
    .join("\n");
  return (
    <article className="space-y-4" aria-label="Réponse de l'assistant">
      <div className="flex flex-wrap items-center gap-2">
        {r.demo && <DemoBadge />}
        <span className="font-mono text-[10px] text-muted-foreground">scénario {r.scenario}</span>
      </div>
      {r.warnings.length > 0 && (
        <ul className="space-y-1" aria-label="Avertissements">
          {r.warnings.map((w) => (
            <li
              key={w}
              className="flex items-start gap-2 rounded-md bg-warning px-2.5 py-1.5 text-xs text-warning-foreground"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
      <GroupedBlocks blocks={r.blocks} />

      {r.evidence.length > 0 && (
        <section aria-label="Sources">
          <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold">
            <Database className="h-3.5 w-3.5" /> Sources ({r.evidence.length})
          </h4>
          <ul className="space-y-1 text-[11px]">
            {r.evidence.map((e) => (
              <li key={e.source_id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className="font-mono text-foreground"
                  title={`result_id = ${e.source_id}`}
                  data-source-id={e.source_id}
                >
                  {e.source_id}
                </span>
                <span className="text-muted-foreground">{e.label}</span>
                <span className="text-muted-foreground">
                  · n = <span className="font-mono text-foreground">{fmtNum(e.sample_count)}</span>
                </span>
                <span className="text-muted-foreground">· {e.aggregation}</span>
                <span className="text-muted-foreground">
                  · {e.period.start} → {e.period.end}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {r.follow_ups.map((q) => (
          <button
            key={q}
            onClick={() => onFollowUp(q)}
            className="rounded-full border px-2.5 py-1 text-[11px] text-primary hover:bg-accent"
          >
            {q}
          </button>
        ))}
        <span className="ml-auto flex gap-0.5">
          <button
            aria-label="Copier la réponse"
            onClick={() => {
              void navigator.clipboard?.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            aria-label="Exporter la réponse (JSON)"
            onClick={() =>
              download(
                `bc4_assistant_${r.message_id}.json`,
                JSON.stringify(r, null, 2),
                "application/json",
              )
            }
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label="Relancer"
            onClick={onRetry}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
    </article>
  );
}
