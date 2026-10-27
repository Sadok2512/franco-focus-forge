// Préférence « barre du haut flottante » partagée par toute l'UI.
//
// Flottante (défaut) : la barre se pose au-dessus du contenu et ne réserve
// aucune place — `--app-header-offset` vaut 0, les pages reprennent la
// hauteur complète de la fenêtre. Ancrée : elle reprend sa place normale de
// 56 px dans le flux de la page.
//
// Le choix est mémorisé dans localStorage (aucune donnée sensible) et survit
// donc au rechargement, au changement de page et aux entrées/sorties de
// plein écran. `storage` garde les onglets ouverts synchrones.
import { useSyncExternalStore } from "react";

const FLOATING_CLASS = "app-header-floating";
const KEY = "bc4.headerFloating.v1";

const listeners = new Set<() => void>();
let installed = false;

/** Défaut : flottante — c'est le comportement attendu en plein écran. */
function read(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
}

function applyClass() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(FLOATING_CLASS, read());
}

function notify() {
  applyClass();
  listeners.forEach((l) => l());
}

export function isHeaderFloating(): boolean {
  return read();
}

function subscribe(listener: () => void) {
  if (!installed) {
    installed = true;
    window.addEventListener("storage", notify);
  }
  applyClass();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      installed = false;
      window.removeEventListener("storage", notify);
    }
  };
}

const getSnapshot = () => read();
const getServerSnapshot = () => true;

/** Vrai quand la barre du haut doit flotter au-dessus du contenu. */
export function useHeaderFloating(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Ancre (false) ou fait flotter (true) la barre du haut. */
export function setHeaderFloating(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // stockage indisponible (navigation privée) : le changement reste valable
    // pour la session en cours, il ne sera simplement pas mémorisé.
  }
  notify();
}
