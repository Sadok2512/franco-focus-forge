import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clock3, Plus, Radio, RotateCcw, Settings2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getMetricAnalysis } from "@/lib/api/client";
import type { MetricInfo } from "@/lib/api/metrics-schemas";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { WorkspacePanelMenu } from "./WorkspacePanelMenu";
import { MAP_METRIC_MIME, readMapMetric } from "./map-metric-drop";
import { usePointSync } from "./point-sync";

export type SnapshotThreshold = {
  min: number;
  max: number;
  warning: number;
  good: number;
  direction: "higher" | "lower";
  colors: [string, string, string];
};

export type RadioSnapshotConfiguration = {
  metrics: string[];
  showBadges: boolean;
  thresholds: Record<string, SnapshotThreshold>;
};

export const DEFAULT_SNAPSHOT_METRICS = [
  "cell_rsrp@lte-type-0",
  "cell_rsrq@lte-type-0",
  "cell_sinr@lte-type-0",
  "cell_rsrp@nr-type-199",
  "cell_rsrq@nr-type-199",
  "cell_sinr@nr-type-199",
] as const;

const DEFAULT_COLORS: [string, string, string] = ["#ef4444", "#f59e0b", "#22c55e"];

export function defaultSnapshotThreshold(code: string): SnapshotThreshold {
  const key = code.toLowerCase();
  if (key.includes("rsrp"))
    return {
      min: -140,
      max: -40,
      warning: -110,
      good: -90,
      direction: "higher",
      colors: DEFAULT_COLORS,
    };
  if (key.includes("rsrq"))
    return {
      min: -30,
      max: 0,
      warning: -20,
      good: -10,
      direction: "higher",
      colors: DEFAULT_COLORS,
    };
  if (key.includes("sinr") || key.includes("snr"))
    return { min: -20, max: 40, warning: 0, good: 15, direction: "higher", colors: DEFAULT_COLORS };
  if (key.includes("cqi"))
    return { min: 0, max: 15, warning: 5, good: 10, direction: "higher", colors: DEFAULT_COLORS };
  if (key.includes("bler"))
    return { min: 0, max: 100, warning: 10, good: 2, direction: "lower", colors: DEFAULT_COLORS };
  return { min: 0, max: 100, warning: 35, good: 70, direction: "higher", colors: DEFAULT_COLORS };
}

export function snapshotMetricAvailable(metric: MetricInfo) {
  return (
    metric.available &&
    metric.n_in_project > 0 &&
    (metric.kind === "numeric" || metric.kind === "KPI")
  );
}

export function defaultSnapshotConfiguration(
  catalog: MetricInfo[],
  initialMetric?: string,
): RadioSnapshotConfiguration {
  const available = new Set(catalog.filter(snapshotMetricAvailable).map((metric) => metric.code));
  const metrics = DEFAULT_SNAPSHOT_METRICS.filter((code) => available.has(code));
  if (initialMetric && available.has(initialMetric) && !metrics.includes(initialMetric as never)) {
    metrics.push(initialMetric as (typeof DEFAULT_SNAPSHOT_METRICS)[number]);
  }
  const selected = metrics.length
    ? [...metrics]
    : initialMetric && available.has(initialMetric)
      ? [initialMetric]
      : [];
  return {
    metrics: selected,
    showBadges: true,
    thresholds: Object.fromEntries(selected.map((code) => [code, defaultSnapshotThreshold(code)])),
  };
}

export function radioSnapshotStorageKey(workspaceId: string, panelId: string) {
  return `bc4.radio-snapshot.v1.${workspaceId}.${panelId}`;
}

