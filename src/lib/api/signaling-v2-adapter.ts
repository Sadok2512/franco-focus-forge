// PHASE C — BC4 → Signaling v2 (GitHub contracts) adapter.
//
// Traduit les 10 endpoints BC4 /projects/{pid}/signaling/* vers les 4
// contrats attendus par la UI GitHub (pin 75061cc) :
//
//   listSignalingCaptures   → BC4 /signaling/captures
//   getSignalingCapture(id) → BC4 /signaling/events + /points + /timeline
//   getSignalingMessages(id) → BC4 /signaling (paginé, fanout toutes pages)
//   getSignalingPayload(id, index) → BC4 /signaling/details (seq via cache)
//
// Règles d'intégrité (CLAUDE.md Rule 2) :
//   - null → N/D explicite, jamais 0 fabriqué (sauf champs non-nullable
//     du schéma GH où un défaut documenté est utilisé — voir KNOWN_FALLBACKS)
//   - direction UL/DL : utiliser row.direction du back si présent, sinon
//     "DL" par défaut documenté (jamais inférer depuis message_name seul)
//   - RSRP/RSRQ/SINR : null au niveau message (BC4 ne les joint pas aux
//     rows signaling, nmf_cell_second est séparé) — Phase D pourra enrichir
//   - call_flow : vide (BC4 n'a pas de source VoLTE/VoNR dédiée)
//   - connectivity segments : vides (BC4 n'a pas d'intervals LTE/EN-DC/NR-SA
//     reconstruits côté back ; les events lane=connexion sont des marks ponctuels)
//
import { apiFetch } from "./http";
import {
  SigCaptureMetaSchema,
  SigCaptureSchema,
  SigMessageSchema,
  SigPayloadSchema,
  type SigCapture,
  type SigCaptureMeta,
  type SigEvent,
  type SigMessage,
  type SigMobilityEvent,
  type SigPayload,
  type SigPayloadNode,
  type SigTrackPoint,
} from "./signaling-schemas-v2";
import { z } from "zod";

// --------- Project context ---------
// La UI GitHub n'a pas de notion de projet. On injecte via un setter
// module-level depuis la route /signaling-v2 avant tout rendu.
let activeProjectId: string | null = null;
export function setSignalingV2Project(projectId: string | null) {
  activeProjectId = projectId;
}
function requireProject(): string {
  if (!activeProjectId)
    throw { code: "NO_PROJECT", message: "Projet actif requis pour /signaling-v2" };
  return activeProjectId;
}

// --------- BC4 raw schemas (minimal, pour parser côté adapter) ---------
const BcCaptureSchema = z.object({
  capture_id: z.string(),
  label: z.string(),
  env: z.string().nullable(),
});
const BcCapturesEnvelopeSchema = z.object({
  project_id: z.string(),
  captures: z.array(BcCaptureSchema),
});
const BcRowSchema = z.object({
  capture_id: z.string(),
  seq: z.number(),
  t_rel_s: z.number().nullable(),
  protocol: z.string(),
  layer: z.string().optional(),
  technology: z.string().nullable(),
  direction: z.string().nullable(),
  message_name: z.string(),
  ecgi: z.string().nullable(),
  pci: z.number().nullable(),
  size_bytes: z.number().nullable(),
  procedure_id: z.string().nullable(),
  procedure_ids: z.array(z.string()),
  has_tree: z.boolean(),
  source: z.string(),
});
const BcRowsEnvelopeSchema = z.object({
  rows: z.array(BcRowSchema),
  total: z.number(),
  page: z.number(),
  size: z.number(),
  pages: z.number(),
});
const BcEventSchema = z.object({
  id: z.string(),
  lane: z.string(),
  type: z.string(),
  kind: z.string(),
  seq: z.number(),
  seq_end: z.number().nullable(),
  t_rel_s: z.number().nullable(),
  t_rel_end_s: z.number().nullable(),
  duration_ms: z.number().nullable(),
  outcome: z.string().nullable(),
  cause: z.string().nullable(),
  label: z.string(),
  attrs: z.record(z.unknown()),
  pivot_seq: z.number().nullable(),
  linked_seqs: z.array(z.number()),
  link_rule: z.string(),
  seq_gap: z.number().nullable(),
});
const BcEventsEnvelopeSchema = z.object({
  events: z.array(BcEventSchema),
  total: z.number(),
  lanes: z.array(z.string()),
  counts_by_lane: z.record(z.number()),
  missing_time: z.number(),
});
const BcPointSchema = z.object({
  seq: z.number(),
  t_rel_s: z.number().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  gps_seq: z.number().nullable(),
  seq_gap: z.number().nullable(),
});
const BcPointsEnvelopeSchema = z.object({
  points: z.array(BcPointSchema),
  positioned_count: z.number(),
});
const BcDetailsSchema = z.object({
  seq: z.number(),
  tree: z.record(z.unknown()),
  parameters: z.array(
    z.object({ path: z.string(), value: z.unknown(), param_key: z.string().nullable() }),
  ),
  text: z.string(),
  hex: z.string().nullable(),
  hex_reason: z.string().nullable(),
  tree_source: z.string(),
  tree_route_gap: z.string(),
});

