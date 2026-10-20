import { CatalogTree } from "./CatalogTree";
import type { DictParameterNode } from "@/lib/api/dict-v2";
// bc4-front — Dict v2 : panneau arbre.
// Onglets "Paramètres" (view=catalog) et "Raw" (view=raw) empilés
// au-dessus de l'arbre. L'arbre est HIÉRARCHIQUE comme main :
// Techno → Configuration réseau / Capacités terminal / Mesures rapportées
// → message → groupe fonctionnel → feuilles. Mêmes chevrons
// (ChevronDown/ChevronRight), même pattern treeitem, mêmes compteurs
// `fmtInt` à droite — alignés sur main/Tree pour que l'œil ne note
// aucune différence entre les deux onglets ni avec main.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, RotateCcw, Search } from "lucide-react";
import type { DictLeaf, DictTreeResponse } from "@/lib/api/dict-v2";
import { selectionId } from "./parameter-identity";
import { fmtInt } from "@/features/dictionary/shared";
import { discriminatorChips, originLabel } from "./types";

import type { TemplateCategory } from "@/lib/api/dict-templates";

type Techno = "LTE" | "NR" | "LTE+NR";
export type TreePanelView = "catalog" | "raw" | "templates";
type View = TreePanelView;

export function TreePanel({
  techno,
  catalog,
  raw,
  selected,
  onToggle,
  onToggleCatalog,
  onInfo,
  onReset,
  resetTick,
  categories,
  activeCategory,
  onCategory,
  templatesLoading,
  templatesError,
  onViewChange,
}: {
  onToggleCatalog: (
    parameter: DictParameterNode,
    technology: string,
    origin: string,
    leaf?: DictLeaf,
  ) => void;
  onViewChange: (view: TreePanelView) => void;
  categories: TemplateCategory[];
  activeCategory: TemplateCategory | null;
  onCategory: (category: TemplateCategory) => void;
  templatesLoading: boolean;
  templatesError: boolean;
  techno: Techno;
  catalog: DictTreeResponse | null;
  raw: DictTreeResponse | null;
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
  // Clear selection + collapse tree + empty right panel. Owned par
  // DictV2Page (il tient `selected`) ; TreePanel vide son propre état
  // (search + onglet + nœuds dépliés) quand `resetTick` incrémente.
  onReset: () => void;
  resetTick: number;
}) {
  const [tab, setTab] = useState<View>("catalog");
  const [searches, setSearches] = useState<Record<View, string>>({
    catalog: "",
    raw: "",
    templates: "",
  });
  const q = searches[tab];
  const setQ = (value: string) => setSearches((previous) => ({ ...previous, [tab]: value }));
  // Signal interne vers TreeView pour qu'il replie à l'état initial —
  // bumpé par le même tick que celui du bouton Réinitialiser.
  const [internalResetTick, setInternalResetTick] = useState(0);

  useEffect(() => {
    if (resetTick === 0) return;
    setTab("catalog");
    setSearches({ catalog: "", raw: "", templates: "" });
    setInternalResetTick((t) => t + 1);
  }, [resetTick]);

  const nSel = selected.size;

  return (
    <div className="rrc-sidebar-content flex h-full min-h-0 flex-col">
      <div
        className="flex items-center gap-1 border-b px-2"
        role="tablist"
        aria-label="Vue du dictionnaire"
        data-testid="dict-tree-tabs"
      >
        {(
          [
            ["catalog", "Paramètres"],
            ["raw", "Raw parameter"],
            ["templates", "Templates"],
          ] as const
        ).map(([view, label], index, tabs) => (
          <button
            key={view}
            id={`rrc-tab-${view}`}
            type="button"
            role="tab"
            aria-selected={tab === view}
            aria-controls={`rrc-panel-${view}`}
            tabIndex={tab === view ? 0 : -1}
            onClick={() => {
              setTab(view);
              onViewChange(view);
            }}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              const nextView = tabs[next]![0];
              setTab(nextView);
              onViewChange(nextView);
              document.getElementById(`rrc-tab-${nextView}`)?.focus();
            }}
            className={`min-w-0 flex-1 whitespace-nowrap border-b-2 px-1 py-2 text-xs font-medium ${tab === view ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "templates" && (
        <section
          id="rrc-panel-templates"
          role="tabpanel"
          aria-labelledby="rrc-tab-templates"
          aria-label="Catégories"
          className="min-h-0 flex-1 overflow-auto border-b py-2"
        >
          <h3 className="px-3 pb-1 text-xs font-semibold">Catégories</h3>
          {templatesLoading && (
            <div role="status" className="h-72 animate-pulse bg-muted mx-2 rounded">
              Chargement des catégories…
            </div>
          )}
          {templatesError && (
            <p role="alert" className="px-3 text-xs text-destructive">
              Templates indisponibles. Réessayez en rechargeant la page.
            </p>
          )}
          {categories.map((category) => (
            <button
              key={category.id}
              disabled={!catalog}
              type="button"
              aria-pressed={activeCategory?.id === category.id}
              title={category.n_in_project === 0 ? "0 occurrence dans le projet" : category.label}
              onClick={() => {
                onCategory(category);
                setTab("catalog");
                onViewChange("catalog");
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1 text-left text-xs hover:bg-muted ${activeCategory?.id === category.id ? "bg-primary/10 text-primary" : category.n_in_project === 0 ? "text-muted-foreground" : ""}`}
            >
              <span>{category.label}</span>
              <span className="shrink-0 font-mono text-[10px]">
                {fmtInt(category.n_parameters)} params · {fmtInt(category.n_in_project)} détections
              </span>
            </button>
          ))}
        </section>
      )}
      {tab !== "templates" && (
        <div className="border-b p-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un paramètre…"
              aria-label="Rechercher un paramètre dans l'arbre"
              className="h-8 w-full rounded-md border bg-card pl-7 pr-2 text-xs"
              data-testid="dict-tree-search"
            />
          </label>
        </div>
      )}
      {(["catalog", "raw"] as const).map((view) => {
        const tree = view === "catalog" ? catalog : raw;
        return (
          <div
            key={view}
            id={`rrc-panel-${view}`}
            role="tabpanel"
            aria-labelledby={`rrc-tab-${view}`}
            hidden={tab !== view}
            className="min-h-0 flex-1 overflow-auto"
            data-testid={tab === view ? "dict-tree-scroll" : undefined}
          >
            {!tree ? (
              <p className="p-3 text-xs text-muted-foreground">Chargement…</p>
            ) : view === "raw" ? (
              <RawTreeView
                tree={tree}
                techno={techno}
                needle={searches[view].trim().toLowerCase()}
                selected={selected}
                onToggle={onToggle}
                resetTick={internalResetTick}
              />
            ) : tree.tree.some((t) => t.origins.some((o) => o.categories !== undefined)) ? (
              <CatalogTree
                tree={tree}
                techno={techno}
                needle={searches[view].trim().toLowerCase()}
                selected={selected}
                onToggle={onToggleCatalog}
                resetTick={internalResetTick}
              />
            ) : (
              <TreeView
                tree={tree}
                techno={techno}
                needle={searches[view].trim().toLowerCase()}
                selected={selected}
                onToggle={onToggle}
                onInfo={onInfo}
                resetTick={internalResetTick}
              />
            )}
          </div>
        );
      })}
      <div className="rrc-sidebar-footer">
        <span className="text-[11px] text-muted-foreground" data-testid="dict-selected-count">
          <b className="font-mono text-foreground">{nSel}</b> sélectionné{nSel > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={nSel === 0 && q === ""}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="dict-reset"
        >
          <RotateCcw className="h-3 w-3" /> Réinitialiser
        </button>
      </div>
    </div>
  );
}