export function readRadioSnapshotConfiguration(
  workspaceId: string,
  panelId: string,
  catalog: MetricInfo[],
  initialMetric?: string,
): RadioSnapshotConfiguration {
  const fallback = defaultSnapshotConfiguration(catalog, initialMetric);
  try {
    const parsed = JSON.parse(
      localStorage.getItem(radioSnapshotStorageKey(workspaceId, panelId)) ?? "null",
    ) as Partial<RadioSnapshotConfiguration> | null;
    if (!parsed || !Array.isArray(parsed.metrics)) return fallback;
    const available = new Set(catalog.filter(snapshotMetricAvailable).map((metric) => metric.code));
    const metrics = parsed.metrics.filter(
      (code): code is string => typeof code === "string" && available.has(code),
    );
    return {
      metrics,
      showBadges: parsed.showBadges !== false,
      thresholds: Object.fromEntries(
        metrics.map((code) => [code, parsed.thresholds?.[code] ?? defaultSnapshotThreshold(code)]),
      ),
    };
  } catch {
    return fallback;
  }
}

export function writeRadioSnapshotConfiguration(
  workspaceId: string,
  panelId: string,
  configuration: RadioSnapshotConfiguration,
) {
  try {
    localStorage.setItem(
      radioSnapshotStorageKey(workspaceId, panelId),
      JSON.stringify(configuration),
    );
  } catch {
    /* The mounted panel remains authoritative when storage is unavailable. */
  }
}

export function snapshotBarPosition(value: number, threshold: SnapshotThreshold) {
  if (!Number.isFinite(value) || threshold.max <= threshold.min) return 0;
  return Math.max(
    0,
    Math.min(100, ((value - threshold.min) / (threshold.max - threshold.min)) * 100),
  );
}

