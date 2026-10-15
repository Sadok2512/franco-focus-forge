// Central permission matrix (UI demo). Real security must be enforced server-side.
import type { ApiPermissions, Role } from "./api/settings-schemas";

export type Action =
  | "users.read"
  | "users.write"
  | "geo.read"
  | "geo.write"
  | "kpi.read"
  | "kpi.write"
  | "ai.read"
  | "ai.write"
  | "org.read"
  | "org.write"
  | "appearance.org.write"
  | "appearance.personal.write"
  | "about.read";

const MATRIX: Record<Role, Action[]> = {
  admin: [
    "users.read",
    "users.write",
    "geo.read",
    "geo.write",
    "kpi.read",
    "kpi.write",
    "ai.read",
    "ai.write",
    "org.read",
    "org.write",
    "appearance.org.write",
    "appearance.personal.write",
    "about.read",
  ],
  editor: [
    "geo.read",
    "kpi.read",
    "ai.read",
    "org.read",
    "appearance.personal.write",
    "about.read",
  ],
  viewer: ["geo.read", "kpi.read", "org.read", "appearance.personal.write", "about.read"],
};

export function can(role: Role, action: Action, api?: ApiPermissions): boolean {
  if (MATRIX[role].includes(action)) return true;
  if (role === "editor" && api) {
    if (action === "geo.write") return api.editor_can_edit_geo;
    if (action === "kpi.write") return api.editor_can_edit_kpi;
  }
  return false;
}
