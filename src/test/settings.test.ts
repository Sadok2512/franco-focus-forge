// Settings guards G2–G8 (logic level).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  SETTINGS_LATENCY, createKpi, createUser, exportMetadata, getAbout, getAiConfig, getUsers, patchKpi, patchUser,
  postGeoImport, putAiConfig, putAppearance, putOrganization, testAiConnection, validateGeo,
} from "@/lib/api/settings";
import { resetSettingsStore, SETTINGS_STORE } from "@/mocks/settings";
import { can } from "@/lib/permissions";
import { contrast } from "@/lib/appearance";
import { releaseNotes } from "@/lib/version";
import { parseCsv, parseXlsx, suggestMapping } from "@/features/settings/geography/parse";
import { reportCsv } from "@/features/settings/geography/GeographyPanel";
import type { Actor } from "@/lib/api/settings-schemas";

SETTINGS_LATENCY.ms = 0;
const admin: Actor = { login: "demo.ingenieur", role: "admin" };
const editor: Actor = { login: "m.martin", role: "editor" };
const viewer: Actor = { login: "p.leroy", role: "viewer" };
beforeEach(() => resetSettingsStore());
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as { code: string }).code; } };

describe("G2 permissions", () => {
  it("matrix: only admin manages users", () => {
    expect(can("admin", "users.write")).toBe(true);
    expect(can("editor", "users.write")).toBe(false);
    expect(can("viewer", "users.read")).toBe(false);
    expect(can("editor", "geo.write", { editor_can_edit_geo: true, editor_can_edit_kpi: false })).toBe(true);
    expect(can("editor", "kpi.write", { editor_can_edit_geo: true, editor_can_edit_kpi: false })).toBe(false);
  });
  it("mock really blocks forbidden mutations", async () => {
    const body = { login: "x.y", display_name: "X", role: "viewer" as const, password: "Abcdefghi1", password_confirm: "Abcdefghi1" };
    expect(await code(createUser(editor, body))).toBe("FORBIDDEN");
    expect(await code(createUser(viewer, body))).toBe("FORBIDDEN");
    expect(await code(getUsers(viewer))).toBe("FORBIDDEN");
    expect(await code(putOrganization(viewer, { ...SETTINGS_STORE.org, name: "X" }))).toBe("FORBIDDEN");
    expect(await code(putAiConfig(editor, { enabled: false, endpoint_url: "", model_code: "", provider: "Interne", auth_method: "none" }))).toBe("FORBIDDEN");
    expect(SETTINGS_STORE.users).toHaveLength(4);
  });
  it("unique login, password policy, confirmation, no secret stored", async () => {
    const base = { display_name: "N", role: "viewer" as const };
    expect(await code(createUser(admin, { ...base, login: "m.martin", password: "Abcdefghi1", password_confirm: "Abcdefghi1" }))).toBe("CONFLICT");
    expect(await code(createUser(admin, { ...base, login: "n.n", password: "short", password_confirm: "short" }))).toBe("VALIDATION");
    expect(await code(createUser(admin, { ...base, login: "n.n", password: "Abcdefghi1", password_confirm: "Abcdefghi2" }))).toBe("VALIDATION");
    const u = await createUser(admin, { ...base, login: "n.n", password: "Abcdefghi1", password_confirm: "Abcdefghi1" });
    expect(JSON.stringify(u)).not.toContain("Abcdefghi1");
    expect(JSON.stringify(SETTINGS_STORE)).not.toContain("Abcdefghi1");
  });
  it("last active admin cannot be deactivated", async () => {
    expect(await code(patchUser(admin, "u1", { active: false }))).toBe("CONFLICT");
    expect(await code(patchUser(admin, "u1", { role: "viewer" }))).toBe("CONFLICT");
  });
});

describe("G3 geography import", () => {
  const csv = "Plaque;DR;Département;id_site;Site;lat;lng\nIDF;DR Paris;75;S1;Opéra;48.87;2.33\nIDF;DR Paris;75;S1;Doublon;48.8;2.3\nIDF;DR Ouest;75;S3;Conflit;48.8;2.3\nIDF;DR Paris;75;S4;SansGPS;;\nIDF;DR Paris;75;S5;Faux;999;2\n;DR Paris;75;S6;SansPlaque;48;2";
  it("parses CSV and suggests a mapping", () => {
    const t = parseCsv(csv);
    expect(t.columns).toEqual(["Plaque", "DR", "Département", "id_site", "Site", "lat", "lng"]);
    const m = suggestMapping(t.columns);
    expect(m).toMatchObject({ plaque: "Plaque", dr: "DR", departement: "Département", site_id: "id_site", latitude: "lat", longitude: "lng" });
  });
  it("flags duplicates, parent-child, missing/invalid coords, missing ids", () => {
    const t = parseCsv(csv);
    const r = validateGeo({ mapping: suggestMapping(t.columns), rows: t.rows });
    expect(r.total).toBe(6);
    expect(r.valid).toBe(2); // S1 + S4 (warning only)
    expect(r.warnings).toBe(1);
    expect(r.points.map((p) => p.site_id)).toEqual(["S1"]);
    const msgs = r.issues.map((i) => i.message).join("|");
    expect(msgs).toMatch(/Doublon/); expect(msgs).toMatch(/Incohérence/); expect(msgs).toMatch(/Coordonnées invalides/); expect(msgs).toMatch(/Plaque manquant/);
    expect(reportCsv(r).split("\n")[0]).toBe("ligne;niveau;champ;message");
  });
  it("unmapped required column rejects everything", () => {
    const t = parseCsv(csv);
    const r = validateGeo({ mapping: { ...suggestMapping(t.columns), site_id: null }, rows: t.rows });
    expect(r.valid).toBe(0);
  });
  it("parses XLSX and commits a new versioned reference", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["plaque", "dr", "departement", "site_id", "site"], ["IDF", "DR Paris", "75", "A1", "Site A"]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Z");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const t = await parseXlsx(buf);
    const rep = await postGeoImport(admin, { filename: "z.xlsx", mapping: suggestMapping(t.columns), rows: t.rows, commit: true });
    expect(rep.committed?.version).toBe(2);
    expect(SETTINGS_STORE.geo.filter((g) => g.status === "active")).toHaveLength(1);
    expect(await code(postGeoImport(viewer, { filename: "z", mapping: {}, rows: [], commit: true }))).toBe("FORBIDDEN");
  });
});

