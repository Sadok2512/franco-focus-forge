// Signaling v2 isolated preview + API adapter.
// Pin GitHub 75061ccbc4cb38c036f5d03ab08ccd5f89b60474.
//
//   /signaling-v2            → mode "mock" (fixtures GitHub)
//   /signaling-v2?mode=api   → mode "api" (BC4 /projects/{active}/signaling/*
//                                          via signaling-v2-adapter.ts)
//
// La route /signaling (BC2+BC3) reste intacte. Prod inchangée.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SignalingPage } from "@/features/signaling-v2/SignalingPage";
import {
  setSignalingV2Mode,
  setSignalingV2Project,
  type SignalingV2Mode,
} from "@/lib/api/signaling-v2";
import { useActiveProject } from "@/lib/activeProject";

export const Route = createFileRoute("/_app/signaling-v2")({
  validateSearch: (s: Record<string, unknown>): { mode: SignalingV2Mode } => ({
    mode: s["mode"] === "api" ? "api" : "mock",
  }),
  component: Page,
  head: () => ({
    meta: [
      { title: "Signaling View v2 — BC4 (GitHub exact preview)" },
      { name: "description", content: "Preview isolée du design GitHub 75061cc + adaptateur BC4 optionnel." },
    ],
  }),
});

function Page() {
  const search = Route.useSearch();
  const { activeProject } = useActiveProject();
  const mode: SignalingV2Mode = search.mode;
  useEffect(() => {
    setSignalingV2Mode(mode);
    setSignalingV2Project(mode === "api" ? (activeProject?.id ?? null) : null);
    return () => {
      setSignalingV2Project(null);
    };
  }, [mode, activeProject?.id]);
  if (mode === "api" && !activeProject) {
    return (
      <main className="p-8">
        <h1 className="text-xl font-semibold">Signaling v2 — mode API</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Aucun projet actif. Ouvrir un projet dans la liste des Projects puis
          revenir ici.
        </p>
      </main>
    );
  }
  return <SignalingPage />;
}
