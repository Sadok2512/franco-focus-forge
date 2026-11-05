import { type HTMLAttributes, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Settings2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_LEGEND_SETTINGS,
  MAX_CLASSES,
  MIN_CLASSES,
  type MetricClass,
  type MetricLegendSettings,
} from "./metric-classes";

/**
 * Shared map-legend building blocks.
 *
 * The drive RSRP legend is the reference for every map legend in the app: a
 * bold section title with its visibility and close controls, one row per class
 * (optional checkbox to hide/show it, a small colour swatch, the class name,
 * then the value and count right-aligned in muted tabular figures) and a
 * bordered settings block underneath.
 */

/** Swatch shapes: a filled class dot, a link line, or a hollow position ring. */
export type MapLegendSwatch = "dot" | "line" | "ring";

/** One legend group: a bold title above its rows, optional action button(s). */
export function MapLegendSection({
  title,
  action,
  children,
  ...rest
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section className="space-y-2" {...rest}>
      {action ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 font-semibold">{title}</span>
          <span className="flex shrink-0 items-center gap-1">{action}</span>
        </div>
      ) : title ? (
        <div className="font-semibold">{title}</div>
      ) : null}
      {children}
    </section>
  );
}

/** The rows of one legend group, stacked with the reference spacing. */
export function MapLegendList({
  label,
  children,
  ...rest
}: { label?: string; children: ReactNode } & HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className="space-y-1" aria-label={label} {...rest}>
      {children}
    </ul>
  );
}

/**
 * One legend row. With `onToggle` it becomes a checkbox row (the class can be
 * hidden on the map); without it the row is a plain reading of the swatch.
 */
export function MapLegendRow({
  color,
  label,
  meta,
  swatch = "dot",
  checked,
  onToggle,
  title,
  lineStyle = "solid",
  lineWidth = 2,
}: {
  color: string;
  label: ReactNode;
  meta?: ReactNode;
  swatch?: MapLegendSwatch;
  checked?: boolean;
  onToggle?: () => void;
  title?: string;
  lineStyle?: "solid" | "dashed";
  lineWidth?: number;
}) {
  const swatchEl =
    swatch === "line" ? (
      <span
        aria-hidden="true"
        className="h-0 w-5 shrink-0 border-t"
        style={{ borderColor: color, borderTopStyle: lineStyle, borderTopWidth: lineWidth }}
      />
    ) : swatch === "ring" ? (
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full border-2"
        style={{ borderColor: color }}
      />
    ) : (
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
    );
  const body = (
    <>
      {swatchEl}
      <span className="min-w-0 flex-1">{label}</span>
      {meta !== undefined && (
        <span className="shrink-0 tabular-nums text-muted-foreground">{meta}</span>
      )}
    </>
  );
  return (
    <li>
      {onToggle ? (
        <label className="flex cursor-pointer items-center gap-2" title={title}>
          <input type="checkbox" checked={checked ?? true} onChange={onToggle} />
          {body}
        </label>
      ) : (
        <span className="flex items-center gap-2" title={title}>
          {body}
        </span>
      )}
    </li>
  );
}

