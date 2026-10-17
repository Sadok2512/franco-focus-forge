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
import { fmtInt } from "@/features/dictionary/shared";
import { discriminatorChips, originLabel } from "./types";

type Techno = "LTE" | "NR" | "LTE+NR";
type View = "catalog" | "raw";

export function TreePanel({
  techno,
  catalog,
  raw,
  selected,
  onToggle,
  onInfo,
  onReset,
  resetTick,
}: {
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
  const [q, setQ] = useState("");
  // Signal interne vers TreeView pour qu'il replie à l'état initial —
  // bumpé par le même tick que celui du bouton Réinitialiser.
  const [internalResetTick, setInternalResetTick] = useState(0);
  const activeTree = tab === "catalog" ? catalog : raw;

  useEffect(() => {
    if (resetTick === 0) return;
    setTab("catalog");
    setQ("");
    setInternalResetTick((t) => t + 1);
  }, [resetTick]);

  const nSel = selected.size;

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center gap-1 border-b px-2"
        role="tablist"
        aria-label="Vue du dictionnaire"
        data-testid="dict-tree-tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "catalog"}
          onClick={() => setTab("catalog")}
          className={`border-b-2 px-3 py-1.5 text-xs font-medium ${
            tab === "catalog"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Paramètres
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "raw"}
          onClick={() => setTab("raw")}
          className={`border-b-2 px-3 py-1.5 text-xs font-medium ${
            tab === "raw"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Raw parameter
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
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
        {activeTree && (
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">
            {fmtInt(activeTree.distinct_param_keys)} paramètres · {fmtInt(activeTree.total_rows)}{" "}
            lignes
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!activeTree ? (
          <p className="p-3 text-xs text-muted-foreground">Chargement…</p>
        ) : (
          <TreeView
            tree={activeTree}
            techno={techno}
            needle={q.trim().toLowerCase()}
            selected={selected}
            onToggle={onToggle}
            onInfo={onInfo}
            resetTick={internalResetTick}
          />
        )}
      </div>
    </div>
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
              const hay = `${leaf.display_name} ${leaf.param_key} ${JSON.stringify(leaf.discriminators ?? {})}`.toLowerCase();
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
              aria-expanded={tOpen}
              onClick={() => toggle(t.techno)}
              className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left font-semibold hover:bg-muted"
            >
              {tOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Folder className="h-3.5 w-3.5 text-primary" />
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
                            const nMsg = m.groups.reduce(
                              (a, g) => a + g.kpis.length,
                              0,
                            );
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
  const isSelected = selected.has(leaf.param_key);
  const n = leaf.n ?? 0;
  return (
    <li role="none">
      <div
        className={`group flex items-center gap-1.5 rounded px-1.5 py-[3px] text-[12px] ${
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        } ${n === 0 ? "opacity-60" : ""}`}
        data-testid={`dict-leaf-${leaf.display_name}`}
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
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{fmtInt(n)}</span>
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