// --------- Caches ---------
// index ↔ seq cache per capture : getSignalingMessages assigne un index
// stable 0..N-1 par tri (capture_id, seq) ; getSignalingPayload(id, index)
// retrouve le seq correspondant.
const seqByCapture = new Map<string, number[]>();
// Cache meta captures pour enrichir listSignalingCaptures sans refetch.
const captureMetaCache = new Map<string, { name: string; label: string }>();

// --------- Helpers de mapping ---------
function extractCapturedAt(label: string): string {
  // Nemo label pattern: ..._26Jun23_110007.4.nmf → 2023-06-26T11:00:07
  const m = label.match(/_(\d{2})([A-Za-z]{3})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return label;
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const [, d, monAbbr, yy, hh, mm, ss] = m;
  const mon = months[monAbbr!] ?? "01";
  return `20${yy}-${mon}-${d}T${hh}:${mm}:${ss}Z`;
}

function laneToTech(lanes: string[]): "LTE" | "NR" | "EN-DC" {
  if (lanes.includes("endc")) return "EN-DC";
  if (lanes.some((l) => l === "nr")) return "NR";
  return "LTE";
}

function kindOutcomeToSeverity(
  kind: string,
  outcome: string | null,
): "info" | "success" | "warning" | "error" | "event" {
  if (outcome === "fail" || kind === "fail" || kind === "x") return "error";
  if (outcome === "incomplete") return "warning";
  if (outcome === "ok") return "success";
  if (kind === "mark" || kind === "tri") return "event";
  return "info";
}

function toSigEvent(e: z.infer<typeof BcEventSchema>): SigEvent {
  return {
    id: e.id,
    t: e.t_rel_s ?? 0,
    name: e.label,
    tech:
      typeof e.attrs["technology"] === "string"
        ? (e.attrs["technology"] as string)
        : null,
    severity: kindOutcomeToSeverity(e.kind, e.outcome),
    message_index: null, // Phase D : seq→index lookup via seqByCapture
    ecgi: null,
    pci: null,
  };
}

function toSigMobility(e: z.infer<typeof BcEventSchema>): SigMobilityEvent {
  const kind =
    e.outcome === "fail" || e.kind === "fail"
      ? "failure"
      : e.outcome === "ok"
        ? "success"
        : e.kind === "x"
          ? "drop"
          : "ho";
  return {
    id: e.id,
    t: e.t_rel_s ?? 0,
    name: e.label,
    kind,
    message_index: null,
  };
}

function toSigTrackPoint(p: z.infer<typeof BcPointSchema>): SigTrackPoint {
  return { t: p.t_rel_s ?? 0, lat: p.lat as number, lng: p.lng as number };
}

function toPayloadNode(key: string, value: unknown): SigPayloadNode {
  if (value === null || value === undefined) return { key, value: "null" };
  if (Array.isArray(value)) {
    return {
      key,
      children: value.map((v, i) => toPayloadNode(`[${i}]`, v)),
    };
  }
  if (typeof value === "object") {
    return {
      key,
      children: Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        toPayloadNode(k, v),
      ),
    };
  }
  return { key, value: String(value) };
}

// --------- Exported API (GitHub signatures preserved) ---------

export async function listSignalingCaptures(signal?: AbortSignal): Promise<SigCaptureMeta[]> {
  const projectId = requireProject();
  const env = await apiFetch(
    `/projects/${encodeURIComponent(projectId)}/signaling/captures`,
    BcCapturesEnvelopeSchema,
    { signal },
  );
  captureMetaCache.clear();
  const metas: SigCaptureMeta[] = env.captures.map((c) => {
    captureMetaCache.set(c.capture_id, { name: c.label, label: c.label });
    return SigCaptureMetaSchema.parse({
      id: c.capture_id,
      name: c.label,
      captured_at: extractCapturedAt(c.label),
      tech: "LTE", // enrichi dans getSignalingCapture
      message_count: 0, // enrichi à la sélection
      duration_s: 0,
    });
  });
  return metas;
}

