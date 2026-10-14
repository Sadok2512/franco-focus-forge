// Mock authentication only — no real identity provider.
const KEY = "bc4.session";
const TTL = 8 * 3600 * 1000;
export type Session = { user: string; displayName: string; expiresAt: number };

export const DEMO_USER = { id: "demo.ingenieur", password: "bc4-demo" };

export async function login(id: string, password: string): Promise<Session> {
  await new Promise((r) => setTimeout(r, 400));
  if (id.trim() !== DEMO_USER.id || password !== DEMO_USER.password) {
    throw new Error("Identifiant ou mot de passe incorrect.");
  }
  const s: Session = { user: id, displayName: "Jean Dupont", expiresAt: Date.now() + TTL };
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    if (!s || s.expiresAt < Date.now()) { localStorage.removeItem(KEY); return null; }
    return s;
  } catch { return null; }
}

export function logout() { localStorage.removeItem(KEY); }
