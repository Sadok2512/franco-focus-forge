import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";

export const LANGUAGE_STORAGE_KEY = "bc4.language";
const LANGUAGE_PREFERENCE_VERSION = "bc4.language.english-default.v2";
export function readLanguage(): "en" | "fr" {
  try {
    // Reset preferences from the initial rollout once, as requested.
    if (typeof window !== "undefined" && !window.localStorage.getItem(LANGUAGE_PREFERENCE_VERSION)) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
      window.localStorage.setItem(LANGUAGE_PREFERENCE_VERSION, "1");
      return "en";
    }
    return typeof window !== "undefined" &&
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "fr"
      ? "fr"
      : "en";
  } catch {
    return "en";
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ["en", "fr"],
  interpolation: { escapeValue: false },
  initAsync: false,
});

export async function setLanguage(value: string) {
  const language = value === "fr" ? "fr" : "en";
  await i18n.changeLanguage(language);
  if (typeof document !== "undefined") document.documentElement.lang = language;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    window.localStorage.setItem(LANGUAGE_PREFERENCE_VERSION, "1");
  } catch {
    /* Storage may be unavailable. */
  }
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB", options).format(
    value,
  );
}
export function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(
    i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB",
    options,
  ).format(value);
}
export default i18n;
