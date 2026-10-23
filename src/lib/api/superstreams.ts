// Superstream adapter. A Superstream only groups existing project logs by id:
// it never copies, decodes or deletes logs. Real backend routes
// (/projects/{id}/superstreams) are used in API mode; the mock store keeps
// the same contract in localStorage, isolated per project.
import { z } from "zod";
import { ApiHttpError, apiFetch, apiOrMock } from "./http";
import { getImportReport } from "./projects";
import type { SuperstreamLog } from "@/features/projects/superstream-model";

export const SuperstreamSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  logIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Superstream = z.infer<typeof SuperstreamSchema>;
const ListSchema = z.array(SuperstreamSchema);

export type SuperstreamInput = { name: string; logIds: string[] };

/** Project logs from the existing import report. The report has no log id
 *  or import date, so the filename (+ occurrence index if repeated) is the id. */
export async function getProjectLogs(projectId: string, signal?: AbortSignal): Promise<SuperstreamLog[]> {
  const report = await getImportReport(projectId, signal);
  const seen = new Map<string, number>();
  return report.by_file.map((f) => {
    const n = seen.get(f.filename) ?? 0;
    seen.set(f.filename, n + 1);
    return {
      id: n === 0 ? f.filename : `${f.filename}#${n}`,
      filename: f.filename,
      n_captures: f.n_captures,
      n_events: f.n_events,
      n_gps: f.n_gps,
      imported_at: null,
    };
  });
}

const LS = (projectId: string) => `bc4.superstreams.${projectId}`;
function readMock(projectId: string): Superstream[] {
  try {
    const parsed = ListSchema.safeParse(JSON.parse(localStorage.getItem(LS(projectId)) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
function writeMock(projectId: string, list: Superstream[]) {
  localStorage.setItem(LS(projectId), JSON.stringify(list));
}
function assertUnique(list: Superstream[], name: string, selfId?: string) {
  const lower = name.trim().toLowerCase();
  if (list.some((s) => s.id !== selfId && s.name.toLowerCase() === lower)) {
    throw new ApiHttpError("CONFLICT", "A Superstream with this name already exists in this project.", 409);
  }
}
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/superstreams`;
const delay = () => new Promise((r) => setTimeout(r, 150));

export function listSuperstreams(projectId: string, signal?: AbortSignal): Promise<Superstream[]> {
  return apiOrMock(
    () => apiFetch(base(projectId), ListSchema, { signal }),
    async () => {
      await delay();
      return readMock(projectId);
    },
    "listSuperstreams",
  );
}

export function createSuperstream(projectId: string, input: SuperstreamInput): Promise<Superstream> {
  const body = { name: input.name.trim(), logIds: [...new Set(input.logIds)] };
  return apiOrMock(
    () => apiFetch(base(projectId), SuperstreamSchema, { method: "POST", body: JSON.stringify(body) }),
    async () => {
      await delay();
      const list = readMock(projectId);
      assertUnique(list, body.name);
      const now = new Date().toISOString();
      const s: Superstream = {
        id: `ss_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        projectId,
        ...body,
        createdAt: now,
        updatedAt: now,
      };
      writeMock(projectId, [...list, s]);
      return s;
    },
    "createSuperstream",
  );
}

export function updateSuperstream(projectId: string, id: string, input: SuperstreamInput): Promise<Superstream> {
  const body = { name: input.name.trim(), logIds: [...new Set(input.logIds)] };
  return apiOrMock(
    () =>
      apiFetch(`${base(projectId)}/${encodeURIComponent(id)}`, SuperstreamSchema, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    async () => {
      await delay();
      const list = readMock(projectId);
      const cur = list.find((s) => s.id === id);
      if (!cur) throw new ApiHttpError("NOT_FOUND", "Superstream not found", 404);
      assertUnique(list, body.name, id);
      const next = { ...cur, ...body, updatedAt: new Date().toISOString() };
      writeMock(projectId, list.map((s) => (s.id === id ? next : s)));
      return next;
    },
    "updateSuperstream",
  );
}

/** Removes only the grouping; logs and their data are untouched. */
export function deleteSuperstream(projectId: string, id: string): Promise<void> {
  return apiOrMock(
    async () => {
      await apiFetch(`${base(projectId)}/${encodeURIComponent(id)}`, z.unknown(), { method: "DELETE" });
    },
    async () => {
      await delay();
      writeMock(projectId, readMock(projectId).filter((s) => s.id !== id));
    },
    "deleteSuperstream",
  );
}