// 1.21.2 — RÈGLES RENDU RAW (3e demande utilisateur, 2026-10-17) :
//
// 1. Afficher le DERNIER SEGMENT du chemin (nom 3GPP de la feuille).
//    Jamais le chemin complet dans la ligne. Le chemin va dans title=
//    (tooltip) et dans le volet Infos.
//
// 2. Les indices [0] [1] [2] sont retirés de la clé d'affichage ;
//    les occurrences du même path dédupliqué sont additionnées (ex. 3
//    occurrences de `rsrpResult` sous `measResultListEUTRA/[0..2]/
//    rsrpResult` → une seule ligne `rsrpResult` avec le total). Fait
//    côté front en attendant que le back expose un vrai `view=raw`
//    agrégé — voir CHANGELOG 1.21.2.
//
// 3. Deux feuilles de même nom court sous le même message mais de
//    chemins différents (ex. `t-Reordering` AM vs UM) → le nom court
//    est suivi du segment parent discriminant entre parenthèses :
//    `t-Reordering (dl-AM-RLC)`. Jamais le chemin complet.
//
// Les helpers `leafOf` + l'aggrégation `aggregateRawLeaves` ci-dessous
// reproduisent le comportement de l'ancienne page
// `src/features/dictionary/DictionaryPage.tsx:TreeMessage` d'avant 1.18.0.
// Agrégation 1.21.2 — fait côté front en attendant un `view=raw`
// agrégé côté back. On regroupe les feuilles par path dédupliqué (sans
// [n]), on somme les n. Si deux feuilles agrégées ont le même nom
// court dans le même message, on ajoute le segment parent discriminant
// entre parenthèses — jamais le chemin complet dans la ligne.
type RawAggItem = {
  key: string; // path canonique (sans [n]) — clé React stable
  shortName: string; // dernier segment (nom 3GPP)
  display: string; // shortName + ' (parentSeg)' si ambigu
  fullPath: string; // path complet du 1er leaf (pour tooltip)
  n: number | null; // compteur API uniquement
  leafRef: DictLeaf; // 1er leaf (sert pour selected/onToggle)
};

