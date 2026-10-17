// bc4-front — Panneau arbre du Dict v2.
// Deux onglets : "Paramètres" (view=catalog) et "Raw" (view=raw).
// La recherche filtre les feuilles de l'onglet actif. Chaque feuille =
// case à cocher + display_name + chips discriminators + n. Jamais
// masquée si n=0 ("0 occurrence dans ce périmètre").

import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { DictLeaf, DictTreeResponse } from "@/lib/api/dict-v2";
import { discriminatorChips, originLabel } from "./types";

type View = "catalog" | "raw";

export function TreePanel({
  catalog,
  raw,
  selected,
  onToggle,
  onInfo,
}: {
  catalog: DictTreeResponse | null;
  raw: DictTreeResponse | null;
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
}) {
  const [tab, setTab] = useState<View>("catalog");
  const [q, setQ] = useState("");
  const activeTree = tab === "catalog" ? catalog : raw;

  // Pré-aplatir chaque feuille avec son chemin lisible pour la recherche :
  // (techno › origin › message › groupe › display_name › chips).
  const leaves = useMemo<FlatLeaf[]>(() => flatten(activeTree), [activeTree]);
  const filtered = useMemo<FlatLeaf[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return leaves;
    return leaves.filter((l) => l.needle.includes(needle));
  }, [leaves, q]);

  return (
    <aside className="panel flex flex-col gap-2 p-3" data-testid="dict-tree-panel">
      <h2 className="text-sm font-bold">Paramètres RRC</h2>
      <div className="flex items-center gap-1 border-b" data-testid="dict-tree-tabs">
        <button
          type="button"
          onClick={() => setTab("catalog")}
          className={`border-b-2 px-3 py-1.5 text-xs font-medium ${
            tab === "catalog"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          }`}
          aria-selected={tab === "catalog"}
          role="tab"
        >
          Paramètres
        </button>
        <button
          type="button"
          onClick={() => setTab("raw")}
          className={`border-b-2 px-3 py-1.5 text-xs font-medium ${
            tab === "raw"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          }`}
          aria-selected={tab === "raw"}
          role="tab"
        >
          Raw parameter
        </button>
      </div>
      <label className="relative block">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "catalog" ? "Rechercher (drx, hysteresis, a3…)" : "Rechercher un path brut…"}
          className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-2 text-xs"
          aria-label="Rechercher un paramètre"
          data-testid="dict-tree-search"
        />
      </label>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {activeTree
          ? `${activeTree.distinct_param_keys} paramètres · ${activeTree.total_rows} lignes${
              q ? ` · ${filtered.length} trouvés` : ""
            }`
          : "Chargement…"}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {activeTree ? (
          q.trim() ? (
            // En recherche : liste plate (plus lisible qu'un arbre partiel).
            <FlatList items={filtered} selected={selected} onToggle={onToggle} onInfo={onInfo} />
          ) : (
            <TreeView tree={activeTree} selected={selected} onToggle={onToggle} onInfo={onInfo} />
          )
        ) : null}
      </div>
    </aside>
  );
}

type FlatLeaf = {
  leaf: DictLeaf;
  needle: string;
  context: string;
};

function flatten(tree: DictTreeResponse | null): FlatLeaf[] {
  if (!tree) return [];
  const out: FlatLeaf[] = [];
  for (const t of tree.tree) {
    for (const o of t.origins) {
      for (const m of o.messages) {
        for (const g of m.groups) {
          for (const leaf of g.kpis) {
            const context = `${t.techno} › ${originLabel(o.origin)} › ${m.message} › ${g.name}`;
            const chips = discriminatorChips(leaf.discriminators).join(" ");
            out.push({
              leaf,
              context,
              needle: `${context} ${leaf.display_name} ${leaf.param_key} ${chips}`.toLowerCase(),
            });
          }
        }
      }
    }
  }
  return out;
}