export async function getSignalingCapture(id: string, signal?: AbortSignal): Promise<SigCapture> {
  const projectId = requireProject();
  const q = `capture_id=${encodeURIComponent(id)}`;
  const base = `/projects/${encodeURIComponent(projectId)}/signaling`;
  const [rowsEnv, eventsEnv, pointsEnv] = await Promise.all([
    apiFetch(`${base}?${q}&page=1&size=1`, BcRowsEnvelopeSchema, { signal }),
    apiFetch(`${base}/events?${q}`, BcEventsEnvelopeSchema, { signal }),
    apiFetch(`${base}/points?${q}`, BcPointsEnvelopeSchema, { signal }),
  ]);
  const totalMessages = rowsEnv.total;
  const maxT = Math.max(
    ...eventsEnv.events.map((e) => e.t_rel_end_s ?? e.t_rel_s ?? 0),
    ...pointsEnv.points.map((p) => p.t_rel_s ?? 0),
    0,
  );
  const meta = captureMetaCache.get(id);
  const name = meta?.name ?? id;
  const capturedAt = extractCapturedAt(meta?.label ?? id);
  const sigEvents = eventsEnv.events
    .filter((e) => ["acces", "services", "contexte"].includes(e.lane))
    .map(toSigEvent);
  const sigMobility = eventsEnv.events
    .filter((e) => e.lane === "mobilite")
    .map(toSigMobility);
  const track = pointsEnv.points.filter((p) => p.lat != null && p.lng != null).map(toSigTrackPoint);
  const capture: SigCapture = {
    id,
    name,
    captured_at: capturedAt,
    tech: laneToTech(eventsEnv.lanes),
    message_count: totalMessages,
    duration_s: maxT,
    // Les sources BC4 pour les contrats suivants ne sont pas disponibles
    // en Phase C — déclaration N/D explicite plutôt que fabrication :
    connectivity: [], // BC4 n'a pas d'intervals LTE/EN-DC/NR-SA
    tasks: [], // BC4 n'a pas d'events data-task DL/UL dédiés
    calls: [], // BC4 n'a pas de source VoLTE/VoNR
    measurements: [], // BC4 /metrics time-series séparé, non intégré Phase C
    events: sigEvents,
    mobility: sigMobility,
    track,
    events_gps: [], // Phase D : joindre events ↔ points par seq_gap
  };
  return SigCaptureSchema.parse(capture);
}

export async function getSignalingMessages(id: string, signal?: AbortSignal): Promise<SigMessage[]> {
  const projectId = requireProject();
  const base = `/projects/${encodeURIComponent(projectId)}/signaling`;
  const q = `capture_id=${encodeURIComponent(id)}`;
  const pageSize = 500;
  const first = await apiFetch(
    `${base}?${q}&page=1&size=${pageSize}`,
    BcRowsEnvelopeSchema,
    { signal },
  );
  const allRows = [...first.rows];
  const totalPages = first.pages;
  if (totalPages > 1) {
    const otherPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        apiFetch(`${base}?${q}&page=${i + 2}&size=${pageSize}`, BcRowsEnvelopeSchema, { signal }),
      ),
    );
    for (const p of otherPages) allRows.push(...p.rows);
  }
  // Tri stable par seq pour un index déterministe.
  allRows.sort((a, b) => a.seq - b.seq);
  seqByCapture.set(
    id,
    allRows.map((r) => r.seq),
  );
  const messages: SigMessage[] = allRows.map((r, index) => {
    const dir: "UL" | "DL" =
      r.direction === "UL" || r.direction === "DL"
        ? r.direction
        : "DL"; // Fallback documenté : BC4 null direction (event state) → DL par défaut
    return {
      index,
      t: r.t_rel_s ?? 0,
      dir,
      // Spec v10 Sidebar filtre sur layers = {"RRC NR","RRC LTE","NAS",
      // "Événements Nemo","MAC-RACH"} — ces libellés matchent exactement
      // le champ BC4 `protocol`. On expose donc protocol en priorité.
      layer: r.protocol.trim(),
      name: r.message_name,
      procedure: r.procedure_id ?? "",
      ecgi: r.ecgi,
      pci: r.pci,
      earfcn: null, // Phase D : /signaling/context ou nmf_cell_second
      rsrp: null,
      rsrq: null,
      sinr: null,
      octets: r.size_bytes ?? 0, // Fallback : null → 0 (contrat GH non-nullable)
    };
  });
  return SigMessageSchema.array().parse(messages);
}

export async function getSignalingPayload(
  id: string,
  index: number,
  signal?: AbortSignal,
): Promise<SigPayload> {
  const projectId = requireProject();
  const seqs = seqByCapture.get(id);
  if (!seqs || index < 0 || index >= seqs.length) {
    throw {
      code: "INDEX_UNKNOWN",
      message: `Index ${index} inconnu — charger getSignalingMessages d'abord`,
    };
  }
  const seq = seqs[index]!;
  const base = `/projects/${encodeURIComponent(projectId)}/signaling/details`;
  const d = await apiFetch(
    `${base}?capture_id=${encodeURIComponent(id)}&seq=${seq}`,
    BcDetailsSchema,
    { signal },
  );
  const decoded: SigPayloadNode = {
    key: "root",
    children: Object.entries(d.tree).map(([k, v]) => toPayloadNode(k, v)),
  };
  const payload: SigPayload = {
    decoded,
    hex: d.hex ?? "",
    params: d.parameters.map((p) => ({
      key: p.path,
      value: p.value == null ? "null" : String(p.value),
      unit: null,
    })),
    call_flow: [], // BC4 pas de source — déclaré N/D
    details: {
      seq: String(d.seq),
      tree_source: d.tree_source,
      tree_route_gap: d.tree_route_gap,
      ...(d.hex_reason ? { hex_reason: d.hex_reason } : {}),
    },
  };
  return SigPayloadSchema.parse(payload);
}
