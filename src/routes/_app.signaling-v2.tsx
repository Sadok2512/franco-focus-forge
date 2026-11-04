import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/signaling-v2")({
  beforeLoad: () => {
    throw redirect({ to: "/kpi", search: {}, replace: true } as never);
  },
});
