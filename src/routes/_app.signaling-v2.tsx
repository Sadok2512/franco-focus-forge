// PHASE B — Signaling v2 isolated preview.
// Route de coexistence : /signaling-v2 charge l'UI GitHub exacte
// (pin 75061ccbc4cb38c036f5d03ab08ccd5f89b60474) en mode MOCK-ONLY.
// La route /signaling (BC2+BC3) reste intacte. Aucune API BC4 n'est
// appelée depuis cette route en Phase B.
import { createFileRoute } from "@tanstack/react-router";
import { SignalingPage } from "@/features/signaling-v2/SignalingPage";

export const Route = createFileRoute("/_app/signaling-v2")({
  component: SignalingPage,
  head: () => ({
    meta: [
      { title: "Signaling View v2 — BC4 (GitHub exact preview)" },
      { name: "description", content: "Preview isolée du design GitHub 75061cc, mode mock, Phase B." },
    ],
  }),
});
