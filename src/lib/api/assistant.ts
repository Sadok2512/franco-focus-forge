// Assistant IA adapter. POST /projects/{id}/assistant → backend HTTP si
// VITE_BC4_DATA=api, sinon mock. Les endpoints d'historique
// (list/create/rename/delete/append) restent MOCK-ONLY tant que le backend
// ne les expose pas (écart ouvert déclaré dans le CHANGELOG).
import { runEngine } from "@/mocks/assistant";
import { apiFetch, apiOrMock, isApiMode } from "./http";
import {
  AssistantRequestSchema,
  AssistantResponseSchema,
  ConversationSchema,
  type AssistantFilters,
  type AssistantRequest,
  type AssistantResponse,
  type ChatMessage,
  type Conversation,
  type ExecStep,
} from "./assistant-schemas";
import { PROJECTS } from "./fixtures";
import type { FilterContext, Project } from "./schemas";

export const ASSISTANT_LATENCY = { scale: 1 };

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    if (signal?.aborted) return rej(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(res, ms * ASSISTANT_LATENCY.scale);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      rej(new DOMException("Aborted", "AbortError"));
    });
  });

/** Drops filter values that do not exist in the project (project change must invalidate them). */
export function effectiveFilters(
  p: Project,
  f: FilterContext | AssistantFilters,
): { filters: AssistantFilters; dropped: string[] } {
  const dropped: string[] = [];
  const keep = <T extends string>(k: string, v: T[] | undefined, allowed: readonly string[]) => {
    if (!v?.length) return undefined;
    const ok = v.filter((x) => allowed.includes(x));
    v.filter((x) => !allowed.includes(x)).forEach((x) => dropped.push(`${k}=${x}`));
    return ok.length ? ok : undefined;
  };
  const filters: AssistantFilters = {
    op: keep("op", f.op, p.operators),
    tech: keep("tech", f.tech, p.technologies),
    svc: keep("svc", f.svc, p.services),
    band: keep("band", f.band, p.bands),
    dep: keep("dep", f.dep, p.departements),
  };
  for (const k of Object.keys(filters) as (keyof AssistantFilters)[])
    if (filters[k] === undefined) delete filters[k];
  return { filters, dropped };
}

let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** POST /projects/{id}/assistant */
export async function postAssistant(
  req: AssistantRequest,
  opts: { signal?: AbortSignal; onStep?: (s: ExecStep, i: number) => void } = {},
): Promise<AssistantResponse> {
  const r = AssistantRequestSchema.parse(req);
  return apiOrMock(
    () => _apiPostAssistant(r, opts),
    () => _mockPostAssistant(r, opts),
    "postAssistant",
  );
}

async function _apiPostAssistant(
  r: AssistantRequest,
  opts: { signal?: AbortSignal; onStep?: (s: ExecStep, i: number) => void },
): Promise<AssistantResponse> {
  // Backend B0 : scénarios complets reportés à B2 (voir CHANGELOG). On
  // appelle quand même l'API, elle renvoie un scenario neutre et les
  // étapes d'exécution issues de sa table assistant_exec_steps.
  const out = await apiFetch(
    `/projects/${encodeURIComponent(r.project_id)}/assistant`,
    AssistantResponseSchema,
    { method: "POST", body: JSON.stringify(r), signal: opts.signal },
  );
  // Rejouer les étapes côté client pour animer la UI, comme le mock.
  for (const [i, s] of out.execution_steps.entries()) {
    opts.onStep?.(s, i);
    await wait(s.duration_ms, opts.signal);
  }
  return out;
}

