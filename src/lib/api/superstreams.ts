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
import { apiFetch } from "./http";
import { getImportReport } from "./projects";
import type { SuperstreamLog } from "@/features/projects/superstream-model";

// Shape renvoyée par le back. captureIds et positions sont des champs
// additifs (NMFHE2) ; ignorés par le dialog actuel, utilisés par le
// consommateur `GET /stream` (lot ultérieur Signaling/Metrics).
export const SuperstreamSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  logIds: z.array(z.string()),
  captureIds: z.array(z.string()).optional(),
  positions: z.array(z.number()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Superstream = z.infer<typeof SuperstreamSchema>;
const ListSchema = z.array(SuperstreamSchema);

export type SuperstreamInput = { name: string; logIds: string[] };

/** Project logs from the existing import report. `imported_at` et
 *  `n_records` sont alimentés depuis NmfFileEntry (NMFHE2). */
export async function getProjectLogs(projectId: string, signal?: AbortSignal): Promise<SuperstreamLog[]> {
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
    };
  });
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

export function createSuperstream(projectId: string, input: SuperstreamInput): Promise<Superstream> {
  const body = { name: input.name.trim(), logIds: [...new Set(input.logIds)] };
  return apiFetch(base(projectId), SuperstreamSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSuperstream(projectId: string, id: string, input: SuperstreamInput): Promise<Superstream> {
  const body = { name: input.name.trim(), logIds: [...new Set(input.logIds)] };
  return apiFetch(`${base(projectId)}/${encodeURIComponent(id)}`, SuperstreamSchema, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** Removes only the grouping; logs and their data are untouched. */
export async function deleteSuperstream(projectId: string, id: string): Promise<void> {
  await apiFetch(`${base(projectId)}/${encodeURIComponent(id)}`, z.unknown(), {
    method: "DELETE",
  });
}
