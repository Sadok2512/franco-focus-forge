import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Copy, Search } from "lucide-react";
import { useState } from "react";
import { getRrcDictionary } from "@/lib/api/client";
import { OPERATORS } from "@/lib/api/schemas";
import type { RrcNode } from "@/lib/api/fixtures";
import { LoadingSkeleton } from "@/components/bc4/States";

export const Route = createFileRoute("/_app/rrc")({
  head: () => ({ meta: [
    { title: "Dictionnaire RRC — BC4" },
    { name: "description", content: "Explorez les messages et paramètres RRC LTE et NR, leur distribution et leurs valeurs par opérateur." },
    { property: "og:title", content: "Dictionnaire RRC — BC4" },
    { property: "og:description", content: "Explorez les messages et paramètres RRC LTE et NR, leur distribution et leurs valeurs par opérateur." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: RrcPage,
});

const BAR = ["bg-primary", "bg-op-bouygues", "bg-op-sfr", "bg-op-orange", "bg-op-free"];

function Tree({ nodes, depth, sel, onSel }: { nodes: RrcNode[]; depth: number; sel: string; onSel: (id: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ lte: true, "lte-ul": true, rrcreq: true, crit: true, r8: true, nr: true });
  return (
    <ul>
      {nodes.map((n) => {
        const isOpen = open[n.id];
        return (
          <li key={n.id}>
            <button onClick={() => (n.children ? setOpen((o) => ({ ...o, [n.id]: !o[n.id] })) : onSel(n.id))}
              style={{ paddingLeft: 8 + depth * 14 }}
              className={`flex w-full items-center gap-1 rounded py-1 pr-2 text-left text-xs ${sel === n.id ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted"} ${depth === 0 ? "font-semibold" : ""}`}>
              {n.children ? (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5 text-center text-muted-foreground">–</span>}
              {n.label}
            </button>
            {n.children && isOpen && <Tree nodes={n.children} depth={depth + 1} sel={sel} onSel={onSel} />}
          </li>
        );
      })}
    </ul>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[120px_1fr] gap-3 border-t py-3 text-xs"><span className="font-medium text-muted-foreground">{k}</span><span>{children}</span></div>;
}

function RrcPage() {
  const q = useQuery({ queryKey: ["rrc"], queryFn: ({ signal }) => getRrcDictionary(signal) });
  const [sel, setSel] = useState("establishmentCause");
  const [tab, setTab] = useState("Général");
  if (!q.data) return <div className="p-4"><LoadingSkeleton className="h-96" /></div>;
  const f = q.data.field;
  const fr = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[260px_1fr_1fr]">
      <aside className="panel p-3">
        <label className="relative block">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input placeholder="Rechercher un message ou un paramètre…" className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-2 text-xs" />
        </label>
        <div className="mt-3"><Tree nodes={q.data.tree} depth={0} sel={sel} onSel={setSel} /></div>
      </aside>

      <section className="panel">
        <div className="flex gap-1 border-b px-3">
          {["Général", "Distribution", "Comparaison", "Carte"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2.5 text-xs font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{t}</button>
          ))}
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{f.name}</h1>
            <button aria-label="Copier" className="text-primary"><Copy className="h-3.5 w-3.5" /></button>
            <span className="rounded bg-sev-good/15 px-1.5 py-0.5 text-[10px] font-bold text-sev-good">{f.tech}</span>
          </div>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">{f.description}</p>
          <Row k="Message">{f.message}</Row>
          <Row k="Chemin ASN.1">{f.path}</Row>
          <Row k="Type">{f.type}</Row>
          <Row k="Description">{f.values}</Row>
          <Row k="Valeur dominante">{f.dominant}</Row>
          <Row k="Occurrences"><span className="num">{f.occurrences.toLocaleString("fr-FR")}</span></Row>
          <Row k="Valeurs non résolues"><span className="num">{fr(f.unresolvedPct)}</span></Row>
        </div>
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Distribution des valeurs</h2>
          <select className="h-8 rounded-md border border-input bg-card px-2 text-xs"><option>Par opérateur</option></select>
        </div>
        <div className="mt-4 space-y-2.5">
          {f.distribution.map((v, i) => (
            <div key={v.value} className="grid grid-cols-[110px_1fr_48px] items-center gap-2 text-xs">
              <span className="text-right text-muted-foreground">{v.value}</span>
              <div className="h-3.5 bg-muted"><div className={`h-full ${BAR[i]}`} style={{ width: `${v.pct}%` }} /></div>
              <span className="num text-right">{fr(v.pct)}</span>
            </div>
          ))}
        </div>
        <h3 className="mt-8 text-sm font-semibold">Valeurs par opérateur</h3>
        <table className="mt-2 w-full text-xs">
          <thead className="bg-muted text-muted-foreground"><tr><th className="px-2 py-2 text-left font-medium">Valeur</th>{OPERATORS.map((o) => <th key={o} className="px-2 py-2 text-right font-medium">{o}</th>)}<th className="px-2 py-2 text-right font-medium">Total</th></tr></thead>
          <tbody>
            {f.distribution.map((v) => (
              <tr key={v.value} className="border-t">
                <td className="px-2 py-2">{v.value}</td>
                {OPERATORS.map((o) => <td key={o} className="num px-2 py-2 text-right">{fr(v.byOp[o])}</td>)}
                <td className="num px-2 py-2 text-right font-semibold">{fr(v.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
