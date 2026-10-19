import { createFileRoute } from "@tanstack/react-router";
import { DictTemplatesPanel } from "@/features/settings/dict-templates/DictTemplatesPanel";
export const Route = createFileRoute("/_app/settings/dict-templates")({
  component: DictTemplatesPanel,
});
