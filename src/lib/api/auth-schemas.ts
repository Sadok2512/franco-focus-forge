// Contrats B2 (auth comptes locaux). Alignés 1:1 avec `app/schemas/auth.py`
// côté bc4-back. Les rôles côté API sont en FR (admin/ingenieur/lecteur) —
// différents du vocabulaire B0 (admin/editor/viewer) utilisé par
// `/settings/users` et consorts. Les deux coexistent pour l'instant
// (écart déclaré CHANGELOG back 0.7.0).

import { z } from "zod";

export const AppUserRoleSchema = z.enum(["admin", "ingenieur", "lecteur"]);
export type AppUserRole = z.infer<typeof AppUserRoleSchema>;

export const PublicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: AppUserRoleSchema,
  active: z.boolean(),
  created_at: z.string(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1),
});
export type AuthLoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  token_type: z.literal("Bearer"),
  expires_at: z.string(),
  user: PublicUserSchema,
});
export type AuthLoginResponse = z.infer<typeof LoginResponseSchema>;
