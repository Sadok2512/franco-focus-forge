import { createFileRoute } from "@tanstack/react-router";
import { SignalingPage } from "@/features/signaling/SignalingPage";

export const Route = createFileRoute("/_app/signaling")({
  head: () => ({
    meta: [
      { title: "Signaling View — BC4" },
      {
        name: "description",
        content:
          "Timeline RF et signalisation LTE/NR : connectivité, événements réseau, tâches data, appels VoLTE/VoNR, mobilité, mesures radio, carte GPS et payload décodé.",
      },
      { property: "og:title", content: "Signaling View — BC4" },
      {
        property: "og:description",
        content: "Timeline RF et signalisation LTE/NR synchronisée avec la carte GPS et le tableau des messages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignalingPage,
});
