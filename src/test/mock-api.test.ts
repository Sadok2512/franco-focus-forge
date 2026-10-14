import { describe, expect, it } from "vitest";
import { getOverview } from "@/lib/api/client";
import { severityOf } from "@/lib/api/schemas";

describe("mock API", () => {
  it("is deterministic across calls", async () => {
    const a = await getOverview({ project: "idf-t3-2026" });
    const b = await getOverview({ project: "idf-t3-2026" });
    expect(a.kpis).toEqual(b.kpis);
  });
  it("operator filter restricts points", async () => {
    const d = await getOverview({ project: "idf-t3-2026", op: ["SFR"] });
    expect(d.points.every((p) => p.operator === "SFR")).toBe(true);
  });
  it("processing project yields no measurements, KPI is null not zero", async () => {
    const d = await getOverview({ project: "lille-indoor-2026" });
    expect(d.points.length).toBe(0);
    expect(d.kpis[0]!.value).toBeNull();
  });
  it("latency severity: lower is better", () => {
    expect(severityOf("latency", 20)).toBe("good");
    expect(severityOf("latency", 90)).toBe("bad");
  });
});
