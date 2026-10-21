import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
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
  {
    key: "metric",
    get label() {
      return i18n.t("kpi.4c45cf9c5901");
    },
  },
  {
    key: "techno",
    get label() {
      return i18n.t("kpi.8a5cefc36adb");
    },
    optional: true,
  },
  {
    key: "operator",
    get label() {
      return i18n.t("kpi.16602c56b3e8");
    },
    optional: true,
  },
  {
    key: "band",
    get label() {
      return i18n.t("kpi.39c716cec99a");
    },
    optional: true,
  },
  { key: "dor", label: "DOR", optional: true },
  {
    key: "cell",
    get label() {
      return i18n.t("kpi.cell");
    },
    optional: true,
  },
  { key: "service", label: "Service", optional: true },
  {
    key: "env",
    get label() {
      return i18n.t("kpi.8c95c96815f1");
    },
    optional: true,
  },
  {
    key: "statistic",
    get label() {
      return i18n.t("kpi.a6fc812e6cb4");
    },
  },
  {
    key: "value",
    get label() {
      return i18n.t("kpi.6e8f3132d8e2");
    },
    numeric: true,
  },
  {
    key: "unit",
    get label() {
      return i18n.t("kpi.1ee30a8526db");
    },
  },
  { key: "n", label: "Population (n)", numeric: true, optional: true },
  {
    key: "denominator",
    get label() {
      return i18n.t("kpi.37b0d26900ca");
    },
    numeric: true,
    optional: true,
  },
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
  const { t: translate, i18n: locale } = useTranslation();
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
            : String(av).localeCompare(String(bv), locale.resolvedLanguage, { numeric: true });
        return sort.descending ? -result : result;
      });
  }, [rows, search, sort, locale.resolvedLanguage]);
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
    <section className="kpi-data-table" aria-label={translate("kpi.6ef4db3c1dca")}>
      <header className="flex flex-wrap items-center gap-2 p-3 border-b">
        <h2 className="text-sm font-semibold mr-2">
          {" "}
          {translate("kpi.6ef4db3c1dca")} <span className="kpi-count">{filtered.length}</span>
        </h2>
        <label className="relative">
          <Search size={13} className="absolute left-2 top-2.5 text-muted-foreground" />
          <input
            aria-label={translate("kpi.9d4fa9d693ef")}
            placeholder={translate("kpi.5fc5667c4142")}
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
            {selected.size} {translate("kpi.214ab747f5ed")}{" "}
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="kpi-button">
                <Columns3 size={14} /> {translate("kpi.bd9a317f77ed")}{" "}
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
              ? translate("kpi.5562230cf53d", { v0: selectedExport.length })
              : translate("kpi.b84f9613287b")}
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
                  aria-label={translate("kpi.d198f440f234")}
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
                    aria-label={translate("kpi.59796aaaac86", { v0: row.metric, v1: row.label })}
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
            {" "}
            {translate("kpi.639f18a262b1")}{" "}
          </p>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t text-xs text-muted-foreground">
        <span>{translate("kpi.ce148f139ae3")}</span>
        <div className="flex items-center gap-2">
          <select
            aria-label={translate("kpi.154b06321991")}
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} {translate("kpi.e0fd3c8b26e5")}{" "}
              </option>
            ))}
          </select>
          <button
            className="kpi-icon"
            disabled={currentPage === 0}
            aria-label={translate("kpi.0301d410db18")}
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
            aria-label={translate("kpi.10733e78ff61")}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </footer>
    </section>
  );
}
