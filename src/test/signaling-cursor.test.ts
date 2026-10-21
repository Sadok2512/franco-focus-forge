import { describe, expect, it } from "vitest";
import type { SigCapture, SigSeries } from "@/lib/api/signaling-schemas";
import { callsAt, connectivityAt, eventsAt, prevPoint, rfReadings, snapTimes, stepTime, tasksAt } from "@/features/signaling/cursor";

const series = (key: string, points: { t: number; v: number | null }[]): SigSeries => ({ key, label: key, unit: "dBm", points });

const capture = (over: Partial<SigCapture> = {}): SigCapture => ({
  id: "c1",
  name: "Test",
  captured_at: "2026-01-01T00:00:00Z",
  tech: "NR",
  message_count: 0,
  duration_s: 1000,
  connectivity: [
    { state: "LTE", start_s: 0, end_s: 500 },
    { state: "EN-DC", start_s: 200, end_s: 800 },
  ],
  events: [
    { id: "e1", t: 100, name: "RRC Setup", tech: "LTE", severity: "success", message_index: 1, ecgi: null, pci: null },
    { id: "e2", t: 245.318, name: "SCG Addition", tech: "EN-DC", severity: "event", message_index: 1012, ecgi: "20815-4312895", pci: 349 },
  ],
  tasks: [{ id: "t1", dir: "DL", start_s: 120.452, end_s: 205.318, label: "Transfer DL", throughput: "85,6 Mb", message_index: 5 }],
  calls: [
    { id: "c1", kind: "VoNR", attempt_s: 120.452, start_s: 122, end_s: 194.558, state: "released", message_index: 7 },
    { id: "c2", kind: "VoLTE", attempt_s: 900, start_s: null, end_s: null, state: "dropped", message_index: null },
  ],
  mobility: [{ id: "m1", t: 412.703, name: "LTE → NR HO", kind: "ho", message_index: 20 }],
  measurements: [series("rsrp_nr", [{ t: 10, v: -90 }, { t: 50, v: null }, { t: 240, v: -82.3 }, { t: 500, v: -80 }])],
  track: [],
  events_gps: [],
  ...over,
});

describe("curseur temporel — mesures RF", () => {
  it("prevPoint retourne la dernière observation prouvée à ou avant t", () => {
    const s = series("rsrp_nr", [{ t: 10, v: -90 }, { t: 240, v: -82.3 }]);
    expect(prevPoint(s, 245.318)).toEqual({ t: 240, v: -82.3 });
    expect(prevPoint(s, 10)).toEqual({ t: 10, v: -90 });
  });

  it("prevPoint ignore les points null et ne prend jamais une mesure future", () => {
    const s = series("rsrp_nr", [{ t: 10, v: -90 }, { t: 50, v: null }, { t: 500, v: -80 }]);
    expect(prevPoint(s, 60)).toEqual({ t: 10, v: -90 });
    expect(prevPoint(s, 5)).toBeNull();
  });

  it("rfReadings signale l'écart temporel et l'absence de mesure", () => {
    const [r] = rfReadings(capture(), 245.318);
    expect(r!.value).toBeCloseTo(-82.3);
    expect(r!.dt).toBeCloseTo(5.318);
    const [none] = rfReadings(capture(), 5);
    expect(none!.value).toBeNull();
  });
});

describe("curseur temporel — états et tâches", () => {
  it("LTE et NSA peuvent se chevaucher au même instant", () => {
    expect(connectivityAt(capture(), 300)).toEqual(["LTE", "EN-DC"]);
    expect(connectivityAt(capture(), 100)).toEqual(["LTE"]);
    expect(connectivityAt(capture(), 900)).toEqual([]);
  });

  it("tasksAt ne retient que les intervalles prouvés contenant t", () => {
    expect(tasksAt(capture(), 150).map((k) => k.id)).toEqual(["t1"]);
    expect(tasksAt(capture(), 300)).toEqual([]);
  });

  it("un appel non confirmé n'apparaît jamais comme actif", () => {
    expect(callsAt(capture(), 150).map((c) => c.id)).toEqual(["c1"]);
    expect(callsAt(capture(), 950)).toEqual([]);
  });

  it("eventsAt ne matche que le timestamp exact (snap)", () => {
    expect(eventsAt(capture(), 245.318).map((e) => e.id)).toEqual(["e2"]);
    expect(eventsAt(capture(), 245.5)).toEqual([]);
  });
});

describe("curseur temporel — navigation clavier", () => {
  it("snapTimes contient événements, mobilité, bornes de tâches et appels, triés", () => {
    const ts = snapTimes(capture());
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(ts).toContain(245.318);
    expect(ts).toContain(412.703);
    expect(ts).toContain(120.452);
    expect(ts).toContain(194.558);
    expect(ts).toContain(900);
  });

  it("stepTime va à l'instant suivant/précédent sans arrondi", () => {
    const ts = snapTimes(capture());
    expect(stepTime(ts, 100, 1, 0)).toBe(120.452);
    expect(stepTime(ts, 245.318, -1, 0)).toBe(205.318);
    expect(stepTime(ts, null, 1, 42)).toBe(42);
    expect(stepTime(ts, 900, 1, 0)).toBe(900); // dernier instant : on reste
  });
});