function stripIndices(path: string): string {
  // Retire tous les segments `[\d+]` (ex. "/[0]/" → "/").
  return path
    .split("/")
    .filter((seg) => !/^\[\d+\]$/.test(seg))
    .join("/");
}

function lastSegment(path: string): string {
  const segs = path.split("/").filter((s) => s.length > 0 && !/^\[\d+\]$/.test(s));
  return segs[segs.length - 1] ?? path;
}

function aggregateRawLeaves(leafs: DictLeaf[]): RawAggItem[] {
  // Première passe : fusion par path dédupliqué (sans [n]).
  const byKey = new Map<
    string,
    { leaf: DictLeaf; n: number | null; shortName: string; canonicalSegs: string[] }
  >();
  for (const l of leafs) {
    const canonical = stripIndices(l.display_name);
    const segs = canonical.split("/").filter(Boolean);
    const existing = byKey.get(canonical);
    if (existing) {
      existing.n = typeof l["canonical_n"] === "number" ? l["canonical_n"] : null;
      if (existing.n === null)
        existing.leaf = {
          ...existing.leaf,
          mapping_error:
            "Agrégat Raw non exposé par l’API : compteur et distribution indisponibles.",
        };
    } else {
      byKey.set(canonical, {
        leaf: l,
        n: typeof l["canonical_n"] === "number" ? l["canonical_n"] : l.n,
        shortName: segs[segs.length - 1] ?? canonical,
        canonicalSegs: segs,
      });
    }
  }
  // Deuxième passe : disambiguation.
  //   - On regroupe par shortName.
  //   - Si > 1 entrée partage le même shortName, on cherche pour
  //     chacune le segment ancêtre le plus proche qui la distingue
  //     des autres entrées ambiguës (le parent immédiat suffit souvent
  //     — ex. t-Reordering (dl-AM-RLC) vs t-Reordering (dl-UM-RLC) —
  //     mais parfois il faut remonter d'un cran — ex. rs-sinr-Result
  //     sous `.../measResultBestNeighCell-r15/measResultCell-r15/…`
  //     vs `.../measResultSCell-r15/measResultCell-r15/…`).
  const groupsByShort = new Map<string, { key: string; segs: string[] }[]>();
  for (const [key, v] of byKey.entries()) {
    const bag = groupsByShort.get(v.shortName) ?? [];
    bag.push({ key, segs: v.canonicalSegs });
    groupsByShort.set(v.shortName, bag);
  }
  const discriminatorByKey = new Map<string, string>();
  for (const group of groupsByShort.values()) {
    if (group.length <= 1) continue;
    for (const g of group) {
      // Cherche un segment ancêtre (à l'index -2, -3, …) qui n'apparaît
      // pas au même index dans les autres entrées du groupe. Sinon,
      // fallback = concat des 2 ancêtres les plus proches.
      const segs = g.segs;
      let discriminator = "";
      for (let depth = 2; depth <= 5 && depth <= segs.length; depth++) {
        const candidate = segs[segs.length - depth];
        if (candidate === undefined) break;
        const unique = group
          .filter((o) => o.key !== g.key)
          .every((o) => o.segs[o.segs.length - depth] !== candidate);
        if (unique) {
          discriminator = candidate;
          break;
        }
      }
      if (!discriminator) {
        // Fallback : utiliser les 2 ancêtres les plus proches joints.
        const a = segs[segs.length - 3] ?? "";
        const b = segs[segs.length - 2] ?? "";
        discriminator = [a, b].filter(Boolean).join("/") || "?";
      }
      discriminatorByKey.set(g.key, discriminator);
    }
  }
  const out: RawAggItem[] = [];
  for (const [key, v] of byKey.entries()) {
    const disc = discriminatorByKey.get(key);
    const display = disc ? `${v.shortName} (${disc})` : v.shortName;
    out.push({
      key,
      shortName: v.shortName,
      display,
      fullPath: v.leaf.display_name,
      n: v.n,
      leafRef: v.leaf,
    });
  }
  out.sort((a, b) => a.display.localeCompare(b.display));
  return out;
}

