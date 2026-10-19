import { catalogMetadata } from "./catalog-model";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { getDictV2Param } from "@/lib/api/client";
import type { DictLeaf, DictTreeResponse, DictDistributionResponse } from "@/lib/api/dict-v2";
import { selectionId } from "./parameter-identity";

const display = (value: unknown): string =>
  value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

export function SelectedParameterInfo({
  projectId,
  selected,
  catalog,
  distribution,
  refreshing,
  locallyFiltered,
}: {
  projectId: string;
  selected: DictLeaf[];
  catalog: DictTreeResponse | null;
  distribution: DictDistributionResponse | null;
  refreshing: boolean;
  locallyFiltered: boolean;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const keys = [
    ...new Set(selected.filter((leaf) => !leaf["mapping_error"]).map((leaf) => leaf.param_key)),
  ];
  const queries = useQueries({
    queries: keys.map((key) => ({
      queryKey: ["dict-v2", "param", projectId, key],
      queryFn: () => getDictV2Param(projectId, key),
      staleTime: 300000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const copy = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        const focused = document.activeElement;
        try {
          input.select();
          if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
        } finally {
          input.remove();
          if (focused instanceof HTMLElement) focused.focus();
        }
      }
      setNotice("Copié");
    } catch {
      setNotice("Copie indisponible. Sélectionnez le texte de la fiche pour le copier.");
    }
  };
  const visible = selected.filter((leaf) =>
    [leaf.display_name, leaf.param_key, leaf["technology"]]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="rrc-selected-info" aria-label="Informations des paramètres sélectionnés">
      <header>
        <h2>Infos — Paramètres sélectionnés ({selected.length})</h2>
      </header>
      {selected.length ? (
        <>
          <div className="rrc-info-tools">
            <button className="rrc-control" onClick={() => setClosed(new Set())}>
              Tout développer
            </button>
            <button
              className="rrc-control"
              onClick={() => setClosed(new Set(selected.map(selectionId)))}
            >
              Tout réduire
            </button>
            {selected.length > 1 && (
              <input
                aria-label="Rechercher parmi les paramètres sélectionnés"
                placeholder="Rechercher un paramètre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </div>
          {notice && (
            <p role="status" className="p-2 text-xs">
              {notice}
            </p>
          )}
          {refreshing && (
            <p role="status" className="p-2 text-xs">
              Actualisation de la population appliquée…
            </p>
          )}
          <div className="rrc-info-cards">
            {visible.map((leaf) => {
              const id = selectionId(leaf),
                query = queries[keys.indexOf(leaf.param_key)],
                sheet = query?.data;
              const block = refreshing
                ? undefined
                : distribution?.blocks.find((b) => b.param_key === leaf.param_key);
              const technology = leaf["technology"];
              let family: string | null = null;
              for (const t of catalogMetadata(catalog)?.tree ?? [])
                for (const o of t.origins)
                  for (const m of o.messages)
                    for (const g of m.groups)
                      if (
                        t.techno === technology &&
                        m.message === leaf["message_id"] &&
                        g.kpis.some((k) => k.param_key === leaf.param_key)
                      )
                        family = g.name;
              const paths = sheet?.sample_paths?.length
                ? sheet.sample_paths
                : (leaf.sample_paths ?? []);
              const fields: Record<string, unknown> = {
                Technologie: technology,
                Famille: family,
                "Message porteur": leaf["message_id"],
                "Clé canonique": leaf.param_key,
                "Chemin ASN.1 complet": paths.length ? paths.join("\n") : null,
                "Type ASN.1": sheet?.["asn1_type"] ?? leaf["asn1_type"],
                Unité: sheet?.unit ?? leaf.unit,
                "Valeur dominante": block?.["dominant_value"],
                "Valeurs distinctes": block?.distinct_values,
                "Occurrences (filtres appliqués)": block?.n_total,
                "Règle de conversion 3GPP": sheet?.["conversion_rule"],
                "Source des métadonnées (projet)": sheet?.source,
                result_id: block?.result_id,
                Comparabilité: locallyFiltered ? null : block?.comparability,
              };
              return (
                <details key={id} data-testid="rrc-info-card" open={!closed.has(id)}>
                  <summary
                    onClick={(e) => {
                      e.preventDefault();
                      setClosed((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                  >
                    <span>{leaf.display_name}</span>
                    <small className="rrc-tech-badge" data-tech={display(technology)}>
                      {display(technology)}
                    </small>
                  </summary>
                  {query?.isPending ? (
                    <p role="status" className="p-3 text-xs">
                      Chargement des métadonnées…
                    </p>
                  ) : null}
                  {query?.isError ? (
                    <div role="alert" className="p-3 text-xs">
                      {query.error.message}{" "}
                      <button className="rrc-control" onClick={() => void query.refetch()}>
                        Réessayer
                      </button>
                    </div>
                  ) : null}
                  {leaf["mapping_error"] ? (
                    <p role="status" className="p-3 text-xs">
                      {display(leaf["mapping_error"])}
                    </p>
                  ) : null}
                  <dl>
                    {Object.entries(fields)
                      .filter(
                        ([label]) =>
                          more.has(id) ||
                          [
                            "Famille",
                            "Message porteur",
                            "Unité",
                            "Valeurs distinctes",
                            "Occurrences (filtres appliqués)",
                            "result_id",
                          ].includes(label),
                      )
                      .map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{display(value)}</dd>
                        </div>
                      ))}
                  </dl>
                  <div className="rrc-info-tools">
                    <button
                      className="rrc-control"
                      aria-expanded={more.has(id)}
                      onClick={() =>
                        setMore((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                    >
                      {more.has(id) ? "Voir moins" : "Voir plus"}
                    </button>
                    <button
                      className="rrc-control"
                      disabled={!paths.length}
                      onClick={() => void copy(paths.join("\n"))}
                    >
                      Copier le chemin ASN.1
                    </button>
                    <button
                      className="rrc-control"
                      onClick={() =>
                        void copy(
                          [
                            leaf.display_name,
                            ...Object.entries(fields).map(([k, v]) => k + ": " + display(v)),
                          ].join("\n"),
                        )
                      }
                    >
                      Copier les informations techniques
                    </button>
                  </div>
                </details>
              );
            })}
            {!visible.length && (
              <p className="p-3 text-xs">
                Aucun paramètre sélectionné ne correspond à la recherche.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="p-3 text-xs text-muted-foreground">
          Sélectionnez un paramètre dans l’arbre pour afficher ses informations.
        </p>
      )}
    </section>
  );
}
