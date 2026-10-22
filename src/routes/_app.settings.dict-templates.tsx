import { createFileRoute } from "@tanstack/react-router";
import { DictTemplatesPanel } from "@/features/settings/dict-templates/DictTemplatesPanel";
export const Route = createFileRoute("/_app/settings/dict-templates")({
  component: DictTemplatesPanel,
  head: () => ({ meta: [
    { title: "Modèles du dictionnaire — BC4" },
    { name: "description", content: "Gestion des modèles du dictionnaire RRC BC4." },
    { property: "og:title", content: "Modèles du dictionnaire — BC4" },
    { property: "og:description", content: "Gestion des modèles du dictionnaire RRC BC4." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});
