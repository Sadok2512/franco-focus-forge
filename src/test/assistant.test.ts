// Assistant IA guards G2–G6 (logic level).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSISTANT_LATENCY, DICT_LATENCY, applyFilters, postAssistant } from "@/lib/api/client";
import { pointsFor, PROJECTS } from "@/lib/api/fixtures";
import { rrcOutcome } from "@/mocks/assistant";
import type { AssistantFilters, AssistantResponse } from "@/lib/api/assistant-schemas";

ASSISTANT_LATENCY.scale = 0;
DICT_LATENCY.ms = 0;
const P = "idf-t3-2026";
const ask = (question: string, filters: AssistantFilters = {}, project_id = P) =>
  postAssistant({ project_id, conversation_id: "c1", question, filters });
const kinds = (r: AssistantResponse) =>
  r.blocks.flatMap((b) => (b.type === "text" ? b.claims.map((c) => c.kind) : []));

describe("G2 standalone route", () => {
  it("assistant has its own route and KPI page has no assistant sidebar", () => {
    expect(readFileSync("src/routes/_app.assistant.tsx", "utf8")).toContain(
      'createFileRoute("/_app/assistant")',
    );
    expect(readFileSync("src/routes/_app.kpi.tsx", "utf8")).not.toMatch(/Assistant|assistant/);
  });
});

describe("G3 context passthrough", () => {
  it("filters are passed unchanged and reflected in sources", async () => {
    const f: AssistantFilters = { op: ["Orange", "SFR"], tech: ["NR"], dep: ["75"] };
    const r = await ask("Analyse les performances NR par bande n78 et n28.", f);
    expect(r.effective_filters).toEqual(f);
    const expected = applyFilters(pointsFor(PROJECTS.find((p) => p.id === P)!), f).length;
    expect(r.evidence.find((e) => e.source_type === "measurement_points")!.sample_count).toBe(
      expected,
    );
  });
  it("filters invalid for the project are dropped with a warning", async () => {
    const r = await ask(
      "Compare les débits DL LTE et NR.",
      { band: ["n78", "B7"] },
      "lyon-drive-2026",
    );
    expect(r.effective_filters.band).toEqual(["n78"]);
    expect(r.warnings[0]).toContain("band=B7");
  });
});

describe("G4 provenance", () => {
  it("RRC success table equals the documented formula on the filtered population", async () => {
    const r = await ask("Compare le RRC Success Rate entre Orange et SFR à Paris.");
    const t = r.blocks.find((b) => b.type === "table")!;
    if (t.type !== "table") throw new Error();
    const pts = pointsFor(PROJECTS.find((p) => p.id === P)!);
    for (const row of t.rows) {
      const out = pts
        .filter((p) => p.operator === row["op"])
        .map(rrcOutcome)
        .filter((x) => x != null);
      const ok = out.filter(Boolean).length;
      expect(row["att"]).toBe(out.length);
      expect(row["ok"]).toBe(ok);
      expect(row["rate"]).toBe(Math.round((ok / out.length) * 1000) / 10);
    }
    expect(t.rows.map((r) => r["op"])).toEqual(["Orange", "SFR"]);
  });
});

describe("G5 scenarios and states", () => {
  const cases: [string, string][] = [
    ["Compare le RRC Success Rate entre Orange et SFR à Paris.", "rrc_success"],
    ["Analyse les performances NR par bande n78 et n28.", "nr_bands"],
    ["Quels paramètres RRC diffèrent entre les opérateurs ?", "params"],
    ["Analyse les performances EN-DC.", "endc"],
    ["Où se trouvent les zones de faible SS-SINR ?", "coverage"],
    ["Identifie les zones candidates à un problème d'overshooting.", "overshooting"],
  ];
  it.each(cases)("%s → %s", async (q, sc) => {
    const r = await ask(q);
    expect(r.scenario).toBe(sc);
    expect(r.status).toBe("completed");
    expect(r.blocks.length).toBeGreaterThan(0);
  });
  it("is deterministic", async () => {
    const a = await ask(cases[0]![0]);
    const b = await ask(cases[0]![0]);
    expect(a.blocks).toEqual(b.blocks);
  });
  it("empty: processing project", async () => {
    const r = await ask(cases[0]![0], {}, "lille-indoor-2026");
    expect(r.scenario).toBe("empty");
    expect(kinds(r)).toEqual(["UNAVAILABLE"]);
  });
  it("error", async () => {
    const r = await ask("simule une erreur");
    expect(r.status).toBe("failed");
    expect(r.error?.code).toBe("UPSTREAM_ERROR");
  });
  it("cancelled: abort rejects", async () => {
    ASSISTANT_LATENCY.scale = 1;
    const ac = new AbortController();
    const p = postAssistant(
      { project_id: P, conversation_id: "c", question: cases[1]![0], filters: {} },
      { signal: ac.signal },
    );
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    ASSISTANT_LATENCY.scale = 0;
  });
});

describe("G6 evidence and no fabricated causes", () => {
  it("overshooting and UL are UNAVAILABLE without candidate zones", async () => {
    for (const q of [
      "Identifie les zones candidates à un problème d'overshooting.",
      "Quels sites présentent un faible débit UL ?",
    ]) {
      const r = await ask(q);
      expect(kinds(r)).toEqual(["UNAVAILABLE"]);
      expect(r.blocks.some((b) => b.type === "map" || b.type === "table")).toBe(false);
    }
  });
  it("interpretations never claim causality", async () => {
    const r = await ask("Compare le RRC Success Rate entre Orange et SFR à Paris.");
    const interp = r.blocks
      .flatMap((b) => (b.type === "text" ? b.claims : []))
      .filter((c) => c.kind === "INTERPRETED");
    expect(interp.length).toBeGreaterThan(0);
    for (const c of interp)
      expect(c.text).toMatch(/corrélation|hypothèse|pas d'une cause|n'est pas/);
  });
  it("small samples raise a warning", async () => {
    const r = await ask("Analyse les performances EN-DC.", { dep: ["94"], op: ["Free"] });
    expect(r.warnings.join(" ")).toMatch(/Échantillon faible|N\/D|Aucune/);
  });
});
