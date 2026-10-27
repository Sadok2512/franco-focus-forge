import { rfProtocolColors } from "@/theme/rf-timeline";
import { useTranslation } from "react-i18next";
import { RfTimeline } from "./RfTimeline";
import { EventRibbon } from "./EventRibbon";
import { revealRow } from "./reveal-row";
import { followMessage, FULL_CAPTURE_S, useTimeWindow, type TimeWindow } from "./time-window";
import { TimeNavigator } from "./TimeNavigator";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { emptyCursor, eventMessage, type TimelineCursorState } from "./cursor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts } from "echarts";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { getSignaling, getAllSignalingRows, getMetricSeries } from "@/lib/api/client";
import type { SignalingTimeline, SignalingPoints, SignalingLine } from "@/lib/api/signaling";
import { useCaptureContext, setCaptureContext } from "@/lib/capture-context";
import { KpiMapOSM } from "@/features/kpi/KpiMapOSM";
import { DriveRsrpLayer } from "@/features/kpi/DriveRsrpLayer";
import { rsrpPositionsFrom } from "@/features/kpi/drive-rsrp";
import { selectSignalingCapture } from "./capture-selection";

import { Group, Panel, Separator } from "react-resizable-panels";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  Activity,
  ActivitySquare,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleX,
  Clock,
  Columns3,
  Download,
  Eye,
  FilterX,

  Gauge,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  Maximize,
  Minimize,
  RadioTower,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useElementFullscreen } from "@/lib/element-fullscreen";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DecoderTree } from "./DecoderTree";
import { DecodePanel } from "@/features/projects/DecodePanel";
import { provenStates } from "./state-evidence";
import {
  COLUMNS,
  COLUMNS_STORAGE_KEY,
  MANDATORY_COLS,
  defaultColumns,
  messageInfo,
  moveColumn,
  pageItems,
  parseColumns,
  radioAt,
  rrcStateAt,
  toggleColumn,
  visibleColumns,
  knownOrder,
  type ColKey,
  type ColumnConfig,
  type MessageInfo,
} from "./message-columns";
import { SignalingFilters } from "./SignalingFilters";
import {
  filterMessageRows,
  messageTypes,
  messagePage,
  messageRowsCsv,
  reconcileMessageSelection,
  type MessageSelection,
} from "./message-filter";
import "./signaling.css";

const layers = ["RRC LTE", "RRC NR", "NAS", "Événements Nemo", "MAC-RACH"];
const colors = layers.map((layer) => rfProtocolColors[layer]!);
const shown = (value: unknown) => (value === null || value === undefined ? "—" : String(value));

// V10 column catalog lives in message-columns.ts (catalog, persistence, Info/RRC/radio rules).

// 1.61.0 — Badges couleur par couche. Spec §5 : RRC LTE bleu, RRC NR
// violet, NAS orange, Événements Nemo cyan, MAC-RACH vert. Mapping sur
// les slugs servis par le back (layer) et sur les étiquettes françaises
// (protocol) pour compat avec les lignes anciennes.
const LAYER_BADGE: Record<string, { label: string; className: string }> = {
  "RRC LTE": {
    label: "RRC LTE",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  },
  "RRC NR": {
    label: "RRC NR",
    className: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  },
  NAS: {
    label: "NAS",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
  },
  "Événements Nemo": {
    label: "Nemo",
    className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200",
  },
  "MAC-RACH": {
    label: "MAC-RACH",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  },
};
function layerBadge(protocol: string | null | undefined) {
  if (!protocol) return <span className="text-muted-foreground">—</span>;
  const b = LAYER_BADGE[protocol];
  if (!b) return <span>{protocol}</span>;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${b.className}`}>
      {b.label}
    </span>
  );
}

// 1.55.0 — Directional badge. Spec §5 : UL = ↑ vert, DL = ↓ bleu, inconnu = —.
// Jamais déduire du nom du message : on lit uniquement row.direction retourné
// par le back. null/undefined → — (pas d'inversion ni d'invention).
function directionBadge(direction: string | null | undefined) {
  if (direction === "UL")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <ArrowUp size={12} aria-hidden="true" />
        UL
      </span>
    );
  if (direction === "DL")
    return (
      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
        <ArrowDown size={12} aria-hidden="true" />
        DL
      </span>
    );
  return <span className="text-muted-foreground">—</span>;
}

// 1.56.0 (V3 LOT 3) — « Détails » tab. Reprend tout ce qui était affiché
// au-dessus du payload en 1.55.0 (ECGI, PCI, eNB/gNB, Secteur, GPS, radio
// context + sources et limites). Zéro nouveau fetch — tout vient des
// queries déjà faites par SignalingPage.
type SelectedLike = {
  protocol?: string | undefined;
  direction?: string | null | undefined;
  ecgi?: string | null | undefined;
  pci?: number | null | undefined;
  size_bytes?: number | null | undefined;
  t_rel_s?: number | null | undefined;
};
type RadioVal = {
  value: number | null;
  unit: string;
  source: string;
  seq: number | null;
  seq_gap: number | null;
  time_gap_s?: number | null | undefined;
  temporal_relation?: string | undefined;
  reason?: string | null | undefined;
};
type ContextQuery = {
  isPending: boolean;
  isError: boolean;
  data?:
    | {
        ecgi?: string | null;
        enb_gnb_id?: string | null;
        sector?: string | null;
        identity_reason?: string;
        radio?: Record<string, RadioVal>;
      }
    | undefined;
  refetch: () => unknown;
};
function DetailsPanel({
  selected,
  seq,
  context,
  position,
  pointsData,
  detailsResultId,
  treeSource,
  treeRouteGap,
}: {
  selected: SelectedLike | undefined;
  seq: number;
  context: ContextQuery;
  position?:
    | { lat: number | null; lng: number | null; gps_seq: number | null; seq_gap: number | null }
    | undefined;
  pointsData: unknown;
  detailsResultId?: string | undefined;
  treeSource?: string | undefined;
  treeRouteGap?: string | undefined;
}) {
  return (
    <div className="space-y-3 text-xs" data-testid="inspector-details">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
        {Object.entries({
          seq,
          Temps: `${timeShown(selected?.t_rel_s)} s`,
          Direction: shown(selected?.direction),
          Couche: shown(selected?.protocol),
          ECGI: context.data?.ecgi ?? selected?.ecgi,
          "PCI message": selected?.pci,
          "Taille (octets)": selected?.size_bytes,
          "eNB/gNB": context.data?.enb_gnb_id,
          Secteur: context.data?.sector,
          "GPS précédent":
            position?.lat != null && position?.lng != null
              ? `${position.lat}, ${position.lng}`
              : null,
        }).map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="break-all font-mono">{shown(v)}</dd>
          </div>
        ))}
      </dl>
      {context.isPending && <p role="status">Chargement du contexte radio…</p>}
      {context.isError && (
        <p role="alert">
          Contexte radio indisponible.{" "}
          <button onClick={() => void context.refetch()}>Réessayer</button>
        </p>
      )}
      {pointsData != null && (position?.lat == null || position?.lng == null) && (
        <p role="status">Aucune position GPS prouvée pour ce message.</p>
      )}
      {position?.lat != null && position?.lng != null && (
        <p className="text-muted-foreground">
          GPS précédent · seq {shown(position.gps_seq)} · Δseq {shown(position.seq_gap)}. Position
          exacte du message non prouvée ; repère pointillé sur la carte.
        </p>
      )}
      <h3 className="border-t pt-2 font-semibold">Contexte radio précédent</h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {Object.entries(context.data?.radio ?? {}).map(([name, v]) => (
          <div key={name} title={v.reason ?? `${v.source}, seq ${shown(v.seq)}`}>
            <span className="text-muted-foreground">
              {name === "pci"
                ? "PCI précédent"
                : name === "band"
                  ? "Bande"
                  : name === "speed"
                    ? "Vitesse"
                    : name === "bler_mac"
                      ? "BLER MAC"
                      : name.toUpperCase()}
            </span>
            <div>
              {radioShown(v.value, v.unit)} {v.unit}
            </div>
            <small>
              Δseq : {shown(v.seq_gap)} · Δt : {timeShown(v.time_gap_s)}
              {v.time_gap_s == null ? "" : " s"}
            </small>
            <div className="text-xs text-muted-foreground">
              {v.temporal_relation === "same_timestamp"
                ? "Précédente en séquence · même horodatage"
                : v.seq == null
                  ? "Aucune mesure précédente"
                  : "Mesure précédente"}
            </div>
            <div className="truncate text-[10px] text-muted-foreground" title={v.source}>
              Source : {v.source}
            </div>
          </div>
        ))}
      </div>
      <details className="max-h-24 overflow-auto border-t pt-1 text-muted-foreground">
        <summary>Sources et limites</summary>
        <p>{treeSource}</p>
        <p>{treeRouteGap}</p>
        <p>{context.data?.identity_reason}</p>
        <p>result_id : {detailsResultId}</p>
      </details>
    </div>
  );
}

// 1.57.0 (V3 LOT 4) — Call Flow réel. Appartenance prouvée via
// row.procedure_ids + /signaling?procedure=<id>. Aucune proximité
// temporelle utilisée. Spec §11.5 : « Afficher les messages de sa
// procédure lorsque l'appartenance est prouvée. Sinon, afficher une
// fenêtre chronologique bornée autour du message, clairement identifiée
// comme telle. » Ici j'affiche l'appartenance stricte ; la fenêtre
// chronologique reste accessible via la liste principale et sera
// ajoutée explicitement si demandé (pas d'invention).
function CallFlowPanel({
  projectId,
  captureId,
  selected,
  procedures,
  onSelect,
  seq,
}: {
  projectId: string;
  captureId: string | undefined;
  selected:
    | {
        procedure_ids?: string[];
        technology?: string | null;
      }
    | undefined;
  procedures: {
    id: string;
    type: string;
    technology: string | null;
    duration_ms: number | null;
    outcome: string;
    cause: string | null;
    seq_start: number;
    seq_end: number | null;
  }[];
  onSelect: (seq: number) => void;
  seq: number;
}) {
  const procedureId = selected?.procedure_ids?.[0] ?? null;
  const procedure = procedures.find((p) => p.id === procedureId) ?? null;
  const technology = selected?.technology ?? procedure?.technology ?? null;
  const peerLabel = technology === "NR" ? "gNB" : technology === "LTE" ? "eNB" : "Réseau";

  const callFlow = useQuery({
    queryKey: ["signaling-callflow", projectId, captureId, procedureId],
    enabled: !!captureId && !!procedureId,
    queryFn: ({ signal }) =>
      getSignaling(
        projectId,
        "rows",
        { capture_id: captureId, procedure: procedureId!, size: 500 },
        signal,
      ),
  });

  if (!procedureId) {
    return (
      <div className="rounded bg-muted p-3 text-xs" data-testid="callflow-no-procedure">
        <strong>Pas de procédure prouvée pour ce message.</strong>
        <p className="mt-1 text-muted-foreground">
          Spec §11.5 : seule l'appartenance prouvée via `procedure_ids` est acceptée. Pour explorer
          la chronologie autour du message, utiliser la liste principale (brosse timeline, filtres).
        </p>
      </div>
    );
  }
  if (callFlow.isPending) return <p role="status">Chargement du Call Flow…</p>;
  if (callFlow.isError)
    return (
      <p role="alert">
        Call Flow indisponible. <button onClick={() => void callFlow.refetch()}>Réessayer</button>
      </p>
    );
  const rows = (callFlow.data?.rows ?? []).slice().sort((a, b) => a.seq - b.seq);
  if (!rows.length)
    return (
      <p role="status" className="rounded bg-muted p-3 text-xs">
        Aucun message prouvé pour cette procédure.
      </p>
    );

  const outcomeBadge = (outcome: string) => {
    const map: Record<string, { label: string; className: string }> = {
      ok: { label: "Normal", className: "bg-emerald-100 text-emerald-800" },
      fail: { label: "Échec", className: "bg-red-100 text-red-800" },
      incomplete: { label: "Incomplet", className: "bg-amber-100 text-amber-800" },
    };
    const b = map[outcome] ?? { label: outcome, className: "bg-muted" };
    return (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.className}`}>
        {b.label}
      </span>
    );
  };

  return (
    <div className="space-y-2 text-xs" data-testid="callflow-panel">
      <header className="flex flex-wrap items-center gap-2 border-b pb-2">
        <span className="font-semibold">{procedure?.type ?? "Procédure"}</span>
        <span className="text-muted-foreground">
          UE ↔ {peerLabel} · seq {procedure?.seq_start}
          {procedure?.seq_end ? ` → ${procedure.seq_end}` : ""}
        </span>
        {procedure && outcomeBadge(procedure.outcome)}
        {procedure?.duration_ms != null && (
          <span className="text-muted-foreground">durée {procedure.duration_ms.toFixed(1)} ms</span>
        )}
        {procedure?.cause && (
          <span className="text-red-600" title={procedure.cause}>
            cause: {procedure.cause}
          </span>
        )}
      </header>
      <div className="grid gap-y-1 py-1" style={{ gridTemplateColumns: "60px 1fr 60px" }}>
        <div className="pb-1 text-center font-semibold text-muted-foreground">UE</div>
        <div></div>
        <div className="pb-1 text-center font-semibold text-muted-foreground">{peerLabel}</div>
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1] : null;
          const dt =
            prev && prev.t_rel_s != null && r.t_rel_s != null
              ? (r.t_rel_s - prev.t_rel_s) * 1000
              : null;
          const isSelected = r.seq === seq;
          return (
            <CallFlowArrow
              key={r.seq}
              row={r}
              peerLabel={peerLabel}
              dtMs={dt}
              selected={isSelected}
              onSelect={onSelect}
            />
          );
        })}
      </div>
      <footer className="border-t pt-2 text-[10px] text-muted-foreground">
        Appartenance prouvée via `procedure_ids` servi par /signaling. Les délais Δt sont calculés
        depuis `t_rel_s` back ; aucun délai inventé.
      </footer>
    </div>
  );
}

