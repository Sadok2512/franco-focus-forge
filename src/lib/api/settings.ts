// /settings/* adapter. Dispatch: VITE_BC4_DATA=api → HTTP, sinon → mock.
// Les permissions mock sont ré-évaluées côté client en mode mock ;
// production impose un contrôle serveur dans tous les cas.
import { can, type Action } from "../permissions";
import { APP_VERSION } from "../version";
import { apiFetch, apiOrMock, buildQuery } from "./http";
import { z } from "zod";
import {
  AI_PROVIDERS,
  API_PERMISSIONS,
  ORG_LIMITS,
  PASSWORD_POLICY,
  SETTINGS_STORE as S,
  persistSettings,
} from "@/mocks/settings";
import {
  AboutSchema,
  AiConfigSchema,
  GEO_FIELDS,
  GeoImportReportSchema,
  GeoReferenceSchema,
  KpiCatalogResponseSchema,
  KpiSchema,
  OrganizationSchema,
  UserSchema,
  UsersResponseSchema,
  type About,
  type Actor,
  type AiConfig,
  type AiConfigInput,
  type ApiError,
  type Appearance,
  type GeoImportReport,
  type GeoImportRequest,
  type GeoIssue,
  type GeoReference,
  type Kpi,
  type KpiCatalogResponse,
  type KpiInput,
  type Organization,
  type OrganizationInput,
  type PasswordPolicy,
  type User,
  type UserCreate,
  type UserPatch,
  type UsersResponse,
} from "./settings-schemas";

export const SETTINGS_LATENCY = { ms: 180 };
const wait = () => new Promise<void>((r) => setTimeout(r, SETTINGS_LATENCY.ms));
const now = () => new Date().toISOString();
const fail = (code: ApiError["code"], message: string, field?: string): never => {
  throw { code, message, field } satisfies ApiError;
};
const guard = (actor: Actor, action: Action) => {
  if (!can(actor.role, action, API_PERMISSIONS))
    fail("FORBIDDEN", "Action non autorisée pour votre rôle.");
};
const commit = <T>(v: T) => {
  persistSettings();
  return structuredClone(v);
};

/* ---------- Users ---------- */
export function passwordProblems(pw: string, p: PasswordPolicy): string[] {
  const out: string[] = [];
  if (pw.length < p.min_length) out.push(`${p.min_length} caractères minimum`);
  if (p.require_digit && !/\d/.test(pw)) out.push("au moins un chiffre");
  if (p.require_upper && !/[A-Z]/.test(pw)) out.push("au moins une majuscule");
  return out;
}

export async function getUsers(actor: Actor): Promise<UsersResponse> {
  return apiOrMock(
    () => apiFetch("/settings/users", UsersResponseSchema),
    async () => {
      await wait();
      guard(actor, "users.read");
      return UsersResponseSchema.parse({
        users: S.users,
        policy: PASSWORD_POLICY,
        permissions: API_PERMISSIONS,
      });
    },
    "getUsers",
  );
}
export async function getApiPermissions() {
  await wait();
  return { ...API_PERMISSIONS };
}

export async function createUser(actor: Actor, body: UserCreate): Promise<User> {
  await wait();
  guard(actor, "users.write");
  const login = body.login.trim();
  if (!/^[a-z0-9._-]{3,40}$/i.test(login))
    fail(
      "VALIDATION",
      "Identifiant invalide (3–40 caractères : lettres, chiffres, . _ -).",
      "login",
    );
  if (S.users.some((u) => u.login.toLowerCase() === login.toLowerCase()))
    fail("CONFLICT", "Cet identifiant existe déjà.", "login");
  if (!body.display_name.trim()) fail("VALIDATION", "Nom affiché requis.", "display_name");
  const pb = passwordProblems(body.password, PASSWORD_POLICY);
  if (pb.length) fail("VALIDATION", `Mot de passe non conforme : ${pb.join(", ")}.`, "password");
  if (body.password !== body.password_confirm)
    fail("VALIDATION", "La confirmation ne correspond pas.", "password_confirm");
  // The password is validated then discarded: never stored, logged or returned.
  const u: User = {
    id: `u${++S.seq}`,
    login,
    display_name: body.display_name.trim(),
    role: body.role,
    active: true,
    created_at: now(),
    last_login_at: null,
  };
  S.users.push(u);
  return UserSchema.parse(commit(u));
}

