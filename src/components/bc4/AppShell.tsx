import { useAnalyticsBootstrap } from "@/lib/analytics-bootstrap";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/lib/i18n";
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
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getAppearance, getOrganization } from "@/lib/api/client";
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
import { getBackHealth } from "@/lib/api/project-kpi";
import { useActiveProject } from "@/lib/activeProject";
import { APP_VERSION } from "@/lib/version";
import { AppFullscreenButton } from "./AppFullscreenButton";
import { HeaderFloatingButton } from "./HeaderFloatingButton";
import { useAppFullscreen } from "@/lib/app-fullscreen";
import { useHeaderFloating } from "@/lib/header-floating";

const NAV = [
  { to: "/projects", label: "nav.projects" },
  { to: "/overview", label: "nav.overview" },
  { to: "/map", label: "nav.map" },
  { to: "/rrc", label: "nav.dictionary" },
  { to: "/kpi", label: "nav.kpi" },
  { to: "/signaling", label: "nav.signaling" },
  { to: "/rf", label: "nav.rf" },
  { to: "/assistant", label: "nav.assistant" },
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

/** Petit label version à côté du logo : "v1.x.x" en style sous-titre
 * (muted). Tooltip au survol = `front vX · back vY` (back lu depuis
 * /health). Source UNIQUE de la version front : APP_VERSION ← package.json
 * (jamais une string tapée à la main). */
function HeaderVersion() {
  const { data: health } = useQuery({
    queryKey: ["back-health"],
    queryFn: ({ signal }) => getBackHealth(signal),
    staleTime: 60_000,
    retry: false,
  });
  const backVer = health?.version ?? "?";
  return (
    <span
      title={`front v${APP_VERSION} · back v${backVer}`}
      className="text-xs font-medium text-muted-foreground"
    >
      v{APP_VERSION}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [dark, toggleTheme] = useTheme();
  const { data: org } = useQuery({
    queryKey: ["settings", "organization"],
    queryFn: () => getOrganization(),
  });
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // 1.11.0 — Projet actif global (ex auto-sélection « premier projet »).
  // On NE sélectionne plus automatiquement : si l'utilisateur n'a pas
  // cliqué « Ouvrir », les pages scopées affichent un état vide clair.
  // Un auto-set était un silent-guard — il masquait l'intention « choisir ».
  const { activeProject, clearActiveProject } = useActiveProject();
  useAnalyticsBootstrap(activeProject?.id);
  const session = getSession();
  const [menu, setMenu] = useState(false);

  // 401 attrapé par `apiFetch` (token expiré/invalide) ou appel explicite
  // à `logout()` : purge locale déjà faite, on redirige vers /login.
  useEffect(() => {
    const onUnauth = () => navigate({ to: "/login" });
    window.addEventListener(UNAUTH_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTH_EVENT, onUnauth);
  }, [navigate]);

  // Plein écran : la barre du haut ne prend plus de place, elle flotte au
  //-dessus du contenu et se replie d'elle-même. Elle revient quand le pointeur
  // atteint le bord supérieur, quand le clavier y entre, et brièvement au
  // moment du passage en plein écran pour signaler qu'elle est toujours là.
  const fullscreen = useAppFullscreen();
  const floating = useHeaderFloating();
  const headerRef = useRef<HTMLElement>(null);
  const [headerOpen, setHeaderOpen] = useState(false);
  const headerOpenRef = useRef(false);
  const showHeader = (v: boolean) => {
    headerOpenRef.current = v;
    setHeaderOpen(v);
  };
  useEffect(() => {
    if (!fullscreen || !floating) {
      showHeader(false);
      return;
    }
    showHeader(true);
    const grace = window.setTimeout(() => showHeader(false), 1600);
    const onMove = (e: PointerEvent) => {
      const h = headerRef.current?.offsetHeight ?? 56;
      if (e.clientY <= 12) showHeader(true);
      else if (headerOpenRef.current && e.clientY > h + 20) showHeader(false);
    };
    const onDown = (e: PointerEvent) => {
      if (e.clientY <= 16) showHeader(true);
    };
    const onFocus = (e: FocusEvent) =>
      showHeader(headerRef.current?.contains(e.target as Node) ?? false);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("focusin", onFocus);
    return () => {
      window.clearTimeout(grace);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("focusin", onFocus);
    };
  }, [fullscreen, floating]);

  const name = session?.displayName ?? t("common.user");
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {fullscreen && floating && !headerOpen && <div className="app-header-hotzone" aria-hidden="true" />}
      <header
        ref={headerRef}
        className={`app-header sticky top-0 z-40 flex h-14 items-center gap-6 border-b bg-card px-5 ${headerOpen ? "is-revealed" : ""}`}
      >
        <Link
          to="/projects"
          search={(s: FilterContext) => s}
          className="flex items-center gap-2 text-lg"
        >
          <Logo />
          <HeaderVersion />
          {org?.show_in_header && org.name && (
            <span className="hidden max-w-40 truncate border-l pl-2 text-xs font-medium text-muted-foreground lg:inline">
              {org.short_name || org.name}
            </span>
          )}
        </Link>
        <nav aria-label={t("nav.main")} className="flex h-full items-center gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                search={(s: FilterContext) => s}
                className={`flex h-9 items-center gap-1 whitespace-nowrap rounded-md px-3.5 text-[13px] font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
              >
                {t(n.label)}
                {active && n.to === "/projects" && <ChevronDown className="h-3.5 w-3.5" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <HeaderFloatingButton />
          <AppFullscreenButton />
          {activeProject && (
            <div
              aria-label={t("common.activeProject", { name: activeProject.name })}
              className="mr-2 inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 pl-3 pr-1 text-xs font-medium text-primary"
            >
              <span className="truncate">
                <span className="text-muted-foreground">{t("common.project")}</span>{" "}
                {activeProject.name}
              </span>
              <button
                type="button"
                onClick={() => clearActiveProject()}
                aria-label={t("common.closeProject")}
                title={t("common.closeProject")}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            aria-label={t(dark ? "common.lightTheme" : "common.darkTheme")}
            onClick={toggleTheme}
            className="rounded-full p-2 text-op-orange hover:bg-muted"
          >
            {dark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
          </button>
          <button
            aria-label={t("common.tips")}
            className="rounded-full p-2 text-op-orange hover:bg-muted"
          >
            <Lightbulb className="h-[18px] w-[18px]" />
          </button>
          <button
            aria-label={t("common.help")}
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
                <span className="block text-[11px] text-muted-foreground">
                  {t("common.radioEngineer")}
                </span>
              </span>
            </button>
            {menu && (
              <div
                role="menu"
                className="absolute right-0 top-11 w-44 rounded-md border bg-popover p-1 shadow-lg"
              >
                <label className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-xs">
                  {t("common.language")}
                  <select
                    aria-label={t("common.language")}
                    value={i18n.resolvedLanguage ?? "en"}
                    onChange={(event) => void setLanguage(event.target.value)}
                    className="rounded border bg-popover px-1 py-0.5"
                  >
                    <option value="en" lang="en">
                      English
                    </option>
                    <option value="fr" lang="fr">
                      Français
                    </option>
                  </select>
                </label>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    navigate({ to: "/settings" });
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <Settings className="h-3.5 w-3.5" /> {t("common.settings")}
                </button>

                <button
                  role="menuitem"
                  onClick={() => {
                    logout();
                    navigate({ to: "/login" });
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <LogOut className="h-3.5 w-3.5" /> {t("common.logout")}
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
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-md text-xs text-muted-foreground">{t("common.pending", { phase })}</p>
    </div>
  );
}
