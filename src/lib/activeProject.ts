// -------------------------------------------------------------------
// activeProject — projet actif global (sélection « Ouvrir » depuis la
// liste des projets). Lu par les pages scopées (Dictionnaire RRC,
// Assistant IA, Vue d'ensemble, KPI). Persisté par-viewer dans
// localStorage (clé `bc4.activeProject.v1.<userEmail|anon>`) pour
// survivre à un refresh — **jamais load-bearing** : si localStorage
// casse (try/catch), l'app démarre juste avec `null`.
//
// Pas d'auto-sélection : si l'utilisateur n'a pas cliqué « Ouvrir », les
// pages scopées affichent l'état vide « Sélectionne un projet pour
// commencer ». On n'invente pas un projet actif.
// -------------------------------------------------------------------

import { useSyncExternalStore } from "react";

import { getSession } from "./auth";

export type ActiveProject = {
  id: string;
  name: string;
} | null;

const KEY_PREFIX = "bc4.activeProject.v1.";

function viewerKey(): string {
  const s = getSession();
  const scope = s?.user ?? "anon";
  return `${KEY_PREFIX}${scope}`;
}

function safeRead(): ActiveProject {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(viewerKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.id === "string" &&
      typeof parsed.name === "string" &&
      parsed.id.length > 0
    ) {
      return { id: parsed.id, name: parsed.name };
    }
    return null;
  } catch {
    // Jamais load-bearing — un localStorage cassé ne doit pas empêcher
    // la nav. On repart juste de `null`.
    return null;
  }
}

function safeWrite(p: ActiveProject): void {
  if (typeof window === "undefined") return;
  try {
    const key = viewerKey();
    if (p === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(p));
  } catch {
    // Idem : on ignore l'échec d'écriture (quota, mode privé, etc.).
    // L'état en mémoire reste à jour, c'est ce qui compte.
  }
}

// -------- Pub/sub en mémoire ---------------------------------------
let current: ActiveProject = safeRead();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getActiveProject(): ActiveProject {
  return current;
}

export function setActiveProject(p: ActiveProject): void {
  // Normalise la valeur avant diff pour éviter des rerenders inutiles.
  const next = p === null ? null : { id: p.id, name: p.name };
  if (
    (current === null && next === null) ||
    (current !== null && next !== null && current.id === next.id && current.name === next.name)
  ) {
    return;
  }
  current = next;
  safeWrite(current);
  emit();
}

export function clearActiveProject(): void {
  setActiveProject(null);
}

// Synchro inter-onglets : si un autre onglet du même viewer modifie la
// clé, on recharge l'état local. Pas de bruit si l'event ne nous
// concerne pas.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(KEY_PREFIX)) return;
    if (e.key !== viewerKey()) return;
    const next = safeRead();
    // Compare par shallow pour éviter l'emit si rien n'a changé.
    const same =
      (current === null && next === null) ||
      (current !== null &&
        next !== null &&
        current.id === next.id &&
        current.name === next.name);
    if (!same) {
      current = next;
      emit();
    }
  });
}

// -------- Hook React -----------------------------------------------
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Hook principal : renvoie `{ activeProject, setActiveProject, clearActiveProject }`.
 *
 *  `activeProject` est `null` quand aucune sélection n'a été faite —
 *  les pages consommatrices doivent afficher un état vide clair, pas
 *  un skeleton infini ni une sélection auto. */
export function useActiveProject(): {
  activeProject: ActiveProject;
  setActiveProject: (p: ActiveProject) => void;
  clearActiveProject: () => void;
} {
  const activeProject = useSyncExternalStore(subscribe, getActiveProject, () => null);
  return {
    activeProject,
    setActiveProject,
    clearActiveProject,
  };
}
