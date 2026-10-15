// Petits helpers partagés par les écrans "Projets" (B1-ingest). Garde les
// mêmes classes Tailwind que le reste de l'app pour ne pas introduire de
// nouveau système de style.
//
// 1.6.0 — expose aussi `OperatorChip` et `TechBadge`, utilisés par la
// liste projets (`_app.projects.tsx`) ET par l'accordéon détail
// (`ProjectRowDetails.tsx`). Le style reprend les classes `bg-op-*`
// déjà définies dans `styles.css` (couleurs opérateurs établies côté
// Vue d'ensemble, cf. `routes/_app.overview.tsx::OP_DOT`). On ne
// dérive **jamais** un libellé d'un PLMN brut : si la chip reçoit un
// PLMN, elle le rend comme texte neutre (slate) — c'est le site
// d'appel qui a préféré un fallback B0 non résolu plutôt que
// d'inventer.
import type { ReactNode } from "react";
import type { Operator } from "@/lib/api/schemas";

/** `null` → « N/D ». Pas de 0 par défaut, pas de pourcentage inventé. */
export const nd = (v: number | null | undefined, fractionDigits = 0): string =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("fr-FR", {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
      })
    : "N/D";

export const ndPct = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)} %` : "N/D";

export const fmtBytes = (n: number): string => {
  if (!Number.isFinite(n)) return "N/D";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Kio`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mio`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} Gio`;
};

export const errMsg = (e: unknown): string =>
  e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : "Erreur inconnue";

/** 1.5.1 — rendu « clés jointes par · » d'un dict `{string: count}` reçu
 *  du back (opérateurs PLMN ou technos). Les clés sont triées par count
 *  décroissant pour que le libellé le plus représenté arrive en premier.
 *  Dict vide ou `null`/`undefined` → « N/D » (règle dure « jamais 0 »). */
export const joinByCount = (d: Record<string, number> | null | undefined): string => {
  if (!d) return "N/D";
  const entries = Object.entries(d);
  if (entries.length === 0) return "N/D";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .join(" · ");
};

/** 1.5.1 — tri utilitaire : utilisé par `ProjectRowDetails` pour afficher
 *  les badges `techno: count` dans l'ordre décroissant. */
export const sortByCountDesc = (
  d: Record<string, number> | null | undefined,
): Array<[string, number]> => (d ? Object.entries(d).sort((a, b) => b[1] - a[1]) : []);

/** 1.6.0 — Déduit la LISTE des libellés opérateurs à afficher pour un
 *  projet. Préfère les champs B0 (`project.operators`, enum fermé portant
 *  déjà les libellés Orange/SFR/Bouygues/Free), et retombe sur les clés
 *  de `operators_plmn` (B1-ingest) si et seulement si B0 est vide. Les
 *  clés PLMN sont NON MAPPÉES — on n'invente jamais un libellé. Retourne
 *  `[]` quand les deux sources sont vides → la UI affiche « N/D ». */
export function selectOperatorLabels(p: {
  operators?: readonly string[] | null | undefined;
  operators_plmn?: Record<string, number> | null | undefined;
}): string[] {
  const b0 = (p.operators ?? []).filter((x) => typeof x === "string" && x.length > 0);
  if (b0.length > 0) return [...b0];
  const dict = p.operators_plmn ?? null;
  if (!dict) return [];
  return Object.entries(dict)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/** 1.6.0 — Même règle pour les technos : B0 d'abord (`LTE`/`NR`/`EN-DC`),
 *  fallback sur les clés `technos_seen` triées par count décroissant.
 *  Garantie : on expose la clé telle quelle, sans traduction (un `UMTS`
 *  renvoyé par le back est affiché « UMTS »). */
export function selectTechLabels(p: {
  technologies?: readonly string[] | null | undefined;
  technos_seen?: Record<string, number> | null | undefined;
}): string[] {
  const b0 = (p.technologies ?? []).filter((x) => typeof x === "string" && x.length > 0);
  if (b0.length > 0) return [...b0];
  const dict = p.technos_seen ?? null;
  if (!dict) return [];
  return Object.entries(dict)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/** 1.6.0 — Couleurs opérateurs : alignées avec `styles.css` (`--op-*`)
 *  et avec le `OP_DOT` de la Vue d'ensemble (`bg-op-orange`, etc.).
 *  Un libellé inconnu (ex. PLMN brut `20801`, ou un nouvel opérateur
 *  non reconnu) tombe sur une pastille `slate` neutre — règle dure
 *  « jamais inventer une couleur ». */
const OP_CHIP_CLS: Record<Operator, string> = {
  Orange: "bg-op-orange text-white",
  SFR: "bg-op-sfr text-white",
  Bouygues: "bg-op-bouygues text-white",
  Free: "bg-op-free text-white",
};
const KNOWN_OPS = new Set<string>(["Orange", "SFR", "Bouygues", "Free"]);

/** Pastille colorée pour un opérateur. Le libellé est rendu TEL QUEL : si
 *  l'appelant passe un PLMN brut (`20801`), on affiche `20801` en neutre
 *  — on ne devine jamais la couleur ni le libellé. */
export function OperatorChip({ label }: { label: string }) {
  const known = KNOWN_OPS.has(label);
  const cls = known
    ? OP_CHIP_CLS[label as Operator]
    : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100";
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold ${cls}`}
      title={known ? label : `${label} (libellé non résolu)`}
    >
      {label}
    </span>
  );
}

/** Badge sobre pour une techno radio. Styles différenciés par techno —
 *  si le back renvoie une techno hors enum historique (ex. `UMTS`), on
 *  rend un badge neutre, pas d'invention. */
const TECH_CLS: Record<string, string> = {
  LTE: "border-primary/60 bg-primary/10 text-primary",
  NR: "border-op-bouygues/60 bg-op-bouygues/10 text-op-bouygues",
  "EN-DC": "border-op-orange/60 bg-op-orange/10 text-op-orange",
  UMTS: "border-muted-foreground/40 bg-muted text-muted-foreground",
  GSM: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

export function TechBadge({ label }: { label: string }) {
  const cls = TECH_CLS[label] ?? "border-muted-foreground/30 bg-muted text-foreground";
  return (
    <span
      className={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border bg-card p-4 shadow-sm ${className}`}>
      {title && <h3 className="mb-3 text-sm font-semibold">{title}</h3>}
      {children}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="max-w-2xl text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
