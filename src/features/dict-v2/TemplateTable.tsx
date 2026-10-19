import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDictTemplateSummary } from "@/lib/api/client";
import type { TemplateCategory } from "@/lib/api/dict-templates";
import type { GroupByMode } from "@/lib/api/dict-v2";
import { OperatorChip } from "@/features/projects/shared";

export function TemplateTable({
  projectId,
  category,
  onGraph,
  technology,
}: {
  technology: string;
  projectId: string;
  category: TemplateCategory;
  onGraph: (key: string, technology: string) => void;
}) {
  const [groupBy, setGroupBy] = useState<GroupByMode>("operator");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["dict-v2", "template-summary", projectId, category.id, category.revision, groupBy],
    queryFn: () => getDictTemplateSummary(projectId, category.id, groupBy),
    staleTime: 60000,
  });
  const population = useMemo(
    () =>
      (query.data?.rows ?? []).filter(
        (row) => technology === "LTE+NR" || row.technology === technology,
      ),
    [query.data, technology],
  );
  const columns = useMemo(
    () => [
      ...new Map(
        population.flatMap((row) =>
          row.cells.map((cell) => [JSON.stringify([cell.operator, cell.band]), cell] as const),
        ),
      ).entries(),
    ],
    [population],
  );
  const rows =
    population.filter((row) =>
      `${row.label} ${row.param_key ?? ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    ) ?? [];
  return (
    <section className="rounded-lg border bg-card shadow-sm" aria-label="Tableau du template">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div>
          <h2 className="text-sm font-semibold">{category.label} — valeurs dominantes</h2>
          <p className="text-xs text-muted-foreground">
            Population complète du projet · part des détections · comparaison par valeur
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Rechercher dans le template"
            placeholder="Rechercher un paramètre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border bg-background px-2 text-xs"
          />
          <select
            aria-label="Comparaison du template"
            className="rounded border bg-background p-2 text-xs"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
          >
            <option value="operator">Opérateur</option>
            <option value="band">Bande</option>
            <option value="operator_band">Les deux</option>
          </select>
        </div>
      </header>
      {query.isPending ? (
        <p role="status" className="p-4 text-sm">
          Chargement des valeurs…
        </p>
      ) : query.isError ? (
        <p role="alert" className="p-4 text-sm">
          Impossible de charger ce template.{" "}
          <button className="text-primary underline" onClick={() => query.refetch()}>
            Réessayer
          </button>
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="p-3 text-left">Paramètre</th>
                {columns.map(([id, cell]) => (
                  <th key={id} className="p-3 text-right whitespace-nowrap">
                    {groupBy !== "band" && <OperatorChip label={cell.operator ?? "N/D"} />}{" "}
                    {groupBy !== "operator" && (cell.band ?? "N/D")}
                  </th>
                ))}
                {!columns.length && <th className="p-3">Valeurs</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={JSON.stringify([
                    row.entry_id,
                    row.param_key,
                    row.technology,
                    row.discriminators,
                    index,
                  ])}
                  className="border-t hover:bg-muted/30"
                  data-result-id={row.result_id}
                >
                  <th
                    className="p-3 text-left font-medium"
                    title={row.param_key ?? row.reason ?? ""}
                  >
                    <span className="mr-2 text-[10px] text-muted-foreground">{row.technology}</span>
                    {row.label}
                    <span className="ml-2 text-muted-foreground">
                      {Object.values(row.discriminators).join(" · ")}
                    </span>
                  </th>
                  {columns.map(([id, column]) => {
                    const cell = row.cells.find(
                      (c) => c.operator === column.operator && c.band === column.band,
                    );
                    const tooltip = row.distribution
                      .flatMap((v) =>
                        v.groups
                          .filter((g) => g.operator === column.operator && g.band === column.band)
                          .map((g) => `${v.value_display ?? "N/D"} : ${g.n}`),
                      )
                      .join("\n");
                    return (
                      <td
                        key={id}
                        className={`p-3 text-right font-mono tabular-nums ${cell?.differs_from_majority ? "bg-primary/10" : ""}`}
                      >
                        <button
                          disabled={!row.param_key || !cell}
                          onClick={() => row.param_key && onGraph(row.param_key, row.technology)}
                          title={tooltip || row.reason || "Aucune occurrence dans le projet"}
                          className="text-right disabled:text-muted-foreground"
                        >
                          {cell ? (
                            <>
                              {(cell.dominant_value === null
                                ? null
                                : (row.distribution.find((v) => v.value === cell.dominant_value)
                                    ?.value_display ?? cell.dominant_value)) ??
                                (cell.dominant_values.length > 1
                                  ? cell.dominant_values
                                      .map(
                                        (value) =>
                                          row.distribution.find((v) => v.value === value)
                                            ?.value_display ?? value,
                                      )
                                      .join(" / ")
                                  : "N/D")}{" "}
                              <span className="text-muted-foreground">
                                {cell.percentage === null
                                  ? "—"
                                  : `${cell.percentage.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}
                              </span>
                            </>
                          ) : row.resolved ? (
                            "0 occ."
                          ) : (
                            "N/D"
                          )}
                        </button>
                      </td>
                    );
                  })}
                  {!columns.length && (
                    <td className="p-3 text-right text-muted-foreground" title={row.reason ?? ""}>
                      {row.resolved ? "0 occ." : "N/D"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="p-4 text-sm text-muted-foreground">
              Aucun paramètre de template pour cette sélection.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