/** Bordered controls block below the rows (class count, colours, links). */
export function MapLegendSettings({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="space-y-1 border-t pt-2">
      <legend className="font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Shared compact key for radio-link evidence. It explains line semantics
 * without adding another floating map control. */
export function MapLinkConfidenceLegend() {
  const { t } = useTranslation();
  return (
    <div className="measurement-link-style-legend" aria-label={t("mapPointPopup.lineStyles")}>
      <span>
        <span className="measurement-popup-line" aria-hidden="true" />
        {t("mapPointPopup.solid")}
      </span>
      <span>
        <span className="measurement-popup-line is-probable" aria-hidden="true" />
        {t("mapPointPopup.dashed")}
      </span>
    </div>
  );
}

/** Compact, closed-by-default settings content shared by every numeric metric. */
export function MetricLegendSettingsPanel({
  metric,
  classes,
  settings,
  onChange,
  onClose,
}: {
  metric: string;
  classes: MetricClass[];
  settings: MetricLegendSettings;
  onChange: (next: MetricLegendSettings) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const update = (patch: Partial<MetricLegendSettings>) => onChange({ ...settings, ...patch });
  const addThreshold = () => {
    if (settings.thresholds.length >= MAX_CLASSES - 1) return;
    const finite = classes.flatMap((item) =>
      Number.isFinite(item.min) && Number.isFinite(item.max) ? [(item.min + item.max) / 2] : [],
    );
    const fallback = finite[0] ?? 0;
    update({ mode: "custom", thresholds: [...settings.thresholds, fallback] });
  };
  return (
    <div
      className="space-y-2 rounded border border-border bg-background p-2 text-xs shadow-sm"
      data-testid="metric-legend-settings"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="truncate">{t("mapLegend.settingsFor", { metric })}</strong>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={onClose}
          aria-label={t("mapLegend.closeSettings")}
        >
          <X size={12} />
        </Button>
      </div>
      <label className="flex items-center justify-between gap-2">
        {t("mapLegend.mode")}
        <select
          className="rounded border bg-background"
          value={settings.mode}
          onChange={(event) => update({ mode: event.target.value as "auto" | "custom" })}
        >
          <option value="auto">{t("mapLegend.auto")}</option>
          <option value="custom">{t("mapLegend.custom")}</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        {t("mapWorkspace.legendCount")}
        <select
          className="rounded border bg-background"
          value={settings.count ?? 5}
          onChange={(event) => update({ count: Number(event.target.value), colors: {} })}
        >
          {Array.from(
            { length: MAX_CLASSES - MIN_CLASSES + 1 },
            (_, index) => index + MIN_CLASSES,
          ).map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-1">
        <label>
          {t("mapLegend.min")}
          <input
            className="w-full rounded border bg-background px-1"
            type="number"
            value={settings.min ?? ""}
            onChange={(event) =>
              update({ min: event.target.value === "" ? null : Number(event.target.value) })
            }
          />
        </label>
        <label>
          {t("mapLegend.max")}
          <input
            className="w-full rounded border bg-background px-1"
            type="number"
            value={settings.max ?? ""}
            onChange={(event) =>
              update({ max: event.target.value === "" ? null : Number(event.target.value) })
            }
          />
        </label>
      </div>
      {settings.mode === "custom" && (
        <div className="space-y-1">
          {settings.thresholds.map((threshold, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                aria-label={t("mapLegend.threshold", { index: index + 1 })}
                className="min-w-0 flex-1 rounded border bg-background px-1"
                type="number"
                value={threshold}
                onChange={(event) =>
                  update({
                    thresholds: settings.thresholds.map((value, at) =>
                      at === index ? Number(event.target.value) : value,
                    ),
                  })
                }
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() =>
                  update({ thresholds: settings.thresholds.filter((_, at) => at !== index) })
                }
                aria-label={t("mapLegend.removeThreshold", { index: index + 1 })}
              >
                <X size={11} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="h-7 px-1" onClick={addThreshold}>
            {t("mapLegend.addRange")}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {classes.map((item, index) => (
          <input
            key={item.id}
            type="color"
            aria-label={t("mapLegend.classColour", { index: index + 1 })}
            value={item.color}
            onChange={(event) =>
              update({ colors: { ...settings.colors, [index]: event.target.value } })
            }
            className="h-5 w-6 cursor-pointer border-0 p-0"
          />
        ))}
      </div>
      <label className="flex gap-1">
        <input
          type="checkbox"
          checked={settings.showCount}
          onChange={(event) => update({ showCount: event.target.checked })}
        />
        {t("mapLegend.showCount")}
      </label>
      <label className="flex gap-1">
        <input
          type="checkbox"
          checked={settings.showPercent}
          onChange={(event) => update({ showPercent: event.target.checked })}
        />
        {t("mapLegend.showPercent")}
      </label>
      <label className="flex gap-1">
        <input
          type="checkbox"
          checked={settings.gradient}
          onChange={(event) => update({ gradient: event.target.checked })}
        />
        {t("mapLegend.gradient")}
      </label>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-1"
        onClick={() => onChange(DEFAULT_LEGEND_SETTINGS)}
      >
        {t("mapWorkspace.legendReset")}
      </Button>
    </div>
  );
}

/**
 * Header controls every map legend carries: a visibility switch (the metric
 * points stay on the map or disappear) and a close button (the legend block
 * collapses to a single reopen button).
 */
export function MapLegendHeaderActions({
  expanded,
  onToggleExpanded,
  visible,
  onToggleVisible,
  settingsOpen,
  onToggleSettings,
  settingsLabel,
  onClose,
  visibilityLabel,
  closeLabel,
}: {
  expanded?: boolean;
  onToggleExpanded?: () => void;
  visible: boolean;
  onToggleVisible: () => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  settingsLabel?: string;
  onClose: () => void;
  visibilityLabel: string;
  closeLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      {onToggleExpanded && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          aria-label={expanded ? t("mapLegend.collapseMetric") : t("mapLegend.expandMetric")}
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        aria-label={visibilityLabel}
        aria-pressed={visible}
        onClick={onToggleVisible}
      >
        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </Button>
      {onToggleSettings && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          aria-label={settingsLabel ?? t("mapLegend.openSettings")}
          aria-expanded={settingsOpen}
          onClick={onToggleSettings}
        >
          <Settings2 size={14} />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <X size={14} />
      </Button>
    </>
  );
}

/** Compact replacement for a closed legend block, so it stays recoverable. */
export function MapLegendReopen({
  label,
  onOpen,
  openLabel,
}: {
  label: ReactNode;
  onOpen: () => void;
  openLabel: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1 text-left text-xs"
      onClick={onOpen}
    >
      <span className="min-w-0 truncate font-semibold">{label}</span>
      <span className="shrink-0 font-medium text-primary underline">{openLabel}</span>
    </button>
  );
}
