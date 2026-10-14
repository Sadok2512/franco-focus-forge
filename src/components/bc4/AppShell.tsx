import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, HelpCircle, LogOut, Moon, Radio, Sun, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getProjects } from "@/lib/api/client";
import { OPERATORS, SERVICES, TECHNOLOGIES, type FilterContext } from "@/lib/api/schemas";
import { getSession, logout } from "@/lib/auth";
import { useFilters } from "@/lib/filters";
import { MultiSelect } from "./MultiSelect";
import { DemoBadge } from "./States";

const NAV = [
  { to: "/projects", label: "Projets" },
  { to: "/overview", label: "Overview" },
  { to: "/rrc", label: "Dictionnaire RRC" },
  { to: "/kpi", label: "KPI Analytics" },
  { to: "/assistant", label: "Assistant IA" },
] as const;

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(localStorage.getItem("bc4.theme") === "dark"); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("bc4.theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark] as const;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [dark, setDark] = useTheme();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { filters, set } = useFilters();
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: ({ signal }) => getProjects(signal) });
  const project = projects?.find((p) => p.id === filters.project);
  const session = getSession();

  useEffect(() => {
    if (!filters.project && projects?.length) set({ project: projects[0]!.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, filters.project]);

  const changeProject = (id: string) => {
    const p = projects?.find((x) => x.id === id);
    if (!p) return;
    // clear selections incompatible with the new project
    const keep = <T extends string>(v: T[] | undefined, allowed: readonly string[]) => v?.filter((x) => allowed.includes(x));
    set({
      project: id, op: keep(filters.op, p.operators), tech: keep(filters.tech, p.technologies),
      svc: keep(filters.svc, p.services), band: keep(filters.band, p.bands), dep: keep(filters.dep, p.departements),
    });
  };

  const chips: { k: keyof FilterContext; v: string }[] = (["op", "tech", "svc", "band", "dep"] as const).flatMap(
    (k) => ((filters[k] as string[] | undefined) ?? []).map((v) => ({ k, v })),
  );
  const showFilters = path !== "/projects";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex h-[62px] items-center gap-4 bg-nav px-4 text-nav-foreground">
        <Link to="/projects" search={(s: FilterContext) => s} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground"><Radio className="h-4 w-4" /></span>
          BC4
        </Link>
        <select aria-label="Projet" value={filters.project ?? ""} onChange={(e) => changeProject(e.target.value)}
          className="h-8 max-w-56 truncate rounded-md border border-nav-active bg-nav-active px-2 text-xs text-nav-foreground">
          {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <nav className="hidden flex-1 items-center gap-0.5 lg:flex" aria-label="Modules">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} search={(s: FilterContext) => s}
              className="rounded-md px-3 py-1.5 text-xs text-nav-muted transition-colors duration-150 hover:text-nav-foreground"
              activeProps={{ className: "bg-nav-active !text-nav-foreground" }}>{n.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <DemoBadge />
          <button aria-label="Basculer le thème" onClick={() => setDark(!dark)} className="rounded p-2 text-nav-muted hover:text-nav-foreground">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button aria-label="Aide" className="rounded p-2 text-nav-muted hover:text-nav-foreground"><HelpCircle className="h-4 w-4" /></button>
          <span className="hidden px-2 text-xs text-nav-muted md:inline">{session?.displayName}</span>
          <button aria-label="Se déconnecter" onClick={() => { logout(); navigate({ to: "/login" }); }} className="rounded p-2 text-nav-muted hover:text-nav-foreground">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-1.5 lg:hidden" aria-label="Modules">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} search={(s: FilterContext) => s} className="whitespace-nowrap rounded px-2 py-1 text-xs" activeProps={{ className: "bg-accent text-accent-foreground" }}>{n.label}</Link>
        ))}
      </nav>
      {showFilters && project && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
          <MultiSelect label="Opérateur" options={project.operators} value={filters.op ?? []} onChange={(v) => set({ op: v })} />
          <MultiSelect label="Service" options={project.services} value={filters.svc ?? []} onChange={(v) => set({ svc: v })} />
          <MultiSelect label="Techno" options={project.technologies} value={filters.tech ?? []} onChange={(v) => set({ tech: v })} />
          <MultiSelect label="Bande" options={project.bands} value={filters.band ?? []} onChange={(v) => set({ band: v })} />
          <MultiSelect label="Département" options={project.departements} value={filters.dep ?? []} onChange={(v) => set({ dep: v })} />
          <span className="num ml-1 font-mono text-[11px] text-muted-foreground">{project.periodStart} → {project.periodEnd}</span>
          <div className="flex flex-wrap gap-1">
            {chips.map((c) => (
              <button key={c.k + c.v} onClick={() => set({ [c.k]: (filters[c.k] as string[]).filter((x) => x !== c.v) } as Partial<FilterContext>)}
                className="inline-flex items-center gap-1 rounded-sm bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground" aria-label={`Retirer ${c.v}`}>
                {c.v} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
          {chips.length > 0 && (
            <button onClick={() => set({ op: undefined, tech: undefined, svc: undefined, band: undefined, dep: undefined })} className="text-[11px] text-primary hover:underline">Réinitialiser</button>
          )}
        </div>
      )}
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function ModulePending({ title, phase, icon = <BookOpen className="h-6 w-6" /> }: { title: string; phase: string; icon?: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-md text-xs text-muted-foreground">Module prévu en phase {phase}. Non implémenté dans cette version — aucune donnée n'est simulée ici.</p>
    </div>
  );
}

export { OPERATORS, SERVICES, TECHNOLOGIES };
