import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { APP_VERSION } from "@/lib/version";
import {
  BarChart3,
  Bot,
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Map,
  Radio,
  Scale,
} from "lucide-react";
import { useState } from "react";
import tower from "@/assets/login-tower.jpg";
import { login } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Connexion — BC4 Benchmark Radio" },
      {
        name: "description",
        content: "Connectez-vous à BC4, la plateforme de benchmark radio multi-opérateurs.",
      },
      { property: "og:title", content: "Connexion — BC4 Benchmark Radio" },
      {
        property: "og:description",
        content: "Connectez-vous à BC4, la plateforme de benchmark radio multi-opérateurs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

const FEATURES = [
  { i: Scale, l: "Comparez les opérateurs" },
  { i: BarChart3, l: "Analysez les performances" },
  { i: Layers, l: "Explorez les paramètres RRC" },
  { i: Map, l: "Visualisez la couverture" },
  { i: Bot, l: "Appuyez-vous sur l'IA" },
];

function LoginPage() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(id, pw);
      navigate({ to: "/projects" });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-card lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-nav lg:block">
        <img
          src={tower}
          alt="Pylône d'antennes au coucher du soleil"
          width={1024}
          height={1280}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-nav/90 via-nav/50 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-12 text-nav-foreground">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Radio className="h-8 w-8" />
              </span>
              <span className="text-6xl font-extrabold tracking-tight">BC4</span>
            </div>
            <h1 className="mt-6 text-3xl font-bold leading-tight">
              Benchmark Radio
              <br />
              Multi-Opérateurs
            </h1>
            <p className="mt-4 text-lg leading-snug text-nav-foreground/90">
              Des mesures terrain
              <br />à une intelligence réseau.
            </p>
            <ul className="mt-10 space-y-4">
              {FEATURES.map(({ i: I, l }) => (
                <li key={l} className="flex items-center gap-3 text-[15px]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-nav-foreground/40">
                    <I className="h-4 w-4" />
                  </span>
                  {l}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[15px] leading-snug">
            Des réseaux plus performants
            <br />
            pour un monde plus connecté.
          </p>
        </div>
      </div>

      <div className="relative flex flex-col justify-center px-8 py-10 lg:px-20">
        <button className="absolute right-8 top-8 flex items-center gap-1 text-sm font-semibold">
          FR <ChevronDown className="h-4 w-4" />
        </button>
        <form onSubmit={submit} className="mx-auto w-full max-w-lg" noValidate>
          <h2 className="text-3xl font-bold tracking-tight">Bienvenue sur BC4</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Connectez-vous pour accéder à vos projets.
          </p>

          <label className="mt-8 block">
            <span className="text-sm font-semibold">Adresse e-mail</span>
            <input
              type="email"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="admin@bc4.local"
              autoComplete="email"
              required
              className="mt-2 h-11 w-full rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground"
            />
          </label>
          <label className="mt-5 block">
            <span className="text-sm font-semibold">Mot de passe</span>
            <div className="relative mt-2">
              <input
                type={show ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11 w-full rounded-md border border-input bg-card px-3 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute right-2 top-2 rounded p-1.5 text-muted-foreground hover:bg-muted"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          <div className="mt-4 flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />{" "}
              Se souvenir de moi
            </label>
            <button type="button" className="font-medium text-primary hover:underline">
              Mot de passe oublié ?
            </button>
          </div>
          {err && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {err}
            </p>
          )}
          <button
            disabled={busy}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Se connecter
          </button>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou prochainement
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            disabled
            className="flex h-11 w-full items-center justify-center gap-3 rounded-md border text-sm font-medium"
          >
            <span className="flex h-6 w-6 items-end justify-start bg-op-orange p-0.5 text-[6px] font-bold text-primary-foreground">
              orange
            </span>{" "}
            SSO Orange (à venir)
          </button>
          <p className="mt-6 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Les identifiants d&apos;administration sont provisionnés côté
            serveur via les variables d&apos;environnement
            <code className="mx-1 font-mono text-foreground">BC4_ADMIN_EMAIL</code> /
            <code className="mx-1 font-mono text-foreground">BC4_ADMIN_PASSWORD</code>
            (seed idempotent au démarrage de l&apos;API).
          </p>
        </form>
        <p className="absolute bottom-6 right-8 text-[11px] text-muted-foreground">
          BC4 v{APP_VERSION} | Usage interne uniquement
        </p>
      </div>
    </div>
  );
}
