// Superstream API client — NMFHE2.
//
// Un superstream groupe par ID des logs EXISTANTS d'un projet : il ne
// copie, ne décode, ni ne supprime aucune donnée. 100% back
// (`/projects/{id}/superstreams`) — plus de simulation localStorage.
// Une erreur back s'affiche comme une erreur (toUserMessage), jamais
// comme un succès silencieux.
//
// Nettoyage des clés `bc4.superstreams.<pid>` écrites par la version
// précédente mocked : `clearSuperstreamsLocalStorageMock()` est appelé
// par `src/features/projects/SuperstreamTree.tsx` à l'`useEffect` initial.
import { z } from "zod";
import { apiFetch, ApiHttpError } from "./http";
import { getImportReport } from "./projects";
import type { SuperstreamLog } from "@/features/projects/superstream-model";

// Shape renvoyée par le back. captureIds et positions sont des champs
// additifs (NMFHE2) ; ignorés par le dialog actuel, utilisés par le
// consommateur `GET /stream` (lot ultérieur Signaling/Metrics).
const SuperstreamMemberSchema = z.object({
  position: z.number().int().nonnegative(),
  captureId: z.string(),
  captureName: z.string(),
});

export const SuperstreamSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  logIds: z.array(z.string()),
  captureIds: z.array(z.string()),
  positions: z.array(z.number().int().nonnegative()),
  members: z.array(SuperstreamMemberSchema),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Superstream = z.infer<typeof SuperstreamSchema>;
const ListSchema = z.array(SuperstreamSchema);

export type SuperstreamInput = { name: string; captureIds: string[] };

/** Project logs from the existing import report. `imported_at` et
 *  `n_records` sont alimentés depuis NmfFileEntry (NMFHE2). */
export async function getProjectLogs(
  projectId: string,
  signal?: AbortSignal,
): Promise<SuperstreamLog[]> {
  const report = await getImportReport(projectId, signal);
  const seen = new Map<string, number>();
  return report.by_file.map((f) => {
    const n = seen.get(f.filename) ?? 0;
    seen.set(f.filename, n + 1);
    return {
      id: n === 0 ? f.filename : `${f.filename}#${n}`,
      filename: f.filename,
      status: f.status,
      n_captures: f.n_captures,
      n_events: f.n_events,
      n_gps: f.n_gps,
      n_records: f.n_records ?? null,
      imported_at: f.imported_at ?? null,
      capture_ids: f.capture_ids ?? [],
    };
  });
}

export async function getProjectCaptures(projectId: string, signal?: AbortSignal) {
  const logs = await getProjectLogs(projectId, signal);
  return logs.flatMap((log) =>
    log.capture_ids.map((captureId) => ({
      id: captureId,
      captureId,
      filename: log.filename,
      label: log.capture_ids.length > 1 ? `${log.filename} · ${captureId}` : log.filename,
      status: log.status,
      n_events: log.n_events,
      n_gps: log.n_gps,
      n_records: log.n_records,
      imported_at: log.imported_at,
    })),
  );
}

/** Nettoie les clés `bc4.superstreams.<pid>` écrites par la version
 *  précédente simulée. Idempotent, aucun effet si rien à nettoyer. */
export function clearSuperstreamsLocalStorageMock(): number {
  if (typeof window === "undefined") return 0;
  let removed = 0;
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith("bc4.superstreams.")) {
      window.localStorage.removeItem(k);
      removed += 1;
    }
  }
  return removed;
}

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/superstreams`;

export function listSuperstreams(projectId: string, signal?: AbortSignal): Promise<Superstream[]> {
  return apiFetch(base(projectId), ListSchema, { signal });
}

export function createSuperstream(
  projectId: string,
  input: SuperstreamInput,
): Promise<Superstream> {
  const body = { name: input.name.trim(), captureIds: [...input.captureIds] };
  return apiFetch(base(projectId), SuperstreamSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function renameSuperstream(
  projectId: string,
  id: string,
  revision: number,
  name: string,
): Promise<Superstream> {
  return apiFetch(`${base(projectId)}/${encodeURIComponent(id)}`, SuperstreamSchema, {
    method: "PATCH",
    headers: { "If-Match": `"${revision}"` },
    body: JSON.stringify({ name: name.trim() }),
  });
}

export function replaceSuperstreamMembers(
  projectId: string,
  id: string,
  revision: number,
  captureIds: string[],
): Promise<Superstream> {
  return apiFetch(`${base(projectId)}/${encodeURIComponent(id)}/members`, SuperstreamSchema, {
    method: "PUT",
    headers: { "If-Match": `"${revision}"` },
    body: JSON.stringify({ captureIds: [...captureIds] }),
  });
}

/** Removes only the grouping; logs and their data are untouched. */
export async function deleteSuperstream(
  projectId: string,
  id: string,
  revision: number,
): Promise<void> {
  await apiFetch(`${base(projectId)}/${encodeURIComponent(id)}`, z.unknown(), {
    method: "DELETE",
    headers: { "If-Match": `"${revision}"` },
  });
}

export function superstreamPreconditionStatus(error: unknown): 409 | 428 | null {
  return error instanceof ApiHttpError && (error.status === 409 || error.status === 428)
    ? error.status
    : null;
}
