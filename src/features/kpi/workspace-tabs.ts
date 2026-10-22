// 1.75.0 (BC3) — Spec v2 Phase B + G9 : modèle d'onglets persistés en URL +
// localStorage. Chaque onglet détient ses propres `codes` KPI + mode layout
// (1/2/3/auto colonnes). Les requêtes ne se déclenchent que sur l'onglet actif
// (G11 perf). Pas de nouveau stockage back ; URL = source de vérité.
export type WorkspaceLayout = "auto" | "1" | "2" | "3";
export type WorkspaceTab = {
  id: string;
  name: string;
  codes: string[];
  metricCodes?: string[];
  activeCode: string | null;
  layout: WorkspaceLayout;
  // 1.76.0 (BC3) — Spec v2 G6 : overlay = tous les codes du tab rendus dans
  // UN seul graphique avec check d'unités (max 2 distinctes).
  overlay: boolean;
};
export type WorkspaceTabsState = {
  tabs: WorkspaceTab[];
  activeTabId: string;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_NAME = "Workspace";

export function defaultTab(codes: string[] = [], name = DEFAULT_NAME): WorkspaceTab {
  return {
    id: uid(),
    name,
    codes,
    metricCodes: [],
    activeCode: codes[0] ?? null,
    layout: "auto",
    overlay: false,
  };
}

export function newTabsState(initialCodes: string[] = []): WorkspaceTabsState {
  const tab = defaultTab(initialCodes);
  return { tabs: [tab], activeTabId: tab.id };
}

export function cloneTab(tab: WorkspaceTab, name?: string): WorkspaceTab {
  return { ...tab, id: uid(), name: name ?? `${tab.name} (copy)` };
}

/** URL-serializable form : small base64url JSON for ?tabs= param. */
export function encodeTabs(state: WorkspaceTabsState): string {
  const minimal = {
    t: state.tabs.map((t) => ({
      i: t.id,
      n: t.name,
      c: t.codes,
       m: t.metricCodes,
      a: t.activeCode,
      l: t.layout,
      o: t.overlay ? 1 : 0,
    })),
    a: state.activeTabId,
  };
  const json = JSON.stringify(minimal);
  return typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : json;
}

export function decodeTabs(encoded: string): WorkspaceTabsState | null {
  try {
    const json =
      typeof atob === "function" ? decodeURIComponent(escape(atob(encoded))) : encoded;
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as { t?: unknown[]; a?: unknown };
    if (!Array.isArray(obj.t) || typeof obj.a !== "string") return null;
    const tabs: WorkspaceTab[] = [];
    for (const raw of obj.t) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      if (
        typeof r["i"] !== "string" ||
        typeof r["n"] !== "string" ||
        !Array.isArray(r["c"])
      )
        continue;
      const codes = (r["c"] as unknown[]).filter((v): v is string => typeof v === "string");
      const activeCode = typeof r["a"] === "string" ? r["a"] : null;
      const layout =
        r["l"] === "1" || r["l"] === "2" || r["l"] === "3" || r["l"] === "auto"
          ? (r["l"] as WorkspaceLayout)
          : "auto";
      const overlay = r["o"] === 1 || r["o"] === true;
      tabs.push({
        id: r["i"] as string,
        name: r["n"] as string,
        codes,
        ...(Array.isArray(r["m"])
          ? { metricCodes: r["m"].filter((v): v is string => typeof v === "string") }
          : {}),
        activeCode,
        layout,
        overlay,
      });
    }
    if (!tabs.length) return null;
    const firstTab = tabs[0];
    if (!firstTab) return null;
    const activeTabId = tabs.find((t) => t.id === obj.a)?.id ?? firstTab.id;
    return { tabs, activeTabId };
  } catch {
    return null;
  }
}

export function updateTab(
  state: WorkspaceTabsState,
  tabId: string,
  patch: Partial<WorkspaceTab>,
): WorkspaceTabsState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
  };
}

export function addTab(state: WorkspaceTabsState, nameHint?: string): WorkspaceTabsState {
  const existing = state.tabs.length;
  const name = nameHint ?? `${DEFAULT_NAME} ${existing + 1}`;
  const t = defaultTab([], name);
  return { tabs: [...state.tabs, t], activeTabId: t.id };
}

export function removeTab(state: WorkspaceTabsState, tabId: string): WorkspaceTabsState {
  const next = state.tabs.filter((t) => t.id !== tabId);
  if (!next.length) return newTabsState();
  const activeTabId =
    state.activeTabId === tabId ? (next[0]?.id ?? "") : state.activeTabId;
  return { tabs: next, activeTabId };
}

export function reorderTab(
  state: WorkspaceTabsState,
  fromIndex: number,
  toIndex: number,
): WorkspaceTabsState {
  if (
    fromIndex < 0 ||
    fromIndex >= state.tabs.length ||
    toIndex < 0 ||
    toIndex >= state.tabs.length ||
    fromIndex === toIndex
  )
    return state;
  const next = [...state.tabs];
  const [moved] = next.splice(fromIndex, 1);
  if (moved) next.splice(toIndex, 0, moved);
  return { ...state, tabs: next };
}

export function activeTab(state: WorkspaceTabsState): WorkspaceTab {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0] ?? defaultTab();
}

/** Import the former project-wide metric selection into the active legacy tab only. */
export function migrateMetrics(state: WorkspaceTabsState, metrics: string[]): WorkspaceTabsState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => ({
      ...tab,
      metricCodes: tab.metricCodes ?? (tab.id === state.activeTabId ? [...metrics] : []),
    })),
  };
}
