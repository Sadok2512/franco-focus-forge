// Mock v0.1.0 contracts for /settings/* — proposals, not an existing backend.
import { z } from "zod";

export const RoleSchema = z.enum(["admin", "editor", "viewer"]);
export type Role = z.infer<typeof RoleSchema>;
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrateur",
  editor: "Éditeur",
  viewer: "Lecteur",
};

export type Actor = { login: string; role: Role };

/* ---- Users ---- */
export const UserSchema = z.object({
  id: z.string(),
  login: z.string(),
  display_name: z.string(),
  role: RoleSchema,
  active: z.boolean(),
  created_at: z.string(),
  last_login_at: z.string().nullable(),
});
export type User = z.infer<typeof UserSchema>;
export const PasswordPolicySchema = z.object({
  min_length: z.number().int(),
  require_digit: z.boolean(),
  require_upper: z.boolean(),
});
export type PasswordPolicy = z.infer<typeof PasswordPolicySchema>;
export const ApiPermissionsSchema = z.object({
  editor_can_edit_geo: z.boolean(),
  editor_can_edit_kpi: z.boolean(),
});
export type ApiPermissions = z.infer<typeof ApiPermissionsSchema>;
export const UsersResponseSchema = z.object({
  users: UserSchema.array(),
  policy: PasswordPolicySchema,
  permissions: ApiPermissionsSchema,
});
export type UsersResponse = z.infer<typeof UsersResponseSchema>;
export type UserCreate = {
  login: string;
  display_name: string;
  role: Role;
  password: string;
  password_confirm: string;
};
export type UserPatch = Partial<Pick<User, "display_name" | "role" | "active">>;

/* ---- Geography ---- */
export const GEO_FIELDS = [
  { key: "plaque", label: "Plaque", required: true },
  { key: "dr", label: "DR", required: true },
  { key: "departement", label: "Département", required: true },
  { key: "site_id", label: "Identifiant site (stable)", required: true },
  { key: "site", label: "Site", required: true },
  { key: "point", label: "Point", required: false },
  { key: "latitude", label: "Latitude", required: false },
  { key: "longitude", label: "Longitude", required: false },
  { key: "indoor_level", label: "Niveau indoor", required: false },
] as const;
export type GeoField = (typeof GEO_FIELDS)[number]["key"];
export type GeoMapping = Partial<Record<GeoField, string | null>>;
export const GeoReferenceSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  filename: z.string(),
  imported_at: z.string(),
  author: z.string(),
  status: z.enum(["active", "archived"]),
  rows: z.number().int(),
});
export type GeoReference = z.infer<typeof GeoReferenceSchema>;
export const GeoIssueSchema = z.object({
  row: z.number().int().nullable(),
  level: z.enum(["error", "warning"]),
  field: z.string().nullable(),
  message: z.string(),
});
export type GeoIssue = z.infer<typeof GeoIssueSchema>;
export const GeoImportReportSchema = z.object({
  total: z.number().int(),
  valid: z.number().int(),
  rejected: z.number().int(),
  warnings: z.number().int(),
  issues: GeoIssueSchema.array(),
  points: z
    .object({ site_id: z.string(), site: z.string(), lat: z.number(), lng: z.number() })
    .array(),
  committed: GeoReferenceSchema.nullable(),
});
export type GeoImportReport = z.infer<typeof GeoImportReportSchema>;
export type GeoImportRequest = {
  filename: string;
  mapping: GeoMapping;
  rows: Record<string, string>[];
  commit: boolean;
};

/* ---- KPI catalogue ---- */
export const KpiStatusSchema = z.enum(["draft", "validated", "published", "archived"]);
export type KpiStatus = z.infer<typeof KpiStatusSchema>;
export const KPI_STATUS_LABEL: Record<KpiStatus, string> = {
  draft: "Brouillon",
  validated: "Validé",
  published: "Publié",
  archived: "Archivé",
};
export const KpiSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  family: z.string(),
  tech: z.string(),
  unit: z.string(),
  formula: z.string(), // versioned text, NEVER executed
  status: KpiStatusSchema,
  version: z.number().int(),
  source_events: z.string().array(),
  history: z
    .object({ version: z.number().int(), at: z.string(), author: z.string(), change: z.string() })
    .array(),
});
export type Kpi = z.infer<typeof KpiSchema>;
export const KpiCatalogResponseSchema = z.object({
  items: KpiSchema.array(),
  statuses: KpiStatusSchema.array(),
  formula_engine: z.null(), // engine not specified yet
});
export type KpiCatalogResponse = z.infer<typeof KpiCatalogResponseSchema>;
export type KpiInput = Pick<
  Kpi,
  "code" | "name" | "description" | "family" | "tech" | "unit" | "formula" | "source_events"
> & { status?: KpiStatus };

/* ---- AI ---- */
export const AiConfigSchema = z.object({
  enabled: z.boolean(),
  endpoint_url: z.string(),
  model_code: z.string(),
  provider: z.string(),
  providers: z.string().array(),
  auth_method: z.enum(["none", "api_key", "bearer"]),
  has_secret: z.boolean(),
  config_version: z.number().int(),
  saved_at: z.string().nullable(),
  connection: z.object({
    status: z.enum(["untested", "mock_ok", "mock_failed"]),
    tested_at: z.string().nullable(),
    message: z.string().nullable(),
    simulated: z.literal(true),
  }),
});
export type AiConfig = z.infer<typeof AiConfigSchema>;
export type AiConfigInput = Pick<
  AiConfig,
  "enabled" | "endpoint_url" | "model_code" | "provider" | "auth_method"
> & { secret?: string };

/* ---- Appearance / Organization / About ---- */
export const AppearanceSchema = z.object({ org_primary_hex: z.string().nullable() });
export type Appearance = z.infer<typeof AppearanceSchema>;
export const OrganizationSchema = z.object({
  name: z.string(),
  short_name: z.string(),
  description: z.string(),
  logo_data_url: z.string().nullable(),
  admin_contact: z.string(),
  domain: z.string(),
  show_in_header: z.boolean(),
  show_in_exports: z.boolean(),
  limits: z.object({
    name_max: z.number().int(),
    logo_max_bytes: z.number().int(),
    logo_types: z.string().array(),
  }),
});
export type Organization = z.infer<typeof OrganizationSchema>;
export type OrganizationInput = Omit<Organization, "limits">;
export const AboutSchema = z.object({
  app_name: z.literal("BC4"),
  version: z.string(),
  build_number: z.string().nullable(),
  build_date: z.string().nullable(),
  environment: z.enum(["mock", "development", "production"]),
  api_contracts_version: z.string().nullable(),
  api_client_status: z.string(),
  organization: z.string().nullable(),
  license: z.string().nullable(),
});
export type About = z.infer<typeof AboutSchema>;

export type ApiError = {
  code: "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "NOT_FOUND";
  message: string;
  field?: string | undefined;
};
