import { createFileRoute } from "@tanstack/react-router";
import { ModulePending } from "@/components/bc4/AppShell";

export const Route = createFileRoute("/_app/assistant")({
  head: () => ({ meta: [
    { title: "Assistant IA — BC4" }, { name: "description", content: "Assistant d'analyse radio étayé par les preuves (démo)." },
    { property: "og:title", content: "Assistant IA — BC4" }, { property: "og:description", content: "Assistant d'analyse radio étayé par les preuves (démo)." },
  ] }),
  component: () => <ModulePending title="Assistant IA" phase="U8" />,
});