function RawTreeView({
  tree,
  techno,
  needle,
  selected,
  onToggle,
  resetTick,
}: {
  tree: DictTreeResponse;
  techno: Techno;
  needle: string;
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  resetTick: number;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(["LTE", "NR"]));
  useEffect(() => {
    if (resetTick === 0) return;
    setOpen(new Set(["LTE", "NR"]));
  }, [resetTick]);
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Flatten origins → messages (le niveau origin n'est pas rendu en Raw).
  // 1.21.2 — Les feuilles sont ensuite AGRÉGÉES par path dédupliqué
  // (sans [n]) → un item par nom 3GPP, n sommé. L'ambiguïté éventuelle
  // (même shortName, parents différents) est résolue par ajout du
  // segment parent entre parenthèses dans l'affichage.
  const perTechno = tree.tree
    .filter((t) => techno === "LTE+NR" || t.techno === techno)
    .map((t) => {
      const byMessage = new Map<string, DictLeaf[]>();
      for (const o of t.origins) {
        for (const m of o.messages) {
          const bag = byMessage.get(m.message) ?? [];
          for (const g of m.groups) {
            for (const leaf of g.kpis) bag.push(leaf);
          }
          byMessage.set(m.message, bag);
        }
      }
      return {
        techno: t.techno,
        messages: Array.from(byMessage.entries())
          .map(([message, leafs]) => ({
            message,
            items: aggregateRawLeaves(leafs),
          }))
          .sort((a, b) => a.message.localeCompare(b.message)),
      };
    });

  const matchItem = (item: RawAggItem): boolean => {
    if (!needle) return true;
    return (
      item.display.toLowerCase().includes(needle) ||
      item.fullPath.toLowerCase().includes(needle) ||
      item.leafRef.param_key.toLowerCase().includes(needle)
    );
  };
  const matchMessage = (message: string, items: RawAggItem[]): boolean => {
    if (!needle) return true;
    return message.toLowerCase().includes(needle) || items.some(matchItem);
  };

  return (
    <ul role="tree" aria-label="Arbre Raw" className="p-1.5 text-[12.5px]">
      {perTechno.map((t) => {
        const visibleMessages = t.messages.filter((m) => matchMessage(m.message, m.items));
        if (needle && visibleMessages.length === 0) return null;
        const tOpen = open.has(t.techno) || !!needle;
        const nMessages = visibleMessages.length;
        const nLeafs = visibleMessages.reduce((a, m) => a + m.items.length, 0);
        return (
          <li key={t.techno} role="none">
            <button
              role="treeitem"
              aria-level={1}
              data-rrc-root={t.techno}
              aria-expanded={tOpen}
              onClick={() => toggle(t.techno)}
              className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left font-semibold hover:bg-muted"
            >
              {tOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Folder className="h-3.5 w-3.5" />
              {t.techno}
              <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                {fmtInt(nMessages)} msg · {fmtInt(nLeafs)}
              </span>
            </button>
            {tOpen && (
              <ul role="group" className="ml-3">
                {visibleMessages.map(({ message, items }) => {
                  const mid = `raw|${t.techno}|${message}`;
                  const mOpen = open.has(mid) || !!needle;
                  const shownItems = needle ? items.filter(matchItem) : items;
                  return (
                    <li key={mid} role="none">
                      <button
                        role="treeitem"
                        aria-level={2}
                        aria-expanded={mOpen}
                        onClick={() => toggle(mid)}
                        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-muted"
                      >
                        {mOpen ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span className="min-w-0 flex-1 font-mono text-[11.5px] break-all">
                          {message}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {fmtInt(shownItems.length)}
                        </span>
                      </button>
                      {mOpen && (
                        <ul role="group" className="ml-4 border-l pl-1">
                          {shownItems.map((item) => (
                            <RawLeafRow
                              key={item.key}
                              item={item}
                              selected={selected}
                              onToggle={onToggle}
                            />
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// 1.19.1 — Feuille Raw : nom BRUT mono, non tronqué (break-all), compte
// aligné à droite tabular-nums. Pas de FileText (compacité), pas de chips,
// pas de bouton Info — la ligne entière est cliquable pour toggle la case.
function RawLeafRow({
  item,
  selected,
  onToggle,
}: {
  item: RawAggItem;
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
}) {
  const isSelected = selected.has(selectionId(item.leafRef));
  const n = item.n;
  const unavailable =
    typeof item.leafRef["mapping_error"] === "string"
      ? item.leafRef["mapping_error"]
      : n === 0
        ? "0 occurrence dans ce périmètre"
        : undefined;
  return (
    <li role="none">
      <label
        className={`group flex items-start gap-1.5 rounded px-1.5 py-[3px] text-[12px] ${
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        } ${unavailable ? "opacity-60" : ""}`}
        title={unavailable ?? item.fullPath}
        data-testid={`dict-raw-leaf-${item.shortName}`}
        data-selection-id={selectionId(item.leafRef)}
      >
        <input
          type="checkbox"
          checked={isSelected}
          disabled={!!unavailable}
          onChange={() => onToggle(item.leafRef)}
          className="mt-[3px] h-3 w-3 shrink-0"
          aria-label={`Sélectionner ${item.shortName}`}
        />
        <span
          className={`min-w-0 flex-1 truncate font-mono text-[11.5px] leading-[1.35] ${
            isSelected ? "font-semibold" : ""
          }`}
          // 1.21.2 — tooltip = chemin ASN.1 complet (path d'origine du
          // 1er leaf agrégé). Le nom court seul reste dans la ligne.
          title={item.fullPath}
        >
          {item.display}
        </span>
        <span className="shrink-0 self-start pt-[1px] font-mono text-[10px] tabular-nums text-muted-foreground">
          {n === null ? "N/D" : fmtInt(n)}
          {isSelected && (
            <span title="Occurrences affichées avec les filtres appliqués">
              {" "}
              /{" "}
              {typeof item.leafRef["displayed_n"] === "number"
                ? fmtInt(item.leafRef["displayed_n"])
                : "—"}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}

function TreeView({
  tree,
  techno,
  needle,
  selected,
  onToggle,
  onInfo,
  resetTick,
}: {
  tree: DictTreeResponse;
  techno: Techno;
  needle: string;
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
  resetTick: number;
}) {
  // Nœuds développés (ids stables). Techno LTE/NR auto-ouverts par défaut.
  const initialOpen = () => new Set(["LTE", "NR"]);
  const [open, setOpen] = useState<Set<string>>(initialOpen);
  useEffect(() => {
    if (resetTick === 0) return;
    setOpen(initialOpen());
  }, [resetTick]);
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Filtrage techno (LTE / NR / LTE+NR) comme main's Tree.
  const technos = tree.tree.filter((t) => techno === "LTE+NR" || t.techno === techno);

  // Pré-flatten par filtrage sur l'input. Ouvre tout si needle non vide.
  // On indexe par param_key + chemin (leafMatchKey) — stable, pas lié à
  // la position [i] du leaf dans son groupe.
  const filteredIds = useMemo(() => {
    if (!needle) return null;
    const ids = new Set<string>();
    for (const t of tree.tree) {
      for (const o of t.origins) {
        for (const m of o.messages) {
          for (const g of m.groups) {
            for (const leaf of g.kpis) {
              const hay =
                `${leaf.display_name} ${leaf.param_key} ${JSON.stringify(leaf.discriminators ?? {})}`.toLowerCase();
              if (
                hay.includes(needle) ||
                m.message.toLowerCase().includes(needle) ||
                g.name.toLowerCase().includes(needle)
              ) {
                ids.add(leafMatchKey(t.techno, o.origin, m.message, g.name, leaf));
                ids.add(groupId(t.techno, o.origin, m.message, g.name));
                ids.add(messageId(t.techno, o.origin, m.message));
                ids.add(originId(t.techno, o.origin));
                ids.add(t.techno);
              }
            }
          }
        }
      }
    }
    return ids;
  }, [tree, needle]);

  useEffect(() => {
    if (!needle) return;
    setOpen((prev) => {
      const n = new Set(prev);
      // Auto-open all techno/origin/message/group that match
      if (filteredIds) {
        for (const id of filteredIds) {
          if (!id.startsWith("leaf|")) n.add(id);
        }
      }
      return n;
    });
  }, [needle, filteredIds]);

  const match = (id: string): boolean => !needle || !filteredIds || filteredIds.has(id);

  return (
    <ul role="tree" aria-label="Arbre du dictionnaire" className="p-1.5 text-[12.5px]">
      {technos.map((t) => {
        const tOpen = open.has(t.techno) || !!needle;
        return (
          <li key={t.techno} role="none">
            <button
              role="treeitem"
              aria-level={1}
              data-rrc-root={t.techno}
              aria-expanded={tOpen}
              onClick={() => toggle(t.techno)}
              className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left font-semibold hover:bg-muted"
            >
              {tOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Folder className="h-3.5 w-3.5" />
              {t.techno}
            </button>
            {tOpen && (
              <ul role="group" className="ml-3">
                {t.origins.map((o) => {
                  const oid = originId(t.techno, o.origin);
                  if (!match(oid) && !t.origins.some((_oo) => match(oid))) {
                    // skip if origin has no matches AND searching
                  }
                  const oOpen = open.has(oid) || !!needle;
                  const nOrigin = o.messages.reduce(
                    (acc, m) => acc + m.groups.reduce((a, g) => a + g.kpis.length, 0),
                    0,
                  );
                  // Hide origin bucket if searching and nothing inside matches
                  if (needle && filteredIds && !filteredIds.has(oid)) return null;
                  return (
                    <li key={oid} role="none">
                      <button
                        role="treeitem"
                        aria-level={2}
                        aria-expanded={oOpen}
                        onClick={() => toggle(oid)}
                        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-muted"
                      >
                        {oOpen ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span className="min-w-0 truncate font-medium">
                          {originLabel(o.origin)}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                          {fmtInt(nOrigin)}
                        </span>
                      </button>
                      {oOpen && (
                        <ul role="group" className="ml-4 border-l pl-1">
                          {o.messages.map((m) => {
                            const mid = messageId(t.techno, o.origin, m.message);
                            if (needle && filteredIds && !filteredIds.has(mid)) return null;
                            const mOpen = open.has(mid) || !!needle;
                            const nMsg = m.groups.reduce((a, g) => a + g.kpis.length, 0);
                            return (
                              <li key={mid} role="none">
                                <button
                                  role="treeitem"
                                  aria-level={3}
                                  aria-expanded={mOpen}
                                  onClick={() => toggle(mid)}
                                  className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-muted"
                                >
                                  {mOpen ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                  <span className="min-w-0 truncate font-mono text-[11.5px]">
                                    {m.message}
                                  </span>
                                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                    {fmtInt(nMsg)}
                                  </span>
                                </button>
                                {mOpen && (
                                  <ul role="group" className="ml-4 border-l pl-1">
                                    {m.groups.map((g) => {
                                      const gid = groupId(t.techno, o.origin, m.message, g.name);
                                      if (needle && filteredIds && !filteredIds.has(gid))
                                        return null;
                                      const gOpen = open.has(gid) || !!needle;
                                      return (
                                        <li key={gid} role="none">
                                          <button
                                            role="treeitem"
                                            aria-level={4}
                                            aria-expanded={gOpen}
                                            onClick={() => toggle(gid)}
                                            className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-muted"
                                          >
                                            {gOpen ? (
                                              <ChevronDown className="h-3 w-3" />
                                            ) : (
                                              <ChevronRight className="h-3 w-3" />
                                            )}
                                            <span className="min-w-0 truncate text-[11.5px]">
                                              {g.name}
                                            </span>
                                            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                              {fmtInt(g.kpis.length)}
                                            </span>
                                          </button>
                                          {gOpen && (
                                            <ul role="group" className="ml-5 border-l pl-1">
                                              {g.kpis.map((leaf, i) => {
                                                const matchK = leafMatchKey(
                                                  t.techno,
                                                  o.origin,
                                                  m.message,
                                                  g.name,
                                                  leaf,
                                                );
                                                if (
                                                  needle &&
                                                  filteredIds &&
                                                  !filteredIds.has(matchK)
                                                )
                                                  return null;
                                                return (
                                                  <LeafRow
                                                    key={`${matchK}|${i}`}
                                                    leaf={leaf}
                                                    selected={selected}
                                                    onToggle={onToggle}
                                                    onInfo={onInfo}
                                                  />
                                                );
                                              })}
                                            </ul>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LeafRow({
  leaf,
  selected,
  onToggle,
  onInfo,
}: {
  leaf: DictLeaf;
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
}) {
  const chips = discriminatorChips(leaf.discriminators);
  const isSelected = selected.has(selectionId(leaf));
  const n = leaf.n;
  const unavailable = n === 0 ? "0 occurrence dans ce périmètre" : undefined;
  return (
    <li role="none">
      <div
        className={`group flex items-center gap-1.5 rounded px-1.5 py-[3px] text-[12px] ${
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        } ${unavailable ? "opacity-60" : ""}`}
        title={unavailable}
        data-testid={`dict-leaf-${leaf.display_name}`}
        data-selection-id={selectionId(leaf)}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(leaf)}
          className="h-3 w-3 shrink-0"
          aria-label={`Sélectionner ${leaf.display_name}`}
        />
        <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => onInfo(leaf)}
          title={leaf.param_key}
          className="min-w-0 flex-1 truncate text-left"
        >
          <span className={isSelected ? "font-semibold" : ""}>{leaf.display_name}</span>
        </button>
        {chips.length > 0 && (
          <span className="shrink-0 rounded bg-accent/40 px-1 py-0.5 font-mono text-[9.5px] text-accent-foreground">
            {chips.join(" ")}
          </span>
        )}
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {n === null ? "N/D" : fmtInt(n)}
          {isSelected && (
            <span title="Occurrences affichées avec les filtres appliqués">
              {" "}
              / {typeof leaf["displayed_n"] === "number" ? fmtInt(leaf["displayed_n"]) : "—"}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

// IDs stables pour l'état ouvert/fermé + filtrage par recherche.
const originId = (t: string, o: string) => `o|${t}|${o}`;
const messageId = (t: string, o: string, m: string) => `m|${t}|${o}|${m}`;
const groupId = (t: string, o: string, m: string, g: string) => `g|${t}|${o}|${m}|${g}`;
// Clé de match pour un leaf : param_key + path hiérarchique (stable à
// l'index près — plusieurs leaves peuvent partager le même param_key
// dans des contextes différents, l'index [i] joue le rôle de disambig).
const leafMatchKey = (t: string, o: string, m: string, g: string, leaf: DictLeaf) =>
  `leaf|${t}|${o}|${m}|${g}|${leaf.param_key}`;
