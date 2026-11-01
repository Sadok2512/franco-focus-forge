import { type HTMLAttributes, type ReactNode } from "react";

/**
 * Shared map-legend building blocks.
 *
 * The drive RSRP legend is the reference for every map legend in the app: a
 * bold section title, one row per class (optional checkbox to hide/show it, a
 * small colour swatch, the class name, then the value and count right-aligned
 * in muted tabular figures) and a bordered settings block underneath.
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
}: {
  color: string;
  label: ReactNode;
  meta?: ReactNode;
  swatch?: MapLegendSwatch;
  checked?: boolean;
  onToggle?: () => void;
  title?: string;
}) {
  const swatchEl =
    swatch === "line" ? (
      <span
        aria-hidden="true"
        className="h-0 w-5 shrink-0 border-t-[3px]"
        style={{ borderColor: color }}
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
export function MapLegendSettings({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-1 border-t pt-2">
      <legend className="font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}
