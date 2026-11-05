// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readPreferencesWithLinkReset } from "@/features/kpi/mapLinkPreferenceMigration";
import {
  metricMapPreferenceKey,
  readMetricMapPreferences,
} from "@/features/kpi/metricMapPreferences";

describe("radio-link preference migration", () => {
  beforeEach(() => localStorage.clear());

  it("resets legacy KPI link visibility once while preserving visual settings", () => {
    localStorage.setItem(
      "bc4.metric-map.v1.workspace.rsrp",
      JSON.stringify({
        palette: "ocean",
        pointSize: 7,
        links: { serving: false, neighbour: false, nr_anchor: false },
      }),
    );

    expect(readMetricMapPreferences("workspace", "rsrp")).toEqual({
      palette: "ocean",
      pointSize: 7,
      links: { serving: true, neighbour: true, nr_anchor: true },
    });
    expect(metricMapPreferenceKey("workspace", "rsrp")).toContain(".v2.");
  });

  it("respects a user choice saved after the KPI migration", () => {
    localStorage.setItem(
      metricMapPreferenceKey("workspace", "rsrp"),
      JSON.stringify({
        palette: "coverage",
        pointSize: 3,
        links: { serving: false, neighbour: true, nr_anchor: true },
      }),
    );
    expect(readMetricMapPreferences("workspace", "rsrp").links.serving).toBe(false);
  });

  it("resets the legacy shared-map links once and persists the migrated state", () => {
    localStorage.setItem(
      "bc4.map.driveRsrp.v2",
      JSON.stringify({
        on: true,
        opacity: 55,
        hidden: ["excellent"],
        links: { serving: false, neighbour: false, nr_anchor: false },
      }),
    );
    const defaults = {
      on: true,
      opacity: 90,
      hidden: [] as string[],
      links: { serving: true, neighbour: true, nr_anchor: true },
    };
    const migrated = readPreferencesWithLinkReset(
      "bc4.map.driveRsrp.v3",
      "bc4.map.driveRsrp.v2",
      defaults,
    );
    expect(migrated.opacity).toBe(55);
    expect(migrated.links).toEqual({ serving: true, neighbour: true, nr_anchor: true });

    localStorage.setItem(
      "bc4.map.driveRsrp.v3",
      JSON.stringify({ ...migrated, links: { ...migrated.links, serving: false } }),
    );
    expect(
      readPreferencesWithLinkReset("bc4.map.driveRsrp.v3", "bc4.map.driveRsrp.v2", defaults).links
        .serving,
    ).toBe(false);
  });
});
