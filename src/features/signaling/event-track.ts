import type { RfEvent } from "@/lib/api/signaling";

/**
 * The VM's /signaling/events response names its lanes canonically (mobilite,
 * connexion, services, …) and only sets `attrs.track` on state evidence.
 * Reading `attrs.track` alone would drop every other lane, so the canonical
 * lane is used as the fallback source of the presentation track.
 */
const laneToTrack: Record<string, string> = {
  mobilite: "mobility",
};

export function eventTrack(event: Pick<RfEvent, "attrs" | "lane">): string {
  return event.attrs.track ?? laneToTrack[event.lane] ?? "network";
}
