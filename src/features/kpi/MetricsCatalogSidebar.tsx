import { useMemo, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronDown, ChevronRight, Search } from "lucide-react";
import { getMetrics } from "@/lib/api/client";
import type { MetricInfo } from "@/lib/api/metrics-schemas";
import type { MetricView } from "./MetricGraphCard";
const ORDER = [
  "radio_serving",
  "neighbours",
  "carrier_aggregation",
  "throughput_layers",
  "link_quality",
  "allocation_mcs",
  "csi",
  "mimo_port",
  "ul_power",
  "voice",
  "services",
  "position",
  "signalling_states",
  "session",
  "terminal_cell",
  "undocumented",
];
export function MetricsCatalogSidebar({
  projectId,
  selected,
  onToggle,
  searchRef,
}: {
  projectId: string;
  selected: string[];
  onToggle: (code: string) => void;
  onVisualization?: (code: string, view: MetricView) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(new Set(["LTE"]));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const query = useQuery({
    queryKey: ["project-metrics", projectId],
    queryFn: ({ signal }) => getMetrics(projectId, signal),
    staleTime: 300_000,
  });
  const tree = useMemo(() => {
    const groups = new Map<string, Map<string, MetricInfo[]>>();
    for (const m of query.data ?? []) {
      if (m.alias_of) continue;
      if (
        search &&
        !`${m.label} ${m.code} ${m.event} ${m.category_label}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
        continue;
      const tech = m.tech === "BOTH" ? "Commun LTE / NR" : m.tech;
      if (!groups.has(tech)) groups.set(tech, new Map());
      const cats = groups.get(tech)!;
      const category = m.category ?? "session";
      if (!cats.has(category)) cats.set(category, []);
      cats.get(category)!.push(m);
    }
    return [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tech, cats]) => ({
        tech,
        cats: [...cats].sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b)),
      }));
  }, [query.data, search]);
  const check = (key: string, label: string, disabled = false, reason?: string | null) => (
    <label
      className={`kpi-tree-leaf ${disabled ? "opacity-45" : ""}`}
      title={reason ?? label}
      key={key}
    >
      <input
        type="checkbox"
        checked={selected.includes(key)}
        disabled={disabled || (!selected.includes(key) && selected.length >= 64)}
        aria-label={`Sélectionner ${label}`}
        onChange={() => onToggle(key)}
      />
      <span className="truncate">{label}</span>
    </label>
  );
  const metric = (m: MetricInfo) => {
    const key = m.code;
    const expanded = !!search || open.has(key);
    const parent = m.cell_scoped ? `${key}@all` : key;
    const expandable = m.cell_scoped || m.attributes.length > 0 || m.unproven_cells.length > 0;
    return (
      <li key={key} className="ml-2">
        <div
          className={`kpi-tree-leaf ${!m.available ? "opacity-45" : ""}`}
          title={m.reason ?? m.proof_ref}
        >
          {expandable && (
            <button
              aria-label={`Déplier ${m.label}`}
              aria-expanded={expanded}
              onClick={() => toggle(key)}
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
          <input
            type="checkbox"
            aria-label={`Sélectionner ${m.label}`}
            checked={selected.includes(parent)}
            disabled={!m.available || (!selected.includes(parent) && selected.length >= 64)}
            onChange={() => onToggle(parent)}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {m.cell_scoped ? "★ " : m.kind === "event" ? "⚑ " : ""}
              {m.label}
            </span>
            <small className="text-muted-foreground">
              [{m.event}] · {m.unit}
            </small>
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {m.n_in_project.toLocaleString("fr-FR")}
          </span>
        </div>
        {expanded && expandable && (
          <ul className="ml-5 border-l pl-2">
            {m.cell_options.map((c) =>
              check(`${key}@${c.cell}`, `${m.label} · ${c.label}`, !c.available, c.reason),
            )}
            {m.attributes.map((a) =>
              check(`${key}~${a.code}`, `${m.event} · ${a.label} ${a.unit}`, false, a.proof_ref),
            )}
            {m.unproven_cells.map((c) => check(`${key}@${c.cell}`, c.label, true, c.reason))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <aside className="kpi-catalog" aria-label="Catalogue Métriques">
      <header className="p-3 border-b">
        <h2 className="flex gap-2 font-semibold text-sm">
          <Activity size={16} />
          Catalogue Métriques
        </h2>
        <p className="text-[11px] text-muted-foreground">
          ★ cellule · ⚑ événement · {selected.length}/64 sélectionnées
        </p>
        <label className="relative block mt-3">
          <Search className="absolute left-2 top-3" size={14} />
          <input
            ref={searchRef}
            className="h-9 w-full rounded-md border bg-background pl-8 text-xs"
            placeholder="Rechercher une métrique…"
            aria-label="Rechercher une métrique"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </header>
      {query.isPending && (
        <p className="p-3 text-xs" role="status">
          Chargement du catalogue…
        </p>
      )}
      {query.isError && (
        <p role="alert" className="p-3 text-destructive">
          {query.error.message}
        </p>
      )}
      <ul className="kpi-tree p-2 space-y-1">
        {tree.map((t) => (
          <li key={t.tech}>
            <button
              className="kpi-tree-root"
              aria-expanded={!!search || open.has(t.tech)}
              onClick={() => toggle(t.tech)}
            >
              {open.has(t.tech) ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {t.tech}
            </button>
            <ul>
              {(!!search || open.has(t.tech)) &&
                t.cats.map(([cat, items]) => {
                  const key = t.tech + cat;
                  const expanded = !!search || open.has(key);
                  const events = cat === "signalling_states";
                  const eventGroups = [...new Set(items.map((m) => m.event_group))];
                  return (
                    <li key={key} className="ml-2">
                      <button
                        className="kpi-tree-family"
                        aria-expanded={expanded}
                        onClick={() => toggle(key)}
                      >
                        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{" "}
                        {items[0]?.category_label}
                        {items.some((m) => m.cell_scoped) ? " ★" : ""}
                      </button>
                      {expanded && (
                        <ul>
                          {events
                            ? eventGroups.map((group) => (
                                <li key={group}>
                                  <button
                                    className="kpi-tree-family ml-2"
                                    aria-expanded={!!search || open.has(key + group)}
                                    onClick={() => toggle(key + group)}
                                  >
                                    {open.has(key + group) ? (
                                      <ChevronDown size={12} />
                                    ) : (
                                      <ChevronRight size={12} />
                                    )}{" "}
                                    {group}
                                  </button>
                                  {(!!search || open.has(key + group)) && (
                                    <ul>
                                      {items.filter((m) => m.event_group === group).map(metric)}
                                    </ul>
                                  )}
                                </li>
                              ))
                            : items.map(metric)}
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
          </li>
        ))}
        {query.data?.[0]?.root_notices.map((n) => (
          <li
            key={n.label}
            className="kpi-tree-root opacity-45"
            title={n.reason}
            aria-disabled="true"
          >
            {n.label}
            <span className="text-[10px] font-normal"> · non documenté</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
