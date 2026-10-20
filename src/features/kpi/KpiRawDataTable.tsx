import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Columns3, Download, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getKpiTimeSeries, type KpiTimeSeries } from "@/lib/api/kpi-timeseries";
import { toUserMessage } from "@/lib/api/http";

/** 1.43.0 — Tableau des observations brutes.
 *
 *  Attendu par le mandat §8 : « observations réelles de la capture
 *  déjà sélectionnée » plutôt que les agrégats quand on est en mode
 *  Graphique temporel. Colonnes principales : Time (s), Longitude,
 *  Latitude, puis une colonne par métrique sélectionnée.
 *
 *  Alignement multi-métriques : identité `(capture_id, seq)` →
 *  jointure sur `seq` sans heuristique temporelle (règle du mandat
 *  §8 — « Ne pas effectuer de jointure temporelle approximative
 *  sans contrat »).
 *
 *  Longitude / Latitude : la route `/time-series` ne porte pas les
 *  coordonnées GPS aujourd'hui ; les cellules affichent `—` et la
 *  limite est tracée dans l'en-tête du tableau (règle du mandat §9).
 *  Aucune valeur fabriquée. */

export type KpiRawMetric = {
  code: string;
  label: string;
  unit: string | null;
};

type Column = {
  key: string;
  label: string;
  numeric?: boolean;
  optional?: boolean;
};

const timeFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  useGrouping: false,
});

const valueFormatter = (value: unknown, unit: string | null) => {
  if (value == null) return "—";
  if (typeof value === "number") {
    const digits = unit === "%" ? 1 : 2;
    const base = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(digits);
    return unit ? `${base} ${unit}` : base;
  }
  return String(value);
};

