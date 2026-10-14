import { createFileRoute } from "@tanstack/react-router";
import { ModulePending } from "@/components/bc4/AppShell";

export const Route = createFileRoute("/_app/rrc")({
  head: () => ({ meta: [
    { title: "Dictionnaire RRC — BC4" }, { name: "description", content: "Arbre ASN.1 LTE/NR et inspection des paramètres RRC." },
    { property: "og:title", content: "Dictionnaire RRC — BC4" }, { property: "og:description", content: "Arbre ASN.1 LTE/NR et inspection des paramètres RRC." },
  ] }),
  component: () => <ModulePending title="Dictionnaire RRC" phase="U6" />,
});
