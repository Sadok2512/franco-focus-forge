import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/signaling")({
  beforeLoad: () => {
    throw redirect({ to: "/kpi", search: {}, replace: true } as never);
  },
});