export function snapshotValueColor(value: number, threshold: SnapshotThreshold) {
  if (threshold.direction === "lower") {
    if (value <= threshold.good) return threshold.colors[2];
    if (value <= threshold.warning) return threshold.colors[1];
    return threshold.colors[0];
  }
  if (value >= threshold.good) return threshold.colors[2];
  if (value >= threshold.warning) return threshold.colors[1];
  return threshold.colors[0];
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function RadioSnapshotPanel({
  projectId,
  captureId,
  workspaceId,
  panelId,
  title,
  initialMetric,
  catalog,
  filters,
  onRemove,
}: {
  projectId: string;
  captureId: string;
  workspaceId: string;
  panelId: string;
  title: string;
  initialMetric: string;
  catalog: MetricInfo[];
  filters: KpiQueryFilters;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const pointSync = usePointSync();
  const [configuration, setConfiguration] = useState(() =>
    readRadioSnapshotConfiguration(workspaceId, panelId, catalog, initialMetric),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metricSearch, setMetricSearch] = useState("");
  const [dropOver, setDropOver] = useState(false);

  useEffect(() => {
    if (!catalog.length) return;
    setConfiguration(readRadioSnapshotConfiguration(workspaceId, panelId, catalog, initialMetric));
  }, [catalog, initialMetric, panelId, workspaceId]);

  const save = (next: RadioSnapshotConfiguration) => {
    setConfiguration(next);
    writeRadioSnapshotConfiguration(workspaceId, panelId, next);
  };
  const availableMetrics = useMemo(() => catalog.filter(snapshotMetricAvailable), [catalog]);
  const metricByCode = useMemo(
    () => new Map(availableMetrics.map((metric) => [metric.code, metric])),
    [availableMetrics],
  );
  const addMetric = (code: string) => {
    if (!metricByCode.has(code) || configuration.metrics.includes(code)) return;
    save({
      ...configuration,
      metrics: [...configuration.metrics, code],
      thresholds: {
        ...configuration.thresholds,
        [code]: defaultSnapshotThreshold(code),
      },
    });
  };
  const removeMetric = (code: string) => {
    const thresholds = { ...configuration.thresholds };
    delete thresholds[code];
    save({
      ...configuration,
      metrics: configuration.metrics.filter((metric) => metric !== code),
      thresholds,
    });
  };
  const moveMetric = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= configuration.metrics.length) return;
    const metrics = [...configuration.metrics];
    [metrics[index], metrics[to]] = [metrics[to]!, metrics[index]!];
    save({ ...configuration, metrics });
  };
  const selectedPoint =
    pointSync.selection?.projectId === projectId && pointSync.selection.captureId === captureId
      ? pointSync.selection
      : null;
  const latest = useQuery({
    queryKey: ["radio-snapshot-latest", projectId, captureId, configuration.metrics, filters],
    queryFn: async ({ signal }) => {
      const latestByMetric = await Promise.all(
        configuration.metrics.map(async (code) => {
          const first = await getMetricAnalysis(
            projectId,
            captureId,
            [code],
            filters,
            {
              group_by: "none",
              include_map: false,
              table_only: true,
              page: 1,
              page_size: 25,
            },
            signal,
          );
          if (first.total_pages === 0) return undefined;
          const last =
            first.total_pages === 1
              ? first
              : await getMetricAnalysis(
                  projectId,
                  captureId,
                  [code],
                  filters,
                  {
                    group_by: "none",
                    include_map: false,
                    table_only: true,
                    page: first.total_pages,
                    page_size: 25,
                  },
                  signal,
                );
          return last.rows.reduce<number | undefined>(
            (maximum, row) => (maximum == null || row.seq_last > maximum ? row.seq_last : maximum),
            undefined,
          );
        }),
      );
      return latestByMetric.reduce<number | undefined>(
        (maximum, seq) => (seq != null && (maximum == null || seq > maximum) ? seq : maximum),
        undefined,
      );
    },
    enabled: configuration.metrics.length > 0 && !selectedPoint,
    staleTime: 60_000,
    retry: false,
  });
  const targetSeq = selectedPoint?.seq ?? latest.data;
  const snapshot = useQuery({
    queryKey: [
      "radio-snapshot-exact",
      projectId,
      captureId,
      targetSeq,
      configuration.metrics,
      filters,
    ],
    queryFn: ({ signal }) =>
      getMetricAnalysis(
        projectId,
        captureId,
        configuration.metrics,
        filters,
        {
          group_by: "none",
          include_map: false,
          table_only: true,
          page: 1,
          page_size: 25,
          from_seq: targetSeq!,
          to_seq: targetSeq!,
        },
        signal,
      ),
    enabled: configuration.metrics.length > 0 && targetSeq != null,
    staleTime: 60_000,
    retry: false,
  });
  const rows = snapshot.data?.rows ?? [];
  const columns = new Map((snapshot.data?.columns ?? []).map((column) => [column.code, column]));
  const populatedRows = rows.filter((row) =>
    configuration.metrics.some((code) => row.values[code] != null),
  );
  const systems = unique(populatedRows.map((row) => row.cell_system));
  const cells = unique(populatedRows.map((row) => row.cell_label));
  const serving = populatedRows.find((row) => row.cell_pci != null);
  const anchors = unique(
    populatedRows.map((row) => {
      if (row.cell_system === "LTE") return `LTE (${row.cell_label ?? "PCell"})`;
      if (row.cell_system === "NR") return `NR (${row.cell_label ?? "PSCell"})`;
      return null;
    }),
  );
  const timeRow = populatedRows[0] ?? rows[0];
  const loading = latest.isPending || (targetSeq != null && snapshot.isPending);
  const error = latest.error ?? snapshot.error;
  const choices = availableMetrics.filter((metric) => {
    if (configuration.metrics.includes(metric.code)) return false;
    const query = metricSearch.trim().toLocaleLowerCase();
    return (
      !query || `${metric.label} ${metric.code} ${metric.tech}`.toLocaleLowerCase().includes(query)
    );
  });

  return (
    <article
      className={`radio-snapshot-panel${dropOver ? " is-drop" : ""}`}
      data-testid="radio-snapshot-panel"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(MAP_METRIC_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropOver(false);
      }}
      onDrop={(event) => {
        setDropOver(false);
        const metric = readMapMetric(event.dataTransfer.getData(MAP_METRIC_MIME));
        if (!metric || metric.kind !== "metric") return;
        event.preventDefault();
        addMetric(metric.code);
      }}
    >
      <header className="radio-snapshot-header">
        <div>
          <h3>
            <Radio size={16} /> {title}
          </h3>
          <p data-testid="radio-snapshot-time">
            <Clock3 size={12} />
            {selectedPoint
              ? t("radioSnapshot.selectedSample", { seq: targetSeq })
              : t("radioSnapshot.latestSample")}
            {timeRow ? ` · ${timeRow.time_local ?? timeRow.time_label}` : ""}
          </p>
        </div>
        <WorkspacePanelMenu label={t("radioSnapshot.panelMenu")}>
          <DropdownMenuItem onSelect={() => setAddOpen(true)}>
            <Plus size={14} /> {t("radioSnapshot.addMetric")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSettingsOpen((value) => !value)}>
            <Settings2 size={14} /> {t("radioSnapshot.configure")}
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem
            checked={configuration.showBadges}
            onCheckedChange={(checked) => save({ ...configuration, showBadges: checked === true })}
          >
            {t("radioSnapshot.showBadges")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem
            onSelect={() => save(defaultSnapshotConfiguration(catalog, initialMetric))}
          >
            <RotateCcw size={14} /> {t("radioSnapshot.reset")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onRemove} className="text-destructive">
            <X size={14} /> {t("radioSnapshot.close")}
          </DropdownMenuItem>
        </WorkspacePanelMenu>
      </header>

      {configuration.showBadges && (
        <div className="radio-snapshot-badges" data-testid="radio-snapshot-badges">
          <span className="is-blue">
            {t("radioSnapshot.servingCell")}:{" "}
            {serving?.cell_pci != null ? `PCI ${serving.cell_pci}` : t("radioSnapshot.na")}
          </span>
          <span className="is-violet">
            {t("radioSnapshot.tech")}:{" "}
            {systems.length ? systems.join(" + ") : t("radioSnapshot.na")}
          </span>
          <span className="is-green" title={t("radioSnapshot.rrcUnavailableHint")}>
            {t("radioSnapshot.rrcState")}: {t("radioSnapshot.na")}
          </span>
          <span className="is-blue">
            {t("radioSnapshot.anchor")}:{" "}
            {anchors.length ? anchors.join(" · ") : t("radioSnapshot.na")}
          </span>
          <span className="is-violet">
            {t("radioSnapshot.cell")}: {cells.length ? cells.join(" · ") : t("radioSnapshot.na")}
          </span>
        </div>
      )}

      {addOpen && (
        <section className="radio-snapshot-picker" data-testid="radio-snapshot-picker">
          <div className="radio-snapshot-picker-head">
            <strong>{t("radioSnapshot.addMetric")}</strong>
            <button
              type="button"
              className="kpi-icon"
              onClick={() => setAddOpen(false)}
              aria-label={t("radioSnapshot.closePicker")}
            >
              <X size={14} />
            </button>
          </div>
          <input
            autoFocus
            value={metricSearch}
            onChange={(event) => setMetricSearch(event.target.value)}
            placeholder={t("radioSnapshot.searchMetrics")}
            aria-label={t("radioSnapshot.searchMetrics")}
          />
          <div className="radio-snapshot-picker-list">
            {choices.slice(0, 40).map((metric) => (
              <button key={metric.code} type="button" onClick={() => addMetric(metric.code)}>
                <span>{metric.label}</span>
                <small>
                  {metric.tech} · {metric.unit}
                </small>
              </button>
            ))}
            {!choices.length && <p>{t("radioSnapshot.noAvailableMetric")}</p>}
          </div>
        </section>
      )}

      {error && (
        <p className="radio-snapshot-state" role="alert">
          {t("radioSnapshot.loadError")}
        </p>
      )}
      {loading && (
        <p className="radio-snapshot-state" role="status">
          {t("radioSnapshot.loading")}
        </p>
      )}
      {!loading && !error && configuration.metrics.length === 0 && (
        <p className="radio-snapshot-state">{t("radioSnapshot.empty")}</p>
      )}
      {!error && configuration.metrics.length > 0 && (
        <div className="radio-snapshot-metrics" aria-busy={loading}>
          {configuration.metrics.map((code, index) => {
            const info = metricByCode.get(code);
            const column = columns.get(code);
            const row = populatedRows.find((candidate) => candidate.values[code] != null);
            const raw = row?.values[code];
            const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
            const threshold = configuration.thresholds[code] ?? defaultSnapshotThreshold(code);
            const color = value == null ? "#94a3b8" : snapshotValueColor(value, threshold);
            const position = value == null ? 0 : snapshotBarPosition(value, threshold);
            return (
              <div className="radio-snapshot-metric-wrap" key={code}>
                <div
                  className="radio-snapshot-metric"
                  data-testid={`radio-snapshot-metric-${code}`}
                >
                  <div
                    className="radio-snapshot-metric-name"
                    title={column?.label ?? info?.label ?? code}
                  >
                    <strong>{column?.label ?? info?.label ?? code}</strong>
                    <small>{code}</small>
                  </div>
                  <div className="radio-snapshot-value">
                    {value == null
                      ? t("radioSnapshot.na")
                      : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    {value != null && (column?.unit ?? info?.unit)
                      ? ` ${column?.unit ?? info?.unit}`
                      : ""}
                  </div>
                  <div className="radio-snapshot-bar" aria-label={t("radioSnapshot.rangePosition")}>
                    <span style={{ width: `${position}%`, backgroundColor: color }} />
                  </div>
                  <div className="radio-snapshot-row-actions">
                    <button
                      type="button"
                      className="kpi-icon"
                      disabled={index === 0}
                      onClick={() => moveMetric(index, -1)}
                      aria-label={t("radioSnapshot.moveUp")}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="kpi-icon"
                      disabled={index === configuration.metrics.length - 1}
                      onClick={() => moveMetric(index, 1)}
                      aria-label={t("radioSnapshot.moveDown")}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      className="kpi-icon"
                      onClick={() => removeMetric(code)}
                      aria-label={t("radioSnapshot.removeMetric", { metric: info?.label ?? code })}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                {settingsOpen && (
                  <div
                    className="radio-snapshot-thresholds"
                    data-testid={`radio-snapshot-thresholds-${code}`}
                  >
                    {(["min", "max", "warning", "good"] as const).map((field) => (
                      <label key={field}>
                        {t(`radioSnapshot.${field}`)}
                        <input
                          type="number"
                          step="any"
                          value={threshold[field]}
                          onChange={(event) =>
                            save({
                              ...configuration,
                              thresholds: {
                                ...configuration.thresholds,
                                [code]: { ...threshold, [field]: Number(event.target.value) },
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      {t("radioSnapshot.direction")}
                      <select
                        value={threshold.direction}
                        onChange={(event) =>
                          save({
                            ...configuration,
                            thresholds: {
                              ...configuration.thresholds,
                              [code]: {
                                ...threshold,
                                direction: event.target.value as "higher" | "lower",
                              },
                            },
                          })
                        }
                      >
                        <option value="higher">{t("radioSnapshot.higherIsBetter")}</option>
                        <option value="lower">{t("radioSnapshot.lowerIsBetter")}</option>
                      </select>
                    </label>
                    {threshold.colors.map((valueColor, colorIndex) => (
                      <label key={colorIndex}>
                        {t("radioSnapshot.color", { n: colorIndex + 1 })}
                        <input
                          type="color"
                          value={valueColor}
                          onChange={(event) => {
                            const colors = [...threshold.colors] as [string, string, string];
                            colors[colorIndex] = event.target.value;
                            save({
                              ...configuration,
                              thresholds: {
                                ...configuration.thresholds,
                                [code]: { ...threshold, colors },
                              },
                            });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button type="button" className="radio-snapshot-add" onClick={() => setAddOpen(true)}>
        <Plus size={13} /> {t("radioSnapshot.addMetric")}
      </button>
    </article>
  );
}
