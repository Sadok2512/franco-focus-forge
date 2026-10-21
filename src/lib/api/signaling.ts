// Adaptateur Signaling View — même contrat que les autres modules :
// la UI ne lit la donnée que via ces fonctions, Zod-valide le mode api,
// repli déterministe sur `src/mocks/signaling` en mode mock.
import { apiFetch, apiOrMock } from "./http";
import {
  SigCaptureMetaSchema,
  SigCaptureSchema,
  SigMessageSchema,
  SigPayloadSchema,
  type SigCapture,
  type SigCaptureMeta,
  type SigMessage,
  type SigPayload,
} from "./signaling-schemas";
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
  return apiOrMock(
    () => apiFetch("/signaling/captures", SigCaptureMetaSchema.array(), { signal }),
    async () => {
      await delay(150, signal);
      return SigCaptureMetaSchema.array().parse(SIGNALING_CAPTURES);
    },
    "listSignalingCaptures",
  );
}

export async function getSignalingCapture(id: string, signal?: AbortSignal): Promise<SigCapture> {
  return apiOrMock(
    () => apiFetch(`/signaling/captures/${encodeURIComponent(id)}`, SigCaptureSchema, { signal }),
    async () => {
      await delay(250, signal);
      const c = getMockCapture(id);
      if (!c) throw { code: "NOT_FOUND", message: "Capture introuvable" };
      return SigCaptureSchema.parse(c);
    },
    "getSignalingCapture",
  );
}

export async function getSignalingMessages(id: string, signal?: AbortSignal): Promise<SigMessage[]> {
  return apiOrMock(
    () => apiFetch(`/signaling/captures/${encodeURIComponent(id)}/messages`, SigMessageSchema.array(), { signal }),
    async () => {
      await delay(200, signal);
      return SigMessageSchema.array().parse(getMockMessages(id));
    },
    "getSignalingMessages",
  );
}

export async function getSignalingPayload(
  id: string,
  index: number,
  signal?: AbortSignal,
): Promise<SigPayload> {
  return apiOrMock(
    () =>
      apiFetch(
        `/signaling/captures/${encodeURIComponent(id)}/messages/${index}/payload`,
        SigPayloadSchema,
        { signal },
      ),
    async () => {
      await delay(120, signal);
      const p = getMockPayload(id, index);
      if (!p) throw { code: "NOT_FOUND", message: "Message introuvable" };
      return SigPayloadSchema.parse(p);
    },
    "getSignalingPayload",
  );
}
