import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSession,
  login,
  openAuthenticatedTab,
  rememberedLogin,
  setSession,
  type Session,
} from "@/lib/api/http";

const session: Session = {
  token: "test-session-not-a-real-token",
  token_type: "Bearer",
  expires_at: "2099-01-01T00:00:00Z",
  user: {
    id: "test",
    email: "test@example.invalid",
    role: "lecteur",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    must_change_password: false,
  },
};
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());
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
  it("copies a tab-only session into a same-origin popup without persisting it", () => {
    setSession(session, false);
    const popupStorage = { setItem: vi.fn() };
    const replace = vi.fn();
    const popup = {
      sessionStorage: popupStorage,
      location: { replace },
      opener: window,
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);

    expect(openAuthenticatedTab("/kpi?map_panel=cell_rsrp%400")).toBe(popup);
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(popupStorage.setItem).toHaveBeenCalledWith(
      "bc4.session",
      sessionStorage.getItem("bc4.session"),
    );
    expect(popup.opener).toBeNull();
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("/kpi?map_panel="));
    expect(localStorage.getItem("bc4.session")).toBeNull();
  });
  it("refuses to transfer a session to another origin", () => {
    const open = vi.spyOn(window, "open");
    expect(openAuthenticatedTab("https://example.invalid/kpi")).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});
