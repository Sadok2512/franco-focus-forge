// Transport HTTP vers bc4-back. Le mock reste présent — chaque adaptateur
// décide « api » vs « mock » via `isApiMode()`. Rien ici ne fabrique de
// chiffre : on fait un fetch, on parse via le schéma Zod déjà existant,
// on remonte l'erreur du backend telle quelle.
//
// B2 : l'identité vient UNIQUEMENT du JWT (Authorization: Bearer).
// Les en-têtes X-Actor-* ne sont plus envoyés. VITE_BC4_DEV_ACTOR est
// retiré. Un 401 purge la session et émet un évènement `bc4:unauthenticated`
// que la UI écoute pour rediriger vers /login.

import { z } from "zod";

import { LoginResponseSchema, PublicUserSchema, type PublicUser } from "./auth-schemas";

export const DEFAULT_API_BASE = "http://localhost:8000";

export type DataSource = "api" | "mock";

function env(key: string): string | undefined {
  const e = (import.meta as unknown as { env?: Record<string, string> }).env;
  return e ? e[key] : undefined;
}

function readMode(): DataSource {
  return env("VITE_BC4_DATA") === "api" ? "api" : "mock";
}

function readBase(): string {
  return (env("VITE_BC4_API_BASE") ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

export function isApiMode(): boolean {
  return readMode() === "api";
}

export function apiBase(): string {
  return readBase();
}

/* ---------- Session (Bearer token) ---------- */

const LS_SESSION = "bc4.session";
const LS_LOGIN = "bc4.remembered-login";

export function rememberedLogin(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LS_LOGIN) ?? "";
}

export type Session = {
  token: string;
  token_type: "Bearer";
  expires_at: string;
  user: PublicUser;
};

const SessionSchema = z.object({
  token: z.string(),
  token_type: z.literal("Bearer"),
  expires_at: z.string(),
  user: PublicUserSchema,
});

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.sessionStorage.getItem(LS_SESSION) ? window.sessionStorage : window.localStorage;
    const raw = storage.getItem(LS_SESSION);
    if (!raw) return null;
    const parsed = SessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      storage.removeItem(LS_SESSION);
      return null;
    }
    // Vérif TTL : expiré → purge et renvoie null, pas de session « zombie ».
    const expiry = Date.parse(parsed.data.expires_at);
    if (!Number.isFinite(expiry) || Date.now() >= expiry) {
      storage.removeItem(LS_SESSION);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null, remember = true): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_SESSION);
  window.sessionStorage.removeItem(LS_SESSION);
  if (s) (remember ? window.localStorage : window.sessionStorage).setItem(LS_SESSION, JSON.stringify(s));
}

export function getSession(): Session | null {
  return readSession();
}

/** Évènement émis quand un 401 est intercepté — la UI écoute et bascule
 *  sur /login. Le même évènement est émis quand `logout()` est appelé. */
export const UNAUTH_EVENT = "bc4:unauthenticated";
function emitUnauthenticated(reason: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UNAUTH_EVENT, { detail: { reason } }));
}

/* ---------- Erreurs ----------
 *
 * Trois classes distinctes, exposées par le même module pour que la UI
 * ait **une seule** fonction `toUserMessage(err)` à appeler :
 *
 *   - `ApiUnauthenticatedError` (401) : la session doit être rejouée.
 *     L'évènement `bc4:unauthenticated` est émis → AppShell redirige.
 *   - `ApiNetworkError` (code 0)      : le navigateur n'a JAMAIS reçu de
 *     réponse (DNS mort, port fermé, préflight CORS bloqué). Seul cas
 *     où l'on parle d'« injoignabilité ».
 *   - `ApiHttpError` (4xx/5xx ≠ 401) : le back a répondu avec un code
 *     ≥400 et un corps JSON `{detail:{code,message,...}}`. On affiche
 *     **le code HTTP + le `message` tel quel** + les diagnostics
 *     (`missing_columns`, etc.) s'ils sont présents. Jamais
 *     « Backend injoignable » dans ce cas.
 */