async function _mockPostAssistant(
  r: AssistantRequest,
  opts: { signal?: AbortSignal; onStep?: (s: ExecStep, i: number) => void },
): Promise<AssistantResponse> {
  const project = PROJECTS.find((p) => p.id === r.project_id);
  if (!project) throw { code: "NOT_FOUND", message: "Projet introuvable" };
  const { filters, dropped } = effectiveFilters(project, r.filters);
  const out = await runEngine(project, r.question, filters);
  for (const [i, s] of out.steps.entries()) {
    opts.onStep?.(s, i);
    await wait(s.duration_ms, opts.signal);
  }
  const warnings = [...out.warnings];
  if (dropped.length)
    warnings.unshift(`Filtres incompatibles avec ce projet ignorés : ${dropped.join(", ")}.`);
  return AssistantResponseSchema.parse({
    conversation_id: r.conversation_id,
    message_id: uid("msg"),
    status: out.error ? "failed" : "completed",
    project_id: project.id,
    scenario: out.scenario,
    effective_filters: filters,
    blocks: out.blocks,
    evidence: out.evidence,
    follow_ups: out.follow_ups,
    execution_steps: out.steps,
    warnings,
    error: out.error,
    demo: true,
  });
}

export function cancelledResponse(req: AssistantRequest): AssistantResponse {
  return {
    conversation_id: req.conversation_id,
    message_id: uid("msg"),
    status: "cancelled",
    project_id: req.project_id,
    scenario: "cancelled",
    effective_filters: req.filters,
    blocks: [],
    evidence: [],
    follow_ups: [],
    execution_steps: [],
    warnings: [],
    demo: true,
  };
}

// ---- MOCK-ONLY history store -------------------------------------------------
const key = (projectId: string) => `bc4.assistant.v1.${projectId}`;
const memory = new Map<string, Conversation[]>();
function read(projectId: string): Conversation[] {
  if (typeof localStorage === "undefined") return memory.get(projectId) ?? [];
  try {
    const raw = localStorage.getItem(key(projectId));
    return raw ? ConversationSchema.array().parse(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}
function write(projectId: string, list: Conversation[]) {
  memory.set(projectId, list);
  if (typeof localStorage !== "undefined")
    localStorage.setItem(key(projectId), JSON.stringify(list));
}

export async function listConversations(projectId: string): Promise<Conversation[]> {
  // Backend B0 : /conversations renvoie []. Les historiques réels sont
  // conservés en localStorage côté front jusqu'à ce que B2 expose un
  // backend conversationnel (déclaré écart ouvert).
  if (isApiMode()) {
    try {
      const remote = await apiFetch(
        `/projects/${encodeURIComponent(projectId)}/conversations`,
        ConversationSchema.array(),
      );
      // Si le backend renvoie [] (B0), on complète avec le store local.
      if (remote.length) return remote;
    } catch {
      // Repli local sans bruit : le backend B0 n'implémente pas encore
      // la persistance côté serveur.
    }
  }
  await wait(60);
  return read(projectId).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export async function createConversation(
  projectId: string,
  title = "Nouvelle conversation",
): Promise<Conversation> {
  const now = new Date().toISOString();
  const c: Conversation = {
    id: uid("conv"),
    project_id: projectId,
    title,
    created_at: now,
    updated_at: now,
    messages: [],
  };
  write(projectId, [c, ...read(projectId)]);
  return c;
}
export async function renameConversation(projectId: string, id: string, title: string) {
  write(
    projectId,
    read(projectId).map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c)),
  );
}
export async function deleteConversation(projectId: string, id: string) {
  write(
    projectId,
    read(projectId).filter((c) => c.id !== id),
  );
}
export async function appendMessages(projectId: string, id: string, msgs: ChatMessage[]) {
  write(
    projectId,
    read(projectId).map((c) => {
      if (c.id !== id) return c;
      const first = msgs.find((m) => m.role === "user");
      const title =
        c.messages.length === 0 && first?.role === "user" ? first.text.slice(0, 60) : c.title;
      return {
        ...c,
        title,
        updated_at: new Date().toISOString(),
        messages: [...c.messages, ...msgs],
      };
    }),
  );
}
export const newId = uid;
