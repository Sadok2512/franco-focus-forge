import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Columns3, Download, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type AnalyticRow,
  exportRows,
  formatValue,
  operatorColor,
  STAT_LABELS,
} from "./workspace-model";

type Column = { key: keyof AnalyticRow; label: string; numeric?: boolean; optional?: boolean };
const COLUMNS: Column[] = [
  { key: "metric", label: "Métrique" },
  { key: "techno", label: "Technologie", optional: true },
  { key: "operator", label: "Opérateur", optional: true },
  { key: "band", label: "Bande", optional: true },
  { key: "dor", label: "DOR", optional: true },
  { key: "cell", label: "Cellule", optional: true },
  { key: "service", label: "Service", optional: true },
  { key: "env", label: "Environnement", optional: true },
  { key: "statistic", label: "Statistique" },
  { key: "value", label: "Valeur", numeric: true },
  { key: "unit", label: "Unité" },
  { key: "n", label: "Population (n)", numeric: true, optional: true },
  { key: "denominator", label: "Dénominateur", numeric: true, optional: true },
  { key: "result_id", label: "result_id", optional: true },
];
export function KpiDataTable({
  rows,
  selected,
  onSelect,
}: {
  rows: AnalyticRow[];
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
}) {
  const [search, setSearch] = useState(""),
    [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: keyof AnalyticRow; descending: boolean }>({
    key: "metric",
    descending: false,
  });
  const [page, setPage] = useState(0),
    [size, setSize] = useState(25);
  const available = COLUMNS.filter(
    (col) => !col.optional || rows.some((row) => row[col.key] != null),
  );
  const columns = available.filter((col) => !hidden.has(col.key));
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return rows
      .filter(
        (row) =>
          !needle ||
          Object.values(row).some(
            (v) => v != null && String(v).toLocaleLowerCase().includes(needle),
          ),
      )
      .sort((a, b) => {
        const av = a[sort.key],
          bv = b[sort.key];
        if (av == null) return bv == null ? 0 : 1;
        if (bv == null) return -1;
        const result =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "fr", { numeric: true });
        return sort.descending ? -result : result;
      });
  }, [rows, search, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)),
    currentPage = Math.min(page, pages - 1),
    pageRows = filtered.slice(currentPage * size, (currentPage + 1) * size);
  const selectedExport = filtered.filter((row) => selected.has(row.id));
  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };
  return (
    <section className="kpi-data-table" aria-label="Données">
      <header className="flex flex-wrap items-center gap-2 p-3 border-b">
        <h2 className="text-sm font-semibold mr-2">
          Données <span className="kpi-count">{filtered.length}</span>
        </h2>
        <label className="relative">
          <Search size={13} className="absolute left-2 top-2.5 text-muted-foreground" />
          <input
            aria-label="Rechercher dans les données"
            placeholder="Rechercher dans les données…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-8 rounded-md border bg-background pl-7 pr-2 text-xs"
          />
        </label>
        {selected.size > 0 && (
          <button className="kpi-button" onClick={() => onSelect(new Set())}>
            {selected.size} sélectionnée(s) · Effacer
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="kpi-button">
                <Columns3 size={14} />
                Colonnes
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <div className="space-y-2">
                {available.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!hidden.has(col.key)}
                      disabled={!hidden.has(col.key) && columns.length === 1}
                      onChange={() =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (next.has(col.key)) next.delete(col.key);
                          else next.add(col.key);
                          return next;
                        })
                      }
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <button
            className="kpi-button"
            disabled={!filtered.length}
            onClick={() => exportRows(selectedExport.length ? selectedExport : filtered)}
          >
            <Download size={14} />
            {selectedExport.length
              ? `Exporter la sélection (${selectedExport.length})`
              : "Exporter CSV"}
          </button>
        </div>
      </header>
      <div className="kpi-table-scroll">
        <table>
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Sélectionner les lignes de la page"
                  checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
                  disabled={!pageRows.length}
                  onChange={(e) => {
                    const next = new Set(selected);
                    pageRows.forEach((row) => {
                      if (e.target.checked) next.add(row.id);
                      else next.delete(row.id);
                    });
                    onSelect(next);
                  }}
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  aria-sort={
                    sort.key === col.key ? (sort.descending ? "descending" : "ascending") : "none"
                  }
                  className={col.numeric ? "numeric" : ""}
                >
                  <button
                    onClick={() =>
                      setSort({
                        key: col.key,
                        descending: sort.key === col.key ? !sort.descending : false,
                      })
                    }
                  >
                    {col.label}
                    {sort.key === col.key ? (sort.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.id}
                data-row-id={row.id}
                className={selected.has(row.id) ? "selected" : ""}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner la ligne ${row.metric} ${row.label}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                  />
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={col.numeric ? "numeric" : ""}
                    title={row[col.key] == null ? undefined : String(row[col.key])}
                  >
                    {col.key === "operator" ? (
                      <span className="inline-flex items-center gap-2">
                        <i
                          className="kpi-operator-dot"
                          style={{ backgroundColor: operatorColor(row.operator) }}
                        />
                        {row.operator ?? "—"}
                      </span>
                    ) : col.numeric ? (
                      formatValue(row[col.key])
                    ) : col.key === "statistic" ? (
                      STAT_LABELS[row.statistic]
                    ) : (
                      (row[col.key] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucune ligne disponible pour les métriques et filtres appliqués.
          </p>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t text-xs text-muted-foreground">
        <span>Mêmes agrégats que les graphiques · une population par métrique</span>
        <div className="flex items-center gap-2">
          <select
            aria-label="Lignes par page"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} lignes
              </option>
            ))}
          </select>
          <button
            className="kpi-icon"
            disabled={currentPage === 0}
            aria-label="Page précédente"
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            {currentPage + 1} / {pages}
          </span>
          <button
            className="kpi-icon"
            disabled={currentPage + 1 >= pages}
            aria-label="Page suivante"
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </footer>
    </section>
  );
}