function CallFlowArrow({
  row,
  peerLabel,
  dtMs,
  selected,
  onSelect,
}: {
  row: {
    seq: number;
    t_rel_s: number | null;
    direction: string | null;
    layer?: string | undefined;
    protocol?: string | undefined;
    message_name: string;
    size_bytes: number | null;
  };
  peerLabel: string;
  dtMs: number | null;
  selected: boolean;
  onSelect: (seq: number) => void;
}) {
  const dir = row.direction;
  const isUL = dir === "UL";
  const isDL = dir === "DL";
  const color = isUL
    ? "text-emerald-600 dark:text-emerald-400"
    : isDL
      ? "text-blue-600 dark:text-blue-400"
      : "text-muted-foreground";
  // Arrow direction: UL = UE → peer (right), DL = peer → UE (left).
  const arrow = isUL ? "→" : isDL ? "←" : "—";
  const metaLine = (
    <>
      <span className={`font-mono text-[10px] ${color}`}>
        {dir ?? "—"} #{row.seq}
      </span>
      {row.size_bytes != null && (
        <span className="ml-1 text-[10px] text-muted-foreground">· {row.size_bytes} B</span>
      )}
      {row.protocol && (
        <span className="ml-1 text-[10px] text-muted-foreground">· {row.protocol}</span>
      )}
    </>
  );
  return (
    <>
      <div
        className={`col-span-3 cursor-pointer rounded p-1 ${selected ? "bg-primary/15" : "hover:bg-accent"}`}
        onClick={() => onSelect(row.seq)}
        data-testid={`callflow-arrow-${row.seq}`}
      >
        <div className="grid items-center" style={{ gridTemplateColumns: "60px 1fr 60px" }}>
          <div className="text-center text-[10px]">{isUL ? "●" : ""}</div>
          <div className="text-center">
            <div className={`${color} font-mono text-sm`}>{arrow}</div>
            <div className="truncate font-semibold">{row.message_name}</div>
          </div>
          <div className="text-center text-[10px]">{isDL ? "●" : ""}</div>
        </div>
        <div className="mt-0.5 text-center">
          {metaLine}
          {row.t_rel_s != null && (
            <span className="ml-1 text-[10px] text-muted-foreground">
              · t={row.t_rel_s.toFixed(3)}s
            </span>
          )}
          {dtMs != null && (
            <span className="ml-1 text-[10px] text-muted-foreground">
              · Δt={dtMs.toFixed(1)} ms
            </span>
          )}
        </div>
      </div>
    </>
  );
}

type RowLike = {
  message_name: string;
  procedure_ids: string[];
};
type ProcLike = {
  id: string;
  type: string;
  duration_ms: number | null;
  outcome: string;
};
function messageCell(row: RowLike, procedures: ProcLike[]) {
  return (
    <>
      {row.message_name}
      {row.procedure_ids.map((id) => {
        const p = procedures.find((q) => q.id === id);
        return p ? (
          <div key={id} className="text-[10px] text-muted-foreground">
            {p.type} · {p.duration_ms ?? "—"} ms · {p.outcome}
          </div>
        ) : null;
      })}
    </>
  );
}
const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const fmtRadio = (n: number) => (n < 0 ? `−${Math.abs(n).toFixed(1)}` : n.toFixed(1));

const INFO_ICONS = {
  setup: LogIn,
  release: LogOut,
  scg: RadioTower,
  handover: ArrowLeftRight,
  measurement: Gauge,
  other: Activity,
} as const;
function InfoBadge({ info }: { info: MessageInfo | null }) {
  if (!info) return <span className="text-muted-foreground">—</span>;
  const Icon =
    info.role === "error" ? CircleX : info.role === "success" ? CircleCheck : INFO_ICONS[info.kind];
  return (
    <span className={`sig-info sig-info-${info.role}`} title={`${info.label} · ${info.outcome}`}>
      <Icon size={12} aria-hidden="true" />
      <span className="truncate">{info.label}</span>
    </span>
  );
}

