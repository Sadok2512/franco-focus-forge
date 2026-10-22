import { beforeEach, describe, expect, it } from "vitest";
import { getSession, login, rememberedLogin, setSession, type Session } from "@/lib/api/http";

const session: Session = {
  token: "test-session-not-a-real-token", token_type: "Bearer",
  expires_at: "2099-01-01T00:00:00Z",
  user: { id: "test", email: "test@example.invalid", role: "lecteur", active: true, created_at: "2026-01-01T00:00:00Z" },
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe("Remember me", () => {
  it("keeps checked sessions after tab storage is cleared", () => {
    setSession(session, true);
    sessionStorage.clear();
    expect(getSession()).toEqual(session);
    expect(sessionStorage.getItem("bc4.session")).toBeNull();
  });
  it("keeps unchecked sessions only in tab storage", () => {
    setSession(session, true);
    setSession(session, false);
    expect(localStorage.getItem("bc4.session")).toBeNull();
    expect(getSession()).toEqual(session);
    sessionStorage.clear();
    expect(getSession()).toBeNull();
  });
  it("never extends an expired server session", () => {
    setSession({ ...session, expires_at: "2020-01-01T00:00:00Z" }, true);
    expect(getSession()).toBeNull();
    expect(localStorage.getItem("bc4.session")).toBeNull();
  });
  it("clears both storage locations on logout or unauthorized response", () => {
    localStorage.setItem("bc4.session", JSON.stringify(session));
    sessionStorage.setItem("bc4.session", JSON.stringify(session));
    setSession(null);
    expect(localStorage.getItem("bc4.session")).toBeNull();
    expect(sessionStorage.getItem("bc4.session")).toBeNull();
  });
  it("remembers only the login, never the password, and clears it when unchecked", async () => {
    await login("demo", "demo", true);
    expect(rememberedLogin()).toBe("demo");
    expect(JSON.parse(localStorage.getItem("bc4.session") ?? "{}")).not.toHaveProperty("password");
    await login("demo", "demo", false);
    expect(rememberedLogin()).toBe("");
    expect(localStorage.getItem("bc4.session")).toBeNull();
    expect(getSession()?.user.email).toBe("demo");
  });
});