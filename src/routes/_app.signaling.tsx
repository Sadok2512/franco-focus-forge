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
  head: () => ({ meta: [{ title: "Signaling View — BC4" }] }),
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
    />
  ) : (
    <NoActiveProject scope="Signaling View" />
  );
}