/** Compact summary of leaf values actually decoded (first named fields only). */
function DecodedValues({
  parameters,
}: {
  parameters: {
    path: string;
    value?: unknown;
    param_key: string | null;
    redacted_reason?: string | null | undefined;
  }[];
}) {
  const rows = parameters
    .filter(
      (p) => p.value !== undefined && !p.redacted_reason && !String(p.value).startsWith("<binary"),
    )
    .slice(0, 10);
  if (!rows.length) return null;
  return (
    <section className="sig-decoded shrink-0 border-t pt-2" data-testid="decoded-values">
      <h3 className="mb-1 text-xs font-semibold">Decoded values</h3>
      <table className="w-full">
        <tbody>
          {rows.map((p, i) => (
            <tr key={`${p.path}:${i}`}>
              <th scope="row" title={p.path}>
                {p.param_key ?? p.path.split("/").slice(-1)[0]}
              </th>
              <td>{typeof p.value === "string" ? p.value : JSON.stringify(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {parameters.length > rows.length && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {rows.length} / {parameters.length} — liste complète dans « Paramètres »
        </p>
      )}
    </section>
  );
}

const timeShown = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(3));
const radioShown = (value: number | null | undefined, unit: string) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: unit === "km/h" ? 1 : 2 }).format(
        value,
      );

function Timeline({
  data,
  onRange,
  selectedTime,
  timeWindow,
  duration,
}: {
  timeWindow: TimeWindow;
  duration: number;
  data: SignalingTimeline;
  selectedTime: number | null;
  onRange: (range: [number, number] | undefined) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<ECharts | undefined>(undefined);
  const view = useRef({ timeWindow, duration });
  view.current = { timeWindow, duration };
  useEffect(() => {
    instance.current?.dispatchAction(
      { type: "dataZoom", startValue: timeWindow[0], endValue: timeWindow[1] },
      { silent: true },
    );
  }, [timeWindow[0], timeWindow[1]]);
  const time = useRef(selectedTime);
  time.current = selectedTime;
  const drawCursor = useCallback(() => {
    instance.current?.setOption({
      series: [
        {
          id: "selection",
          type: "line",
          data: [],
          markLine: {
            symbol: "none",
            silent: true,
            lineStyle: { color: "#dc2626", width: 2 },
            data: time.current === null ? [] : [{ xAxis: time.current }],
          },
        },
      ],
    });
  }, []);
  useEffect(drawCursor, [selectedTime, drawCursor]);
  const callback = useRef(onRange);
  callback.current = onRange;
  useEffect(() => {
    let chart: ECharts | undefined;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    void import("echarts").then((e) => {
      if (disposed || !host.current) return;
      chart = e.init(host.current);
      instance.current = chart;
      chart.setOption({
        animation: false,
        tooltip: { trigger: "axis" },
        legend: { top: 0, left: "center", data: layers, textStyle: { color: "#64748b" } },
        grid: { left: 48, right: 20, top: 40, bottom: 42 },
        xAxis: {
          min: 0,
          max: view.current.duration,
          type: "value",
          name: "Temps capture (s)",
          nameLocation: "middle",
          nameGap: 26,
        },
        yAxis: { type: "value", name: "Messages" },
        dataZoom: [
          {
            type: "inside",
            xAxisIndex: 0,
            disabled: true,
            startValue: view.current.timeWindow[0],
            endValue: view.current.timeWindow[1],
          },
        ],
        brush: { xAxisIndex: 0, brushType: "lineX", toolbox: [] },
        toolbox: { show: false },
        series: layers.map((name, i) => ({
          id: name,
          name,
          type: "bar",
          stack: "protocol",
          barMaxWidth: 8,
          itemStyle: { color: colors[i] },
          data: data.buckets.map((b) => [b.t_rel_s, b.counts[name]]),
        })),
      });
      drawCursor();
      chart.on("brushEnd", (event: unknown) => {
        const area = (event as { areas?: { coordRange?: number[] }[] }).areas?.[0]?.coordRange;
        callback.current(area?.length === 2 ? [area[0]!, area[1]!] : undefined);
      });
      chart.dispatchAction({
        type: "takeGlobalCursor",
        key: "brush",
        brushOption: { brushType: "lineX" },
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(host.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
      instance.current = undefined;
    };
  }, [data, drawCursor]);
  return (
    <div
      ref={host}
      className="h-full min-h-0 flex-1"
      data-testid="signaling-timeline"
      data-selected-time={selectedTime ?? undefined}
      aria-label="Histogramme temporel, glisser pour filtrer"
    />
  );
}

function SignalMap({
  data,
  onSelect,
  selectedSeq,
  projectId,
  captureId,
}: {
  data: SignalingPoints;
  onSelect: (seq: number) => void;
  selectedSeq: number | undefined;
  projectId: string;
  captureId: string;
}) {
  const [map, setMap] = useState<MlMap>();
  const ready = useCallback((m: MlMap) => setMap(m), []);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  /** Positions the server already published for this capture, so an RSRP row
   * without its own GPS can still be drawn at its exact sequence. */
  const rsrpPositions = useMemo(() => rsrpPositionsFrom(data.points, data.markers), [data]);
  useEffect(() => {
    if (!map) return;
    let disposed = false;
    const render = async () => {
      const ml = await import("maplibre-gl");
      if (disposed || !map.isStyleLoaded()) return;
      const features: FeatureCollection = {
        type: "FeatureCollection",
        features: data.markers
          .filter((p) => p.lat !== null && p.lng !== null)
          .map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng!, p.lat!] },
            properties: {
              seq: p.seq,
              time: timeShown(p.t_rel_s),
              protocol: p.protocol,
              color: colors[layers.indexOf(p.protocol)] ?? "#64748b",
              counts: JSON.stringify(p.counts),
            },
          })),
      };
      const route: FeatureCollection = {
        type: "FeatureCollection",
        features:
          features.features.length > 1
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: data.markers
                      .filter((p) => p.lat !== null && p.lng !== null)
                      .map((p) => [p.lng!, p.lat!]),
                  },
                },
              ]
            : [],
      };
      const routeSource = map.getSource("signaling-route") as GeoJSONSource | undefined;
      if (routeSource) routeSource.setData(route);
      else {
        map.addSource("signaling-route", { type: "geojson", data: route });
        map.addLayer({
          id: "signaling-route-line",
          type: "line",
          source: "signaling-route",
          paint: { "line-color": "#64748b", "line-width": 2, "line-opacity": 0.5 },
        });
      }
      const source = map.getSource("signaling") as GeoJSONSource | undefined;
      if (source) source.setData(features);
      else {
        map.addSource("signaling", { type: "geojson", data: features });
        map.addLayer({
          id: "signaling-points",
          type: "circle",
          source: "signaling",
          paint: {
            "circle-radius": 5,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-color": ["get", "color"],
          },
        });
      }
      const coordinates = data.markers.filter((p) => p.lat !== null && p.lng !== null);
      if (coordinates.length) {
        const bounds = new ml.LngLatBounds();
        coordinates.forEach((p) => bounds.extend([p.lng!, p.lat!]));
        map.fitBounds(bounds, { padding: 35, maxZoom: 16, duration: 0 });
      }
    };
    if (map.isStyleLoaded()) void render();
    else map.once("load", render);
    const click = (e: import("maplibre-gl").MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["signaling-points"] })[0];
      if (!f) return;
      callback.current(Number(f.properties["seq"]));
      void import("maplibre-gl").then((ml) => {
        if (disposed) return;
        const el = document.createElement("div");
        const counts = JSON.parse(String(f.properties["counts"])) as Record<string, number>;
        el.textContent = `${f.properties["time"]} s · ${Object.entries(counts)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")}`;
        new ml.Popup().setLngLat(e.lngLat).setDOMContent(el).addTo(map);
      });
    };
    map.on("click", "signaling-points", click);
    return () => {
      disposed = true;
      map.off("load", render);
      map.off("click", "signaling-points", click);
    };
  }, [map, data]);
  useEffect(() => {
    if (!map) return;
    let marker: import("maplibre-gl").Marker | undefined;
    let cancelled = false;
    const point = data.points.find((p) => p.seq === selectedSeq);
    if (
      point?.lat !== null &&
      point?.lat !== undefined &&
      point.lng !== null &&
      point.seq_gap === 0 &&
      point.gps_seq === point.seq
    ) {
      void import("maplibre-gl").then((ml) => {
        if (cancelled) return;
        const el = document.createElement("div");
        el.dataset["testid"] = "selected-gps";
        el.dataset["seq"] = String(selectedSeq);
        el.title = `GPS · seq ${point.gps_seq}`;
        el.style.cssText =
          "width:18px;height:18px;border:3px solid var(--signaling-cursor);border-radius:50%;pointer-events:none;background:transparent";
        marker = new ml.Marker({ element: el }).setLngLat([point.lng!, point.lat!]).addTo(map);
      });
    }
    return () => {
      cancelled = true;
      marker?.remove();
    };
  }, [map, data, selectedSeq]);
  if (data.indoor)
    return (
      <div
        role="status"
        className="flex h-full items-center justify-center rounded border bg-muted text-sm"
      >
        plan {data.floorplan_id ?? "non renseigné"}, pas de position
      </div>
    );
  // 1.65.0 — Spec §4 : « Si la position n'est pas disponible, afficher
  // une indication discrète sans inventer de point. » Au lieu d'un bloc
  // texte brut, on affiche la carte OSM centrée sur la France (centroid
  // 2.4/46.6) + bandeau en overlay. L'utilisateur voit bien la carte.
  const hasMarkers = data.markers.length > 0;
  // Paris centre, zoom 10 : reconnaissable visuellement sans inventer de
  // position par capture (spec §4). Pas de centroid France (46.6 → Atlantique
  // moyen, visuellement vide).
  const center: [number, number] = hasMarkers
    ? [data.markers[0]!.lng!, data.markers[0]!.lat!]
    : [2.35, 48.85];
  const zoom = hasMarkers ? 13 : 10;
  // 1.66.0 — key force le remount de KpiMapOSM quand le centre/zoom change.
  // Sans ça, le composant garde la position de la capture précédente car son
  // useEffect d'init a [] en deps (voir KpiMapOSM.tsx:71-122).
  const mapKey = hasMarkers
    ? `markers-${data.markers[0]!.lat!.toFixed(3)}-${data.markers[0]!.lng!.toFixed(3)}`
    : "empty";
  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden rounded border [&>div]:h-full">
      <KpiMapOSM
        key={mapKey}
        center={center}
        zoom={zoom}
        onMapReady={ready}
        workspace
        showOperatorLegend={false}
        contextLabel="Signalisation"
        measurementStatus={null}
        nPoints={data.positioned_count}
      >
        <DriveRsrpLayer
          map={map ?? null}
          projectId={projectId}
          activeCaptureId={captureId}
          autoFrame
          positions={rsrpPositions}
        />
      </KpiMapOSM>
      {!hasMarkers && (
        <span
          role="status"
          className="pointer-events-none absolute bottom-16 left-1/2 z-30 inline-block max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs shadow"
        >
          Aucun GPS précédent prouvé dans cette capture
        </span>
      )}
    </div>
  );
}