const activeAdmins = () => S.users.filter((u) => u.active && u.role === "admin");
export async function patchUser(actor: Actor, id: string, patch: UserPatch): Promise<User> {
  await wait();
  guard(actor, "users.write");
  const u = S.users.find((x) => x.id === id) ?? fail("NOT_FOUND", "Utilisateur introuvable.");
  const losesAdmin =
    u.role === "admin" &&
    u.active &&
    (patch.active === false || (patch.role && patch.role !== "admin"));
  if (losesAdmin && activeAdmins().length <= 1)
    fail("CONFLICT", "Impossible : c'est le dernier compte administrateur actif.");
  if (losesAdmin && u.login === actor.login && patch.active === false)
    fail("CONFLICT", "Vous ne pouvez pas désactiver votre propre compte administrateur.");
  if (patch.display_name !== undefined && !patch.display_name.trim())
    fail("VALIDATION", "Nom affiché requis.", "display_name");
  Object.assign(u, patch);
  return UserSchema.parse(commit(u));
}

export async function resetPassword(
  actor: Actor,
  id: string,
): Promise<{ sent: true; simulated: true }> {
  await wait();
  guard(actor, "users.write");
  if (!S.users.some((u) => u.id === id)) fail("NOT_FOUND", "Utilisateur introuvable.");
  return { sent: true, simulated: true }; // no temporary password is generated or exposed
}

/* ---------- Geography ---------- */
export async function getGeoReferences(actor: Actor): Promise<GeoReference[]> {
  return apiOrMock(
    () => apiFetch("/settings/geo", GeoReferenceSchema.array()),
    async () => {
      await wait();
      guard(actor, "geo.read");
      return GeoReferenceSchema.array().parse(S.geo);
    },
    "getGeoReferences",
  );
}

export function validateGeo(
  req: Pick<GeoImportRequest, "mapping" | "rows">,
): Omit<GeoImportReport, "committed"> {
  const issues: GeoIssue[] = [];
  const { mapping, rows } = req;
  for (const f of GEO_FIELDS)
    if (f.required && !mapping[f.key])
      issues.push({
        row: null,
        level: "error",
        field: f.key,
        message: `Colonne obligatoire non mappée : ${f.label}.`,
      });
  if (issues.length)
    return { total: rows.length, valid: 0, rejected: rows.length, warnings: 0, issues, points: [] };
  const get = (r: Record<string, string>, k: string) => {
    const c = mapping[k as keyof typeof mapping];
    return c ? (r[c] ?? "").trim() : "";
  };
  const seen = new Map<string, number>();
  const depToDr = new Map<string, string>(),
    drToPlaque = new Map<string, string>();
  const points: GeoImportReport["points"] = [];
  let valid = 0,
    warnings = 0;
  rows.forEach((r, i) => {
    const line = i + 2; // header = line 1
    const rowIssues: GeoIssue[] = [];
    for (const f of GEO_FIELDS)
      if (f.required && !get(r, f.key))
        rowIssues.push({
          row: line,
          level: "error",
          field: f.key,
          message: `${f.label} manquant.`,
        });
    const id = get(r, "site_id");
    if (id) {
      if (seen.has(id))
        rowIssues.push({
          row: line,
          level: "error",
          field: "site_id",
          message: `Doublon de l'identifiant « ${id} » (ligne ${seen.get(id)}).`,
        });
      else seen.set(id, line);
    }
    const dep = get(r, "departement"),
      dr = get(r, "dr"),
      pl = get(r, "plaque");
    if (dep && dr) {
      const k = depToDr.get(dep);
      if (k && k !== dr)
        rowIssues.push({
          row: line,
          level: "error",
          field: "dr",
          message: `Incohérence : département ${dep} rattaché à « ${k} » et « ${dr} ».`,
        });
      else depToDr.set(dep, dr);
    }
    if (dr && pl) {
      const k = drToPlaque.get(dr);
      if (k && k !== pl)
        rowIssues.push({
          row: line,
          level: "error",
          field: "plaque",
          message: `Incohérence : DR « ${dr} » rattachée à « ${k} » et « ${pl} ».`,
        });
      else drToPlaque.set(dr, pl);
    }
    const latS = get(r, "latitude").replace(",", "."),
      lngS = get(r, "longitude").replace(",", ".");
    let coords: [number, number] | null = null;
    if (!latS && !lngS)
      rowIssues.push({
        row: line,
        level: "warning",
        field: "latitude",
        message: "Coordonnées absentes.",
      });
    else {
      const lat = Number(latS),
        lng = Number(lngS);
      if (
        !latS ||
        !lngS ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      )
        rowIssues.push({
          row: line,
          level: "error",
          field: "latitude",
          message: `Coordonnées invalides (${latS || "∅"}, ${lngS || "∅"}).`,
        });
      else coords = [lat, lng];
    }
    const errs = rowIssues.filter((x) => x.level === "error").length;
    warnings += rowIssues.length - errs;
    if (!errs) {
      valid++;
      if (coords)
        points.push({ site_id: id, site: get(r, "site"), lat: coords[0], lng: coords[1] });
    }
    issues.push(...rowIssues);
  });
  return { total: rows.length, valid, rejected: rows.length - valid, warnings, issues, points };
}

