// Signaling v2 client — switch mock / api piloté par
// `setSignalingV2Mode()` depuis la route /signaling-v2.
// Phase B : "mock" uniquement. Phase C : "api" ajoute l'adaptateur BC4.
// Le code UI ne change pas (mêmes signatures listSignalingCaptures /
// getSignalingCapture / getSignalingMessages / getSignalingPayload).
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
import * as adapter from "./signaling-v2-adapter";

export type SignalingV2Mode = "mock" | "api";
let currentMode: SignalingV2Mode = "mock";
export function setSignalingV2Mode(mode: SignalingV2Mode) {
  currentMode = mode;
}
export function getSignalingV2Mode(): SignalingV2Mode {
  return currentMode;
}
export { setSignalingV2Project } from "./signaling-v2-adapter";

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      rej(new DOMException("Aborted", "AbortError"));
    });
  });

export async function listSignalingCaptures(signal?: AbortSignal): Promise<SigCaptureMeta[]> {
  if (currentMode === "api") return adapter.listSignalingCaptures(signal);
  await delay(150, signal);
  return SigCaptureMetaSchema.array().parse(SIGNALING_CAPTURES);
}

export async function getSignalingCapture(id: string, signal?: AbortSignal): Promise<SigCapture> {
  if (currentMode === "api") return adapter.getSignalingCapture(id, signal);
  await delay(250, signal);
  const c = getMockCapture(id);
  if (!c) throw { code: "NOT_FOUND", message: "Capture introuvable" };
  return SigCaptureSchema.parse(c);
}

export async function getSignalingMessages(id: string, signal?: AbortSignal): Promise<SigMessage[]> {
  if (currentMode === "api") return adapter.getSignalingMessages(id, signal);
  await delay(200, signal);
  return SigMessageSchema.array().parse(getMockMessages(id));
}

export async function getSignalingPayload(
  id: string,
  index: number,
  signal?: AbortSignal,
): Promise<SigPayload> {
  if (currentMode === "api") return adapter.getSignalingPayload(id, index, signal);
  await delay(120, signal);
  const p = getMockPayload(id, index);
  if (!p) throw { code: "NOT_FOUND", message: "Message introuvable" };
  return SigPayloadSchema.parse(p);
}
