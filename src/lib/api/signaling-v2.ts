// PHASE B — Signaling v2 isolated preview.
// Pinned to GitHub commit 75061ccbc4cb38c036f5d03ab08ccd5f89b60474.
// MOCK-ONLY : par mandat Phase B, aucune API réelle n'est appelée ici.
// Phase C ajoutera l'adaptateur BC4 → contrats SigCapture / SigMessage /
// SigPayload via un module séparé (signaling-v2-adapter.ts) et le switch
// se fera via la route /signaling-v2 uniquement.
import {
  SigCaptureMetaSchema,
  SigCaptureSchema,
  SigMessageSchema,
  SigPayloadSchema,
  type SigCapture,
  type SigCaptureMeta,
  type SigMessage,
  type SigPayload,
} from "./signaling-schemas-v2";
import { SIGNALING_CAPTURES, getMockCapture, getMockMessages, getMockPayload } from "@/mocks/signaling";

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      rej(new DOMException("Aborted", "AbortError"));
    });
  });

export async function listSignalingCaptures(signal?: AbortSignal): Promise<SigCaptureMeta[]> {
  await delay(150, signal);
  return SigCaptureMetaSchema.array().parse(SIGNALING_CAPTURES);
}

export async function getSignalingCapture(id: string, signal?: AbortSignal): Promise<SigCapture> {
  await delay(250, signal);
  const c = getMockCapture(id);
  if (!c) throw { code: "NOT_FOUND", message: "Capture introuvable" };
  return SigCaptureSchema.parse(c);
}

export async function getSignalingMessages(id: string, signal?: AbortSignal): Promise<SigMessage[]> {
  await delay(200, signal);
  return SigMessageSchema.array().parse(getMockMessages(id));
}

export async function getSignalingPayload(
  id: string,
  index: number,
  signal?: AbortSignal,
): Promise<SigPayload> {
  await delay(120, signal);
  const p = getMockPayload(id, index);
  if (!p) throw { code: "NOT_FOUND", message: "Message introuvable" };
  return SigPayloadSchema.parse(p);
}
