// Fixture before/after exécutable via vitest. Lance :
//
//   ./node_modules/.bin/vitest run audit/bc5-graph-real-capture-time/before-after.test.ts
//
// Les 3 captures viennent du DB bc4 (nmf_file.start_at + utc_offset_min),
// confirmées par :
//   SELECT c.capture_id, f.start_at, f.utc_offset_min
//   FROM nmf_capture c JOIN nmf_file f ON f.id = c.nmf_file_id
//   WHERE c.capture_id IN ('a4b0c321c52e','ecffb18dbd7f','daa2b1df250d');

import { describe, expect, it } from "vitest";
import {
  formatTick,
  timeAxisLabel,
  tooltipTriple,
  type TimeAxisMeta,
} from "@/features/kpi/time-axis";

const captures: Array<{ id: string; name: string; meta: TimeAxisMeta }> = [
  {
    id: "a4b0c321c52e",
    name: "Test_6",
    meta: {
      nmf_start_at: "10.06.2026 15:59:41.993",
      origin_ts: "15:59:41.993",
      utc_offset_min: 120,
      capture_date: "2026-06-10",
    },
  },
  {
    id: "ecffb18dbd7f",
    name: "ikea.2",
    meta: {
      nmf_start_at: "10.06.2026 17:23:54.686",
      origin_ts: "17:23:54.686",
      utc_offset_min: 120,
      capture_date: "2026-06-10",
    },
  },
  {
    id: "daa2b1df250d",
    name: "ikea.6",
    meta: {
      nmf_start_at: "10.06.2026 17:23:54.658",
      origin_ts: "17:23:54.658",
      utc_offset_min: 120,
      capture_date: "2026-06-10",
    },
  },
];

const points = [0, 1000, 2000, 3000, 4858];

describe("audit BC5 — real capture time before/after", () => {
  it.each(captures)("$name — axis + ticks AFTER fix show real clock", ({ meta, name }) => {
    const nameLocal = timeAxisLabel("clock-local", meta);
    const nameUtc = timeAxisLabel("clock-utc", meta);
    const nameCapture = timeAxisLabel("capture", meta);
    expect(nameLocal.startsWith("Local time")).toBe(true);
    expect(nameUtc.startsWith("UTC time")).toBe(true);
    expect(nameCapture.startsWith("Capture time")).toBe(true);

    // eslint-disable-next-line no-console
    console.log(`\n[audit] ${name} — axis names`);
    // eslint-disable-next-line no-console
    console.log(`  AFTER local  : ${nameLocal}`);
    // eslint-disable-next-line no-console
    console.log(`  AFTER UTC    : ${nameUtc}`);
    // eslint-disable-next-line no-console
    console.log(`  AFTER capture: ${nameCapture}`);
    // eslint-disable-next-line no-console
    console.log(`[audit] ${name} — ticks (t_rel_s | BEFORE | AFTER local | AFTER UTC | tooltip)`);
    for (const t of points) {
      const before = `${t} s`;
      const local = formatTick(t, "clock-local", meta);
      const utc = formatTick(t, "clock-utc", meta);
      const trip = tooltipTriple(t, meta);
      // eslint-disable-next-line no-console
      console.log(
        `  ${String(t).padStart(5)} | ${before.padEnd(10)} | ${local.padEnd(10)} | ${utc.padEnd(10)} | ${trip.local} · UTC ${trip.utc} · t ${trip.capture}`,
      );
      expect(local).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(utc).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(trip.local).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
      expect(trip.utc).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
      expect(trip.capture).toBe(`${t.toFixed(3)} s`);
    }
  });

  it("Test_6 — specific values verified against back time_label math", () => {
    const t6 = captures[0]!.meta;
    // origin 15:59:41.993 + 0  = 15:59:41 (floor)
    expect(formatTick(0, "clock-local", t6)).toBe("15:59:41");
    // origin + 1000 s = 16:16:21.993
    expect(formatTick(1000, "clock-local", t6)).toBe("16:16:21");
    // origin + 4858 s = 17:20:39.993
    expect(formatTick(4858, "clock-local", t6)).toBe("17:20:39");
    // UTC = local - 120 min
    expect(formatTick(0, "clock-utc", t6)).toBe("13:59:41");
    expect(formatTick(4858, "clock-utc", t6)).toBe("15:20:39");
  });

  it("midnight wrap — origin 23:30 + 7200 s = 01:30 modulo 24h", () => {
    const near: TimeAxisMeta = {
      nmf_start_at: "10.06.2026 23:30:00.000",
      origin_ts: "23:30:00.000",
      utc_offset_min: 120,
      capture_date: "2026-06-10",
    };
    expect(formatTick(7200, "clock-local", near)).toBe("01:30:00");
    expect(formatTick(7200, "clock-utc", near)).toBe("23:30:00");
  });

  it("missing #START/#UT → explicit fallback, never invented", () => {
    const nd: TimeAxisMeta = {
      nmf_start_at: null,
      origin_ts: "10:00:00.000",
      utc_offset_min: null,
      capture_date: null,
    };
    expect(timeAxisLabel("clock-local", nd)).toBe("Capture time (s) · clock unavailable");
    expect(formatTick(1000, "clock-local", nd)).toBe("1000 s");
    const trip = tooltipTriple(1000, nd);
    expect(trip.local).toBeNull();
    expect(trip.utc).toBeNull();
    expect(trip.capture).toBe("1000.000 s");
  });

  it("Superstream — chaque capture-local garde son origin ; concaténation = UTC", () => {
    const t6 = captures[0]!.meta;
    const ik6 = captures[2]!.meta;
    // Même t_rel_s = 0 pointe sur deux horloges différentes.
    expect(formatTick(0, "clock-local", t6)).toBe("15:59:41");
    expect(formatTick(0, "clock-local", ik6)).toBe("17:23:54");
    // En UTC absolu, les points de deux captures sont comparables.
    expect(formatTick(0, "clock-utc", t6)).toBe("13:59:41");
    expect(formatTick(0, "clock-utc", ik6)).toBe("15:23:54");
    // Même t_rel_s brut (0 s) ne pouvait pas être distingué en mode "capture".
    expect(formatTick(0, "capture", t6)).toBe("0 s");
    expect(formatTick(0, "capture", ik6)).toBe("0 s");
  });
});
