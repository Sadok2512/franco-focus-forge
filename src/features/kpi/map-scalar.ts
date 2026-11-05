/** Convert API scalars that are numerically meaningful on a map colour scale. */
export function numericMapScalar(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapScalarLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const label = String(value).trim();
  return label === "" ? null : label;
}
