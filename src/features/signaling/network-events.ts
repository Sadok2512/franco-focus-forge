/** Presentation allowlist only; never alter source events or message queries. */
export const EXPLICIT_NETWORK_EVENT_TYPES = [
  "PSCELL_CHANGE",
  "SCG_ADD",
  "SCG_RELEASE",
  "RRRE",
  "RRF",
  "TUF",
  "LUF",
  "PBF",
] as const;

const explicitNetworkEventTypes = new Set<string>(EXPLICIT_NETWORK_EVENT_TYPES);

export function eventTypeCounts(events: ReadonlyArray<{ type: string }>) {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  return [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => ({
      type,
      count,
    }));
}

export function isAllowedNetworkEvent(event: { type: string; label: string }): boolean {
  if (explicitNetworkEventTypes.has(event.type.toUpperCase())) return true;
  return [event.type, event.label].some((value) => {
    const name = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      /rrc(?:connection|setup)?request/.test(name) ||
      /rrc(?:connection)?release/.test(name) ||
      name.includes("scg")
    );
  });
}
