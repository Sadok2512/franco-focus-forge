import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts } from "echarts";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { getSignaling } from "@/lib/api/client";
import type { SignalingTimeline, SignalingPoints, SignalingLine } from "@/lib/api/signaling";
import { useCaptureContext, setCaptureContext } from "@/lib/capture-context";
import { KpiMapOSM } from "@/features/kpi/KpiMapOSM";

import { Group, Panel, Separator } from "react-resizable-panels";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  Activity,
  ActivitySquare,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  MapPin,
  MapPinOff,
  SlidersHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DecoderTree } from "./DecoderTree";
import "./signaling.css";

const layers = ["RRC LTE", "RRC NR", "NAS", "Événements Nemo", "MAC-RACH"];
const colors = ["#2563eb", "#7c3aed", "#ea580c", "#0891b2", "#16a34a"];
const shown = (value: unknown) => (value === null || value === undefined ? "—" : String(value));

// 1.55.0 (V3 LOT 2) — Column catalog. Only fields supported by the back
// Line contract. Section 6 of the V3 spec forbids inventing values; any
// column requested by the spec but not provided by /signaling (EARFCN,
// Bande, Service, RSRP/RSRQ/SINR/CQI/BLER, eNB/gNB, Lat/Lng/Speed) is
// absent from this catalog and must stay hidden until the back supplies
// the data.
type ColKey =
  | "seq"
  | "t_rel_s"
  | "layer"
  | "direction"
  | "message_name"
  | "ecgi"
  | "pci"
  | "size_bytes"
  | "technology"
  | "source";
