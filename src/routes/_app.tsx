import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/bc4/AppShell";
import { getSession } from "@/lib/auth";
import { validateFilters } from "@/lib/filters";

export const Route = createFileRoute("/_app")({
  ssr: false,
  validateSearch: validateFilters,
  beforeLoad: () => {
    if (!getSession()) throw redirect({ to: "/login" });
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
