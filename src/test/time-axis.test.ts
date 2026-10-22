import { describe, expect, it } from "vitest";
import {
  formatTick,
  isClockAvailable,
  tooltipTriple,
  type TimeAxisMeta,
} from "@/features/kpi/time-axis";

// 1.99.1 (lot C axe X temps) — unités du compute Clock. Même math que back
// metrics_v3.py:341-343 (origin_ts seconds-of-day + t_rel_s, modulo 86400).

const BCNE_META: TimeAxisMeta = {
  nmf_start_at: "11.06.2026 10:35:20.055",
  origin_ts: "10:35:22.249",
  utc_offset_min: 120,
  capture_date: "2026-06-11",
};

const WITHOUT_START: TimeAxisMeta = {
  nmf_start_at: null,
  origin_ts: "10:35:22.249",
  utc_offset_min: 120,
  capture_date: null,
};

describe("time-axis helpers", () => {
  it("isClockAvailable requires nmf_start_at and utc_offset_min", () => {
    expect(isClockAvailable(BCNE_META)).toBe(true);
    expect(isClockAvailable(WITHOUT_START)).toBe(false);
    expect(isClockAvailable({ ...BCNE_META, utc_offset_min: null })).toBe(false);
    expect(isClockAvailable(undefined)).toBe(false);
  });

  it("formatTick Clock local reproduces origin_ts + t_rel_s (HH:MM:SS)", () => {
    expect(formatTick(0, "clock-local", BCNE_META)).toBe("10:35:22");
    expect(formatTick(1.099, "clock-local", BCNE_META)).toBe("10:35:23");
    expect(formatTick(60, "clock-local", BCNE_META)).toBe("10:36:22");
    // Même convention que back time_label pour la Table (origin + t_rel_s).
  });

  it("formatTick Clock UTC subtracts utc_offset_min * 60", () => {
    // 120 min = 2h → local 10:35:22 → UTC 08:35:22
    expect(formatTick(0, "clock-utc", BCNE_META)).toBe("08:35:22");
  });

  it("formatTick Capture time keeps the integer seconds", () => {
    expect(formatTick(0, "capture", BCNE_META)).toBe("0 s");
    expect(formatTick(200, "capture", BCNE_META)).toBe("200 s");
    expect(formatTick(799.4, "capture", BCNE_META)).toBe("799 s");
  });

  it("formatTick falls back to Capture time when clock unavailable", () => {
    expect(formatTick(120, "clock-local", WITHOUT_START)).toBe("120 s");
    expect(formatTick(120, "clock-utc", WITHOUT_START)).toBe("120 s");
  });

  it("tooltipTriple exposes local, utc, capture together (ms precision)", () => {
    const t = tooltipTriple(1.099, BCNE_META);
    expect(t.local).toBe("10:35:23.348");
    expect(t.utc).toBe("08:35:23.348");
    expect(t.capture).toBe("1.099 s");
  });

  it("tooltipTriple drops local/utc when clock unavailable (never invented)", () => {
    const t = tooltipTriple(1.099, WITHOUT_START);
    expect(t.local).toBeNull();
    expect(t.utc).toBeNull();
    expect(t.capture).toBe("1.099 s");
  });

  it("formatTick wraps modulo 86400 (never invents a date)", () => {
    // origin 10:35:22 + 14h (50400s) = 00:35:22 next day in human calendar,
    // but display stays HH:MM:SS modulo 24h (same as back time_label).
    expect(formatTick(50400, "clock-local", BCNE_META)).toBe("00:35:22");
  });
});
