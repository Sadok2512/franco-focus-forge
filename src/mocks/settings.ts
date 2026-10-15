// DEMO-ONLY deterministic settings fixtures. No secrets are ever stored here.
import type { AiConfig, Appearance, GeoReference, Kpi, Organization, User } from "@/lib/api/settings-schemas";

const USERS: User[] = [
  { id: "u1", login: "demo.ingenieur", display_name: "Jean Dupont", role: "admin", active: true, created_at: "2026-01-05T09:00:00Z", last_login_at: "2026-10-15T07:40:00Z" },
  { id: "u2", login: "m.martin", display_name: "Marie Martin", role: "editor", active: true, created_at: "2026-02-11T10:15:00Z", last_login_at: "2026-10-13T16:02:00Z" },
  { id: "u3", login: "p.leroy", display_name: "Paul Leroy", role: "viewer", active: true, created_at: "2026-03-02T08:30:00Z", last_login_at: null },
  { id: "u4", login: "s.bernard", display_name: "Sophie Bernard", role: "viewer", active: false, created_at: "2026-03-20T14:00:00Z", last_login_at: "2026-05-01T11:20:00Z" },
];

const GEO_REFS: GeoReference[] = [
  { id: "geo-v1", version: 1, filename: "referentiel_zones_v1.csv", imported_at: "2026-04-01T09:00:00Z", author: "demo.ingenieur", status: "active", rows: 0 },
];

const h = (version: number, at: string, change: string) => ({ version, at, author: "demo.ingenieur", change });
const KPIS: Kpi[] = [
  { code: "RRC_SR", name: "RRC Success Rate", description: "Taux de succès d'établissement RRC.", family: "Accessibilité", tech: "LTE, NR", unit: "%", formula: "RRC_SETUP_COMPLETE / RRC_CONNECTION_REQUEST", status: "published", version: 2, source_events: ["RRCConnectionRequest", "RRCConnectionSetupComplete"], history: [h(1, "2026-02-01T10:00:00Z", "Création"), h(2, "2026-03-10T10:00:00Z", "Ajout NR")] },
  { code: "DCR", name: "Drop Call Rate", description: "Taux de coupure d'appel.", family: "Rétention", tech: "LTE", unit: "%", formula: "ABNORMAL_RELEASE / CALL_ESTABLISHED", status: "validated", version: 1, source_events: ["RRCConnectionRelease"], history: [h(1, "2026-02-03T10:00:00Z", "Création")] },
  { code: "HO_SR", name: "HO Success Rate", description: "Taux de succès des handovers.", family: "Mobilité", tech: "LTE, NR", unit: "%", formula: "HO_COMPLETE / HO_COMMAND", status: "draft", version: 1, source_events: ["MobilityFromEUTRACommand"], history: [h(1, "2026-04-12T10:00:00Z", "Création")] },
];

const AI: Omit<AiConfig, "providers"> = {
  enabled: true, endpoint_url: "https://llm.exemple.interne/v1", model_code: "bc4-analyst-mock", provider: "Interne",
  auth_method: "api_key", has_secret: false, config_version: 1, saved_at: "2026-04-02T09:00:00Z",
  connection: { status: "untested", tested_at: null, message: null, simulated: true },
};
export const AI_PROVIDERS = ["Interne", "Azure OpenAI", "Mistral", "Autre"];

const ORG: Omit<Organization, "limits"> = {
  name: "", short_name: "", description: "", logo_data_url: null, admin_contact: "", domain: "",
  show_in_header: true, show_in_exports: true,
};
export const ORG_LIMITS = { name_max: 80, logo_max_bytes: 300_000, logo_types: ["image/png", "image/svg+xml", "image/jpeg"] };
export const PASSWORD_POLICY = { min_length: 10, require_digit: true, require_upper: true };
export const API_PERMISSIONS = { editor_can_edit_geo: true, editor_can_edit_kpi: false };

type Store = {
  users: User[]; geo: GeoReference[]; kpis: Kpi[]; ai: Omit<AiConfig, "providers">;
  org: Omit<Organization, "limits">; appearance: Appearance; seq: number;
};
const fresh = (): Store => structuredClone({ users: USERS, geo: GEO_REFS, kpis: KPIS, ai: AI, org: ORG, appearance: { org_primary_hex: null }, seq: 100 });

const LS = "bc4.mock.settings";
function load(): Store {
  if (typeof window === "undefined") return fresh();
  try {
    const raw = localStorage.getItem(LS);
    return raw ? { ...fresh(), ...(JSON.parse(raw) as Store) } : fresh();
  } catch { return fresh(); }
}
export const SETTINGS_STORE: Store = load();
/** Persist mock state (contains no secret by construction). */
export function persistSettings() {
  if (typeof window !== "undefined") localStorage.setItem(LS, JSON.stringify(SETTINGS_STORE));
}
export function resetSettingsStore() {
  Object.assign(SETTINGS_STORE, fresh());
  if (typeof window !== "undefined") localStorage.removeItem(LS);
}
