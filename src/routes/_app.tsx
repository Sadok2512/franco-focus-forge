import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/bc4/AppShell";
import { getSession } from "@/lib/auth";
import { validateFilters } from "@/lib/filters";

export const Route = createFileRoute("/_app")({
  ssr: false,
  validateSearch: validateFilters,
  beforeLoad: ({ location }) => {
    const session = getSession();
    if (!session) throw redirect({ to: "/login" });
    if (session.mustChangePassword && location.pathname !== "/change-password") {
      throw redirect({ to: "/change-password" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
