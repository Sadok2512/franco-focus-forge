// B2 : shim au-dessus de `src/lib/api/http.ts`.
// L'auth réelle (JWT HS256 + argon2id, bc4-back 0.7.0) est portée par
// `http.ts`. Ce fichier conserve la surface d'API héritée du B0
// (`getSession`, `getActor`, `login`, `logout`, `setDemoRole`) pour que
// `_app.tsx`, `AppShell`, et autres consommateurs ne changent pas de
// signature. Le rôle est traduit du vocabulaire FR du back
// (admin/ingenieur/lecteur) vers le vocabulaire Zod existant côté UI
// (admin/editor/viewer).

import {
  fetchMe,
  getSession as getHttpSession,
  login as httpLogin,
  logout as httpLogout,
} from "./api/http";
import type { AppUserRole } from "./api/auth-schemas";
import type { Actor, Role } from "./api/settings-schemas";

/** Shape héritée B0 — on la préserve pour ne rien casser côté UI. */
export type Session = {
  user: string;
  displayName: string;
  expiresAt: number;
  role?: Role;
};

const ROLE_FR_TO_ZOD: Record<AppUserRole, Role> = {
  admin: "admin",
  ingenieur: "editor",
  lecteur: "viewer",
};

/** `DEMO_USER` reste exporté pour conserver la compat d'import ; en B2
 *  l'écran de login affiche uniquement un indice générique — les vrais
 *  credentials viennent de l'env serveur (BC4_ADMIN_*). */
export const DEMO_USER = { id: "admin@bc4.local", password: "" };

export async function login(email: string, password: string, remember = true): Promise<Session> {
  const s = await httpLogin(email, password, remember);
  const role: Role = ROLE_FR_TO_ZOD[s.user.role];
  return {
    user: s.user.email,
    displayName: s.user.email,
    role,
    expiresAt: Date.parse(s.expires_at),
  };
}

export function getSession(): Session | null {
  const s = getHttpSession();
  if (!s) return null;
  return {
    user: s.user.email,
    displayName: s.user.email,
    role: ROLE_FR_TO_ZOD[s.user.role],
    expiresAt: Date.parse(s.expires_at),
  };
}

export function logout(): void {
  // Fire-and-forget : la purge locale est immédiate ; l'appel /auth/logout
  // est best-effort (JWT stateless, pas de révocation serveur).
  void httpLogout();
}

export function getActor(): Actor {
  const s = getHttpSession();
  return {
    login: s?.user.email ?? "anonyme",
    role: s ? ROLE_FR_TO_ZOD[s.user.role] : "viewer",
  };
}

/** B0 : switch simulé de rôle. En B2 le rôle vient du JWT serveur — on
 *  ne peut plus le simuler côté client. No-op gardé pour ne pas casser
 *  les imports existants ; un éventuel « sous-rôle demo » devra passer
 *  par un vrai compte seedé. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setDemoRole(_role: Role): void {
  // intentionnellement vide
}

export { fetchMe };
