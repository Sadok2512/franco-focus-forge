import { afterEach, describe, expect, it, vi } from "vitest";
import i18n, { formatNumber, LANGUAGE_STORAGE_KEY, readLanguage, setLanguage } from "@/lib/i18n";

afterEach(async () => {
  vi.restoreAllMocks();
  await setLanguage("en");
  localStorage.clear();
});
describe("UI language", () => {
  it("defaults to English and only accepts supported preferences", () => {
    localStorage.clear();
    expect(readLanguage()).toBe("en");
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "de");
    expect(readLanguage()).toBe("en");
  });
  it("resets a saved French preference from the initial rollout to English", () => {
    localStorage.clear();
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(readLanguage()).toBe("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });
  it("switches, persists and formats without changing the source value", async () => {
    await setLanguage("fr");
    expect(readLanguage()).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(i18n.t("nav.projects")).toBe("Projets");
    expect(formatNumber(1234.56)).toBe(new Intl.NumberFormat("fr-FR").format(1234.56));
    await setLanguage("en");
    expect(i18n.t("nav.projects")).toBe("Projects");
  });
  it("works when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readLanguage()).toBe("en");
    await expect(setLanguage("fr")).resolves.toBeUndefined();
    expect(i18n.t("nav.projects")).toBe("Projets");
  });
});
