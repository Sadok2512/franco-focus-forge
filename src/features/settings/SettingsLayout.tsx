import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";
import type { FilterContext } from "@/lib/api/schemas";
import { ROLE_LABEL } from "@/lib/api/settings-schemas";
import { useActor } from "./shared";

export const SETTINGS_TABS = [
  { to: "/settings/dict-templates", label: "Templates RRC" },
  { to: "/settings/users", label: "Utilisateurs" },
  { to: "/settings/geography", label: "Géographie" },
  { to: "/settings/cellular-reference", label: "Référence cellulaire" },
  { to: "/settings/kpi-catalog", label: "Catalogue KPI" },
  { to: "/settings/ai", label: "Assistant LLM" },
  { to: "/settings/appearance", label: "Apparence" },
  { to: "/settings/organization", label: "Organisation" },
  { to: "/settings/about", label: "À propos & Version" },
] as const;

export function SettingsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const actor = useActor();
  // 1.19.0 — Lecture directe de la session HTTP : plus de « démo » dans
  // ce composant. Les onglets non-connectés affichent eux-mêmes leur
  // propre bandeau "NON CONNECTÉ AU BACK".
  const session = getSession();
  const email = session?.user ?? null;
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Paramètres</h1>
          <p className="text-xs text-muted-foreground">
            Administration de BC4. Les onglets ont chacun leur statut de connexion back (certaines
            sections restent en mock : marquées visiblement dans leur en-tête).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {email ? (
              <>
                Connecté : <span className="font-medium text-foreground">{email}</span>
              </>
            ) : (
              <span className="font-medium text-destructive">
                Non authentifié (pas de session active)
              </span>
            )}
          </span>
          <span className="rounded border border-[#E2E8F0] px-2 py-0.5 font-medium">
            {ROLE_LABEL[actor.role]}
          </span>
        </div>
      </div>
      <nav aria-label="Sections des paramètres" className="flex gap-1 overflow-x-auto border-b">
        {SETTINGS_TABS.map((t) => {
          const active = path === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              search={(s: FilterContext) => s}
              aria-current={active ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