export async function postGeoImport(actor: Actor, req: GeoImportRequest): Promise<GeoImportReport> {
  await wait();
  guard(actor, "geo.write");
  const rep = validateGeo(req);
  let committed: GeoReference | null = null;
  if (req.commit) {
    if (!rep.valid) fail("VALIDATION", "Aucune ligne valide : import refusé.");
    S.geo.forEach((g) => (g.status = "archived"));
    committed = {
      id: `geo-v${S.geo.length + 1}`,
      version: S.geo.length + 1,
      filename: req.filename,
      imported_at: now(),
      author: actor.login,
      status: "active",
      rows: rep.valid,
    };
    S.geo.unshift(committed);
    persistSettings();
  }
  return GeoImportReportSchema.parse({ ...rep, committed });
}

/* ---------- KPI catalogue ---------- */
export async function getKpiCatalogSettings(actor: Actor): Promise<KpiCatalogResponse> {
  return apiOrMock(
    () => apiFetch("/settings/kpi", KpiCatalogResponseSchema),
    async () => {
      await wait();
      guard(actor, "kpi.read");
      return KpiCatalogResponseSchema.parse({
        items: S.kpis,
        statuses: ["draft", "validated", "published", "archived"],
        formula_engine: null,
      });
    },
    "getKpiCatalogSettings",
  );
}
function checkKpi(b: KpiInput) {
  if (!/^[A-Z0-9_]{2,32}$/.test(b.code))
    fail("VALIDATION", "Code KPI : 2–32 caractères A-Z, 0-9 ou _.", "code");
  if (!b.name.trim()) fail("VALIDATION", "Nom KPI requis.", "name");
  if (typeof b.formula !== "string")
    fail("VALIDATION", "La formule doit être un texte.", "formula");
}
export async function createKpi(actor: Actor, b: KpiInput): Promise<Kpi> {
  await wait();
  guard(actor, "kpi.write");
  checkKpi(b);
  if (S.kpis.some((k) => k.code === b.code))
    fail("CONFLICT", `Le code KPI « ${b.code} » existe déjà.`, "code");
  const k: Kpi = {
    ...b,
    status: b.status ?? "draft",
    version: 1,
    history: [{ version: 1, at: now(), author: actor.login, change: "Création" }],
  };
  S.kpis.push(k);
  return KpiSchema.parse(commit(k));
}
export async function patchKpi(
  actor: Actor,
  code: string,
  patch: Partial<KpiInput>,
  change = "Modification",
): Promise<Kpi> {
  await wait();
  guard(actor, "kpi.write");
  const k = S.kpis.find((x) => x.code === code) ?? fail("NOT_FOUND", "KPI introuvable.");
  if (patch.code && patch.code !== code)
    fail("VALIDATION", "Le code KPI n'est pas modifiable.", "code");
  const next = { ...k, ...patch };
  checkKpi(next);
  Object.assign(k, next, { version: k.version + 1 });
  k.history.push({ version: k.version, at: now(), author: actor.login, change });
  return KpiSchema.parse(commit(k));
}

