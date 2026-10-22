import { createFileRoute } from "@tanstack/react-router";
import { useActiveProject } from "@/lib/activeProject";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import { SignalingPage } from "@/features/signaling/SignalingPage";
export const Route = createFileRoute("/_app/signaling")({
  validateSearch: (s: Record<string, unknown>) => ({
    capture_id: typeof s["capture_id"] === "string" ? s["capture_id"] : undefined,
    seq: Number.isInteger(Number(s["seq"])) && Number(s["seq"]) >= 0 ? Number(s["seq"]) : undefined,
  }),
  component: Page,
  head: () => ({
    meta: [
      { title: "Signaling View — BC4" },
      {
        name: "description",
        content:
          "Analyse des événements LTE/NR, messages décodés et mesures radio synchronisés dans BC4.",
      },
      { property: "og:title", content: "Signaling View — BC4" },
      {
        property: "og:description",
        content:
          "Investigation temporelle des événements, messages et mesures radio de vos captures.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
function Page() {
  const { activeProject } = useActiveProject();
  const search = Route.useSearch();
  return activeProject ? (
    <SignalingPage
      key={activeProject.id}
      projectId={activeProject.id}
      initialCapture={search.capture_id}
      initialSeq={search.seq}
      stateTracksV2
    />
  ) : (
    <NoActiveProject scope="Signaling View" />
  );
}
