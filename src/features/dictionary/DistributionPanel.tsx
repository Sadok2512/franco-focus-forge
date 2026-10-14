import { useCallback } from "react";
import { Chart } from "@/components/bc4/Chart";
import { EmptyState } from "@/components/bc4/States";
import type { ParamDetail } from "@/lib/api/dictionary-schemas";
import { downloadCsv, fmtInt } from "./shared";

export function DistributionPanel({ detail }: { detail: ParamDetail }) {
  const h = detail.histogram;
  const rule = detail.fiche.conversion_rule;
  const total = h.reduce((a, b) => a + b.count, 0); // declared calculation: Σ histogram counts
  const numeric = h.some((b) => b.value_num != null);
  const xName = numeric ? (rule ? `Valeur convertie (${rule.unit})` : "Index brut") : "Valeur";
  const build = useCallback((c: { fg: string; muted: string; border: string }) => {
    const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    return {
      grid: { left: 44, right: 12, top: 18, bottom: numeric ? 64 : 56, containLabel: false },
      tooltip: { trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
      xAxis: { type: "category" as const, data: h.map((b) => b.label), name: xName, nameLocation: "middle" as const, nameGap: numeric ? 48 : 40,
        axisLabel: { color: c.muted, fontSize: 9, rotate: h.length > 6 ? 40 : 0, interval: 0, hideOverlap: true }, axisLine: { lineStyle: { color: c.border } } },
      yAxis: { type: "value" as const, name: "Occurrences", nameTextStyle: { color: c.muted, fontSize: 10 }, axisLabel: { color: c.muted, fontSize: 10 }, splitLine: { lineStyle: { color: c.border } } },
      series: [{ type: "bar" as const, data: h.map((b) => b.count), itemStyle: { color: primary }, barMaxWidth: 28 }],
    };
  }, [h, numeric, xName]);

  if (!h.length || total === 0) return <EmptyState title="Aucune occurrence">Aucune valeur pour ce paramètre avec les filtres actifs.</EmptyState>;
  return (
    <div className="flex flex-col gap-2 p-2">
      <Chart title={`Distribution — ${detail.fiche.leaf}`} subtitle={`${numeric ? "Histogramme" : "Valeurs catégorielles"} · ${fmtInt(total)} occurrences (total calculé = Σ histogramme)`}
        exportName={`distribution_${detail.fiche.leaf}`} build={build} height={240} />
      <details className="rounded-md border bg-card">
        <summary className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-[11px] font-medium">
          Tableau des valeurs (alternative textuelle)
          <button onClick={(e) => { e.preventDefault(); downloadCsv(`histogramme_${detail.fiche.leaf}`, [["label", "value_num", "count"], ...h.map((b) => [b.label, b.value_num ?? "", b.count])]); }}
            className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted">CSV</button>
        </summary>
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="px-2 py-1 text-left font-medium">{xName}</th><th className="px-2 py-1 text-right font-medium">Occurrences</th></tr></thead>
            <tbody>{h.map((b) => <tr key={b.label} className="border-t"><td className="px-2 py-1 font-mono">{b.label}</td><td className="num px-2 py-1 text-right font-mono">{fmtInt(b.count)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="text-[10px] text-muted-foreground">P10/P90 non affichés : l'API ne fournit que l'histogramme agrégé.</p>
    </div>
  );
}
