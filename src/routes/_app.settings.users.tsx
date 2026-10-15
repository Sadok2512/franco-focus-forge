import { createFileRoute } from "@tanstack/react-router";
import { UsersPanel } from "@/features/settings/users/UsersPanel";

export const Route = createFileRoute("/_app/settings/users")({
  head: () => ({
    meta: [
      { title: "Utilisateurs — Paramètres BC4" },
      { name: "description", content: "Gestion des comptes, rôles et statuts BC4." },
      { property: "og:title", content: "Utilisateurs — Paramètres BC4" },
      { property: "og:description", content: "Gestion des comptes, rôles et statuts BC4." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPanel,
});