function FlatList({
  items,
  selected,
  onToggle,
  onInfo,
}: {
  items: FlatLeaf[];
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
}) {
  if (!items.length) {
    return (
      <p className="px-2 py-4 text-xs text-muted-foreground">Aucun paramètre pour cette recherche.</p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {items.map((it, i) => (
        <li
          key={`${it.leaf.param_key}|${it.context}|${JSON.stringify(it.leaf.discriminators ?? {})}|${i}`}
          className="rounded-md px-1 py-1 hover:bg-muted"
        >
          <div className="text-[10px] text-muted-foreground">{it.context}</div>
          <LeafRow leaf={it.leaf} selected={selected} onToggle={onToggle} onInfo={onInfo} />
        </li>
      ))}
    </ul>
  );
}

function TreeView({
  tree,
  selected,
  onToggle,
  onInfo,
}: {
  tree: DictTreeResponse;
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
}) {
  return (
    <ul className="space-y-0.5" data-testid="dict-tree-root">
      {tree.tree.map((t) => (
        <TechnoNode
          key={t.techno}
          techno={t.techno}
          origins={t.origins}
          selected={selected}
          onToggle={onToggle}
          onInfo={onInfo}
        />
      ))}
    </ul>
  );
}

function TechnoNode({
  techno,
  origins,
  selected,
  onToggle,
  onInfo,
}: {
  techno: string;
  origins: DictTreeResponse["tree"][number]["origins"];
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[13px] font-semibold hover:bg-muted"
        aria-expanded={open}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        {techno}
      </button>
      {open && (
        <ul className="ml-3 border-l pl-2">
          {origins.map((o) => (
            <OriginNode
              key={`${techno}|${o.origin}`}
              origin={o.origin}
              messages={o.messages}
              selected={selected}
              onToggle={onToggle}
              onInfo={onInfo}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function OriginNode({
  origin,
  messages,
  selected,
  onToggle,
  onInfo,
}: {
  origin: DictTreeResponse["tree"][number]["origins"][number]["origin"];
  messages: DictTreeResponse["tree"][number]["origins"][number]["messages"];
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
}) {
  const [open, setOpen] = useState(origin === "network_config");
  const originCls =
    origin === "network_config"
      ? "bg-sev-good/15 text-sev-good"
      : origin === "ue_capability"
      ? "bg-sev-warn/15 text-sev-warn"
      : "bg-accent/40 text-accent-foreground";
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs font-medium hover:bg-muted"
        aria-expanded={open}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${originCls}`}>
          {originLabel(origin)}
        </span>
      </button>
      {open && (
        <ul className="ml-3 border-l pl-2">
          {messages.map((m) => (
            <MessageNode
              key={`${origin}|${m.message}`}
              message={m.message}
              groups={m.groups}
              selected={selected}
              onToggle={onToggle}
              onInfo={onInfo}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function MessageNode({
  message,
  groups,
  selected,
  onToggle,
  onInfo,
}: {
  message: string;
  groups: DictTreeResponse["tree"][number]["origins"][number]["messages"][number]["groups"];
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs hover:bg-muted"
        aria-expanded={open}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <code className="truncate font-mono text-[11px]">{message}</code>
      </button>
      {open && (
        <ul className="ml-3 border-l pl-2">
          {groups.map((g) => (
            <GroupNode
              key={`${message}|${g.name}`}
              name={g.name}
              kpis={g.kpis}
              selected={selected}
              onToggle={onToggle}
              onInfo={onInfo}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function GroupNode({
  name,
  kpis,
  selected,
  onToggle,
  onInfo,
}: {
  name: string;
  kpis: DictLeaf[];
  selected: Set<string>;
  onToggle: (leaf: DictLeaf) => void;
  onInfo: (leaf: DictLeaf) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs hover:bg-muted"
        aria-expanded={open}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-[11px] font-medium">{name}</span>
      </button>
      {open && (
        <ul className="ml-3 space-y-0.5 border-l pl-2">
          {kpis.map((leaf, i) => (
            <li
              key={`${leaf.param_key}|${name}|${JSON.stringify(leaf.discriminators ?? {})}|${i}`}
              className="group rounded px-1 py-0.5 hover:bg-muted"
            >
              <LeafRow leaf={leaf} selected={selected} onToggle={onToggle} onInfo={onInfo} />
            </li>
          ))}
        </ul>
      )}
    </li>
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
  const checked = selected.has(leaf.param_key);
  const n = leaf.n ?? 0;
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 text-xs ${
        n === 0 ? "opacity-60" : ""
      }`}
      data-testid={`dict-leaf-${leaf.display_name}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(leaf)}
        className="h-3.5 w-3.5 shrink-0"
        aria-label={`Sélectionner ${leaf.display_name}`}
      />
      <code className="truncate font-mono text-[11.5px]">{leaf.display_name}</code>
      {chips.map((c) => (
        <span
          key={c}
          className="rounded bg-accent/40 px-1 py-0.5 font-mono text-[9.5px] text-accent-foreground"
        >
          {c}
        </span>
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onInfo(leaf);
        }}
        className="ml-auto rounded px-1 text-[10px] text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
        aria-label="Voir la fiche"
      >
        ⓘ
      </button>
      <span className="num ml-1 text-[11px] text-muted-foreground">{n}</span>
    </label>
  );
}
