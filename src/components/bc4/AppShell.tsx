import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  HelpCircle,
  Lightbulb,
  LogOut,
  Moon,
  Radio,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getAppearance, getOrganization, getProjects } from "@/lib/api/client";
import {
  applyAppearance,
  DEFAULT_PREFS,
  readPrefs,
  writePrefs,
  type Prefs,
} from "@/lib/appearance";
import type { FilterContext, Operator } from "@/lib/api/schemas";
import { getSession, logout } from "@/lib/auth";
import { UNAUTH_EVENT } from "@/lib/api/http";
import { useFilters } from "@/lib/filters";

const NAV = [
  { to: "/projects", label: "Projets" },
  { to: "/overview", label: "Vue d'ensemble" },
  { to: "/signaling", label: "Signaling" },
  { to: "/rrc", label: "Dictionnaire RRC" },
  { to: "/kpi", label: "KPI Analytics" },
  { to: "/assistant", label: "Assistant IA" },
] as const;

function useTheme() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const { data: app } = useQuery({
    queryKey: ["settings", "appearance"],
    queryFn: () => getAppearance(),
  });
  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    sync();
    window.addEventListener("bc4-appearance", sync);
    return () => window.removeEventListener("bc4-appearance", sync);
  }, []);
  useEffect(() => {
    applyAppearance(prefs, app?.org_primary_hex ?? null);
  }, [prefs, app]);
  const dark =
    prefs.mode === "dark" ||
    (prefs.mode === "system" &&
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const toggle = () => writePrefs({ ...prefs, mode: dark ? "light" : "dark" });
  return [dark, toggle] as const;
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Radio className="h-4 w-4" />
      </span>
      BC4
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [dark, toggleTheme] = useTheme();
  const { data: org } = useQuery({
    queryKey: ["settings", "organization"],
    queryFn: () => getOrganization(),
  });
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { filters, set } = useFilters();
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: ({ signal }) => getProjects(signal),
  });
  const session = getSession();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!filters.project && projects?.length) set({ project: projects[0]!.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, filters.project]);

  // 401 attrapé par `apiFetch` (token expiré/invalide) ou appel explicite
  // à `logout()` : purge locale déjà faite, on redirige vers /login.
  useEffect(() => {
    const onUnauth = () => navigate({ to: "/login" });
    window.addEventListener(UNAUTH_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTH_EVENT, onUnauth);
  }, [navigate]);

  const name = session?.displayName ?? "Jean Dupont";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-6 border-b bg-card px-5">
        <Link
          to="/projects"
          search={(s: FilterContext) => s}
          className="flex items-center gap-2 text-lg"
        >
          <Logo />
          {org?.show_in_header && org.name && (
            <span className="hidden max-w-40 truncate border-l pl-2 text-xs font-medium text-muted-foreground lg:inline">
              {org.short_name || org.name}
            </span>
          )}
        </Link>
        <nav
          aria-label="Navigation principale"
          className="flex h-full items-center gap-1 overflow-x-auto"
        >
          {NAV.map((n) => {
            const active = path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                search={(s: FilterContext) => s}
                className={`flex h-9 items-center gap-1 whitespace-nowrap rounded-md px-3.5 text-[13px] font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
              >
                {n.label}
                {active && n.to === "/projects" && <ChevronDown className="h-3.5 w-3.5" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button
            aria-label={dark ? "Thème clair" : "Thème sombre"}
            onClick={toggleTheme}
            className="rounded-full p-2 text-op-orange hover:bg-muted"
          >
            {dark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
          </button>
          <button aria-label="Astuces" className="rounded-full p-2 text-op-orange hover:bg-muted">
            <Lightbulb className="h-[18px] w-[18px]" />
          </button>
          <button
            aria-label="Aide"
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
          </button>
          <div className="relative ml-2">
            <button
              onClick={() => setMenu((m) => !m)}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted"
              aria-haspopup="menu"
              aria-expanded={menu}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-xs font-semibold">{name}</span>
                <span className="block text-[11px] text-muted-foreground">Ingénieur Radio</span>
              </span>
            </button>
            {menu && (
              <div
                role="menu"
                className="absolute right-0 top-11 w-44 rounded-md border bg-popover p-1 shadow-lg"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    navigate({ to: "/settings" });
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <Settings className="h-3.5 w-3.5" /> Paramètres
                </button>

                <button
                  role="menuitem"
                  onClick={() => {
                    logout();
                    navigate({ to: "/login" });
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <LogOut className="h-3.5 w-3.5" /> Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

const OP_CLS: Record<Operator, string> = {
  Orange: "border-op-orange text-op-orange",
  SFR: "border-op-sfr text-op-sfr",
  Bouygues: "border-op-bouygues text-op-bouygues",
  Free: "border-muted-foreground text-foreground",
};
export function OpBadge({ op }: { op: Operator }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium ${OP_CLS[op]}`}
    >
      {op}
    </span>
  );
}
export function TechPill({ t }: { t: string }) {
  return (
    <span className="inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
      {t === "EN-DC" ? "EN-DC" : t}
    </span>
  );
}
export const OP_VAR: Record<Operator, string> = {
  Orange: "--op-orange",
  SFR: "--op-sfr",
  Bouygues: "--op-bouygues",
  Free: "--op-free",
};

export function ModulePending({
  title,
  phase,
  icon = <BookOpen className="h-6 w-6" />,
}: {
  title: string;
  phase: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-md text-xs text-muted-foreground">Module prévu en phase {phase}.</p>
    </div>
  );
}
