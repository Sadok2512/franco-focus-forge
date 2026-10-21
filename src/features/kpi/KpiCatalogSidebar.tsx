import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VisualizationItems } from "./VisualizationMenu";
import type { VisualizationType } from "./visualization-model";
import { useState, type RefObject } from "react";
import { BarChart3, ChevronDown, ChevronRight, Search, MoreVertical } from "lucide-react";
import type { ProjectKpiCatalog } from "@/lib/api/project-kpi-schemas";
import { APP_VERSION } from "@/lib/version";
import { MAX_GRAPHS, matchesEntry, techLabel } from "./workspace-model";

/** Existing KPI tree: same server technologies, families, codes and status counts. */
export function KpiCatalogSidebar({
  catalog,
  selected,
  active,
  onToggle,
  onVisualization,
  searchRef,
}: {
  catalog: ProjectKpiCatalog;
  selected: string[];
  active: string | null;
  onToggle: (code: string) => void;
  onVisualization: (code: string, mode: VisualizationType) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const { t: translate } = useTranslation();
  const [search, setSearch] = useState("");
  const initial =
    catalog.tree.find((t) => t.families.some((f) => f.kpis.some((k) => k.code === active))) ??
    catalog.tree[0];
  const initialFamily =
    initial?.families.find((f) => f.kpis.some((k) => k.code === active)) ?? initial?.families[0];
  const [open, setOpen] = useState<Set<string>>(
    () => new Set([initial?.techno ?? "", `${initial?.techno}/${initialFamily?.family}`]),
  );
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const order = ["LTE", "NR", "ENDC", "AGGREGATE"];
  const tree = [...catalog.tree]
    .sort(
      (a, b) =>
        (order.indexOf(a.techno) < 0 ? 99 : order.indexOf(a.techno)) -
        (order.indexOf(b.techno) < 0 ? 99 : order.indexOf(b.techno)),
    )
    .map((t) => ({
      ...t,
      families: t.families
        .map((f) => ({
          ...f,
          kpis: f.kpis.filter((item) =>
            matchesEntry({ techno: t.techno, family: f.family, item }, search),
          ),
        }))
        .filter((f) => f.kpis.length),
    }))
    .filter((t) => t.families.length);
  return (
    <aside className="kpi-catalog" aria-label={translate("kpi.3ad34a87a145")}>
      <header className="p-2 border-b">
        <h2 className="flex items-center gap-2 font-semibold text-sm">
          <BarChart3 size={16} className="text-primary" /> {translate("kpi.3ad34a87a145")}
          <span className="ml-auto text-[10px] font-normal text-muted-foreground tabular-nums">
            {selected.length}/{MAX_GRAPHS}
          </span>
        </h2>
        <label className="relative block mt-2">
          <Search size={14} className="absolute left-2.5 top-3 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={translate("kpi.cee7b35d8aa1")}
            aria-label={translate("kpi.a3a628e99080")}
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-xs"
          />
        </label>
      </header>
      <ul className="kpi-tree p-2 space-y-1">
        {tree.map((t) => {
          const expanded = Boolean(search) || open.has(t.techno);
          const counts = catalog.counts_by_techno?.[t.techno];
          return (
            <li key={t.techno}>
              <button
                className="kpi-tree-root"
                aria-expanded={expanded}
                onClick={() => toggle(t.techno)}
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {techLabel(t.techno)}
                {counts && (
                  <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                    {Object.values(counts).reduce((a, b) => a + b, 0)} · {counts["AVAILABLE"] ?? 0}{" "}
                    AVAIL
                  </span>
                )}
              </button>
              {expanded &&
                t.families.map((f) => {
                  const key = `${t.techno}/${f.family}`,
                    familyOpen = Boolean(search) || open.has(key);
                  return (
                    <div className="ml-2" key={key}>
                      <button
                        className="kpi-tree-family"
                        aria-expanded={familyOpen}
                        onClick={() => toggle(key)}
                      >
                        {familyOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="truncate">{f.family}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {f.kpis.length}
                        </span>
                      </button>
                      {familyOpen &&
                        f.kpis.map((item) => {
                          const isSelected = selected.includes(item.code);
                          const canAdd = isSelected || selected.length < MAX_GRAPHS;
                          return (
                          <div
                            key={item.code}
                            title={`${t.techno} / ${f.family} / ${item.code}${item.reason ? ` — ${item.reason}` : ""}`}
                            className={`kpi-tree-leaf ${active === item.code ? "is-active" : ""} ${isSelected ? "is-selected" : ""} ${!canAdd ? "is-disabled" : ""}`}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left bg-transparent border-0 p-0"
                              onClick={() => canAdd && onToggle(item.code)}
                              disabled={!canAdd}
                              aria-pressed={isSelected}
                              aria-label={translate("kpi.46d8d72f28dd", { v0: item.name })}
                            >
                              <span
                                className={`kpi-status-dot status-${item.status.toLowerCase()}`}
                                title={item.status}
                              />
                              <span className="min-w-0">
                                <span className="block truncate">{item.name}</span>
                                {search && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {techLabel(t.techno)} / {f.family} · {item.code}
                                  </span>
                                )}
                              </span>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="kpi-icon kpi-leaf-menu"
                                  aria-label={`Visualisation ${item.name}`}
                                  disabled={
                                    !selected.includes(item.code) && selected.length >= MAX_GRAPHS
                                  }
                                >
                                  <MoreVertical size={15} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuLabel>
                                  {translate("kpi.af3aaf87ff99")}
                                </DropdownMenuLabel>
                                <VisualizationItems
                                  throughput={item.unit === "Mbit/s"}
                                  onChange={(mode) => onVisualization(item.code, mode)}
                                />
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
        {!tree.length && (
          <li className="p-4 text-xs text-muted-foreground"> {translate("kpi.7f626224ba1f")} </li>
        )}
      </ul>
      <footer
        className="border-t p-2 text-[10px] text-muted-foreground"
        title={`front v${APP_VERSION} · ${translate("kpi.daee2b836d5a")}`}
      >
        {translate("kpi.daee2b836d5a")}
      </footer>
    </aside>
  );
}
