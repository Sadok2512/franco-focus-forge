import { createFileRoute } from "@tanstack/react-router";
import { ProjectPage } from "@/features/projects/ProjectPage";

export const Route = createFileRoute("/_app/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Projet — BC4" },
      {
        name: "description",
        content: "Détail d'un projet BC4 : import de logs NMF et rapport d'import.",
      },
      { property: "og:title", content: "Projet — BC4" },
      {
        property: "og:description",
        content: "Détail d'un projet BC4 : import de logs NMF et rapport d'import.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectPageWrapper,
});

function ProjectPageWrapper() {
  const { projectId } = Route.useParams();
  return <ProjectPage projectId={projectId} />;
}