/* ---------- AI ---------- */
export function urlCheck(u: string): { ok: boolean; https: boolean; message: string | null } {
  try {
    const p = new URL(u);
    if (p.protocol !== "https:" && p.protocol !== "http:")
      return { ok: false, https: false, message: "Protocole non supporté." };
    return {
      ok: true,
      https: p.protocol === "https:",
      message: p.protocol === "https:" ? null : "Endpoint non sécurisé (HTTP) : HTTPS recommandé.",
    };
  } catch {
    return { ok: false, https: false, message: "URL invalide." };
  }
}
const aiOut = (): AiConfig => AiConfigSchema.parse({ ...S.ai, providers: AI_PROVIDERS });
export async function getAiConfig(actor?: Actor): Promise<AiConfig> {
  return apiOrMock(
    () => apiFetch("/settings/ai", AiConfigSchema),
    async () => {
      await wait();
      if (actor) guard(actor, "ai.read");
      return aiOut();
    },
    "getAiConfig",
  );
}
/** Public, read-only: does the assistant run? (no config details) */
export async function getAiEnabled(): Promise<boolean> {
  return apiOrMock(
    () => apiFetch("/settings/ai/enabled", z.boolean()),
    async () => {
      await wait();
      return S.ai.enabled;
    },
    "getAiEnabled",
  );
}
export async function putAiConfig(actor: Actor, b: AiConfigInput): Promise<AiConfig> {
  await wait();
  guard(actor, "ai.write");
  if (b.enabled || b.endpoint_url) {
    const c = urlCheck(b.endpoint_url);
    if (!c.ok) fail("VALIDATION", c.message ?? "URL invalide.", "endpoint_url");
  }
  if (b.enabled && !b.model_code.trim()) fail("VALIDATION", "Code modèle requis.", "model_code");
  const { secret, ...rest } = b;
  // Secret is never persisted: only the fact that one was provided (future encrypted backend vault).
  Object.assign(S.ai, rest, {
    has_secret: b.auth_method === "none" ? false : secret ? true : S.ai.has_secret,
    config_version: S.ai.config_version + 1,
    saved_at: now(),
    connection: { status: "untested", tested_at: null, message: null, simulated: true },
  });
  persistSettings();
  return aiOut();
}
export async function testAiConnection(actor: Actor): Promise<AiConfig> {
  await wait();
  guard(actor, "ai.write");
  const c = urlCheck(S.ai.endpoint_url);
  // No network request is made: result is derived from the saved config only.
  const ok = c.ok && !!S.ai.model_code && (S.ai.auth_method === "none" || S.ai.has_secret);
  S.ai.connection = {
    status: ok ? "mock_ok" : "mock_failed",
    tested_at: now(),
    simulated: true,
    message: ok
      ? "Test simulé réussi — aucun modèle réel n'a été contacté."
      : `Test simulé en échec : ${!c.ok ? c.message : !S.ai.model_code ? "code modèle manquant" : "secret manquant"}.`,
  };
  persistSettings();
  return aiOut();
}

/* ---------- Appearance ---------- */
export const HEX_RE = /^#[0-9a-f]{6}$/i;
const AppearanceSchemaLocal = z.object({ org_primary_hex: z.string().nullable() });
export async function getAppearance(): Promise<Appearance> {
  return apiOrMock(
    () => apiFetch("/settings/appearance", AppearanceSchemaLocal),
    async () => {
      await wait();
      return { ...S.appearance };
    },
    "getAppearance",
  );
}
export async function putAppearance(actor: Actor, b: Appearance): Promise<Appearance> {
  await wait();
  guard(actor, "appearance.org.write");
  if (b.org_primary_hex !== null && !HEX_RE.test(b.org_primary_hex))
    fail("VALIDATION", "Couleur HEX invalide (#RRGGBB).", "org_primary_hex");
  S.appearance = { ...b };
  return commit(S.appearance);
}

/* ---------- Organization ---------- */
const orgOut = (): Organization => OrganizationSchema.parse({ ...S.org, limits: ORG_LIMITS });
export async function getOrganization(): Promise<Organization> {
  return apiOrMock(
    () => apiFetch("/settings/organization", OrganizationSchema),
    async () => {
      await wait();
      return orgOut();
    },
    "getOrganization",
  );
}
export async function putOrganization(actor: Actor, b: OrganizationInput): Promise<Organization> {
  await wait();
  guard(actor, "org.write");
  const name = b.name.trim();
  if (!name) fail("VALIDATION", "Le nom de l'organisation est requis.", "name");
  if (name.length > ORG_LIMITS.name_max)
    fail("VALIDATION", `${ORG_LIMITS.name_max} caractères maximum.`, "name");
  if (b.logo_data_url) {
    const type = /^data:([^;]+);/.exec(b.logo_data_url)?.[1] ?? "";
    if (!ORG_LIMITS.logo_types.includes(type))
      fail("VALIDATION", "Format de logo non accepté (PNG, SVG, JPEG).", "logo");
    if (b.logo_data_url.length * 0.75 > ORG_LIMITS.logo_max_bytes)
      fail("VALIDATION", "Logo trop volumineux (300 Ko max).", "logo");
  }
  Object.assign(S.org, b, { name });
  persistSettings();
  return orgOut();
}
/** Metadata attached to exports — reflects the configured organization, never a hardcoded value. */
export function exportMetadata(): { organization: string | null; generator: string } {
  return {
    organization: S.org.show_in_exports && S.org.name ? S.org.name : null,
    generator: `BC4 v${APP_VERSION}`,
  };
}

/* ---------- About ---------- */
export async function getAbout(): Promise<About> {
  return apiOrMock(
    () => apiFetch("/settings/about", AboutSchema),
    async () => {
      await wait();
      return AboutSchema.parse({
        app_name: "BC4",
        version: APP_VERSION,
        build_number: null,
        build_date: null,
        environment: "mock", // fixtures only — never "production"
        api_contracts_version: "0.1.0 (proposition mock)",
        api_client_status: "Adaptateur mock local — aucun backend connecté",
        organization: S.org.name || null,
        license: null,
      });
    },
    "getAbout",
  );
}
