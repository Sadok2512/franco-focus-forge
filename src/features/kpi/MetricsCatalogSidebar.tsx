import { useMemo, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronDown, ChevronRight, MoreVertical, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getMetrics } from "@/lib/api/metrics";
import { MAX_GRAPHS, techLabel } from "./workspace-model";
import { METRIC_VIEW_ICONS, METRIC_VIEW_LABELS, type MetricView } from "./MetricGraphCard";

type MetricInfo = {
  code: string;
  label: string;
  unit: string;
  tech: "LTE" | "NR" | "BOTH";
  kind: "numeric" | "categorical";
  event_code: string;
  n_in_project: number;
  category?: string | null;
};

/** 0.64.0 (F2) — même composant d'arbre visuel que le KpiCatalogSidebar,
 *  alimenté par /projects/{p}/metrics. Grouping (tech → category) depuis
 *  les champs `tech` et `category` servis par le back (pas de catégorie
 *  inventée côté front). Checkboxes séparées de celles des KPI (store
 *  distinct dans l'URL `metrics=[]`). */
export function MetricsCatalogSidebar({
  projectId,
  selected,
  onToggle,
  onVisualization,
  searchRef,
}: {
  projectId: string;
  selected: string[];
  onToggle: (code: string) => void;
  onVisualization?: (code: string, view: MetricView) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["LTE"]));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const query = useQuery({
    queryKey: ["project-metrics", projectId],
    queryFn: ({ signal }) => getMetrics(projectId, signal),
    staleTime: 60_000,
  });

  const tree = useMemo(() => {
    const metrics = (query.data ?? []) as MetricInfo[];
    const needle = search.trim().toLocaleLowerCase();
    const filtered = needle
      ? metrics.filter(
          (m) =>
            m.code.toLocaleLowerCase().includes(needle) ||
            m.label.toLocaleLowerCase().includes(needle) ||
            (m.category ?? "").toLocaleLowerCase().includes(needle),
        )
      : metrics;
    const byTech = new Map<string, Map<string, MetricInfo[]>>();
    for (const m of filtered) {
      const techKey = m.tech === "BOTH" ? "LTE" : m.tech;
      const catKey = m.category ?? "autres";
      if (!byTech.has(techKey)) byTech.set(techKey, new Map());
      const inner = byTech.get(techKey)!;
      if (!inner.has(catKey)) inner.set(catKey, []);
      inner.get(catKey)!.push(m);
    }
    const order = ["LTE", "NR", "BOTH"];
    return [...byTech.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([tech, cats]) => ({
        tech,
        total: [...cats.values()].reduce((s, l) => s + l.length, 0),
        availLines: [...cats.values()].flat().reduce((s, m) => s + m.n_in_project, 0),
        categories: [...cats.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([cat, items]) => ({
            cat,
            items: items.sort((a, b) => a.label.localeCompare(b.label)),
            lines: items.reduce((s, m) => s + m.n_in_project, 0),
          })),
      }));
  }, [query.data, search]);

  return (
    <aside className="kpi-catalog" aria-label="Catalogue Métriques">
      <header className="p-3 border-b">
        <h2 className="flex items-center gap-2 font-semibold text-sm">
          <Activity size={16} className="text-primary" /> Catalogue Métriques
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          décodeur · {(query.data ?? []).length} métriques · {selected.length}/{MAX_GRAPHS}
          sélectionnées
        </p>
        <label className="relative block mt-3">
          <Search size={14} className="absolute left-2.5 top-3 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une métrique…"
            aria-label="Rechercher une métrique"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-xs"
          />
        </label>
      </header>
      {query.isPending && (
        <p className="p-3 text-xs text-muted-foreground" role="status">
          Chargement du catalogue…
        </p>
      )}
      {query.isError && (
        <p className="p-3 text-xs text-destructive" role="alert">
          Impossible de charger /metrics : {query.error.message}
        </p>
      )}
      {!query.isPending && !query.isError && tree.length === 0 && (
        <p className="p-3 text-xs text-muted-foreground" role="status">
          Aucune métrique décodée pour ce projet.
        </p>
      )}
      <ul className="kpi-tree p-2 space-y-1">
        {tree.map((t) => {
          const expanded = Boolean(search) || open.has(t.tech);
          return (
            <li key={t.tech}>
              <button
                className="kpi-tree-root"
                aria-expanded={expanded}
                onClick={() => toggle(t.tech)}
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {techLabel(t.tech)}
                <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                  {t.total} · {t.availLines.toLocaleString("fr-FR")} lignes
                </span>
              </button>
              {expanded &&
                t.categories.map((c) => {
                  const key = `${t.tech}/${c.cat}`;
                  const famOpen = Boolean(search) || open.has(key);
                  return (
                    <div className="ml-2" key={key}>
                      <button
                        className="kpi-tree-family"
                        aria-expanded={famOpen}
                        onClick={() => toggle(key)}
                      >
                        {famOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="truncate">{c.cat}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {c.items.length} · {c.lines.toLocaleString("fr-FR")}
                        </span>
                      </button>
                      {famOpen &&
                        c.items.map((m) => {
                          const isSelected = selected.includes(m.code);
                          const over = !isSelected && selected.length >= MAX_GRAPHS;
                          return (
                            <div
                              key={m.code}
                              title={`${m.event_code} · ${m.code}${m.n_in_project ? ` · ${m.n_in_project} lignes` : ""}`}
                              className={`kpi-tree-leaf`}
                            >
                              <label className="flex min-w-0 flex-1 items-center gap-2">
                                <input
                                  type="checkbox"
                                  aria-label={`Sélectionner ${m.label}`}
                                  checked={isSelected}
                                  disabled={over}
                                  onChange={() => onToggle(m.code)}
                                />
                                <span className="min-w-0">
                                  <span className="block truncate">{m.label}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    [{m.event_code}] · {m.unit} ·{" "}
                                    {m.n_in_project.toLocaleString("fr-FR")}
                                  </span>
                                </span>
                              </label>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="kpi-icon kpi-leaf-menu"
                                    aria-label={`Visualisation ${m.label}`}
                                    disabled={over}
                                    data-testid={`metric-leaf-menu-${m.code}`}
                                  >
                                    <MoreVertical size={15} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                  <DropdownMenuLabel>Visualisation</DropdownMenuLabel>
                                  {(Object.keys(METRIC_VIEW_LABELS) as MetricView[]).map((mode) => {
                                    const Icon = METRIC_VIEW_ICONS[mode];
                                    return (
                                      <DropdownMenuItem
                                        key={mode}
                                        onSelect={() => {
                                          if (!isSelected) onToggle(m.code);
                                          onVisualization?.(m.code, mode);
                                        }}
                                      >
                                        <Icon size={14} />
                                        {METRIC_VIEW_LABELS[mode]}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
