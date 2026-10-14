import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { getProjects } from "@/lib/api/client";
import type { Project } from "@/lib/api/schemas";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/bc4/States";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({
    meta: [
      { title: "Projets — BC4" },
      { name: "description", content: "Campagnes de mesure radio importées dans BC4." },
      { property: "og:title", content: "Projets — BC4" },
      { property: "og:description", content: "Campagnes de mesure radio importées dans BC4." },
    ],
  }),
  component: ProjectsPage,
});

const STATUS: Record<Project["status"], { l: string; c: string }> = {
  ready: { l: "Prêt", c: "bg-sev-good/15 text-sev-good" },
  processing: { l: "En traitement", c: "bg-warning text-warning-foreground" },
  failed: { l: "Échec", c: "bg-destructive/15 text-destructive" },
};
type SortKey = "name" | "captures" | "importedAt" | "periodStart";

function ProjectsPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["projects"], queryFn: ({ signal }) => getProjects(signal) });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "importedAt", dir: -1 });

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (q.data ?? [])
      .filter((p) => !s || `${p.name} ${p.geography}`.toLowerCase().includes(s))
      .sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : -1) * sort.dir);
  }, [q.data, search, sort]);

  const th = (k: SortKey, l: string, right = false) => (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`} aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} className="inline-flex items-center gap-1 hover:text-foreground">
        {l} <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projets</h1>
          <p className="text-xs text-muted-foreground">Un projet = une campagne de mesure importée.</p>
        </div>
        <div className="flex gap-2">
          <label className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un projet…" aria-label="Rechercher un projet"
              className="h-8 w-64 rounded-md border bg-card pl-7 pr-2 text-xs" />
          </label>
          <button disabled title="Assistant d'import prévu en phase U2b" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground opacity-50">Nouveau projet</button>
        </div>
      </div>
      <div className="panel overflow-x-auto">
        {q.isPending ? <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <LoadingSkeleton key={i} className="h-8" />)}</div>
          : q.isError ? <ErrorState message="Impossible de charger les projets." onRetry={() => q.refetch()} />
          : !rows.length ? <EmptyState title="Aucun projet">Aucun projet ne correspond à la recherche.</EmptyState>
          : (
          <table className="w-full min-w-[960px] text-xs">
            <thead className="sticky top-0 border-b bg-muted text-muted-foreground">
              <tr>{th("name", "Nom")}<th className="px-3 py-2 text-left font-medium">Géographie</th><th className="px-3 py-2 text-left font-medium">Opérateurs</th>
                <th className="px-3 py-2 text-left font-medium">Technos</th>{th("periodStart", "Période")}{th("captures", "Captures", true)}{th("importedAt", "Import")}<th className="px-3 py-2 text-left font-medium">Statut</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && p.status === "ready" && navigate({ to: "/overview", search: { project: p.id } })}
                  onClick={() => p.status === "ready" && navigate({ to: "/overview", search: { project: p.id } })}
                  className={`border-b last:border-0 ${p.status === "ready" ? "cursor-pointer hover:bg-muted/60" : "opacity-70"}`}>
                  <td className="px-3 py-2.5 font-medium">{p.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.geography}</td>
                  <td className="px-3 py-2.5">{p.operators.join(", ")}</td>
                  <td className="px-3 py-2.5 font-mono">{p.technologies.join(" · ")}</td>
                  <td className="num px-3 py-2.5 font-mono">{p.periodStart} → {p.periodEnd}</td>
                  <td className="num px-3 py-2.5 text-right font-mono">{p.captures.toLocaleString("fr-FR")}</td>
                  <td className="num px-3 py-2.5 font-mono">{p.importedAt}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${STATUS[p.status].c}`}>{STATUS[p.status].l}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
