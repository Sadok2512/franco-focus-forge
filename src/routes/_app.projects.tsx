import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { getProjects } from "@/lib/api/client";
import { OPERATORS, TECHNOLOGIES, type Project } from "@/lib/api/schemas";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { OpBadge, TechPill } from "@/components/bc4/AppShell";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({
    meta: [
      { title: "Mes projets — BC4" },
      {
        name: "description",
        content: "Gérez vos campagnes de mesures radio et accédez à vos analyses.",
      },
      { property: "og:title", content: "Mes projets — BC4" },
      {
        property: "og:description",
        content: "Gérez vos campagnes de mesures radio et accédez à vos analyses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectsPage,
});

const STATUS: Record<Project["status"], { l: string; c: string; i: typeof Clock }> = {
  ready: { l: "Prêt", c: "text-sev-good", i: CheckCircle2 },
  processing: { l: "Traitement", c: "border border-primary text-primary", i: Clock },
  failed: { l: "Échec", c: "text-destructive", i: XCircle },
};
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const fmtCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n);

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="relative mt-0.5">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-48 appearance-none rounded-md border border-input bg-card px-3 text-sm"
        >
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      </div>
    </label>
  );
}

function ProjectsPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["projects"], queryFn: ({ signal }) => getProjects(signal) });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [op, setOp] = useState("");
  const [tech, setTech] = useState("");

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (q.data ?? []).filter(
      (p) =>
        (!s || `${p.name} ${p.geography}`.toLowerCase().includes(s)) &&
        (!status || p.status === status) &&
        (!op || p.operators.includes(op as never)) &&
        (!tech || p.technologies.includes(tech as never)),
    );
  }, [q.data, search, status, op, tech]);

  const open = (p: Project) => navigate({ to: "/overview", search: { project: p.id } });

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <div className="panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mes projets</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gérez vos campagnes de mesures et accédez à vos analyses.
            </p>
          </div>
          <button className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau projet
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un projet…"
              aria-label="Rechercher un projet"
              className="h-9 w-72 rounded-md border border-input bg-card pl-9 pr-3 text-sm"
            />
          </label>
          <Select
            label="Statut"
            value={status}
            onChange={setStatus}
            options={[
              { v: "", l: "Tous" },
              { v: "ready", l: "Prêt" },
              { v: "processing", l: "Traitement" },
              { v: "failed", l: "Échec" },
            ]}
          />
          <Select
            label="Opérateur"
            value={op}
            onChange={setOp}
            options={[{ v: "", l: "Tous" }, ...OPERATORS.map((o) => ({ v: o, l: o }))]}
          />
          <Select
            label="Technologie"
            value={tech}
            onChange={setTech}
            options={[{ v: "", l: "Tous" }, ...TECHNOLOGIES.map((o) => ({ v: o, l: o }))]}
          />
        </div>

        <div className="mt-5 overflow-x-auto rounded-md border">
          {q.isPending ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-10" />
              ))}
            </div>
          ) : q.isError ? (
            <ErrorState message="Impossible de charger les projets." onRetry={() => q.refetch()} />
          ) : !rows.length ? (
            <EmptyState title="Aucun projet">Aucun projet ne correspond aux critères.</EmptyState>
          ) : (
            <table className="w-full min-w-[1000px] text-[13px]">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  {[
                    "Nom du projet",
                    "Périmètre",
                    "Opérateurs",
                    "Technologies",
                    "Période",
                    "Captures",
                    "Statut",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const S = STATUS[p.status];
                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/50">
                      <td className="px-4 py-3 font-semibold">{p.name}</td>
                      <td className="max-w-48 px-4 py-3 text-xs text-muted-foreground">
                        {p.geography}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.operators.map((o) => (
                            <OpBadge key={o} op={o} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {p.technologies
                            .filter((t) => t !== "EN-DC")
                            .map((t) => (
                              <TechPill key={t} t={t} />
                            ))}
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-xs leading-tight text-muted-foreground">
                        {fmtDate(p.periodStart)}
                        <br />
                        {fmtDate(p.periodEnd)}
                      </td>
                      <td className="num px-4 py-3">{fmtCount(p.captures)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${S.c}`}
                        >
                          <S.i className="h-3.5 w-3.5" />
                          {S.l}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => open(p)}
                            className="flex h-8 items-center gap-1.5 rounded-md border border-primary px-3 text-xs font-semibold text-primary hover:bg-accent"
                          >
                            <FolderOpen className="h-3.5 w-3.5" /> Ouvrir
                          </button>
                          <button
                            aria-label="Plus d'actions"
                            className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Affichage de 1 à {rows.length} sur {rows.length} projets
          </span>
          <div className="flex items-center gap-1">
            <button aria-label="Page précédente" className="p-1.5">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              1
            </span>
            <button aria-label="Page suivante" className="p-1.5">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
