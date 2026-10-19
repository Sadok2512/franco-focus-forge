// bc4-front — Volet "Infos" sous les graphes : fiche d'un paramètre.
// Source : /projects/{id}/dict/v2/param/{param_key}. On ne devine rien ;
// si le back ne renvoie pas une info (unit optionnel, kpi_hint absent),
// on affiche "—".

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getDictV2Param as getDictParam } from "@/lib/api/client";
import { originLabel } from "./types";

export function InfoDrawer({
  projectId,
  paramKey,
}: {
  projectId: string;
  paramKey: string | null;
}) {
  const q = useQuery({
    queryKey: ["dict-v2", "param", projectId, paramKey],
    queryFn: ({ signal }) => getDictParam(projectId, paramKey!, signal),
    enabled: !!paramKey,
  });

  if (!paramKey) {
    return (
      <aside className="panel p-4 text-xs text-muted-foreground" data-testid="dict-info-empty">
        Sélectionnez un paramètre dans l'arbre pour afficher sa fiche.
      </aside>
    );
  }

  if (q.isLoading) {
    return (
      <aside className="panel p-4 text-xs text-muted-foreground" data-testid="dict-info-loading">
        Chargement de la fiche…
      </aside>
    );
  }

  if (q.error) {
    const msg =
      q.error && typeof q.error === "object" && "message" in q.error
        ? String((q.error as { message?: unknown }).message ?? "Erreur fiche paramètre")
        : "Erreur fiche paramètre";
    return (
      <aside className="panel p-4 text-xs text-sev-bad" data-testid="dict-info-error">
        {msg}
      </aside>
    );
  }

  const p = q.data!;
  const isReport = p.origin === "ue_report";
  const discExample = p.discriminators_examples[0];

  return (
    <aside className="panel grid gap-2 p-4" data-testid="dict-info">
      <h3 className="text-sm font-semibold">Infos — {p.display_name}</h3>
      <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
        <dt className="text-muted-foreground">Clé canonique</dt>
        <dd className="min-w-0 overflow-wrap-anywhere">
          <code className="font-mono text-[11px]">{p.param_key}</code>
        </dd>
        {p.choice_of && (
          <>
            <dt className="text-muted-foreground">CHOICE</dt>
            <dd>
              paramètre nommé par <code className="font-mono">{p.choice_of}</code>, valeur =
              alternative choisie
            </dd>
          </>
        )}
        {discExample && Object.keys(discExample).length > 0 && (
          <>
            <dt className="text-muted-foreground">Contexte</dt>
            <dd className="min-w-0 overflow-wrap-anywhere">
              {Object.entries(discExample)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(" · ")}{" "}
              (lu dans le chemin)
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Unité</dt>
        <dd>{p.unit ?? "—"}</dd>
        <dt className="text-muted-foreground">Origine</dt>
        <dd>{originLabel(p.origin)}</dd>
        <dt className="text-muted-foreground">Messages porteurs</dt>
        <dd>
          {p.carrying_messages.length
            ? p.carrying_messages
                .map(
                  (m) => `${(m as { message?: string }).message} (${(m as { n?: number }).n ?? 0})`,
                )
                .join(", ")
            : "—"}
        </dd>
        <dt className="text-muted-foreground">N total</dt>
        <dd className="num">{p.n_total}</dd>
        <dt className="text-muted-foreground">Source</dt>
        <dd className="min-w-0 overflow-wrap-anywhere text-[11px] text-muted-foreground">
          {p.source}
        </dd>
      </dl>
      {isReport && p.kpi_hint && (
        <div className="mt-1 rounded-md border bg-accent/10 p-2 text-xs">
          Mesure rapportée — voir dans{" "}
          <Link
            to="/kpi"
            search={{} as never}
            className="font-semibold text-primary hover:underline"
          >
            KPI
          </Link>{" "}
          <span className="font-mono text-[10.5px]">({p.kpi_hint})</span>
        </div>
      )}
      {p.sample_paths.length > 0 && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Chemins ASN.1 (échantillon)
          </summary>
          <ul className="mt-1 space-y-1 pl-4 font-mono text-[10.5px] text-muted-foreground">
            {p.sample_paths.map((s) => (
              <li key={s} className="overflow-wrap-anywhere">
                {s}
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
