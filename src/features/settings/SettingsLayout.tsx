import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { setDemoRole } from "@/lib/auth";
import type { FilterContext } from "@/lib/api/schemas";
import { ROLE_LABEL, RoleSchema, type Role } from "@/lib/api/settings-schemas";
import { inputCls, useActor } from "./shared";

export const SETTINGS_TABS = [
  { to: "/settings/users", label: "Utilisateurs" },
  { to: "/settings/geography", label: "Géographie" },
  { to: "/settings/cellular-reference", label: "Référence cellulaire" },
  { to: "/settings/kpi-catalog", label: "Catalogue KPI" },
  { to: "/settings/ai", label: "Configuration IA" },
  { to: "/settings/appearance", label: "Apparence" },
  { to: "/settings/organization", label: "Organisation" },
  { to: "/settings/about", label: "À propos & Version" },
] as const;

export function SettingsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const actor = useActor();
  const qc = useQueryClient();
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Paramètres</h1>
          <p className="text-xs text-muted-foreground">
            Administration de BC4 — données de démonstration, API mockée.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Rôle simulé (démo)</span>
          <select
            className={`${inputCls} w-40`}
            value={actor.role}
            onChange={(e) => {
              setDemoRole(e.target.value as Role);
              window.dispatchEvent(new Event("bc4-role"));
              qc.invalidateQueries({ queryKey: ["settings"] });
            }}
          >
            {RoleSchema.options.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
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