export class ApiHttpError extends Error {
  code: string;
  status: number;
  /** Corps JSON brut renvoyé par le back (pour `missing_columns` etc.). */
  detail: unknown;
  constructor(code: string, message: string, status: number, detail: unknown = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** 501 : endpoint non implémenté (écart ouvert déclaré). */
export class ApiNotImplementedError extends ApiHttpError {
  constructor(message: string) {
    super("NOT_IMPLEMENTED", message, 501);
  }
}

/** 401 : non authentifié / token invalide / token expiré. */
export class ApiUnauthenticatedError extends ApiHttpError {
  constructor(message: string) {
    super("UNAUTHENTICATED", message, 401);
  }
}

/** Réseau : `fetch`/XHR n'a reçu AUCUNE réponse. DNS, connect refused,
 *  préflight CORS bloqué. C'est le **seul** cas où l'on parle d'API
 *  « injoignable ». Un 422 avec corps JSON tombe dans `ApiHttpError`. */
export class ApiNetworkError extends ApiHttpError {
  constructor(message: string) {
    super("NETWORK_ERROR", message, 0);
  }
}

/** Erreur schéma Zod : réponse 2xx mais forme non attendue. */
export class ApiSchemaError extends ApiHttpError {
  constructor(message: string, detail: unknown = null) {
    super("SCHEMA_ERROR", message, 0, detail);
  }
}

/** Transforme une erreur brute en message utilisateur selon la classe.
 *  La UI appelle UNIQUEMENT cette fonction — elle ne devine jamais la
 *  classe elle-même. */
export function toUserMessage(err: unknown): string {
  if (err instanceof ApiUnauthenticatedError) {
    return "Session expirée, reconnexion requise.";
  }
  if (err instanceof ApiNetworkError) {
    return "Backend injoignable — vérifier `VITE_BC4_API_BASE` et la configuration CORS côté API.";
  }
  if (err instanceof ApiSchemaError) {
    return `Réponse serveur non conforme au schéma attendu : ${err.message}`;
  }
  if (err instanceof ApiHttpError) {
    // 4xx/5xx (sauf 401) : on expose le code HTTP + le message du back
    // TEL QUEL, et on complète avec les diagnostics si présents
    // (missing_columns / unknown_columns pour l'upload CSV).
    const base = `HTTP ${err.status} — ${err.message || "erreur serveur"}`;
    const diag = extractDiagnostics(err.detail);
    return diag ? `${base} — ${diag}` : base;
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Erreur inconnue";
}

/** Rassemble les diagnostics structurés du back (`missing_columns`,
 *  `unknown_columns`, `by_file`…) en une chaîne lisible. Retourne `null`
 *  si rien d'exploitable. */
function extractDiagnostics(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const nested = d["detail"];
  const inner = (nested && typeof nested === "object" ? nested : d) as Record<string, unknown>;
  const parts: string[] = [];
  const mc = inner["missing_columns"];
  if (Array.isArray(mc) && mc.length) parts.push(`manquantes : ${mc.join(", ")}`);
  const uc = inner["unknown_columns"];
  if (Array.isArray(uc) && uc.length) parts.push(`inconnues : ${uc.join(", ")}`);
  return parts.length ? parts.join(" ; ") : null;
}

/* ---------- Requête ---------- */

type QueryValue = string | number | boolean | null | undefined | (string | number)[];

export function buildQuery(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      sp.set(k, v.join(","));
      continue;
    }
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface ApiRequestInit extends Omit<RequestInit, "signal"> {
  signal?: AbortSignal | undefined;
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Appel HTTP + validation Zod systématique de la réponse. */
export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: ApiRequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const session = readSession();
  if (session) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const { signal, ...rest } = init ?? {};
  const fetchInit: RequestInit = { ...rest, headers };
  if (signal) fetchInit.signal = signal;
  let res: Response;
  try {
    res = await fetch(`${readBase()}${path}`, fetchInit);
  } catch (e) {
    // `fetch` rejette uniquement si AUCUNE réponse n'est reçue (DNS,
    // connect refused, préflight CORS bloqué). C'est le seul cas où l'on
    // parle d'« injoignabilité ». Un 422 côté serveur passe par la
    // branche `!res.ok` plus bas.
    throw new ApiNetworkError((e as Error).message || "Backend injoignable");
  }

  if (res.status === 401) {
    // Purge la session et émet l'évènement pour que la UI redirige.
    setSession(null);
    const body = (await parseJsonSafe(res)) as { detail?: { message?: string } } | null;
    const message = body?.detail?.message ?? "Session expirée ou invalide";
    emitUnauthenticated(message);
    throw new ApiUnauthenticatedError(message);
  }

  if (res.status === 501) {
    const body = (await parseJsonSafe(res)) as { detail?: { message?: string } } | null;
    throw new ApiNotImplementedError(body?.detail?.message ?? "Endpoint non implémenté (B0)");
  }

  if (!res.ok) {
    const body = (await parseJsonSafe(res)) as {
      detail?: { code?: string; message?: string } | string;
    } | null;
    const detail =
      body && typeof body === "object" && body.detail && typeof body.detail === "object"
        ? body.detail
        : null;
    const code = detail?.code ?? "HTTP_ERROR";
    const message =
      detail?.message ?? (typeof body?.detail === "string" ? body.detail : res.statusText);
    // On conserve le corps brut dans `detail` pour que `toUserMessage`
    // puisse exposer `missing_columns`/`unknown_columns` à la UI.
    throw new ApiHttpError(code, message, res.status, body);
  }

  const data = await parseJsonSafe(res);
  return schema.parse(data);
}

/** Variante avec repli mock **explicite**.
 *
 *  Règle P1-3 (bc4-front 1.5.0) : en mode `api`, un échec API ne doit
 *  JAMAIS basculer silencieusement vers le mock — l'utilisateur doit
 *  voir l'erreur réelle (401, réseau, 4xx/5xx avec le `message` du back).
 *
 *  Seul repli toléré, et seulement si le site d'appel le demande :
 *    - `fallbackOn501: true` → un endpoint 501 (écart ouvert déclaré,
 *      pas encore implémenté côté back) retombe sur le mock pour que la
 *      UI reste navigable pendant la mise en œuvre.
 *
 *  Toutes les autres erreurs (ApiNetworkError, ApiUnauthenticatedError,
 *  ApiHttpError non-501) sont propagées pour que la UI appelle
 *  `toUserMessage(err)` et affiche la classe correcte. */
export async function apiOrMock<T>(
  loader: () => Promise<T>,
  mockLoader: () => Promise<T>,
  context: string,
  options: { fallbackOn501?: boolean } = {},
): Promise<T> {
  if (!isApiMode()) return mockLoader();
  try {
    return await loader();
  } catch (e) {
    const is501 = options.fallbackOn501 && e instanceof ApiNotImplementedError;
    if (is501) {
      console.warn(
        `[bc4-front] ${context}: endpoint non implémenté (501), repli mock (${(e as Error).message})`,
      );
      return mockLoader();
    }
    throw e;
  }
}

/* ---------- Upload helpers (XHR streaming) ----------
 *
 * `fetch` n'expose pas `upload.onprogress` dans les navigateurs → les
 * uploads passent par XMLHttpRequest. Pour que la UI ait les MÊMES
 * classes d'erreur que `apiFetch`, on centralise ici la conversion
 * `xhr → ApiHttpError | ApiUnauthenticatedError | ApiNetworkError`.
 */

/** Transforme la réponse d'un XHR terminé (status connu) en erreur typée
 *  ou en payload JSON. Émet l'évènement `bc4:unauthenticated` sur 401 et
 *  purge la session, exactement comme `apiFetch`. */
export function xhrPayloadOrThrow(xhr: XMLHttpRequest): unknown {
  let payload: unknown = null;
  try {
    payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
  } catch {
    payload = xhr.responseText;
  }
  if (xhr.status === 401) {
    setSession(null);
    const message =
      (payload as { detail?: { message?: string } } | null)?.detail?.message ??
      "Session expirée ou invalide";
    emitUnauthenticated(message);
    throw new ApiUnauthenticatedError(message);
  }
  if (xhr.status === 501) {
    const message =
      (payload as { detail?: { message?: string } } | null)?.detail?.message ??
      "Endpoint non implémenté";
    throw new ApiNotImplementedError(message);
  }
  if (xhr.status < 200 || xhr.status >= 300) {
    const body = payload as { detail?: { code?: string; message?: string } | string } | null;
    const detail =
      body && typeof body === "object" && body.detail && typeof body.detail === "object"
        ? body.detail
        : null;
    const code = detail?.code ?? "HTTP_ERROR";
    const message =
      detail?.message ??
      (typeof body?.detail === "string" ? body.detail : xhr.statusText || `HTTP ${xhr.status}`);
    throw new ApiHttpError(code, message, xhr.status, body);
  }
  return payload;
}

/* ---------- Auth helpers ---------- */

/** POST /auth/login — stocke la session complète (token+expiry+user). */
export async function login(email: string, password: string, remember = true): Promise<Session> {
  const saveLogin = (session: Session) => {
    setSession(session, remember);
    if (remember) window.localStorage.setItem(LS_LOGIN, session.user.email);
    else window.localStorage.removeItem(LS_LOGIN);
  };
  // Compte de démonstration local (demo / demo) : fonctionne sans backend.
  if (email.trim().toLowerCase() === "demo" && password === "demo") {
    const s: Session = {
      token: "demo-local-token",
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
      user: {
        id: "demo",
        email: "demo",
        role: "admin",
        active: true,
        created_at: new Date().toISOString(),
      },
    };
    saveLogin(s);
    return s;
  }
  const res = await apiFetch("/auth/login", LoginResponseSchema, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const s: Session = {
    token: res.token,
    token_type: res.token_type,
    expires_at: res.expires_at,
    user: res.user,
  };
  saveLogin(s);
  return s;
}

/** POST /auth/logout — purge la session côté client, émet l'évènement.
 *  JWT stateless côté serveur : le serveur retourne 204 et c'est tout. */
export async function logout(): Promise<void> {
  try {
    if (readSession()) {
      await apiFetch("/auth/logout", z.unknown(), { method: "POST" });
    }
  } catch {
    // Ignorer les erreurs réseau sur logout : on purge quand même localement.
  } finally {
    setSession(null);
    emitUnauthenticated("logout");
  }
}

/** GET /auth/me — rafraîchit le profil courant depuis le serveur. */
export async function fetchMe(): Promise<PublicUser> {
  return apiFetch("/auth/me", PublicUserSchema);
}
