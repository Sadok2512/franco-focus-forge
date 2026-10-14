import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Info, MessageSquare, Plus, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { getAssistant } from "@/lib/api/client";
import { Chart } from "@/components/bc4/Chart";
import { LoadingSkeleton } from "@/components/bc4/States";

export const Route = createFileRoute("/_app/assistant")({
  head: () => ({ meta: [
    { title: "Assistant IA — BC4" },
    { name: "description", content: "Posez vos questions sur les mesures radio et obtenez des analyses chiffrées par opérateur." },
    { property: "og:title", content: "Assistant IA — BC4" },
    { property: "og:description", content: "Posez vos questions sur les mesures radio et obtenez des analyses chiffrées par opérateur." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AssistantPage,
});

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function AssistantPage() {
  const q = useQuery({ queryKey: ["assistant"], queryFn: ({ signal }) => getAssistant(signal) });
  const [active, setActive] = useState("c1");
  const [input, setInput] = useState("");
  const a = q.data?.answer;

  const box = useCallback((c: { muted: string; border: string }) => ({
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: "category" as const, data: Object.keys(a?.box ?? {}), axisLabel: { color: c.muted, fontSize: 11 }, axisLine: { lineStyle: { color: c.border } } },
    yAxis: { type: "value" as const, name: "Mbps", nameLocation: "middle" as const, nameGap: 36, axisLabel: { color: c.muted, fontSize: 10 }, splitLine: { lineStyle: { color: c.border } } },
    series: [{ type: "boxplot" as const, boxWidth: [30, 60],
      data: Object.entries(a?.box ?? {}).map(([op, v]) => {
        const col = css(op === "SFR" ? "--op-sfr" : "--op-orange");
        return { value: v, itemStyle: { color: col, borderColor: col } };
      }) }],
  }), [a]);

  if (!q.data || !a) return <div className="p-4"><LoadingSkeleton className="h-96" /></div>;

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[260px_1fr]">
      <aside className="panel flex flex-col p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Conversations</h2>
          <button className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-primary hover:bg-accent"><Plus className="h-3 w-3" /> Nouvelle discussion</button>
        </div>
        <ul className="mt-3 space-y-1">
          {q.data.conversations.map((c) => (
            <li key={c.id}>
              <button onClick={() => setActive(c.id)} className={`flex w-full gap-2 rounded px-2 py-1.5 text-left ${active === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span><span className="block text-xs font-medium">{c.title}</span><span className="block text-[10px] text-muted-foreground">{c.date}</span></span>
              </button>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-sm font-bold">Questions suggérées</h3>
        <ul className="mt-2 space-y-1.5">
          {q.data.suggestions.map((s) => (
            <li key={s}><button onClick={() => setInput(s)} className="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] hover:bg-muted"><MessageSquare className="h-3 w-3 text-primary" />{s}</button></li>
          ))}
        </ul>
      </aside>

      <section className="panel flex min-h-[600px] flex-col p-4">
        <div className="flex justify-end"><p className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">{a.question}</p></div>
        <div className="mt-4 flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><Bot className="h-4 w-4" /></span>
          <div className="flex-1">
            <p className="text-xs">{a.intro}</p>
            <div className="mt-3 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Chart title="Throughput DL NR — Paris" build={box} height={260} exportName="assistant_nr" />
              <div>
                <h4 className="text-xs font-semibold">Statistiques</h4>
                <table className="mt-2 w-full text-xs">
                  <thead className="bg-muted text-muted-foreground"><tr><th className="px-2 py-1.5 text-left font-medium">Métrique</th><th className="px-2 py-1.5 text-right font-medium">Orange</th><th className="px-2 py-1.5 text-right font-medium">SFR</th></tr></thead>
                  <tbody>{a.stats.map((s) => <tr key={s.m} className="border-t"><td className="px-2 py-1.5">{s.m}</td><td className="num px-2 py-1.5 text-right">{s.o}</td><td className="num px-2 py-1.5 text-right">{s.s}</td></tr>)}</tbody>
                </table>
                <p className="mt-4 flex items-center gap-1 text-xs font-semibold"><Info className="h-3.5 w-3.5 text-primary" /> Analyse</p>
                <p className="mt-1 text-xs text-muted-foreground">{a.analysis}</p>
              </div>
            </div>
          </div>
        </div>
        <form onSubmit={(e) => e.preventDefault()} className="mt-auto flex gap-2 pt-4">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Posez votre question…" className="h-9 flex-1 rounded-md border border-input bg-card px-3 text-xs" />
          <button aria-label="Envoyer" className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Send className="h-4 w-4" /></button>
        </form>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">Les réponses sont basées sur les données de votre projet et peuvent être limitées par la couverture des mesures.</p>
      </section>
    </div>
  );
}