export function SignalingPage({
  projectId,
  initialCapture,
  initialSeq,
  stateTracksV2 = false,
}: {
  projectId: string;
  initialCapture?: string | undefined;
  initialSeq?: number | undefined;
  stateTracksV2?: boolean;
}) {
  const { t } = useTranslation();
  const [compact, setCompact] = useState(false);
  // 1.72.0 (BC3) — Vue timeline : ribbon (BC3 lanes), rf (BC2), compact (histogram).
  // Défaut = ribbon (addendum spec signaling_timeline.html).
  const [timelineView, setTimelineView] = useState<"ribbon" | "rf" | "compact">("rf");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  // 1.54.0 (V3 LOT 1) — sidebar filtres repliable. État distinct de la
  // sélection message (P0 1.50.1) : jamais inclus dans les clés React
  // Query, jamais utilisé comme déclencheur de refetch.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const filtersPanelRef = useRef<PanelImperativeHandle>(null);
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    if (next) filtersPanelRef.current?.collapse();
    else filtersPanelRef.current?.expand();
  };
  // V10 — column visibility + order, persisted locally; never part of a query key.
  const [colConfig, setColConfig] = useState<ColumnConfig>(() =>
    typeof window === "undefined"
      ? defaultColumns()
      : parseColumns(window.localStorage.getItem(COLUMNS_STORAGE_KEY)),
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(colConfig));
    } catch {
      /* storage unavailable: keep session config */
    }
  }, [colConfig]);
  const shownCols = visibleColumns(colConfig);
  // Inspector tab state is independent of selection and of every query key.
  type InspectorTab = "Payload" | "Paramètres" | "Call Flow" | "Détails" | "Hexadécimal";
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("Payload");
  // 1.58.0 (V3 LOT 5) — Toggle Carte ON/OFF, session-local useState.
  // Jamais inclus dans un queryKey (ne déclenche aucun refetch des points).
  // Panel map garde la même instance mountée (collapsedSize=0) pour éviter
  // le bug react-resizable-panels de remount dynamique.
  const [mapVisible, setMapVisible] = useState(true);
  const [timelineVisible, setTimelineVisible] = useState(true);
  const mapPanelRef = useRef<PanelImperativeHandle>(null);
  const timelinePanelRef = useRef<PanelImperativeHandle>(null);
  const overviewPanelRef = useRef<PanelImperativeHandle>(null);
  // Si les deux (timeline + map) sont OFF, on replie aussi la rangée
  // « overview » entière pour libérer verticalement l'espace à l'inspecteur.
  const syncOverview = (nextMap: boolean, nextTimeline: boolean) => {
    if (!nextMap && !nextTimeline) overviewPanelRef.current?.collapse();
    else overviewPanelRef.current?.expand();
  };
  const toggleMap = () => {
    setMapVisible((prev) => {
      const next = !prev;
      if (next) mapPanelRef.current?.expand();
      else mapPanelRef.current?.collapse();
      syncOverview(next, timelineVisible);
      return next;
    });
  };
  const toggleTimeline = () => {
    setTimelineVisible((prev) => {
      const next = !prev;
      if (next) timelinePanelRef.current?.expand();
      else timelinePanelRef.current?.collapse();
      syncOverview(mapVisible, next);
      return next;
    });
  };
  const [sharedCapture, setSharedCapture] = useCaptureContext(projectId);
  const [protocols, setProtocols] = useState(layers),
    [technology, setTechnology] = useState(""),
    [direction, setDirection] = useState(""),
    [search, setSearch] = useState(""),
    [procedure, setProcedure] = useState("");
  const [page, setPage] = useState(1),
    [size, setSize] = useState(100),
    [range, setRange] = useState<[number, number]>(),
    [seq, setSeq] = useState<number | undefined>(initialSeq),
    [sort, setSort] = useState("seq"),
    [order, setOrder] = useState("asc");
  const [hover, setHover] = useState<string[]>([]),
    [exportError, setExportError] = useState("");
  const [cursor, setCursor] = useState<TimelineCursorState>({
    ...emptyCursor,
    selectedTimeS: 0,
  });
  const [linkedMessages, setLinkedMessages] = useState<number[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<Partial<SignalingLine>>();
  const selectionCapture = useRef<string | undefined>(undefined);
  const caps = useQuery({
    queryKey: ["signaling-captures", projectId],
    queryFn: ({ signal }) => getSignaling(projectId, "captures", {}, signal),
  });
  const capture = selectSignalingCapture(caps.data?.captures ?? [], sharedCapture);
  const captureRadio = useQuery({
    queryKey: ["signaling-rf-radio", projectId, capture],
    enabled: !!capture,
    queryFn: ({ signal }) => {
      if (!capture) throw new Error("Capture unavailable");
      return getMetricSeries(projectId, capture, ["cell_rsrp", "cell_rsrq", "ci_rs_snr"], signal);
    },
    staleTime: 60000,
  });
  const captureDuration = captureRadio.data?.duration_s ?? 0;
  const { window: timeWindow, setWindow: setTimeWindow } = useTimeWindow(
    capture,
    captureDuration,
    stateTracksV2 ? 30 : FULL_CAPTURE_S,
  );
  useEffect(() => {
    if (initialCapture) setCaptureContext(projectId, initialCapture);
  }, [projectId, initialCapture]);
  useEffect(() => {
    if (capture && !sharedCapture) setCaptureContext(projectId, capture);
  }, [capture, sharedCapture, projectId]);
  const base = useMemo(
    () => ({
      capture_id: capture,
      protocols: protocols.join(","),
      technology: technology || undefined,
      direction: direction || undefined,
      q: search || undefined,
      procedure: procedure || undefined,
    }),
    [capture, protocols, technology, direction, search, procedure],
  );
  const filtered = useMemo(
    () => ({ ...base, from_s: range?.[0], to_s: range?.[1] }),
    [base, range],
  );
  const [messageSelection, setMessageSelection] = useState<MessageSelection>(null);
  const [catalogRequested, setCatalogRequested] = useState(false);
  const catalog = useQuery({
    queryKey: ["signaling-message-types", projectId, capture],
    enabled: !!capture && catalogRequested,
    queryFn: ({ signal }) =>
      getAllSignalingRows(projectId, { capture_id: capture, protocols: layers.join(",") }, signal),
    staleTime: Infinity,
    retry: false,
  });
  const types = useMemo(() => messageTypes(catalog.data?.rows ?? []), [catalog.data]);
  useEffect(() => {
    if (catalog.data) setMessageSelection((old) => reconcileMessageSelection(old, types));
  }, [catalog.data, types]);
  const selectedPopulation = useQuery({
    queryKey: ["signaling-message-population", projectId, filtered, sort, order],
    enabled: !!capture && messageSelection !== null && messageSelection.length > 0,
    queryFn: ({ signal }) => getAllSignalingRows(projectId, { ...filtered, sort, order }, signal),
    staleTime: 60000,
    retry: false,
  });
  const remoteListing = useQuery({
    queryKey: ["signaling", projectId, filtered, page, size, sort, order],
    enabled: !!capture && messageSelection === null,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "rows", { ...filtered, page, size, sort, order }, signal),
  });
  const selectedRows = useMemo(
    () => filterMessageRows(selectedPopulation.data?.rows ?? [], messageSelection),
    [selectedPopulation.data, messageSelection],
  );
  const listing =
    messageSelection === null
      ? remoteListing
      : {
          ...selectedPopulation,
          data:
            messageSelection.length === 0
              ? {
                  ...remoteListing.data,
                  ...messagePage([], page, size),
                  procedures: remoteListing.data?.procedures ?? [],
                  protocol_counts: remoteListing.data?.protocol_counts ?? {},
                }
              : selectedPopulation.data
                ? { ...selectedPopulation.data, ...messagePage(selectedRows, page, size) }
                : undefined,
          isFetching: messageSelection.length > 0 && selectedPopulation.isFetching,
        };
  const tableScroll = useRef<HTMLDivElement | null>(null);
  const messagesFs = useElementFullscreen<HTMLElement>();
  useEffect(() => {
    if (seq === undefined) return;
    const id = requestAnimationFrame(() => {
      if (tableScroll.current) revealRow(tableScroll.current, seq);
    });
    return () => cancelAnimationFrame(id);
  }, [seq, page, listing.data?.rows]);
  const timeline = useQuery({
    queryKey: ["signaling-timeline", projectId, base],
    enabled: !!capture && compact,
    queryFn: ({ signal }) => getSignaling(projectId, "timeline", base, signal),
  });
  // 1.52.0 — dedicated /signaling/procedures feed for the Procédure filter.
  // Independent of the paginated /signaling response; groups per type.
  const procedures = useQuery({
    queryKey: ["signaling-procedures", projectId, capture],
    enabled: !!capture,
    queryFn: ({ signal }) => getSignaling(projectId, "procedures", { capture_id: capture }, signal),
  });
  const points = useQuery({
    queryKey: ["signaling-points", projectId, filtered],
    enabled: !!capture,
    queryFn: ({ signal }) => getSignaling(projectId, "points", filtered, signal),
  });
  const context = useQuery({
    queryKey: ["signaling-context", projectId, capture, seq],
    staleTime: 60000,
    enabled: !!capture && seq !== undefined,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "context", { capture_id: capture, seq }, signal),
  });
  const details = useQuery({
    queryKey: ["signaling-details", projectId, capture, seq],
    staleTime: 60000,
    enabled: !!capture && seq !== undefined,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "details", { capture_id: capture, seq }, signal),
  });
  const initialMessage = useQuery({
    queryKey: ["signaling-initial-message", projectId, capture, initialSeq],
    enabled: !!capture && capture === initialCapture && initialSeq !== undefined,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "rows", { capture_id: capture, seq: initialSeq, size: 1 }, signal),
    staleTime: Infinity,
  });
  const selected =
    selectedRecord?.capture_id === capture && selectedRecord?.seq === seq
      ? selectedRecord
      : (listing.data?.rows.find((r) => r.seq === seq) ??
        initialMessage.data?.rows.find((r) => r.seq === seq));
  useEffect(() => {
    if (selectionCapture.current && selectionCapture.current !== capture) {
      setSeq(undefined);
      setSelectedRecord(undefined);
      setCursor({ ...emptyCursor, selectedTimeS: 0 });
      setLinkedMessages([]);
    }
    selectionCapture.current = capture;
  }, [capture]);
  // Message identity/time changes may follow; cursor previews and window drags never do.
  useEffect(() => {
    if (seq === undefined || selected?.t_rel_s == null || captureDuration <= 0) return;
    setTimeWindow(followMessage(timeWindow, selected.t_rel_s, captureDuration));
  }, [seq, selected?.t_rel_s, captureDuration, setTimeWindow]);
  const position = points.data?.points.find((p) => p.seq === seq);
  // Same key and params as RfTimeline: one cached request feeds both the
  // timeline bands and the RRC State column (no extra API call).
  const stateEvents = useQuery({
    queryKey: ["signaling-rf", projectId, capture, technology, direction, search],
    enabled: !!capture,
    queryFn: ({ signal }) =>
      getSignaling(
        projectId,
        "events",
        {
          capture_id: capture,
          view: "rf",
          technology: technology || undefined,
          direction: direction || undefined,
          q: search || undefined,
        },
        signal,
      ),
    staleTime: 60000,
  });
  const provenRrc = useMemo(
    () => (capture ? provenStates(stateEvents.data?.events ?? [], capture) : []),
    [stateEvents.data, capture],
  );
  const radioSeries = useMemo(() => {
    const byCode = (code: string) =>
      [...(captureRadio.data?.series.find((s) => s.code === code)?.points ?? [])].sort(
        (a, b) => a.t_rel_s - b.t_rel_s || a.seq - b.seq,
      );
    return { rsrp: byCode("cell_rsrp"), rsrq: byCode("cell_rsrq"), sinr: byCode("ci_rs_snr") };
  }, [captureRadio.data]);
  const filtersActive =
    messageSelection !== null ||
    !!search ||
    !!direction ||
    !!technology ||
    !!procedure ||
    !!range ||
    protocols.length !== layers.length;
  const inspectorTabs: InspectorTab[] = [
    "Payload",
    "Paramètres",
    "Call Flow",
    "Détails",
    ...(details.data?.hex ? (["Hexadécimal"] as InspectorTab[]) : []),
  ];
  useEffect(() => {
    if (inspectorTab === "Hexadécimal" && details.data && !details.data.hex)
      setInspectorTab("Payload");
  }, [inspectorTab, details.data]);
  const radioCell = (key: "rsrp" | "rsrq" | "sinr", t: number | null) => {
    const r = radioAt(radioSeries[key], t);
    if (!r) return <span className="text-muted-foreground">—</span>;
    const exact = r.dtS === 0;
    return (
      <span
        className={exact ? undefined : "sig-radio-prev"}
        title={
          exact
            ? `Mesure #${r.seq} au même instant (${r.t.toFixed(3)} s)`
            : `Mesure précédente #${r.seq} à ${r.t.toFixed(3)} s · Δt ${r.dtS.toFixed(3)} s · non instantanée`
        }
      >
        {fmtRadio(r.value)}
      </span>
    );
  };
  const renderCell = (c: ColKey, r: SignalingLine) => {
    switch (c) {
      case "seq":
        return r.seq;
      case "t_rel_s":
        return timeShown(r.t_rel_s);
      case "layer":
        return layerBadge(r.protocol);
      case "direction":
        return directionBadge(r.direction);
      case "message_name":
        return messageCell(r, listing.data?.procedures ?? []);
      case "info":
        return <InfoBadge info={messageInfo(r, listing.data?.procedures ?? [])} />;
      case "technology":
        return r.technology ? <span className="sig-chip">{r.technology}</span> : "—";
      case "rrc_state": {
        const s = rrcStateAt(r.t_rel_s, provenRrc);
        return s ? (
          <span className={`sig-state sig-state-${s.state.toLowerCase()}`} title={s.sessionId}>
            {t(`sigTable.rrc.${s.state}`)}
          </span>
        ) : (
          <span className="text-muted-foreground" title={t("sigTable.rrcUnproven")}>
            —
          </span>
        );
      }
      case "rsrp":
      case "rsrq":
      case "sinr":
        return radioCell(c, r.t_rel_s);
      case "size_bytes":
        return shown(r.size_bytes);
      case "ecgi":
        return shown(r.ecgi);
      case "pci":
        return shown(r.pci);
      case "source":
        return shown(r.source);
      default:
        return <span className="text-muted-foreground">—</span>;
    }
  };
  const resetPage = () => {
    setPage(1);
    setSeq(undefined);
  };
  const chooseCapture = (cap: string) => {
    setSharedCapture(cap);
    setPage(1);
    setRange(undefined);
    setProcedure("");
    setSeq(undefined);
    setHover([]);
  };
  const chooseSeq = (value: number) => {
    if (!capture) return;
    const row = listing.data?.rows.find((r) => r.seq === value);
    const point = points.data?.points.find((p) => p.seq === value);
    setSelectedRecord(
      row ?? {
        seq: value,
        capture_id: capture,
        t_rel_s: point?.t_rel_s ?? null,
        ...(point ? { protocol: point.protocol } : {}),
      },
    );
    setSeq(value);
    setCursor({
      selectedTimeS: row?.t_rel_s ?? point?.t_rel_s ?? null,
      hoveredTimeS: null,
      selectedEventId: null,
      selectedMessageSeq: value,
    });
    setLinkedMessages([]);
  };
  const error = [caps, listing, timeline, points].find((q) => q.isError)?.error;
  const exportCsv = async () => {
    try {
      setExportError("");
      const data =
        messageSelection === null
          ? await getSignaling(projectId, "export", filtered)
          : {
              csv: messageRowsCsv(selectedRows),
              filename: `signaling-${capture ?? "capture"}-filtered.csv`,
            };
      const url = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(String(e));
    }
  };
  // View activations (view switch, timeline, map) live in the filters sidebar,
  // never in a strip above the workspace.
  const viewControls = (
    <>
      <Button asChild variant="outline" size="sm">
        <Link
          to={stateTracksV2 ? "/signaling" : "/signaling-v2"}
          search={(previous) => ({ ...previous, capture_id: capture, seq })}
        >
          {t(stateTracksV2 ? "signalingV2.stable" : "signalingV2.open")}
        </Link>
      </Button>
      <button
        type="button"
        className="kpi-button"
        onClick={toggleTimeline}
        aria-pressed={timelineVisible}
        data-testid="signaling-timeline-toggle"
        title={timelineVisible ? t("signalingV2.hideTimeline") : t("signalingV2.showTimeline")}
      >
        {timelineVisible ? <Activity size={14} /> : <ActivitySquare size={14} />}
        {t("signalingV2.timeline")} ·{" "}
        {timelineVisible ? t("signalingV2.on") : t("signalingV2.off")}
      </button>
      <button
        type="button"
        className="kpi-button"
        onClick={toggleMap}
        aria-pressed={mapVisible}
        data-testid="signaling-map-toggle"
        title={mapVisible ? t("signalingV2.hideMap") : t("signalingV2.showMap")}
      >
        {mapVisible ? <MapPin size={14} /> : <MapPinOff size={14} />}
        {t("signalingV2.map")} ·{" "}
        {mapVisible ? t("signalingV2.on") : t("signalingV2.off")}
      </button>
    </>
  );

  return (

    <main className="p-3" data-testid="signaling-page">
      <h1 className="sr-only">{t(stateTracksV2 ? "signalingV2.title" : "signalingV2.stable")}</h1>

      {(error || exportError) && (
        <p role="alert" className="mb-3 rounded border border-destructive p-3 text-sm">
          {String(error?.message ?? exportError)}
        </p>
      )}
      <div className="signaling-workspace">
        <Group orientation={narrow ? "vertical" : "horizontal"} id="signaling-workspace">
          <Panel
            id="filters"
            panelRef={filtersPanelRef}
            defaultSize={narrow ? "34%" : 300}
            minSize={sidebarCollapsed ? 0 : narrow ? 280 : 280}
            maxSize={narrow ? "50%" : 360}
            collapsible
            collapsedSize={44}
          >
            {sidebarCollapsed ? (
              <aside
                className="signaling-pane flex h-full w-full flex-col items-center gap-2 rounded-lg border bg-card py-3"
                data-testid="signaling-sidebar-rail"
              >
                <button
                  type="button"
                  className="kpi-icon"
                  title="Afficher les filtres"
                  aria-label="Afficher les filtres"
                  aria-expanded="false"
                  onClick={toggleSidebar}
                >
                  <ChevronRight size={16} />
                </button>
                <SlidersHorizontal size={16} className="text-muted-foreground" aria-hidden="true" />
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="kpi-icon"
                  aria-label={t(stateTracksV2 ? "signalingV2.stable" : "signalingV2.open")}
                  title={t(stateTracksV2 ? "signalingV2.stable" : "signalingV2.open")}
                >
                  <Link
                    to={stateTracksV2 ? "/signaling" : "/signaling-v2"}
                    search={(previous) => ({ ...previous, capture_id: capture, seq })}
                  >
                    <Eye size={16} />
                  </Link>
                </Button>
                <button
                  type="button"
                  className="kpi-icon"
                  onClick={toggleTimeline}
                  aria-pressed={timelineVisible}
                  aria-label={t("signalingV2.timeline")}
                  data-testid="signaling-timeline-toggle"
                  title={timelineVisible ? t("signalingV2.hideTimeline") : t("signalingV2.showTimeline")}
                >
                  {timelineVisible ? <Activity size={16} /> : <ActivitySquare size={16} />}
                </button>
                <button
                  type="button"
                  className="kpi-icon"
                  onClick={toggleMap}
                  aria-pressed={mapVisible}
                  aria-label={t("signalingV2.map")}
                  data-testid="signaling-map-toggle"
                  title={mapVisible ? t("signalingV2.hideMap") : t("signalingV2.showMap")}
                >
                  {mapVisible ? <MapPin size={16} /> : <MapPinOff size={16} />}
                </button>

              </aside>
            ) : (
              <SignalingFilters
                viewControls={viewControls}

                layers={layers}
                protocols={protocols}
                technology={technology}
                direction={direction}
                search={search}
                procedure={procedure}
                capture={capture}
                size={size}
                captures={caps.data?.captures ?? []}
                procedures={procedures.data?.procedures ?? []}
                counts={catalog.data?.protocol_counts ?? remoteListing.data?.protocol_counts}
                total={listing.data?.total}
                selection={messageSelection}
                types={types}
                catalogLoading={catalog.isPending}
                catalogError={catalog.isError}
                onRequestTypes={() => {
                  setCatalogRequested(true);
                  if (catalog.isError) void catalog.refetch();
                }}
                onApply={(value) => {
                  setMessageSelection(value);
                }}
                onTechnology={(v) => {
                  setTechnology(v);
                  resetPage();
                }}
                onProtocols={(v) => {
                  setProtocols(v);
                  resetPage();
                }}
                onDirection={(v) => {
                  setDirection(v);
                  resetPage();
                }}
                onCapture={chooseCapture}
                onProcedure={(v) => {
                  setProcedure(v);
                  resetPage();
                }}
                onSearch={(v) => {
                  setSearch(v);
                  resetPage();
                }}
                onSize={(v) => {
                  setSize(v);
                  setPage(1);
                }}
                onCollapse={toggleSidebar}
                onReset={() => {
                  setTechnology("");
                  setProtocols(layers);
                  setDirection("");
                  setSearch("");
                  setProcedure("");
                  setRange(undefined);
                  setMessageSelection(null);
                  setPage(1);
                }}
              />
            )}
          </Panel>
          <Separator className="signaling-separator" aria-label="Largeur des filtres" />
          <Panel id="workspace" minSize="55%">
            <Group orientation="vertical" id="signaling-rows">
              <Panel
                id="overview"
                panelRef={overviewPanelRef}
                defaultSize="58%"
                minSize={timelineVisible || mapVisible ? 190 : 0}
                collapsible
                collapsedSize={0}
                data-testid="signaling-overview-panel"
              >
                <Group orientation="horizontal" id="signaling-overview">
                  <Panel
                    id="timeline"
                    panelRef={timelinePanelRef}
                    defaultSize={60}
                    minSize={timelineVisible ? 20 : 0}
                    collapsible
                    collapsedSize={0}
                    data-testid="signaling-timeline-panel"
                  >
                    <section className="signaling-pane flex flex-col rounded-lg border bg-card p-3">
                      {timelineView === "ribbon" && capture ? (
                        <EventRibbon
                          key={capture}
                          projectId={projectId}
                          captureId={capture}
                          selectedSeq={seq}
                          selectedTime={cursor.selectedTimeS ?? selected?.t_rel_s ?? null}
                          onTime={(time) =>
                            setCursor((current) => ({
                              ...current,
                              selectedTimeS: time,
                              selectedEventId: null,
                            }))
                          }
                          duration={captureDuration}
                          timeWindow={timeWindow}
                          onSelect={(e) => {
                            // Spec signaling_timeline §interactions : clic →
                            // sélectionne pivot_seq (ou le seq lui-même si pas
                            // de pivot), surlignes messages liés dans la
                            // liste, ouvre l'arbre ASN.1 sur le pivot. On
                            // réutilise chooseSeq qui déjà met à jour seq +
                            // selected pour le highlight et ouvre /details.
                            const target = e.pivot_seq ?? e.seq;
                            chooseSeq(target);
                            setCursor({
                              selectedTimeS: e.t_rel_s,
                              hoveredTimeS: null,
                              selectedEventId: e.id,
                              selectedMessageSeq: target,
                            });
                            setSelectedRecord({
                              capture_id: capture,
                              seq: target,
                              t_rel_s: e.t_rel_s,
                              message_name: e.label,
                              protocol: "",
                            });
                          }}
                        />
                      ) : timelineView === "rf" && capture ? (
                        <RfTimeline
                          key={capture}
                          projectId={projectId}
                          captureId={capture}
                          selectedTime={cursor.selectedTimeS ?? selected?.t_rel_s ?? null}
                          selectedEventId={cursor.selectedEventId}
                          timeWindow={timeWindow}
                          onWindow={setTimeWindow}
                          stateTracksV2={stateTracksV2}
                          onTime={(time) => {
                            setCursor({
                              selectedTimeS: time,
                              hoveredTimeS: null,
                              selectedEventId: null,
                              selectedMessageSeq: time === null ? null : (seq ?? null),
                            });
                            setLinkedMessages([]);
                            if (time === null) {
                              setSeq(undefined);
                              setSelectedRecord(undefined);
                            }
                          }}
                          technology={technology}
                          direction={direction}
                          search={search}
                          allowedProtocols={protocols}
                          onRange={(r) => {
                            setRange(r);
                            resetPage();
                          }}
                          onSelect={(e, sourceSeq) => {
                            const target = sourceSeq ?? eventMessage(e);
                            setLinkedMessages(e.linked_seqs);
                            setCursor({
                              selectedTimeS: e.t_rel_s,
                              hoveredTimeS: null,
                              selectedEventId: e.id,
                              selectedMessageSeq: target,
                            });
                            if (target === null || !capture) return;
                            const row = listing.data?.rows.find((r) => r.seq === target);
                            setSeq(target);
                            setSelectedRecord(
                              row ?? {
                                capture_id: capture,
                                seq: target,
                                t_rel_s: e.t_rel_s,
                                message_name:
                                  typeof e.attrs["source_message"] === "string"
                                    ? e.attrs["source_message"]
                                    : e.label,
                                protocol: e.attrs.protocol ?? "",
                              },
                            );
                            if (!row)
                              void getSignaling(projectId, "rows", {
                                ...filtered,
                                seq: target,
                                page,
                                size,
                                sort,
                                order,
                              })
                                .then((data) => {
                                  const selectedRow = data.rows.find((r) => r.seq === target);
                                  if (selectedRow) setSelectedRecord(selectedRow);
                                  if (data.selected_page !== null && data.selected_page !== page)
                                    setPage(data.selected_page);
                                })
                                .catch(() => undefined);
                          }}
                        />
                      ) : timeline.data ? (
                        <Timeline
                          data={timeline.data}
                          timeWindow={timeWindow}
                          duration={captureDuration}
                          selectedTime={cursor.selectedTimeS ?? selected?.t_rel_s ?? null}
                          onRange={(r) => {
                            setRange(r);
                            resetPage();
                          }}
                        />
                      ) : (
                        <p role="status" className="p-10">
                          Chargement de la timeline…
                        </p>
                      )}
                      {capture && timelineView !== "rf" && (
                        <TimeNavigator
                          duration={captureDuration}
                          window={timeWindow}
                          onWindow={setTimeWindow}
                        />
                      )}
                    </section>
                  </Panel>
                  <Separator
                    className="signaling-separator"
                    aria-label="Largeur timeline et carte"
                  />
                  <Panel
                    id="map"
                    panelRef={mapPanelRef}
                    minSize={mapVisible ? 25 : 0}
                    collapsible
                    collapsedSize={0}
                    defaultSize={40}
                    data-testid="signaling-map-panel"
                  >
                    <section className="signaling-pane flex flex-col rounded-lg border bg-card p-3" aria-label={t("signalingV2.map")}>
                      {mapVisible && points.data ? (
                        <SignalMap data={points.data} onSelect={chooseSeq} selectedSeq={seq} projectId={projectId} captureId={capture ?? ""} />
                      ) : (
                        <p role="status">Chargement des positions…</p>
                      )}
                    </section>
                  </Panel>
                </Group>
              </Panel>
              <Separator
                className="signaling-separator"
                aria-label="Hauteur de la vue d’ensemble"
              />
              <Panel id="inspection" minSize={300}>
                <Group orientation={narrow ? "vertical" : "horizontal"} id="signaling-inspection">
                  <Panel id="messages" defaultSize="70%" minSize={narrow ? 220 : "35%"}>
                    <section
                      ref={messagesFs.ref}
                      className="sig-messages signaling-pane flex flex-col overflow-hidden rounded-lg border bg-card"
                      aria-label={t("sigTable.title")}
                    >
                      <header className="sig-toolbar flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2.5 py-1.5">
                        <h2 className="sig-count mr-1" data-testid="signaling-total">
                          {listing.data
                            ? t("sigTable.count", {
                                count: listing.data.total,
                                n: fmtInt(listing.data.total),
                              })
                            : t("sigTable.countPending")}
                        </h2>
                        <label className="sig-search">
                          <Search size={14} aria-hidden="true" />
                          <input
                            aria-label={t("sigTable.search")}
                            placeholder={t("sigTable.searchPlaceholder")}
                            title={t("sigTable.searchScope")}
                            value={search}
                            onChange={(e) => {
                              setSearch(e.target.value);
                              resetPage();
                            }}
                          />
                        </label>
                        <select
                          className="sig-select"
                          aria-label={t("sigTable.layer")}
                          data-testid="sig-filter-layer"
                          value={
                            protocols.length === layers.length
                              ? ""
                              : protocols.length === 1
                                ? protocols[0]
                                : "__custom"
                          }
                          onChange={(e) => {
                            setProtocols(e.target.value ? [e.target.value] : layers);
                            resetPage();
                          }}
                        >
                          <option value="">{t("sigTable.allLayers")}</option>
                          {protocols.length > 1 && protocols.length < layers.length && (
                            <option value="__custom" disabled>
                              {t("sigTable.customLayers", { n: protocols.length })}
                            </option>
                          )}
                          {layers.map((l) => (
                            <option key={l} value={l}>
                              {LAYER_BADGE[l]?.label ?? l}
                            </option>
                          ))}
                        </select>
                        <select
                          className="sig-select"
                          aria-label={t("sigTable.direction")}
                          value={direction}
                          onChange={(e) => {
                            setDirection(e.target.value);
                            resetPage();
                          }}
                        >
                          <option value="">{t("sigTable.allDirections")}</option>
                          <option value="UL">UL</option>
                          <option value="DL">DL</option>
                          <option value="unknown">{t("sigTable.undocumented")}</option>
                        </select>
                        <select
                          className="sig-select"
                          aria-label={t("sigTable.technology")}
                          value={technology}
                          onChange={(e) => {
                            setTechnology(e.target.value);
                            resetPage();
                          }}
                        >
                          <option value="">{t("sigTable.allTechnologies")}</option>
                          <option value="LTE">LTE</option>
                          <option value="NR">NR</option>
                        </select>
                        <div className="ml-auto flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="sig-tool sig-tool-icon"
                                aria-label={`${t("sigTable.columns")} (${shownCols.length}/${COLUMNS.length})`}
                                title={`${t("sigTable.columns")} (${shownCols.length}/${COLUMNS.length})`}
                                data-testid="signaling-columns-trigger"
                              >
                                <Columns3 size={14} aria-hidden="true" />

                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-72">
                              <DropdownMenuLabel>{t("sigTable.columnsLabel")}</DropdownMenuLabel>
                              {knownOrder(colConfig).map((c, i) => {
                                const mandatory = MANDATORY_COLS.includes(c);
                                const def = COLUMNS.find((d) => d.key === c)!;
                                return (
                                  <div
                                    key={c}
                                    className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent"
                                  >
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={colConfig.visible.includes(c)}
                                        disabled={mandatory}
                                        onChange={() => setColConfig((old) => toggleColumn(old, c))}
                                        data-testid={`signaling-column-${c}`}
                                      />
                                      <span className="truncate">{t(`sigTable.col.${c}`)}</span>
                                      {!def.available && (
                                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                          {t("sigTable.notSupplied")}
                                        </span>
                                      )}
                                      {mandatory && (
                                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                          {t("sigTable.required")}
                                        </span>
                                      )}
                                    </label>
                                    <button
                                      type="button"
                                      className="sig-move"
                                      disabled={i === 0}
                                      aria-label={t("sigTable.moveUp", {
                                        col: t(`sigTable.col.${c}`),
                                      })}
                                      onClick={() => setColConfig((old) => moveColumn(old, c, -1))}
                                    >
                                      <ChevronUp size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      className="sig-move"
                                      disabled={i === colConfig.order.length - 1}
                                      aria-label={t("sigTable.moveDown", {
                                        col: t(`sigTable.col.${c}`),
                                      })}
                                      onClick={() => setColConfig((old) => moveColumn(old, c, 1))}
                                    >
                                      <ChevronDown size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                              <DropdownMenuSeparator />
                              <button
                                type="button"
                                onClick={() => setColConfig(defaultColumns())}
                                className="w-full px-2 py-1 text-left text-xs hover:bg-accent"
                              >
                                {t("sigTable.resetColumns")}
                              </button>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <button
                            type="button"
                            className="sig-tool sig-tool-icon"
                            aria-label={t("sigTable.export")}
                            title={t("sigTable.export")}
                            disabled={!listing.data}
                            onClick={() => void exportCsv()}
                          >
                            <Download size={14} aria-hidden="true" />

                          </button>
                          <button
                            type="button"
                            className="sig-tool sig-tool-icon"
                            aria-label={t("sigTable.clear")}
                            title={t("sigTable.clear")}

                            data-testid="sig-clear-filters"
                            disabled={!filtersActive}
                            onClick={() => {
                              setMessageSelection(null);
                              setSearch("");
                              setProtocols(layers);
                              setDirection("");
                              setTechnology("");
                              setProcedure("");
                              setRange(undefined);
                              resetPage();
                            }}
                          >
                            <FilterX size={14} aria-hidden="true" />

                          </button>
                          <button
                            type="button"
                            className="sig-tool sig-tool-icon"
                            aria-label={t(messagesFs.active ? "sigTable.exitFullscreen" : "sigTable.fullscreen")}
                            title={t(messagesFs.active ? "sigTable.exitFullscreen" : "sigTable.fullscreen")}
                            aria-pressed={messagesFs.active}
                            disabled={!messagesFs.supported}
                            data-testid="sig-messages-fullscreen"
                            onClick={() => void messagesFs.toggle()}
                          >
                            {messagesFs.active ? (
                              <Minimize size={14} aria-hidden="true" />
                            ) : (
                              <Maximize size={14} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </header>
                      <div
                        className="min-h-0 flex-1 overflow-auto"
                        data-testid="sig-table-scroll"
                        ref={tableScroll}
                      >
                        <table className="sig-table" aria-label={t("sigTable.title")}>
                          <thead>
                            <tr>
                              {shownCols.map((c) => {
                                const def = COLUMNS.find((d) => d.key === c)!;
                                const label = t(`sigTable.col.${c}`);
                                const active = def.sortKey && sort === def.sortKey;
                                return (
                                  <th
                                    key={c}
                                    data-col={c}
                                    className={def.numeric ? "num" : undefined}
                                    title={
                                      def.available ? undefined : t("sigTable.notSuppliedHint")
                                    }
                                    aria-sort={
                                      active
                                        ? order === "asc"
                                          ? "ascending"
                                          : "descending"
                                        : undefined
                                    }
                                  >
                                    {def.sortKey ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSort(def.sortKey!);
                                          setOrder((old) =>
                                            sort === def.sortKey && old === "asc" ? "desc" : "asc",
                                          );
                                          resetPage();
                                        }}
                                      >
                                        {label}
                                        {active ? (
                                          order === "asc" ? (
                                            <ArrowUp size={11} aria-hidden="true" />
                                          ) : (
                                            <ArrowDown size={11} aria-hidden="true" />
                                          )
                                        ) : (
                                          <ArrowUpDown
                                            size={11}
                                            aria-hidden="true"
                                            className="opacity-40"
                                          />
                                        )}
                                      </button>
                                    ) : (
                                      label
                                    )}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {listing.data?.rows.map((r) => {
                              const linked = linkedMessages.includes(r.seq);
                              const procHover = r.procedure_ids.some((id) => hover.includes(id));
                              return (
                                <tr
                                  key={r.seq}
                                  data-seq={r.seq}
                                  aria-selected={r.seq === seq}
                                  data-event-linked={linked}
                                  data-procedure-highlight={procHover}
                                  data-related={r.seq !== seq && (linked || procHover)}
                                  onMouseEnter={() => setHover(r.procedure_ids)}
                                  onMouseLeave={() => setHover([])}
                                  onClick={() => chooseSeq(r.seq)}
                                >
                                  {shownCols.map((c) => (
                                    <td
                                      key={c}
                                      data-col={c}
                                      className={
                                        COLUMNS.find((d) => d.key === c)!.numeric
                                          ? "num"
                                          : undefined
                                      }
                                    >
                                      {renderCell(c, r)}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {listing.data && listing.data.rows.length === 0 && (
                          <p
                            role="status"
                            className="p-6 text-center text-xs text-muted-foreground"
                          >
                            {t("sigTable.empty")}
                          </p>
                        )}
                      </div>
                      <footer className="sig-footer flex shrink-0 flex-wrap items-center gap-3 border-t px-3 py-2">
                        <nav
                          className="flex items-center gap-1"
                          aria-label={t("sigTable.pagination")}
                        >
                          <button
                            type="button"
                            className="sig-page"
                            aria-label={t("sigTable.previous")}
                            disabled={!listing.data || listing.data.page <= 1}
                            onClick={() => setPage((listing.data?.page ?? 1) - 1)}
                          >
                            <ChevronLeft size={14} />
                          </button>
                          {listing.data &&
                            pageItems(listing.data.page, Math.max(1, listing.data.pages)).map(
                              (p, i) =>
                                p === "…" ? (
                                  <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                                    …
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    key={p}
                                    className="sig-page"
                                    aria-current={p === listing.data!.page ? "page" : undefined}
                                    onClick={() => setPage(p)}
                                  >
                                    {p}
                                  </button>
                                ),
                            )}
                          <button
                            type="button"
                            className="sig-page"
                            aria-label={t("sigTable.next")}
                            disabled={!listing.data || listing.data.page >= listing.data.pages}
                            onClick={() => setPage((listing.data?.page ?? 1) + 1)}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </nav>
                        <label className="flex items-center gap-2">
                          {t("sigTable.rowsPerPage")}
                          <select
                            className="sig-select"
                            aria-label={t("sigTable.rowsPerPage")}
                            value={size}
                            onChange={(e) => {
                              setSize(Number(e.target.value));
                              resetPage();
                            }}
                          >
                            {[25, 50, 100, 250, 500].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                        <span className="text-muted-foreground">
                          {listing.data && listing.data.total > 0
                            ? t("sigTable.showing", {
                                from: fmtInt((listing.data.page - 1) * listing.data.size + 1),
                                to: fmtInt(
                                  Math.min(
                                    listing.data.total,
                                    listing.data.page * listing.data.size,
                                  ),
                                ),
                                total: fmtInt(listing.data.total),
                              })
                            : ""}
                        </span>
                        {listing.isFetching && (
                          <span role="status" className="ml-auto text-muted-foreground">
                            {t("sigTable.loading")}
                          </span>
                        )}
                      </footer>
                    </section>
                  </Panel>
                  <Separator
                    className="signaling-separator"
                    aria-label="Taille de la liste et du décodeur"
                  />
                  <Panel id="details" defaultSize="30%" minSize={narrow ? 300 : 360}>
                    <section
                      className="sig-inspector signaling-pane flex flex-col rounded-lg border bg-card text-xs"
                      aria-label="Inspecteur de message"
                      data-testid="signaling-inspector"
                    >
                      <header className="shrink-0 border-b px-3 pb-2 pt-3">
                        <h2 className="sig-inspector-title break-words">
                          {seq !== undefined ? (
                            <>
                              <span className="font-mono">#{seq}</span>
                              {" — "}
                              {selected?.message_name ?? "…"}
                            </>
                          ) : (
                            t("sigTable.selectMessage")
                          )}
                        </h2>
                        {seq !== undefined && (
                          <div
                            className="mt-2 flex flex-wrap items-center gap-1.5"
                            data-testid="inspector-meta"
                          >
                            <span className="sig-chip">
                              <Clock size={12} aria-hidden="true" />
                              {timeShown(selected?.t_rel_s)} s
                            </span>
                            {layerBadge(selected?.protocol)}
                            {directionBadge(selected?.direction ?? null)}
                            {selected?.technology && (
                              <span className="sig-chip">{selected.technology}</span>
                            )}
                            {(() => {
                              const s = rrcStateAt(selected?.t_rel_s, provenRrc);
                              return s ? (
                                <span className={`sig-state sig-state-${s.state.toLowerCase()}`}>
                                  RRC : {t(`sigTable.rrc.${s.state}`)}
                                </span>
                              ) : null;
                            })()}
                            {selected?.pci != null && (
                              <span className="sig-chip">PCI {selected.pci}</span>
                            )}
                          </div>
                        )}
                      </header>
                      {messageSelection !== null &&
                        seq !== undefined &&
                        !selectedRows.some((row) => row.seq === seq) &&
                        !listing.isFetching && (
                          <p className="sig-selection-note" role="status">
                            {t("sigFilters.selectedOutside", { seq })}
                          </p>
                        )}
                      {seq === undefined ? (
                        <p role="status" className="p-4 text-muted-foreground">
                          {t("sigTable.selectHint")}
                        </p>
                      ) : (
                        <>
                          <div
                            role="tablist"
                            className="sig-tabs flex shrink-0 gap-1 border-b px-3"
                            data-testid="inspector-tabs"
                          >
                            {inspectorTabs.map((name) => (
                              <button
                                role="tab"
                                type="button"
                                aria-selected={inspectorTab === name}
                                key={name}
                                onClick={() => setInspectorTab(name)}
                                data-testid={`inspector-tab-${name.toLowerCase().replace(/[^a-z]/g, "")}`}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                          {details.isError ? (
                            <p role="alert" className="m-3">
                              Erreur de récupération du décodage.{" "}
                              <button className="underline" onClick={() => void details.refetch()}>
                                Réessayer le décodage
                              </button>
                            </p>
                          ) : details.isPending ? (
                            <p role="status" className="m-3">
                              Chargement du décodage…
                            </p>
                          ) : (
                            details.data && (
                              <div
                                className="flex min-h-0 flex-1 flex-col break-words px-3 pt-2"
                                data-testid="inspector-content"
                              >
                                {inspectorTab === "Payload" ? (
                                  details.data.parameters.length ? (
                                    <>
                                      <div className="min-h-0 flex-1">
                                        <DecoderTree
                                          key={`${capture}:${seq}`}
                                          parameters={details.data.parameters}
                                        />
                                      </div>
                                      <DecodedValues parameters={details.data.parameters} />
                                    </>
                                  ) : (
                                    <div className="space-y-2">
                                      <p>Payload ASN.1 non disponible pour ce message.</p>
                                      <p className="text-muted-foreground">
                                        {details.data.hex_reason ??
                                          "Aucun paramètre décodé fourni par la source."}
                                      </p>
                                      {/* Capture seulement « light » ? Le décodage
                                          approfondi peut fournir l'arbre (admins). */}
                                      <DecodePanel projectId={projectId} captureId={capture} />
                                    </div>
                                  )
                                ) : inspectorTab === "Hexadécimal" ? (
                                  <div className="min-h-0 flex-1 overflow-auto">
                                    <pre
                                      className="whitespace-pre-wrap break-all font-mono text-xs"
                                      data-testid="inspector-hex"
                                    >
                                      {details.data.hex}
                                    </pre>
                                  </div>
                                ) : inspectorTab === "Paramètres" ? (
                                  <div className="min-h-0 flex-1 overflow-auto">
                                    {details.data.parameters.length ? (
                                      <table
                                        className="w-full text-xs"
                                        aria-label="Paramètres décodés"
                                        data-testid="inspector-params"
                                      >
                                        <thead className="sticky top-0 bg-muted">
                                          <tr>
                                            <th className="p-1 text-left">Paramètre</th>
                                            <th className="p-1 text-left">Valeur</th>
                                            <th className="p-1 text-left">Chemin ASN.1</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {details.data.parameters.map((p, i) => (
                                            <tr
                                              key={`${p.path}:${i}`}
                                              className="border-b align-top"
                                            >
                                              <td className="p-1">
                                                <a
                                                  href={`/rrc?parameter=${encodeURIComponent(p.param_key ?? p.path)}`}
                                                  className="text-primary underline"
                                                >
                                                  {p.param_key ?? p.path.split("/").slice(-1)[0]}
                                                </a>
                                              </td>
                                              <td className="p-1 font-mono">{shown(p.value)}</td>
                                              <td className="p-1 font-mono text-[10px] text-muted-foreground">
                                                {p.path}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <p role="status" className="rounded bg-muted p-3">
                                        {details.data.hex_reason ??
                                          "Aucun paramètre décodé fourni par la source."}
                                      </p>
                                    )}
                                  </div>
                                ) : inspectorTab === "Call Flow" ? (
                                  <div className="min-h-0 flex-1 overflow-auto">
                                    <CallFlowPanel
                                      projectId={projectId}
                                      captureId={capture}
                                      selected={selected}
                                      procedures={listing.data?.procedures ?? []}
                                      onSelect={chooseSeq}
                                      seq={seq}
                                    />
                                  </div>
                                ) : (
                                  <div className="min-h-0 flex-1 overflow-auto">
                                    <DetailsPanel
                                      selected={selected}
                                      seq={seq}
                                      context={context}
                                      position={position}
                                      pointsData={points.data}
                                      detailsResultId={details.data?.result_id}
                                      treeSource={details.data?.tree_source}
                                      treeRouteGap={details.data?.tree_route_gap}
                                    />
                                  </div>
                                )}
                              </div>
                            )
                          )}
                        </>
                      )}
                    </section>
                  </Panel>
                </Group>
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </main>
  );
}
