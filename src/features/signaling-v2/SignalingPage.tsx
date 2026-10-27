import { useQuery } from "@tanstack/react-query";
import { GripHorizontal, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSignalingCapture,
  getSignalingMessages,
  getSignalingPayload,
  listSignalingCaptures,
} from "@/lib/api/signaling-v2";
import type { SigMessage } from "@/lib/api/signaling-schemas-v2";
import { Button } from "@/components/ui/button";
import { timeFraction } from "./time-scale";
import { Inspector } from "./Inspector";
import { MessagesTable } from "./MessagesTable";
import { RadioChart } from "./RadioChart";
import { Sidebar, DEFAULT_SIDEBAR, type SidebarFilters } from "./Sidebar";
import { SignalingMap } from "./SignalingMap";
import { CONN_LABEL, Timeline, type HoverState, type View } from "./Timeline";
import { callsAt, connectivityAt, eventForMessage, eventsAt, rfReadings, snapTimes, stepTime, tasksAt } from "./cursor";
import { fmtNum, fmtSec } from "./shared";

export function SignalingPage() {
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  // Hauteur de la timeline (échelle), mémorisée entre les sessions.
  const TL_SCALE_KEY = "bc4-signaling-tlscale";
  const [tlScale, setTlScale] = useState(0.6);
  useEffect(() => {
    
    const n = Number(window.localStorage.getItem(TL_SCALE_KEY));
    setTlScale(Number.isFinite(n) && n >= 0.55 && n <= 2 ? n : window.innerHeight < 820 ? 0.6 : 0.72);
  }, []);
  useEffect(() => {
    window.localStorage.setItem(TL_SCALE_KEY, String(tlScale));
  }, [tlScale]);
  const [mapOn, setMapOn] = useState(true);
  const [pageFull, setPageFull] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideW, setSideW] = useState(200);
  const [inspW, setInspW] = useState(340);
  const [view, setView] = useState<View | null>(null);
  const [cursorT, setCursorT] = useState<number | null>(null);
  // Curseur de prévisualisation (survol) : temps + position écran pour l'infobulle.
  const [hoverCur, setHoverCur] = useState<{ t: number; x: number; y: number } | null>(null);
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [selEventId, setSelEventId] = useState<string | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [selectedTip, setSelectedTip] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [sf, setSf] = useState<SidebarFilters>(DEFAULT_SIDEBAR);

  const capturesQ = useQuery({ queryKey: ["signaling", "captures"], queryFn: ({ signal }) => listSignalingCaptures(signal) });
  useEffect(() => {
    const first = capturesQ.data?.[0];
    if (!captureId && first) setCaptureId(first.id);
  }, [capturesQ.data, captureId]);

  const captureQ = useQuery({
    queryKey: ["signaling", "capture", captureId],
    queryFn: ({ signal }) => captureId ? getSignalingCapture(captureId, signal) : Promise.reject(new Error("Capture manquante")),
    enabled: !!captureId,
  });
  const messagesQ = useQuery({
    queryKey: ["signaling", "messages", captureId],
    queryFn: ({ signal }) => captureId ? getSignalingMessages(captureId, signal) : Promise.reject(new Error("Capture manquante")),
    enabled: !!captureId,
  });

  const capture = captureQ.data ?? null;
  useEffect(() => {
    if (capture) {
      setView({ start: 0, end: capture.duration_s });
      setCursorT(null);
      setHoverCur(null);
      setSelIdx(null);
      setSelEventId(null);
      setSelectedTip(null);
      setSf((f) => ({ ...f, tech: capture.tech === "LTE" ? "LTE" : "NR" }));
    }
  }, [capture?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const payloadQ = useQuery({
    queryKey: ["signaling", "payload", captureId, selIdx],
    queryFn: ({ signal }) => captureId && selIdx != null ? getSignalingPayload(captureId, selIdx, signal) : Promise.reject(new Error("Message manquant")),
    enabled: !!captureId && selIdx != null,
  });

  const layerCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of messagesQ.data ?? []) out[m.layer] = (out[m.layer] ?? 0) + 1;
    return out;
  }, [messagesQ.data]);

  const filteredMessages = useMemo(() => {
    let rows = messagesQ.data ?? [];
    rows = rows.filter((m) => sf.layers.has(m.layer));
    if (sf.dir !== "Toutes") rows = rows.filter((m) => m.dir === sf.dir);
    if (sf.procedure !== "Toutes") rows = rows.filter((m) => m.procedure === sf.procedure);
    return rows;
  }, [messagesQ.data, sf]);

  const selectedMessage: SigMessage | null = useMemo(
    () => (messagesQ.data ?? []).find((m) => m.index === selIdx) ?? null,
    [messagesQ.data, selIdx],
  );

  // Clic sur un événement / une tâche / un appel de la timeline.
  const onSelectTime = (t: number, messageIndex: number | null) => {
    setCursorT(t);
    const event = capture ? eventsAt(capture, t).find((e) => messageIndex == null || e.message_index === messageIndex) : null;
    setSelEventId(event?.id ?? null);
    const bounds = plotRef.current?.getBoundingClientRect();
    if (bounds) setSelectedTip({ x: bounds.left + bounds.width * timeFraction(t, effView.start, effView.end), y: bounds.top + 70 });
    setHoverCur(null);
    setHover(null);
    if (messageIndex != null) setSelIdx(messageIndex);
  };
  const onSelectEvent = (eventId: string, t: number, messageIndex: number | null) => {
    setSelEventId(eventId);
    onSelectTime(t, messageIndex);
  };
  // Clic sur un message : liste et pagination conservées, curseur positionné.
  const onSelectMessage = (m: SigMessage) => {
    setSelIdx(m.index);
    setCursorT(m.t);
    setSelEventId(capture ? eventForMessage(capture, m.index)?.id ?? null : null);
    setSelectedTip(null);
  };

  // --- Curseur temporel interactif ---
  const snaps = useMemo(() => (capture ? snapTimes(capture) : []), [capture]);
  const onHoverTime = (t: number | null, x: number, y: number) => setHoverCur(t == null ? null : { t, x, y });
  const onCursorDrag = (t: number) => {
    setCursorT(t);
    setSelEventId(capture ? eventsAt(capture, t)[0]?.id ?? null : null);
    setSelectedTip(null);
    setHoverCur(null);
  };
  const onStepCursor = (dir: 1 | -1) => onCursorDrag(stepTime(snaps, cursorT, dir, effView.start));
  const onClearCursor = () => {
    setCursorT(null);
    setSelectedTip(null);
    setSelEventId(null);
  };

  // Contenu de l'infobulle du curseur : uniquement des valeurs prouvées
  // (dernière mesure RF à ou avant t, états/tâches dont l'intervalle contient t).
  const tipInfo = useMemo(() => {
    const t = hoverCur?.t ?? (selectedTip ? cursorT : null);
    if (!capture || t == null) return null;
    return {
      t,
      events: eventsAt(capture, t),
      conns: connectivityAt(capture, t),
      tasks: tasksAt(capture, t),
      calls: callsAt(capture, t),
      rf: rfReadings(capture, t),
    };
  }, [capture, hoverCur, cursorT, selectedTip]);

  const effView = view ?? { start: 0, end: capture?.duration_s ?? 1 };
  const chartH = Math.max(80, Math.round((compact ? 110 : 150) * tlScale));
  const tipPosition = hoverCur ?? selectedTip;

  return (
    <div className="signaling-workspace flex h-[calc(100dvh-var(--app-header-offset))] min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {/* En-tête : technologie, capture, nombre de messages, durée */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-card px-4 py-2">
        <Button variant="ghost" size="sm"
          aria-label={sideOpen ? "Replier les filtres" : "Déplier les filtres"}
          onClick={() => setSideOpen((v) => !v)}
          className="rounded border p-1 text-muted-foreground hover:bg-muted"
        >
          {sideOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
        </Button>
        <h1 className="text-sm font-bold">Signaling View</h1>
        {capture && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{capture.tech}</span>}
        {capture && (
          <p className="num text-[11px] text-muted-foreground">
            Capture : {capture.name} · {fmtNum(capture.message_count)} messages · {fmtSec(0)} → {fmtSec(capture.duration_s)}
          </p>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex rounded border p-0.5" role="group" aria-label="Mode d'affichage">
            <Button variant="ghost" size="sm"
              onClick={() => setCompact(false)}
              aria-pressed={!compact}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${!compact ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Timeline
            </Button>
            <Button variant="ghost" size="sm"
              onClick={() => setCompact(true)}
              aria-pressed={compact}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${compact ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Compact
            </Button>
          </div>
          <Button variant="ghost" size="sm"
            onClick={() => setMapOn((v) => !v)}
            aria-pressed={mapOn}
            className="flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
          >
            Carte
            <span className={`relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors ${mapOn ? "bg-primary" : "bg-muted"}`}>
              <span className={`inline-block h-2.5 w-2.5 rounded-full bg-card transition-transform ${mapOn ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </span>
          </Button>
          <Button variant="ghost" size="sm"
            onClick={() => setPageFull((v) => !v)}
            aria-label={pageFull ? "Quitter le plein écran" : "Plein écran"}
            className="rounded border p-1.5 text-muted-foreground hover:bg-muted"
          >
            {pageFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </header>

      <div className={pageFull ? "fixed inset-0 z-50 flex min-h-0 flex-1 flex-col bg-background" : "flex min-h-0 min-w-0 flex-1"}>
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* Sidebar redimensionnable et repliable */}
          {sideOpen && (
            <aside style={{ "--filter-width": `${sideW}px` } as React.CSSProperties} className="signaling-filters shrink-0 overflow-hidden border-r bg-card">
              <Sidebar
                captures={capturesQ.data ?? []}
                captureId={captureId}
                onCapture={setCaptureId}
                filters={sf}
                onFilters={setSf}
                layerCounts={layerCounts}
              />
            </aside>
          )}
          <div className="flex w-1 shrink-0 cursor-col-resize items-center justify-center border-r bg-muted/40 hover:bg-accent" role="separator" aria-orientation="vertical" aria-label="Redimensionner les filtres"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = sideW;
              const move = (ev: MouseEvent) => setSideW(Math.min(360, Math.max(180, startW + ev.clientX - startX)));
              const up = () => {
                document.removeEventListener("mousemove", move);
                document.removeEventListener("mouseup", up);
              };
              document.addEventListener("mousemove", move);
              document.addEventListener("mouseup", up);
            }}
          />
          {/* Colonne centrale : timeline + tableau des messages */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2">
            <section className="panel relative max-h-[62%] shrink-0 overflow-auto" aria-label="Timeline RF et signalisation">
              {capture ? (
                <div ref={plotRef} className="relative min-w-0">
                  <Timeline
                    capture={capture}
                    view={effView}
                    onView={setView}
                    compact={compact}
                    cursorT={cursorT}
                    onSelectTime={onSelectTime}
                    onHover={setHover}
                    scaleY={tlScale}
                    hoverT={hoverCur?.t ?? null}
                    onHoverTime={onHoverTime}
                    onCursorDrag={onCursorDrag}
                    onStepCursor={onStepCursor}
                    onClearCursor={onClearCursor}
                    selectedEventId={selEventId}
                  />
                  <RadioChart series={capture.measurements} view={effView} cursorT={cursorT} height={chartH}
                    onHoverTime={onHoverTime} onSelectTime={(t) => onSelectTime(t, null)} />
                  {cursorT != null && cursorT >= effView.start && cursorT <= effView.end && (
                    <div className="signaling-cursor-line" style={{ left: `${timeFraction(cursorT, effView.start, effView.end) * 100}%`, top: 52 }} />
                  )}
                  {hoverCur && hoverCur.t >= effView.start && hoverCur.t <= effView.end && (
                    <div className="signaling-cursor-line signaling-cursor-preview" style={{ left: `${timeFraction(hoverCur.t, effView.start, effView.end) * 100}%`, top: 52 }} />
                  )}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                  {captureQ.isError ? "Capture indisponible (N/D)." : "Chargement de la capture…"}
                </div>
              )}
              {hover && !selectedTip && (
                <div className="pointer-events-none fixed z-[70] w-60 rounded-md border bg-popover p-2.5 text-[11px] shadow-xl" style={{ left: Math.min(hover.x + 14, window.innerWidth - 260), top: hover.y + 14 }}>
                  <p className="num font-mono font-semibold">{hover.title}</p>
                  {hover.lines.map((l, i) => (
                    <p key={i} className="mt-0.5 text-muted-foreground">{l}</p>
                  ))}
                </div>
              )}
              {/* Infobulle du curseur de survol : temps, état UE, tâches, mesures RF.
                  Repositionnée près des bords, jamais au-dessus d'une infobulle d'élément. */}
              {tipInfo && tipPosition && (
                <div
                  role="dialog" aria-label="Informations au curseur"
                  className="fixed z-[70] max-h-[45vh] w-64 overflow-auto rounded-md border bg-popover p-2.5 text-[11px] shadow-xl"
                  style={{
                    left: Math.min(tipPosition.x + 14, Math.max(8, window.innerWidth - 280)),
                    top: Math.min(tipPosition.y + 14, Math.max(8, window.innerHeight - 260)),
                  }}
                >
                  <div className="flex items-center justify-between"><p className="num font-mono font-semibold text-time-cursor">
                    t = {fmtSec(tipInfo.t)}
                  </p><Button variant="ghost" size="sm" className="h-5 px-1" aria-label="Fermer les informations du curseur" onClick={() => { setSelectedTip(null); setHoverCur(null); }}>×</Button></div>
                  {tipInfo.events.map((e) => (
                    <p key={e.id} className="mt-0.5 font-medium">
                      {e.name}
                      {e.tech ? ` — ${e.tech}` : ""}
                      {e.ecgi ? ` · ECGI ${e.ecgi}` : ""}
                      {e.pci != null ? ` · PCI ${e.pci}` : ""}
                    </p>
                  ))}
                  <p className="mt-0.5 text-muted-foreground">
                    État UE : {tipInfo.conns.length ? tipInfo.conns.map((c) => CONN_LABEL[c] ?? c).join(" + ") : "Inconnu"}
                  </p>
                  {tipInfo.tasks.length ? (
                    tipInfo.tasks.map((k) => (
                      <p key={k.id} className="mt-0.5 text-muted-foreground">
                        {k.label} ({k.dir}) : {fmtSec(k.start_s)} → {fmtSec(k.end_s)}
                        {k.throughput ? ` · ${k.throughput}` : ""}
                      </p>
                    ))
                  ) : (
                    <p className="mt-0.5 text-muted-foreground">Aucune tâche active</p>
                  )}
                  {tipInfo.calls.map((c) => (
                    <p key={c.id} className="mt-0.5 text-muted-foreground">
                      Appel {c.kind} — {c.state === "dropped" ? "drop" : "connecté"}
                    </p>
                  ))}
                  {tipInfo.rf.some((r) => r.value != null) ? (
                    tipInfo.rf.map((r) =>
                      r.value != null ? (
                        <p key={r.label} className="num mt-0.5 text-muted-foreground">
                          {r.label} : {r.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} {r.unit}
                          {r.dt != null && r.dt > 0 ? ` (mesure à −${fmtSec(r.dt)})` : ""}
                        </p>
                      ) : null,
                    )
                  ) : (
                    <p className="mt-0.5 text-muted-foreground">Aucune mesure RF à cet instant</p>
                  )}
                  {tipInfo.events.some((e) => e.message_index != null) && (
                    <Button variant="link" size="sm" className="mt-1 h-6 px-0 text-[11px]" onClick={() => {
                      const event = tipInfo.events.find((e) => e.message_index != null);
                      if (event?.message_index != null) setSelIdx(event.message_index);
                      setSelectedTip(null); setHoverCur(null);
                    }}>Voir les messages →</Button>
                  )}
                </div>
              )}
            </section>
            {/* Poignée de redimensionnement vertical de la timeline */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Redimensionner la timeline"
              title="Glissez pour agrandir ou réduire la timeline — double-clic pour la taille par défaut"
              className="-my-1 flex h-3 shrink-0 cursor-row-resize items-center justify-center rounded hover:bg-accent/50"
              onDoubleClick={() => setTlScale(window.innerHeight < 820 ? 0.6 : 0.72)}
              onMouseDown={(e) => {
                e.preventDefault();
                const startY = e.clientY;
                const startS = tlScale;
                const move = (ev: MouseEvent) => setTlScale(Math.min(2, Math.max(0.55, startS + (ev.clientY - startY) / 300)));
                const up = () => {
                  document.removeEventListener("mousemove", move);
                  document.removeEventListener("mouseup", up);
                };
                document.addEventListener("mousemove", move);
                document.addEventListener("mouseup", up);
              }}
            >
              <GripHorizontal className="h-3 w-3 text-muted-foreground/50" />
            </div>
            <MessagesTable
              messages={filteredMessages}
              total={(messagesQ.data ?? []).length}
              selectedIndex={selIdx}
              onSelect={onSelectMessage}
              getPayload={(index) => captureId ? getSignalingPayload(captureId, index) : Promise.reject(new Error("Capture manquante"))}
            />
          </div>

          {/* Colonne droite : carte GPS + inspecteur de payload */}
          <div className="flex w-1 shrink-0 cursor-col-resize items-center justify-center border-l bg-muted/40 hover:bg-accent" role="separator" aria-orientation="vertical" aria-label="Redimensionner l'inspecteur"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = inspW;
              const move = (ev: MouseEvent) => setInspW(Math.min(560, Math.max(260, startW - (ev.clientX - startX))));
              const up = () => {
                document.removeEventListener("mousemove", move);
                document.removeEventListener("mouseup", up);
              };
              document.addEventListener("mousemove", move);
              document.addEventListener("mouseup", up);
            }}
          />
          <aside style={{ "--inspector-width": `${inspW}px` } as React.CSSProperties} className="signaling-inspector flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden p-2 pl-0">
            {mapOn && capture && (
              <div className="panel h-[38%] min-h-44 shrink-0 overflow-hidden">
                <SignalingMap capture={capture} selectedEventId={selEventId} onSelectEvent={onSelectEvent} />
              </div>
            )}
            <div className="panel min-h-0 flex-1 overflow-hidden">
              <Inspector message={selectedMessage} payload={payloadQ.data ?? null} loading={payloadQ.isLoading} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