describe("G4 KPI catalogue", () => {
  const k = { code: "NEW_KPI", name: "N", description: "", family: "F", tech: "LTE", unit: "%", formula: "1/0; process.exit()", source_events: [] };
  it("code unique, formula kept as inert text, versioned", async () => {
    const c = await createKpi(admin, k);
    expect(c.formula).toBe("1/0; process.exit()");
    expect(c.version).toBe(1);
    expect(await code(createKpi(admin, k))).toBe("CONFLICT");
    const p = await patchKpi(admin, "NEW_KPI", { formula: "A + B" });
    expect(p.version).toBe(2); expect(p.history).toHaveLength(2);
    expect(await code(createKpi(editor, { ...k, code: "X2" }))).toBe("FORBIDDEN");
  });
  it("no value field and no evaluation in sources", () => {
    expect(Object.keys(SETTINGS_STORE.kpis[0]!)).not.toContain("value");
    const src = readFileSync("src/lib/api/settings.ts", "utf8") + readFileSync("src/features/settings/kpi-catalog/KpiCatalogPanel.tsx", "utf8");
    expect(src).not.toMatch(/\beval\(|new Function\(/);
  });
});

describe("G5 AI config", () => {
  it("validates URL & model, never stores the secret, test is simulated without fetch", async () => {
    expect(await code(putAiConfig(admin, { enabled: true, endpoint_url: "pas une url", model_code: "m", provider: "Interne", auth_method: "none" }))).toBe("VALIDATION");
    expect(await code(putAiConfig(admin, { enabled: true, endpoint_url: "https://a.b", model_code: "", provider: "Interne", auth_method: "none" }))).toBe("VALIDATION");
    const c = await putAiConfig(admin, { enabled: true, endpoint_url: "https://a.b/v1", model_code: "m1", provider: "Interne", auth_method: "api_key", secret: "sk-SECRET-123" });
    expect(c.has_secret).toBe(true);
    expect(JSON.stringify(c)).not.toContain("sk-SECRET-123");
    expect(JSON.stringify(SETTINGS_STORE)).not.toContain("sk-SECRET-123");
    const orig = globalThis.fetch; let called = false;
    globalThis.fetch = (() => { called = true; throw new Error("no"); }) as typeof fetch;
    const t = await testAiConnection(admin);
    globalThis.fetch = orig;
    expect(called).toBe(false);
    expect(t.connection.simulated).toBe(true);
    expect(t.connection.message).toMatch(/simulé/);
    await putAiConfig(admin, { enabled: false, endpoint_url: "https://a.b/v1", model_code: "m1", provider: "Interne", auth_method: "none" });
    expect((await getAiConfig(admin)).enabled).toBe(false);
  });
});

describe("G6 appearance", () => {
  it("validates HEX and computes contrast", async () => {
    expect(await code(putAppearance(admin, { org_primary_hex: "bleu" }))).toBe("VALIDATION");
    expect(await code(putAppearance(viewer, { org_primary_hex: "#123456" }))).toBe("FORBIDDEN");
    expect((await putAppearance(admin, { org_primary_hex: "#1F5FD6" })).org_primary_hex).toBe("#1F5FD6");
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrast("#FFFF00", "#FFFFFF")).toBeLessThan(4.5);
  });
});

describe("G7 organization", () => {
  it("name required and reflected in export metadata", async () => {
    expect(await code(putOrganization(admin, { ...SETTINGS_STORE.org, name: "  " }))).toBe("VALIDATION");
    expect(await code(putOrganization(admin, { ...SETTINGS_STORE.org, name: "x".repeat(81) }))).toBe("VALIDATION");
    expect(exportMetadata().organization).toBeNull();
    await putOrganization(admin, { ...SETTINGS_STORE.org, name: "Opérateur Démo SA" });
    expect(exportMetadata().organization).toBe("Opérateur Démo SA");
    await putOrganization(admin, { ...SETTINGS_STORE.org, show_in_exports: false });
    expect(exportMetadata().organization).toBeNull();
  });
});

describe("G8 version", () => {
  it("about version equals package.json and changelog has its section", async () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const a = await getAbout();
    expect(a.version).toBe(pkg.version);
    expect(a.environment).toBe("mock");
    expect(releaseNotes(pkg.version, readFileSync("CHANGELOG.md", "utf8")).length).toBeGreaterThan(0);
    expect(readFileSync("src/features/settings/about/AboutPanel.tsx", "utf8")).not.toMatch(/\d+\.\d+\.\d+/);
  });
});