const COL_LABELS: Record<ColKey, string> = {
  seq: "#",
  t_rel_s: "Temps (s)",
  layer: "Couche",
  direction: "Sens",
  message_name: "Message",
  ecgi: "ECGI",
  pci: "PCI",
  size_bytes: "Octets",
  technology: "Techno",
  source: "Source",
};
const MANDATORY_COLS: readonly ColKey[] = ["seq", "t_rel_s", "message_name"];

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
const DEFAULT_COLS: readonly ColKey[] = [
  "seq",
  "t_rel_s",
  "layer",
  "direction",
  "message_name",
  "ecgi",
  "pci",
  "size_bytes",
];

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
}: {
  data: SignalingTimeline;
  selectedTime: number | null;
  onRange: (range: [number, number] | undefined) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<ECharts | undefined>(undefined);
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
          type: "value",
          name: "Temps capture (s)",
          nameLocation: "middle",
          nameGap: 26,
        },
        yAxis: { type: "value", name: "Messages" },
        dataZoom: [{ type: "inside", xAxisIndex: 0, zoomOnMouseWheel: "ctrl" }],
        brush: { xAxisIndex: 0, brushType: "lineX", toolbox: ["lineX", "clear"] },
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
}: {
  data: SignalingPoints;
  onSelect: (seq: number) => void;
  selectedSeq: number | undefined;
}) {
  const [map, setMap] = useState<MlMap>();
  const ready = useCallback((m: MlMap) => setMap(m), []);
  const callback = useRef(onSelect);
  callback.current = onSelect;
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
    if (point?.lat !== null && point?.lat !== undefined && point.lng !== null) {
      void import("maplibre-gl").then((ml) => {
        if (cancelled) return;
        const el = document.createElement("div");
        el.dataset["testid"] = "selected-gps";
        el.dataset["seq"] = String(selectedSeq);
        el.title = `GPS précédent · seq ${point.gps_seq} · Δseq ${point.seq_gap} ; position exacte du message non prouvée`;
        el.style.cssText =
          "width:18px;height:18px;border:3px dashed #dc2626;border-radius:50%;pointer-events:none;background:transparent";
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
  const center: [number, number] = hasMarkers
    ? [data.markers[0]!.lng!, data.markers[0]!.lat!]
    : [2.4, 46.6];
  const zoom = hasMarkers ? 13 : 5;
  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden rounded border [&>div]:h-full">
      <KpiMapOSM
        center={center}
        zoom={zoom}
        onMapReady={ready}
        showOperatorLegend={false}
        contextLabel="Signalisation"
        measurementStatus={null}
        nPoints={data.positioned_count}
      />
      {!hasMarkers && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs shadow"
        >
          Aucun GPS précédent prouvé dans cette capture
        </div>
      )}
    </div>
  );
}

export function SignalingPage({
  projectId,
  initialCapture,
  initialSeq,
}: {
  projectId: string;
  initialCapture?: string | undefined;
  initialSeq?: number | undefined;
}) {
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
  // 1.55.0 (V3 LOT 2) — visibilité des colonnes, session-scoped useState
  // (jamais inclus dans un queryKey, jamais déclencheur de refetch).
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => new Set<ColKey>(DEFAULT_COLS));
  const toggleCol = (c: ColKey) => {
    if (MANDATORY_COLS.includes(c)) return;
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };
  const resetCols = () => setVisibleCols(new Set<ColKey>(DEFAULT_COLS));
  // 1.56.0 (V3 LOT 3) — Inspector Payload First. Tab state séparé de la
  // sélection (P0 1.50.1) et de toute clé React Query. Default = Payload,
  // préservé entre deux sélections conformément à spec §7.
  type InspectorTab = "Payload" | "Hexadécimal" | "Paramètres" | "Call Flow" | "Détails";
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
  const [selectedRecord, setSelectedRecord] = useState<Partial<SignalingLine>>();
  const selectionCapture = useRef<string | undefined>(undefined);
  const caps = useQuery({
    queryKey: ["signaling-captures", projectId],
    queryFn: ({ signal }) => getSignaling(projectId, "captures", {}, signal),
  });
  const capture =
    sharedCapture && caps.data?.captures.some((c) => c.capture_id === sharedCapture)
      ? sharedCapture
      : caps.data?.captures[0]?.capture_id;
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
  const listing = useQuery({
    queryKey: ["signaling", projectId, filtered, page, size, sort, order],
    enabled: !!capture,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "rows", { ...filtered, page, size, sort, order }, signal),
  });
  const timeline = useQuery({
    queryKey: ["signaling-timeline", projectId, base],
    enabled: !!capture,
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
    }
    selectionCapture.current = capture;
  }, [capture]);
  const position = points.data?.points.find((p) => p.seq === seq);
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
  };
  const error = [caps, listing, timeline, points].find((q) => q.isError)?.error;
  const exportCsv = async () => {
    try {
      setExportError("");
      const data = await getSignaling(projectId, "export", filtered);
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
  return (
    <main className="p-3" data-testid="signaling-page">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Signaling View</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="kpi-button"
            onClick={toggleTimeline}
            aria-pressed={timelineVisible}
            data-testid="signaling-timeline-toggle"
            title={timelineVisible ? "Masquer la timeline" : "Afficher la timeline"}
          >
            {timelineVisible ? <Activity size={14} /> : <ActivitySquare size={14} />}
            Timeline · {timelineVisible ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className="kpi-button"
            onClick={toggleMap}
            aria-pressed={mapVisible}
            data-testid="signaling-map-toggle"
            title={mapVisible ? "Masquer la carte" : "Afficher la carte"}
          >
            {mapVisible ? <MapPin size={14} /> : <MapPinOff size={14} />}
            Carte · {mapVisible ? "ON" : "OFF"}
          </button>
          <span className="text-xs text-muted-foreground">
            Capture unique · ordre seq · sources Nemo et RRC
          </span>
        </div>
      </header>
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
            defaultSize={narrow ? "17%" : "16%"}
            minSize={sidebarCollapsed ? 0 : narrow ? 220 : 185}
            maxSize={narrow ? "30%" : "26%"}
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
              </aside>
            ) : (
              <aside
                className="signaling-pane overflow-auto space-y-4 rounded-lg border bg-card p-3 text-sm"
                data-testid="signaling-sidebar"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Filtres</h2>
                  <button
                    type="button"
                    className="kpi-icon"
                    title="Masquer les filtres"
                    aria-label="Masquer les filtres"
                    aria-expanded="true"
                    onClick={toggleSidebar}
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>
                <label className="block">
                  Technologie
                  <select
                    aria-label="Technologie signalisation"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={technology}
                    onChange={(e) => {
                      setTechnology(e.target.value);
                      resetPage();
                    }}
                  >
                    <option value="">LTE + NR / états non attribués</option>
                    <option>LTE</option>
                    <option>NR</option>
                  </select>
                </label>
                <fieldset className="space-y-2">
                  <legend className="mb-2 font-semibold">Couches</legend>
                  {layers.map((p, i) => (
                    <label key={p} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={protocols.includes(p)}
                        onChange={(e) => {
                          setProtocols((old) =>
                            e.target.checked ? [...old, p] : old.filter((x) => x !== p),
                          );
                          resetPage();
                        }}
                      />
                      <span className="h-2 w-2 rounded-full" style={{ background: colors[i] }} />
                      {p}
                      <span className="ml-auto font-mono text-xs">
                        {shown(listing.data?.protocol_counts[p])}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <label className="block">
                  Direction
                  <select
                    aria-label="Direction"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={direction}
                    onChange={(e) => {
                      setDirection(e.target.value);
                      resetPage();
                    }}
                  >
                    <option value="">Toutes</option>
                    <option>UL</option>
                    <option>DL</option>
                    <option value="unknown">Non documentée</option>
                  </select>
                </label>
                <label className="block">
                  Capture
                  <select
                    aria-label="Capture signalisation"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={capture ?? ""}
                    onChange={(e) => chooseCapture(e.target.value)}
                  >
                    {caps.data?.captures.map((c) => (
                      <option key={c.capture_id} value={c.capture_id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Procédure
                  <select
                    aria-label="Procédure"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={procedure}
                    onChange={(e) => {
                      setProcedure(e.target.value);
                      resetPage();
                    }}
                  >
                    <option value="">
                      Toutes{procedures.data ? ` (${procedures.data.total})` : ""}
                    </option>
                    {procedures.data &&
                      Object.keys(procedures.data.types)
                        .sort()
                        .map((type) => (
                          <optgroup key={type} label={`${type} · ${procedures.data!.types[type]}`}>
                            {procedures
                              .data!.procedures.filter((p) => p.type === type)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  seq {p.seq_start}
                                  {p.seq_end ? `→${p.seq_end}` : ""} · {shown(p.duration_ms)} ms ·{" "}
                                  {p.outcome}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                  </select>
                </label>
                <label className="block">
                  Recherche
                  <input
                    aria-label="Rechercher un message"
                    placeholder="Nom du message"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      resetPage();
                    }}
                    className="mt-1 w-full rounded border bg-background p-2"
                  />
                </label>
                <label className="block">
                  Taille de page
                  <select
                    aria-label="Taille de page"
                    value={size}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      resetPage();
                    }}
                    className="ml-2 rounded border bg-background p-1"
                  >
                    {[50, 100, 250, 500].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                {range && (
                  <button className="kpi-button" onClick={() => setRange(undefined)}>
                    Effacer la brosse
                  </button>
                )}
              </aside>
            )}
          </Panel>
          <Separator className="signaling-separator" aria-label="Largeur des filtres" />
          <Panel id="workspace" minSize="55%">
            <Group orientation="vertical" id="signaling-rows">
              <Panel
                id="overview"
                panelRef={overviewPanelRef}
                defaultSize="40%"
                minSize={timelineVisible || mapVisible ? 190 : 0}
                collapsible
                collapsedSize={0}
                data-testid="signaling-overview-panel"
              >
                <Group orientation="horizontal" id="signaling-overview">
                  <Panel
                    id="timeline"
                    panelRef={timelinePanelRef}
                    defaultSize={40}
                    minSize={timelineVisible ? 20 : 0}
                    collapsible
                    collapsedSize={0}
                    data-testid="signaling-timeline-panel"
                  >
                    <section className="signaling-pane flex flex-col rounded-lg border bg-card p-3">
                      <h2 className="text-sm font-semibold">Timeline</h2>
                      {timeline.data ? (
                        <Timeline
                          data={timeline.data}
                          selectedTime={selected?.t_rel_s ?? null}
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
                    defaultSize={60}
                    data-testid="signaling-map-panel"
                  >
                    <section className="signaling-pane flex flex-col rounded-lg border bg-card p-3">
                      <h2 className="mb-2 text-sm font-semibold">Trajet · GPS précédent</h2>
                      {points.data ? (
                        <SignalMap data={points.data} onSelect={chooseSeq} selectedSeq={seq} />
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
                  <Panel id="messages" defaultSize="55%" minSize={narrow ? 220 : "30%"}>
                    <section className="signaling-pane flex flex-col overflow-hidden rounded-lg border bg-card">
                      <header className="flex items-center justify-between gap-2 border-b p-3 text-sm">
                        <span>{shown(listing.data?.total)} messages</span>
                        <div className="flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="kpi-button"
                                aria-label="Colonnes du tableau"
                                data-testid="signaling-columns-trigger"
                              >
                                <Columns3 size={14} />
                                Colonnes ({visibleCols.size}/{Object.keys(COL_LABELS).length})
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
                              {(Object.keys(COL_LABELS) as ColKey[]).map((c) => {
                                const mandatory = MANDATORY_COLS.includes(c);
                                return (
                                  <label
                                    key={c}
                                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-accent"
                                    title={mandatory ? "Colonne obligatoire" : ""}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={visibleCols.has(c)}
                                      disabled={mandatory}
                                      onChange={() => toggleCol(c)}
                                      data-testid={`signaling-column-${c}`}
                                    />
                                    {COL_LABELS[c]}
                                    {mandatory && (
                                      <span className="ml-auto text-[10px] text-muted-foreground">
                                        obl.
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                              <DropdownMenuSeparator />
                              <button
                                type="button"
                                onClick={resetCols}
                                className="w-full px-2 py-1 text-left text-xs hover:bg-accent"
                              >
                                Réinitialiser
                              </button>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <button
                            className="kpi-button"
                            disabled={!listing.data}
                            onClick={() => void exportCsv()}
                          >
                            Export CSV
                          </button>
                        </div>
                      </header>
                      <div className="min-h-0 flex-1 overflow-auto">
                        <table className="w-full text-xs" aria-label="Messages de signalisation">
                          <thead className="sticky top-0 bg-muted">
                            <tr>
                              {(Object.keys(COL_LABELS) as ColKey[])
                                .filter((c) => visibleCols.has(c))
                                .map((c) => (
                                  <th key={c} className="p-2 text-left" data-col={c}>
                                    {c === "direction" || c === "source" ? (
                                      COL_LABELS[c]
                                    ) : (
                                      <button
                                        onClick={() => {
                                          const sortKey =
                                            c === "layer" ? "protocol" : (c as string);
                                          setSort(sortKey);
                                          setOrder((old) =>
                                            sort === sortKey && old === "asc" ? "desc" : "asc",
                                          );
                                          resetPage();
                                        }}
                                      >
                                        {COL_LABELS[c]}
                                      </button>
                                    )}
                                  </th>
                                ))}
                            </tr>
                          </thead>
                          <tbody>
                            {listing.data?.rows.map((r) => (
                              <tr
                                key={r.seq}
                                data-seq={r.seq}
                                aria-selected={r.seq === seq}
                                data-procedure-highlight={r.procedure_ids.some((id) =>
                                  hover.includes(id),
                                )}
                                onMouseEnter={() => setHover(r.procedure_ids)}
                                onMouseLeave={() => setHover([])}
                                onClick={() => chooseSeq(r.seq)}
                                className={`cursor-pointer border-b hover:bg-accent ${r.seq === seq ? "bg-primary/15" : r.procedure_ids.some((id) => hover.includes(id)) ? "bg-amber-100 dark:bg-amber-900/30" : ""}`}
                              >
                                {(Object.keys(COL_LABELS) as ColKey[])
                                  .filter((c) => visibleCols.has(c))
                                  .map((c) => (
                                    <td
                                      key={c}
                                      className={
                                        c === "seq" || c === "t_rel_s" ? "p-2 font-mono" : "p-2"
                                      }
                                      data-col={c}
                                    >
                                      {c === "seq"
                                        ? r.seq
                                        : c === "t_rel_s"
                                          ? timeShown(r.t_rel_s)
                                          : c === "layer"
                                            ? layerBadge(r.protocol)
                                            : c === "direction"
                                              ? directionBadge(r.direction)
                                              : c === "message_name"
                                                ? messageCell(r, listing.data?.procedures ?? [])
                                                : c === "ecgi"
                                                  ? shown(r.ecgi)
                                                  : c === "pci"
                                                    ? shown(r.pci)
                                                    : c === "size_bytes"
                                                      ? shown(r.size_bytes)
                                                      : c === "technology"
                                                        ? shown(r.technology)
                                                        : c === "source"
                                                          ? shown(r.source)
                                                          : null}
                                    </td>
                                  ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <footer className="flex items-center justify-between p-3 text-xs">
                        <button
                          className="kpi-button"
                          disabled={!listing.data || listing.data.page <= 1}
                          onClick={() => {
                            setPage((listing.data?.page ?? 1) - 1);
                            setSeq(undefined);
                          }}
                        >
                          Précédent
                        </button>
                        <span>
                          Page {shown(listing.data?.page)} / {shown(listing.data?.pages)}
                        </span>
                        <button
                          className="kpi-button"
                          disabled={!listing.data || listing.data.page >= listing.data.pages}
                          onClick={() => {
                            setPage((listing.data?.page ?? 1) + 1);
                            setSeq(undefined);
                          }}
                        >
                          Suivant
                        </button>
                      </footer>
                      {listing.isFetching && (
                        <p role="status" className="p-2 text-xs">
                          Chargement des messages…
                        </p>
                      )}
                    </section>
                  </Panel>
                  <Separator
                    className="signaling-separator"
                    aria-label="Taille de la liste et du décodeur"
                  />
                  <Panel id="details" minSize={narrow ? 300 : "28%"}>
                    <section
                      className="signaling-pane flex flex-col rounded-lg border bg-card p-3 text-xs"
                      aria-label="Inspecteur de message"
                    >
                      <header className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
                        <h2 className="break-words text-sm font-semibold">
                          {selected?.message_name ?? "Sélectionnez un message"}
                          {seq !== undefined && (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              #{seq}
                            </span>
                          )}
                        </h2>
                        {seq !== undefined && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {directionBadge(selected?.direction ?? null)}
                          </span>
                        )}
                      </header>
                      {seq !== undefined && (
                        <>
                          <div
                            role="tablist"
                            className="flex shrink-0 flex-wrap gap-1 border-b pb-2"
                            data-testid="inspector-tabs"
                          >
                            {(
                              [
                                "Payload",
                                "Hexadécimal",
                                "Paramètres",
                                "Call Flow",
                                "Détails",
                              ] as InspectorTab[]
                            ).map((name) => (
                              <button
                                role="tab"
                                aria-selected={inspectorTab === name}
                                key={name}
                                className={`rounded px-2 py-1 ${
                                  inspectorTab === name
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                                onClick={() => setInspectorTab(name)}
                                data-testid={`inspector-tab-${name.toLowerCase().replace(/[^a-z]/g, "")}`}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                          {details.isError ? (
                            <p role="alert" className="mt-2">
                              Erreur de récupération du décodage.{" "}
                              <button onClick={() => void details.refetch()}>
                                Réessayer le décodage
                              </button>
                            </p>
                          ) : details.isPending ? (
                            <p role="status" className="mt-2">
                              Chargement du décodage…
                            </p>
                          ) : (
                            details.data && (
                              <div
                                className="mt-2 min-h-0 flex-1 break-words overflow-auto"
                                data-testid="inspector-content"
                              >
                                {inspectorTab === "Payload" ? (
                                  details.data.parameters.length ? (
                                    <DecoderTree
                                      key={`${capture}:${seq}`}
                                      parameters={details.data.parameters}
                                    />
                                  ) : (
                                    <div>
                                      <p>Payload ASN.1 non disponible pour ce message.</p>
                                      <p className="mt-1 text-muted-foreground">
                                        {details.data.hex_reason ??
                                          "Aucun paramètre décodé fourni par la source."}
                                      </p>
                                    </div>
                                  )
                                ) : inspectorTab === "Hexadécimal" ? (
                                  details.data.hex ? (
                                    <pre
                                      className="whitespace-pre-wrap break-all font-mono text-xs"
                                      data-testid="inspector-hex"
                                    >
                                      {details.data.hex}
                                    </pre>
                                  ) : (
                                    <p role="status" className="rounded bg-muted p-3">
                                      {details.data.hex_reason}
                                    </p>
                                  )
                                ) : inspectorTab === "Paramètres" ? (
                                  details.data.parameters.length ? (
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
                                          <tr key={`${p.path}:${i}`} className="border-b align-top">
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
                                  )
                                ) : inspectorTab === "Call Flow" ? (
                                  <CallFlowPanel
                                    projectId={projectId}
                                    captureId={capture}
                                    selected={selected}
                                    procedures={listing.data?.procedures ?? []}
                                    onSelect={chooseSeq}
                                    seq={seq}
                                  />
                                ) : (
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
