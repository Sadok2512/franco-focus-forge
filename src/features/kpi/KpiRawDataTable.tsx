import { formatNumber } from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
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

const timeFormatter = () =>
  new Intl.NumberFormat(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  });

const valueFormatter = (value: unknown, unit: string | null) => {
  if (value == null) return "—";
  if (typeof value === "number") {
    const digits = unit === "%" ? 1 : 2;
    const base = new Intl.NumberFormat(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB", {
      minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(value);
    return unit ? `${base} ${unit}` : base;
  }
  return String(value);
};

/** 1.44.1 — Compose l'horodatage absolu depuis les deux chaînes brutes
 *  servies par le back 0.60.1 : DATE(nmf_file_start) + event_ts.
 *  Format normalisé : `YYYY-MM-DD HH:MM:SS.ms`.
 *  - `nmf_file_start` arrive en `DD.MM.YYYY HH:MM:SS.ms` → on extrait
 *    la date, on la convertit en ISO.
 *  - `event_ts` arrive en `HH:MM:SS.ms` → tel quel.
 *  Si l'un des deux manque, on affiche ce qu'on a (jamais fabriqué). */
const absoluteTimestamp = (
  event_ts: string | null | undefined,
  nmf_file_start: string | null | undefined,
): string => {
  if (!event_ts && !nmf_file_start) return "—";
  let dateIso: string | null = null;
  if (nmf_file_start) {
    const m = nmf_file_start.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) dateIso = `${m[3]}-${m[2]}-${m[1]}`;
  }
  if (dateIso && event_ts) return `${dateIso} ${event_ts}`;
  return event_ts ?? nmf_file_start ?? "—";
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
  const { t: translate, i18n: locale } = useTranslation();
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
    // GPS et nom du fichier NMF (0.60.0) proviennent du premier point
    // qui les porte — ils sont identiques pour une même séquence
    // puisque joints par la clé `(capture_id, seq)` côté back.
    const map = new Map<
      number,
      {
        key: number;
        time_s: number;
        timestamp: string;
        longitude: number | null;
        latitude: number | null;
        nmf_file: string | null;
        [code: string]: unknown;
      }
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
          if (existing.longitude == null && p.longitude != null) existing.longitude = p.longitude;
          if (existing.latitude == null && p.latitude != null) existing.latitude = p.latitude;
          if (existing.nmf_file == null && p.nmf_file != null) existing.nmf_file = p.nmf_file;
          if (existing.timestamp === "—") {
            existing.timestamp = absoluteTimestamp(p.event_ts, p.nmf_file_start);
          }
          continue;
        }
        map.set(p.seq, {
          key: p.seq,
          time_s: p.time_s,
          timestamp: absoluteTimestamp(p.event_ts, p.nmf_file_start),
          longitude: p.longitude ?? null,
          latitude: p.latitude ?? null,
          nmf_file: p.nmf_file ?? null,
          [metric.code]: p.value,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.time_s - b.time_s);
  }, [queries, metrics]);

  const columns = useMemo<Column[]>(() => {
    const base: Column[] = [
      { key: "time_s", label: "Time (s)", numeric: true },
      { key: "timestamp", label: "Horodatage", optional: true },
      { key: "longitude", label: "Longitude", numeric: true, optional: true },
      { key: "latitude", label: "Latitude", numeric: true, optional: true },
      { key: "nmf_file", label: "Fichier NMF", optional: true },
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
          : String(av).localeCompare(String(bv), locale.resolvedLanguage, { numeric: true });
      return sort.descending ? -result : result;
    });
    if (!needle) return sorted;
    return sorted.filter((row) =>
      Object.values(row).some((v) => v != null && String(v).toLocaleLowerCase().includes(needle)),
    );
  }, [rowsByKey, search, sort, locale.resolvedLanguage]);

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
            if (c.key === "time_s" && typeof v === "number") return timeFormatter().format(v);
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
    <section className="kpi-data-table" aria-label={translate("kpi.9bef38ad5182")} data-mode="raw">
      <header className="flex flex-wrap items-center gap-2 p-3 border-b">
        <h2 className="text-sm font-semibold mr-2">
          {" "}
          {translate("kpi.6ef4db3c1dca")} <span className="kpi-count">{filtered.length}</span>
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {" "}
          {translate("kpi.ad4d960966f1")} {captureId ?? translate("kpi.d7dff346e5d0")}
        </span>
        <label className="relative">
          <Search size={13} className="absolute left-2 top-2.5 text-muted-foreground" />
          <input
            aria-label={translate("kpi.9d950fd2b4b6")}
            placeholder={translate("kpi.2bd604574ca4")}
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
                <Columns3 size={14} /> {translate("kpi.bd9a317f77ed")}{" "}
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
            <Download size={14} /> {translate("kpi.b84f9613287b")}{" "}
          </button>
        </div>
      </header>
      {errors.length > 0 && (
        <p className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b" role="alert">
          {errors.length} {translate("kpi.fa59be47c349")}{" "}
          {errors.map((e) => `${e.metric.code} (${e.message})`).join(" · ")}
        </p>
      )}
      {!enabled ? (
        <p className="p-6 text-xs text-muted-foreground" role="status">
          {metrics.length === 0 ? translate("kpi.10ffed269cda") : translate("kpi.363721ccc8eb")}
        </p>
      ) : pending ? (
        <p className="p-6 text-xs text-muted-foreground animate-pulse" role="status">
          {" "}
          {translate("kpi.928c8c7a315a")}{" "}
        </p>
      ) : filtered.length === 0 ? (
        <p className="p-6 text-xs text-muted-foreground" role="status">
          {" "}
          {translate("kpi.bce9ac6f135d")}{" "}
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
                    let title: string | undefined;
                    if (col.key === "time_s" && typeof raw === "number") {
                      text = timeFormatter().format(raw) + " s";
                    } else if (col.key === "timestamp") {
                      text = typeof raw === "string" && raw.length ? raw : "—";
                      if (text !== "—") title = text;
                    } else if (col.key === "longitude" || col.key === "latitude") {
                      text =
                        typeof raw === "number"
                          ? formatNumber(raw, {
                              minimumFractionDigits: 6,
                              maximumFractionDigits: 6,
                            }) + "°"
                          : "—";
                    } else if (col.key === "nmf_file") {
                      text = typeof raw === "string" && raw.length ? raw : "—";
                      if (text !== "—") title = text;
                    } else {
                      const metric = metrics.find((m) => m.code === col.key);
                      text = valueFormatter(raw, metric?.unit ?? null);
                    }
                    return (
                      <td
                        key={col.key}
                        title={title}
                        className={`px-3 py-1.5 border-b border-slate-100 tabular-nums ${col.numeric ? "text-right" : "text-left"} ${col.key === "nmf_file" ? "max-w-[280px] truncate" : ""} ${text === "—" ? "text-slate-400" : ""}`}
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
        <span> {translate("kpi.d6756cf758fc")} </span>
        <div className="ml-auto flex items-center gap-2">
          <label>
            <select
              aria-label={translate("kpi.154b06321991")}
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(0);
              }}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              {[25, 50, 100, 250].map((s) => (
                <option key={s} value={s}>
                  {s} {translate("kpi.e0fd3c8b26e5")}{" "}
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
