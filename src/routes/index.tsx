import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: getSession() ? "/projects" : "/login" });
  },
  head: () => ({
    meta: [
      { title: "BC4 — Benchmark radio LTE/NR" },
      { name: "description", content: "Plateforme de benchmark radio LTE, NR et EN-DC multi-opérateurs." },
      { property: "og:title", content: "BC4 — Benchmark radio LTE/NR" },
      { property: "og:description", content: "Plateforme de benchmark radio LTE, NR et EN-DC multi-opérateurs." },
    ],
  }),
});
