import { createFileRoute } from "@tanstack/react-router";
import { useActiveProject } from "@/lib/activeProject";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import { SignalingPage } from "@/features/signaling/SignalingPage";

export const Route = createFileRoute("/_app/signaling-v2")({
  validateSearch: (s: Record<string, unknown>) => ({
    capture_id: typeof s["capture_id"] === "string" ? s["capture_id"] : undefined,
    seq: Number.isInteger(Number(s["seq"])) && Number(s["seq"]) >= 0 ? Number(s["seq"]) : undefined,
  }),
  component: Page,
  head: () => ({ meta: [
    { title: "Signaling V2 — UE & RRC State | BC4" },
    { name: "description", content: "BC4 Signaling V2 : états UE et RRC prouvés, navigateur temporel et mesures radio synchronisées." },
    { property: "og:title", content: "Signaling V2 — UE & RRC State | BC4" },
    { property: "og:description", content: "Investigation des captures BC4 avec états prouvés et fenêtres temporelles de 30 secondes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});
function Page() {
  const { activeProject } = useActiveProject();
  const search = Route.useSearch();
  return activeProject ? <SignalingPage key={activeProject.id} projectId={activeProject.id}
    initialCapture={search.capture_id} initialSeq={search.seq} stateTracksV2 /> : <NoActiveProject scope="Signaling V2" />;
}