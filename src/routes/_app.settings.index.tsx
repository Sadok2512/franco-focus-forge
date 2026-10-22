import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/")({
  head: () => ({ meta: [
    { title: "Paramètres — BC4" },
    { name: "description", content: "Administration et préférences BC4." },
    { property: "og:title", content: "Paramètres — BC4" },
    { property: "og:description", content: "Administration et préférences BC4." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/settings/users", search });
  },
});
