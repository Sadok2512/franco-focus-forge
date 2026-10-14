import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import type { DictFilters } from "@/lib/api/client";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { dictQ, errMsg, fmtInt, fmtShare } from "./shared";

export function MessageParameterCards({ projectId, filters, msgId, msgName, selected, onSelect }: {
  projectId: string; filters: DictFilters; msgId: string; msgName: string; selected: string | null; onSelect: (paramId: string) => void;
}) {
  const q = useQuery(dictQ.params(projectId, msgId, filters));
  const [s, setS] = useState("");
  const needle = s.trim().toLowerCase();

  if (q.isPending) return <div className="grid gap-2 p-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <LoadingSkeleton key={i} className="h-24" />)}</div>;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const params = q.data.params.filter((p) => !needle || p.leaf.toLowerCase().includes(needle) || p.path.toLowerCase().includes(needle) || String(p.dominant.value ?? "").toLowerCase().includes(needle));
  const groups = new Map<string, typeof params>();
  for (const p of params) {
    const parent = p.path.split(".").slice(0, -1).join(".");
    groups.set(parent, [...(groups.get(parent) ?? []), p]);
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Paramètres de <span className="font-mono">{msgName}</span></h2>
        <label className="relative">
          <span className="sr-only">Filtrer les paramètres du message</span>
          <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <input value={s} onChange={(e) => setS(e.target.value)} placeholder="Filtrer…" className="h-6 w-40 rounded border border-input bg-card pl-7 pr-2 text-[11px]" />
        </label>
      </div>
      {!q.data.params.length && <EmptyState title="IE indisponibles">L'API n'a retourné aucun chemin ASN.1 pour ce message.</EmptyState>}
      {q.data.params.length > 0 && !params.length && <EmptyState title="Aucun paramètre ne correspond" />}
      {[...groups].map(([parent, ps]) => (
        <section key={parent} aria-label={`Sous-arbre ${parent}`}>
          <p className="mb-1 truncate font-mono text-[10px] text-muted-foreground" title={parent}>{parent.split(".").slice(-2).join(" › ") || "(racine)"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ps.map((p) => {
              const short = p.path.split(".");
              return (
                <button key={p.param_id} onClick={() => onSelect(p.param_id)} aria-pressed={selected === p.param_id}
                  className={`rounded-md border p-2.5 text-left transition-colors ${selected === p.param_id ? "border-primary bg-accent" : "bg-card hover:border-primary/50"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs font-semibold">{p.leaf}</span>
                    <span className="num shrink-0 font-mono text-[10px] text-muted-foreground">n = {fmtInt(p.n)}</span>
                  </div>
                  <p className="truncate font-mono text-[10px] text-muted-foreground" title={p.path}>…{short.slice(-3, -1).join(".")}</p>
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                    <dt className="text-muted-foreground">Dominante</dt>
                    <dd className="truncate font-mono">{p.dominant.value == null ? "N/D" : String(p.dominant.value)}{p.dominant.conversion && <span className="text-primary"> → {p.dominant.conversion}</span>}</dd>
                    <dt className="text-muted-foreground">Part</dt><dd className="num font-mono">{fmtShare(p.dominant.share)}</dd>
                    <dt className="text-muted-foreground">Distinctes</dt><dd className="num font-mono">{fmtInt(p.distinct)}</dd>
                  </dl>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
