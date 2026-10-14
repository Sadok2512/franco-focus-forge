import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";

export const APP_VERSION = "v1.0.0";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [
    { title: "Paramètres — BC4" },
    { name: "description", content: "Paramètres du compte et informations de version de BC4." },
    { property: "og:title", content: "Paramètres — BC4" },
    { property: "og:description", content: "Paramètres du compte et informations de version de BC4." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function SettingsPage() {
  const s = getSession();
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <h1 className="text-xl font-semibold">Paramètres</h1>
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Compte</h2>
        <Row k="Nom" v={s?.displayName ?? "Jean Dupont"} />
        <Row k="Rôle" v="Ingénieur Radio" />
        <Row k="Identifiant" v={s?.user ?? "demo.ingenieur"} />
      </section>
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Application</h2>
        <Row k="Version" v={APP_VERSION} />
        <Row k="Langue" v="Français" />
      </section>
    </div>
  );
}
