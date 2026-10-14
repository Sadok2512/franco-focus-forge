import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { useState } from "react";
import { OpBadge } from "@/components/bc4/AppShell";
import { EmptyState } from "@/components/bc4/States";
import { OPERATORS, type Operator } from "@/lib/api/schemas";
import type { GroupBy, ParamDetail } from "@/lib/api/dictionary-schemas";
import { downloadCsv, fmtInt, fmtPct } from "./shared";

const GAP = 10; // points de % — seuil de mise en évidence, pas un critère de défaut

function KeyBadge({ k }: { k: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {k.split(" · ").map((p) =>
        (OPERATORS as readonly string[]).includes(p) ? (
          <OpBadge key={p} op={p as Operator} />
        ) : (
          <span
            key={p}
            className="rounded border bg-muted px-1.5 font-mono text-[10px] font-semibold"
          >
            {p}
          </span>
        ),
      )}
    </span>
  );
}

export function ComparisonMatrix({
  detail,
  groupBy,
  onGroupBy,
  fetching,
}: {
  detail: ParamDetail;
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  fetching: boolean;
}) {
  const [sort, setSort] = useState<{ col: "key" | "total" | number; dir: 1 | -1 }>({
    col: "key",
    dir: 1,
  });
  const { bins, rows } = detail.matrix;
  // declared calculation: overall share per bin = Σ n(bin) / Σ total
  const grand = rows.reduce((a, r) => a + r.total, 0);
  const overall = bins.map((_, i) =>
    grand
      ? (rows.reduce((a, r) => a + (r.cells.find((c) => c.bin_index === i)?.n ?? 0), 0) / grand) *
        100
      : 0,
  );
  const cell = (r: (typeof rows)[number], i: number) => r.cells.find((c) => c.bin_index === i);
  const sorted = [...rows].sort((a, b) => {
    const v =
      sort.col === "key"
        ? a.key.localeCompare(b.key)
        : sort.col === "total"
          ? a.total - b.total
          : (cell(a, sort.col)?.pct ?? 0) - (cell(b, sort.col)?.pct ?? 0);
    return v * sort.dir;
  });
  const th = (col: typeof sort.col, label: string, right = true) => (
    <th
      scope="col"
      aria-sort={sort.col === col ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      className={`whitespace-nowrap px-2 py-1.5 font-medium ${right ? "text-right" : "text-left"}`}
    >
      <button
        onClick={() => setSort((s) => ({ col, dir: s.col === col ? (-s.dir as 1 | -1) : 1 }))}
        className="inline-flex items-center gap-0.5 hover:text-foreground"
      >
        {label}
        {sort.col === col &&
          (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
  const csv = () =>
    downloadCsv(`matrice_${detail.fiche.leaf}_${groupBy.replace(",", "_")}`, [
      ["groupe", "total", ...bins.flatMap((b) => [`${b} (%)`, `${b} (n)`])],
      ...sorted.map((r) => [
        r.key,
        r.total,
        ...bins.flatMap((_, i) => [cell(r, i)?.pct ?? 0, cell(r, i)?.n ?? 0]),
      ]),
    ]);

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">Regrouper par</span>
          <select
            value={groupBy}
            onChange={(e) => onGroupBy(e.target.value as GroupBy)}
            className="h-6 rounded border border-input bg-card px-1.5 text-[11px]"
          >
            <option value="operator">Opérateur</option>
            <option value="band">Bande</option>
            <option value="operator,band">Opérateur + bande</option>
          </select>
          {fetching && <span className="text-[10px] text-muted-foreground">mise à jour…</span>}
        </label>
        <button
          onClick={csv}
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted"
        >
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      {!rows.length ? (
        <EmptyState title="Aucune ligne">
          Aucune observation pour ce regroupement avec les filtres actifs.
        </EmptyState>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-md border">
          <table className="w-full text-[11px]">
            <caption className="sr-only">
              Matrice croisée {detail.fiche.leaf} par {groupBy}: part en % et effectif n par valeur
            </caption>
            <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
              <tr>
                {th("key", "Groupe", false)}
                {th("total", "Total")}
                {bins.map((b, i) => th(i, b))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.key} className="border-t">
                  <th scope="row" className="px-2 py-1 text-left font-normal">
                    <KeyBadge k={r.key} />
                  </th>
                  <td className="num px-2 py-1 text-right font-mono font-semibold">
                    {fmtInt(r.total)}
                  </td>
                  {bins.map((_, i) => {
                    const c = cell(r, i);
                    const d = c ? c.pct - overall[i]! : 0;
                    const hi = Math.abs(d) >= GAP;
                    return (
                      <td
                        key={i}
                        title={`n = ${c?.n ?? 0}`}
                        className={`num whitespace-nowrap px-2 py-1 text-right font-mono ${hi ? "bg-warning text-warning-foreground" : ""}`}
                      >
                        {c ? fmtPct(c.pct) : "N/D"}
                        {hi && (
                          <span
                            aria-label={
                              d > 0 ? "au-dessus de l'ensemble" : "en dessous de l'ensemble"
                            }
                          >
                            {" "}
                            {d > 0 ? "▲" : "▼"}
                          </span>
                        )}
                        <span className="block text-[9px] text-muted-foreground">
                          n={fmtInt(c?.n ?? 0)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        ▲/▼ : écart ≥ {GAP} pts vs l'ensemble (calculé = Σn / Σtotal). Écart à investiguer, sans
        règle de défaut associée.
      </p>
    </div>
  );
}