export function KpiRawDataTable({
  projectId,
  captureId,
  metrics,
}: {
  projectId: string;
  captureId: string | undefined;
  metrics: KpiRawMetric[];
}) {
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; descending: boolean }>({
    key: "time_s",
    descending: false,
  });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);

  const enabled = Boolean(projectId && captureId && metrics.length);

  const queries = useQueries({
    queries: metrics.map((m) => ({
      queryKey: ["kpi-timeseries-table", projectId, captureId, m.code],
      // Pas de down-sampling côté tableau : on exige les points bruts
      // (règle du mandat §10 — le graphique peut lire une version
      // réduite, le tableau non).
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getKpiTimeSeries(projectId, captureId as string, m.code, 100000, signal),
      enabled,
    })),
  });

  const pending = queries.some((q) => q.isPending);
  const errors: { metric: KpiRawMetric; message: string }[] = [];
  queries.forEach((q, i) => {
    const metric = metrics[i];
    if (!metric || !q.isError) return;
    errors.push({ metric, message: toUserMessage(q.error as Error) });
  });

  const rowsByKey = useMemo(() => {
    // Jointure stricte par `seq` au sein de la même capture : identité
    // (capture_id, seq) → une seule ligne, une colonne par métrique.
    const map = new Map<
      number,
      { key: number; time_s: number; longitude: string; latitude: string; [code: string]: unknown }
    >();
    queries.forEach((q, idx) => {
      const payload = q.data as KpiTimeSeries | undefined;
      if (!payload || payload.status !== "AVAILABLE") return;
      const metric = metrics[idx];
      if (!metric) return;
      for (const p of payload.points) {
        const existing = map.get(p.seq);
        if (existing) {
          existing[metric.code] = p.value;
          continue;
        }
        map.set(p.seq, {
          key: p.seq,
          time_s: p.time_s,
          longitude: "—",
          latitude: "—",
          [metric.code]: p.value,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.time_s - b.time_s);
  }, [queries, metrics]);

  const columns = useMemo<Column[]>(() => {
    const base: Column[] = [
      { key: "time_s", label: "Time (s)", numeric: true },
      { key: "longitude", label: "Longitude", optional: true },
      { key: "latitude", label: "Latitude", optional: true },
    ];
    const metricCols: Column[] = metrics.map((m) => ({
      key: m.code,
      label: m.unit ? `${m.label} (${m.unit})` : m.label,
      numeric: true,
    }));
    return [...base, ...metricCols];
  }, [metrics]);

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const sorted = [...rowsByKey].sort((a, b) => {
      const av = a[sort.key as keyof typeof a];
      const bv = b[sort.key as keyof typeof b];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      const result =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "fr", { numeric: true });
      return sort.descending ? -result : result;
    });
    if (!needle) return sorted;
    return sorted.filter((row) =>
      Object.values(row).some((v) => v != null && String(v).toLocaleLowerCase().includes(needle)),
    );
  }, [rowsByKey, search, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(page, pages - 1);
  const pageRows = filtered.slice(currentPage * size, (currentPage + 1) * size);

  const toCsv = () => {
    const header = visibleColumns.map((c) => c.label).join(";");
    const body = filtered
      .map((row) =>
        visibleColumns
          .map((c) => {
            const v = row[c.key as keyof typeof row];
            if (v == null) return "";
            if (c.key === "time_s" && typeof v === "number") return timeFormatter.format(v);
            return typeof v === "object" ? JSON.stringify(v) : String(v);
          })
          .join(";"),
      )
      .join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${captureId ?? "capture"}-${metrics.map((m) => m.code).join("-")}-raw.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="kpi-data-table" aria-label="Données brutes" data-mode="raw">
      <header className="flex flex-wrap items-center gap-2 p-3 border-b">
        <h2 className="text-sm font-semibold mr-2">
          Données <span className="kpi-count">{filtered.length}</span>
        </h2>
        <span className="text-[10px] text-muted-foreground">
          observations brutes · capture {captureId ?? "non sélectionnée"}
        </span>
        <label className="relative">
          <Search size={13} className="absolute left-2 top-2.5 text-muted-foreground" />
          <input
            aria-label="Rechercher dans les observations"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-8 rounded-md border bg-background pl-7 pr-2 text-xs"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="kpi-button" type="button">
                <Columns3 size={14} />
                Colonnes
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <div className="space-y-2">
                {columns.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!hidden.has(col.key)}
                      disabled={!hidden.has(col.key) && visibleColumns.length === 1}
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
          <button className="kpi-button" type="button" disabled={!filtered.length} onClick={toCsv}>
            <Download size={14} />
            Exporter CSV
          </button>
        </div>
      </header>
      {errors.length > 0 && (
        <p className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b" role="alert">
          {errors.length} métrique(s) sans série temporelle live :{" "}
          {errors.map((e) => `${e.metric.code} (${e.message})`).join(" · ")}
        </p>
      )}
      {!enabled ? (
        <p className="p-6 text-xs text-muted-foreground" role="status">
          {metrics.length === 0
            ? "Aucune métrique temporelle sélectionnée."
            : "En attente d’une capture active pour charger les observations brutes."}
        </p>
      ) : pending ? (
        <p className="p-6 text-xs text-muted-foreground animate-pulse" role="status">
          Chargement des observations…
        </p>
      ) : filtered.length === 0 ? (
        <p className="p-6 text-xs text-muted-foreground" role="status">
          Aucune observation retournée pour cette capture et ces métriques.
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-3 py-2 border-b font-medium text-slate-600 ${col.numeric ? "text-right" : "text-left"}`}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() =>
                        setSort((prev) => ({
                          key: col.key,
                          descending: prev.key === col.key ? !prev.descending : false,
                        }))
                      }
                    >
                      {col.label}
                      {sort.key === col.key ? (sort.descending ? "↓" : "↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50">
                  {visibleColumns.map((col) => {
                    const raw = row[col.key as keyof typeof row];
                    let text: string;
                    if (col.key === "time_s" && typeof raw === "number") {
                      text = timeFormatter.format(raw) + " s";
                    } else if (col.key === "longitude" || col.key === "latitude") {
                      text = raw != null ? String(raw) : "—";
                    } else {
                      const metric = metrics.find((m) => m.code === col.key);
                      text = valueFormatter(raw, metric?.unit ?? null);
                    }
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-1.5 border-b border-slate-100 tabular-nums ${col.numeric ? "text-right" : "text-left"} ${text === "—" ? "text-slate-400" : ""}`}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="flex flex-wrap items-center gap-3 p-2 text-[11px] text-muted-foreground border-t">
        <span>
          Observations brutes · jointure stricte sur (capture_id, seq) · GPS non exposé par le
          contrat `/time-series` → `—` (limite déclarée).
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label>
            <select
              aria-label="Lignes par page"
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(0);
              }}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              {[25, 50, 100, 250].map((s) => (
                <option key={s} value={s}>
                  {s} lignes
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="kpi-button"
            disabled={currentPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ←
          </button>
          <span>
            {currentPage + 1} / {pages}
          </span>
          <button
            type="button"
            className="kpi-button"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          >
            →
          </button>
        </div>
      </footer>
    </section>
  );
}
