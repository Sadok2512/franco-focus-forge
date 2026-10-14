import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Radio } from "lucide-react";
import { useState } from "react";
import mast from "@/assets/login-mast.jpg";
import { DEMO_USER, login } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Connexion — BC4" },
      { name: "description", content: "Connexion à la plateforme BC4 de benchmark radio." },
      { property: "og:title", content: "Connexion — BC4" },
      { property: "og:description", content: "Connexion à la plateforme BC4 de benchmark radio." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try { await login(id, pw); navigate({ to: "/projects" }); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-nav lg:block">
        <img src={mast} alt="Mât d'antennes radio de nuit" width={1024} height={1280} className="absolute inset-0 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-nav via-nav/40 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-nav-foreground">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-nav-muted">Radio Network Intelligence</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Benchmark LTE · NR · EN-DC</h1>
          <p className="mt-2 max-w-md text-sm text-nav-muted">De l'anomalie géographique au KPI, aux paramètres RRC et à l'analyse étayée par les preuves.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground"><Radio className="h-4 w-4" /></span> BC4
          </div>
          <div>
            <h2 className="text-xl font-semibold">Connexion</h2>
            <p className="text-xs text-muted-foreground">Accès réservé. Aucune inscription publique.</p>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Identifiant</span>
            <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required
              className="h-9 w-full rounded-md border bg-card px-3 text-sm" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Mot de passe</span>
            <div className="relative">
              <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required
                className="h-9 w-full rounded-md border bg-card px-3 pr-9 text-sm" />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute right-1 top-1 rounded p-1.5 text-muted-foreground hover:bg-muted">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          <button disabled={busy} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Se connecter
          </button>
          <button type="button" disabled title="Prévu — non disponible" className="h-9 w-full rounded-md border text-xs text-muted-foreground">SSO entreprise (bientôt)</button>
          <div className="rounded-md border border-dashed bg-muted p-2.5 text-[11px] text-muted-foreground">
            Authentification simulée (démo). Identifiant <code className="font-mono text-foreground">{DEMO_USER.id}</code> · mot de passe <code className="font-mono text-foreground">{DEMO_USER.password}</code>
          </div>
        </form>
      </div>
    </div>
  );
}
