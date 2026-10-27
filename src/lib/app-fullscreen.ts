// État « plein écran de l'application » partagé par toute l'UI.
// Le document cible est <html> (documentElement) : la barre du haut, les
// cartes et les panneaux restent dans le même flux, seul le contexte change.
// `fullscreenchange` est la source de vérité — il se déclenche aussi quand
// l'utilisateur sort du plein écran avec Échap ou le geste du navigateur,
// donc l'état affiché ne peut pas rester faux après une navigation.
import { useSyncExternalStore } from "react";

const FULLSCREEN_CLASS = "app-fullscreen";
const listeners = new Set<() => void>();
let installed = false;
const onChange = () => {
  applyClass();
  listeners.forEach((l) => l());
};

function applyClass() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(FULLSCREEN_CLASS, isAppFullscreen());
}

export function isAppFullscreen(): boolean {
  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}

export function isAppFullscreenSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen)
  );
}

function subscribe(listener: () => void) {
  if (!installed) {
    installed = true;
    document.addEventListener("fullscreenchange", onChange);
  }
  applyClass();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      installed = false;
      document.removeEventListener("fullscreenchange", onChange);
    }
  };
}

const getSnapshot = () => isAppFullscreen();
const getServerSnapshot = () => false;

/** Vrai quand l'application entière est en plein écran. */
export function useAppFullscreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Entre (ou sort) du plein écran. Renvoie false si le navigateur refuse. */
export async function setAppFullscreen(on: boolean): Promise<boolean> {
  if (!isAppFullscreenSupported()) return false;
  try {
    if (on) {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    return true;
  } catch {
    return false;
  }
}
