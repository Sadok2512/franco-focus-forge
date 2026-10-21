// Signaling View adapter: upstream capture UI translated to BC4 project API.
import { z } from "zod";
import { apiFetch, isApiMode } from "./http";
import { SigCaptureMetaSchema, SigCaptureSchema, SigMessageSchema, SigPayloadSchema, type SigCapture, type SigCaptureMeta, type SigMessage, type SigPayload } from "./signaling-schemas";
import { SIGNALING_CAPTURES, getMockCapture, getMockMessages, getMockPayload } from "@/mocks/signaling";

let projectId: string | null = null;
export function setSignalingProjectId(id: string | null) { projectId = id; }
const enc = encodeURIComponent;
const anySchema = z.unknown();
const requireProject = () => { if (!projectId) throw new Error("Active project missing"); return projectId; };
export async function getSignaling(project: string, kind: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<any> {
  const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  return apiFetch(`/projects/${enc(project)}/signaling${kind === "rows" ? "" : `/${kind}`}?${q}`, anySchema, { signal });
}
function toMeta(r: any): SigCaptureMeta { return SigCaptureMetaSchema.parse({ id: r.capture_id, name: r.label ?? r.capture_id, captured_at: "", tech: r.env ?? "LTE", message_count: 0, duration_s: 0 }); }

export async function listSignalingCaptures(signal?: AbortSignal): Promise<SigCaptureMeta[]> {
  if (!isApiMode() || !projectId) return SigCaptureMetaSchema.array().parse(SIGNALING_CAPTURES);
  const raw = await apiFetch(`/projects/${enc(requireProject())}/signaling/captures`, anySchema, { signal }) as any;
  return (raw.captures ?? []).map(toMeta);
}

export async function getSignalingCapture(id: string, signal?: AbortSignal): Promise<SigCapture> {
  if (!isApiMode() || !projectId) return SigCaptureSchema.parse(getMockCapture(id));
  const base = `/projects/${enc(requireProject())}/signaling`;
  const [ev, tl, pts] = await Promise.all([
    apiFetch(`${base}/events?capture_id=${enc(id)}&view=rf`, anySchema, { signal }),
    apiFetch(`${base}/timeline?capture_id=${enc(id)}&bucket_s=1`, anySchema, { signal }),
    apiFetch(`${base}/points?capture_id=${enc(id)}`, anySchema, { signal }),
  ]) as any[];
  const events = (ev.events ?? []).filter((e: any) => e.t_rel_s != null).map((e: any) => ({ id: e.id, t: e.t_rel_s, name: e.label, tech: e.attrs?.technology ?? null, severity: e.outcome === "fail" ? "error" : e.outcome === "ok" ? "success" : "event", message_index: e.seq, ecgi: null, pci: null }));
  const duration = Math.max(0, ...events.map((e: any) => e.t), ...(tl.buckets ?? []).map((b: any) => b.t_rel_s));
  const track = (pts.points ?? []).filter((p: any) => p.lat != null && p.lng != null).map((p: any) => ({ t: p.t_rel_s ?? 0, lat: p.lat, lng: p.lng }));
  return SigCaptureSchema.parse({ id, name: id, captured_at: "", tech: "LTE", message_count: 0, duration_s: duration, connectivity: [], events, tasks: [], calls: [], mobility: [], measurements: [], track, events_gps: [] });
}

export async function getSignalingMessages(id: string, signal?: AbortSignal): Promise<SigMessage[]> {
  if (!isApiMode() || !projectId) return SigMessageSchema.array().parse(getMockMessages(id));
  const base = `/projects/${enc(requireProject())}/signaling?capture_id=${enc(id)}&size=500`;
  const first = await apiFetch(`${base}&page=1`, anySchema, { signal }) as any;
  const pages = Number(first.pages ?? 1);
  const rest = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => apiFetch(`${base}&page=${i + 2}`, anySchema, { signal }))) : [];
  const rows = [first, ...rest].flatMap((r: any) => r.rows ?? []);
  return rows.map((r: any) => SigMessageSchema.parse({ index: r.seq, t: r.t_rel_s ?? 0, dir: r.direction === "UL" ? "UL" : "DL", layer: r.protocol, name: r.message_name, procedure: r.procedure_id ?? "", ecgi: r.ecgi, pci: r.pci, earfcn: null, rsrp: null, rsrq: null, sinr: null, octets: r.size_bytes ?? 0 }));
}

export async function getSignalingPayload(id: string, index: number, signal?: AbortSignal): Promise<SigPayload> {
  if (!isApiMode() || !projectId) return SigPayloadSchema.parse(getMockPayload(id, index));
  const raw = await apiFetch(`/projects/${enc(requireProject())}/signaling/details?capture_id=${enc(id)}&seq=${index}`, anySchema, { signal }) as any;
  return SigPayloadSchema.parse({ decoded: raw.tree ?? { key: "Unavailable" }, hex: raw.hex ?? "", params: (raw.parameters ?? []).map((p: any) => ({ key: p.path, value: String(p.value ?? ""), unit: null })), call_flow: [], details: { source: raw.tree_source ?? "" } });
}
