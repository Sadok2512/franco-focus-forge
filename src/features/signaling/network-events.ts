/** Presentation allowlist only; never alter source events or message queries. */
export function isAllowedNetworkEvent(event: { type: string; label: string }): boolean {
  return [event.type, event.label].some((value) => {
    const name = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      /rrc(?:connection|setup)?request/.test(name) ||
      /rrc(?:connection)?release/.test(name) ||
      name.includes("scg")
    );
  });
}