// Preuve GL1 : 2 passes.
//  Pass 1 : login + open any project + visit /kpi → fetch /metrics,
//           /lib/analytics-bootstrap persist la cache sha-keyed.
//  Pass 2 : écraser la cache sha-keyed avec un payload corrompu (sha ≠ key),
//           reload /kpi → GL1 detecte le mismatch, supprime l'entrée,
//           queryFn refetch → nouvelle entrée créée.
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";

const FRONT = process.env["BC4_FRONT_BASE"] ?? "http://localhost:5173";
const API = process.env["BC4_API_BASE"] ?? "http://localhost:8000";
const EMAIL = process.env["BC4_ADMIN_EMAIL"] ?? "admin@bc4.local";
const PASSWORD = process.env["BC4_ADMIN_PASSWORD"] ?? "ChangeMeAdmin123!";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await mkdir("artifacts", { recursive: true });

  const metricsRequests: string[] = [];
  page.on("request", (req) => {
    const m = req.url().match(/\/projects\/([^/]+)\/metrics(?:\?|$)/);
    if (m) metricsRequests.push(decodeURIComponent(m[1]));
  });

  // Login
  await page.goto(`${FRONT}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.getByRole("textbox", { name: /e-?mail/i }).fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter|login|sign in/i }).click();
  await page.waitForURL(/\/projects|\/kpi|\/$/, { timeout: 15_000 });
  await page.waitForTimeout(1_200);

  // Pass 1 — open any project + visit /kpi so queryFn fetches fresh.
  await page.goto(`${FRONT}/projects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_500);
  const openBtn = page.locator('button:has-text("Ouvrir"), button:has-text("Open")').first();
  if (await openBtn.count()) await openBtn.click({ timeout: 5_000 });
  await page.waitForTimeout(2_000);
  await page.goto(`${FRONT}/kpi`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2_000);
  try { await page.getByRole("tab", { name: /metrics catalogue/i }).first().click({ timeout: 3_000 }); } catch {}
  await page.waitForTimeout(4_000);  // laisser React Query écrire la cache

  // Récupère le pid réellement ouvert depuis les requêtes capturées + l'état localStorage.
  const pid = metricsRequests[0];
  if (!pid) { console.error("no /metrics request captured"); await browser.close(); process.exit(1); }
  console.log("pass1 : opened pid =", pid);

  // Pass 1 verification — localStorage doit contenir une entrée sha-keyed pour ce pid.
  const pass1Keys = await page.evaluate((p) => {
    const out: Array<{ key: string; payload_sha?: string; payload_version?: string }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("bc4.cache.")) continue;
      let sha: string | undefined, ver: string | undefined;
      try { const d = JSON.parse(window.localStorage.getItem(k) ?? "{}"); sha = d?.catalog_release?.sha256; ver = d?.catalog_release?.version; } catch {}
      if (k.includes(p) || !k.includes(".project-metrics.")) out.push({ key: k, payload_sha: sha, payload_version: ver });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }, pid);
  const pass1Entry = pass1Keys.find(e => /^bc4\.cache\.sha\.[a-f0-9]{10}\.project-metrics\./.test(e.key) && e.key.endsWith("." + pid));
  console.log("pass1 : sha-keyed entry =", pass1Entry?.key, "payload_sha=", pass1Entry?.payload_sha?.slice(0, 10));

  // Pass 2 — on ÉCRASE la vraie entrée avec un payload corrompu : key reste
  // (ex. bc4.cache.sha.3c87d38418.project-metrics.X) mais payload.sha256
  // = "aaaaaaaaaa_WRONG_SHA_PAYLOAD". Les 10 premiers chars ne matchent
  // plus le sha de la clé → GL1 doit détecter + supprimer + refetch.
  if (!pass1Entry) { console.error("no pass1 entry — abort"); await browser.close(); process.exit(1); }
  const tamperedKey = pass1Entry.key;
  const legacyOrphanKey = `bc4.cache.project-metrics.${pid}`;
  const tamperedPayload = {
    catalog_release: { version: "0.0.0-FAKE", sha256: "aaaaaaaaaa_WRONG_SHA_PAYLOAD", n_leaves: 0 },
    decoder_version: "FAKE",
    reason: "injected_stale_for_GL1_proof",
    nodes: [{ node_id: "fake_root", parent_id: null, node_type: "tech", label: "FAKE_SHOULD_NEVER_RENDER", order: 0 }],
    metrics: [],
  };
  await page.evaluate(({ k, p, lk, lp }) => {
    window.localStorage.setItem(k, JSON.stringify(p));
    window.localStorage.setItem(lk, JSON.stringify(lp));  // orphan legacy pour vérifier purge au boot
  }, { k: tamperedKey, p: tamperedPayload, lk: legacyOrphanKey, lp: { nodes: [{ label: "LEGACY" }] } });

  const beforeKeys = await page.evaluate(() => {
    const out: Array<{ key: string; payload_sha?: string; payload_version?: string }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("bc4.cache.")) continue;
      let sha: string | undefined, ver: string | undefined;
      try { const d = JSON.parse(window.localStorage.getItem(k) ?? "{}"); sha = d?.catalog_release?.sha256; ver = d?.catalog_release?.version; } catch {}
      out.push({ key: k, payload_sha: sha, payload_version: ver });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  });

  // Hard reload pour trigger boot-purge + initialData
  metricsRequests.length = 0;
  await page.goto(`${FRONT}/kpi`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2_000);
  try { await page.getByRole("tab", { name: /metrics catalogue/i }).first().click({ timeout: 3_000 }); } catch {}
  await page.waitForTimeout(5_000);

  const afterKeys = await page.evaluate(() => {
    const out: Array<{ key: string; payload_sha?: string; payload_version?: string }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("bc4.cache.")) continue;
      let sha: string | undefined, ver: string | undefined;
      try { const d = JSON.parse(window.localStorage.getItem(k) ?? "{}"); sha = d?.catalog_release?.sha256; ver = d?.catalog_release?.version; } catch {}
      out.push({ key: k, payload_sha: sha, payload_version: ver });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  });

  const title = await page.locator('aside.kpi-catalog h2').first().innerText().catch(() => "<no title>");

  // Expand CAPTURE for visible proof
  try {
    const captureRoot = page.locator('button:has-text("CAPTURE")').first();
    await captureRoot.click({ timeout: 3_000 });
    await page.waitForTimeout(300);
    const all = page.locator('button:has-text("CAPTURE")');
    for (let i = 1; i < await all.count(); i++) {
      try { await all.nth(i).click({ timeout: 1_500 }); } catch {}
    }
  } catch {}
  await page.waitForTimeout(500);

  await page.screenshot({ path: "artifacts/GL1_proof_screen.png", fullPage: true });

  const metricsEntries = afterKeys.filter(e => /^bc4\.cache\.sha\.[a-f0-9]{10}\.project-metrics\./.test(e.key) && e.key.endsWith("." + pid));
  const validEntry = metricsEntries.find(e =>
    e.payload_sha && typeof e.payload_sha === "string" &&
    e.key.includes(e.payload_sha.slice(0, 10)) &&
    e.payload_sha !== "aaaaaaaaaa_WRONG_SHA_PAYLOAD"
  );

  const report = {
    pid, front: FRONT, api: API,
    pass1_opened_entry: tamperedKey,
    pass1_payload_sha_prefix: pass1Entry?.payload_sha?.slice(0, 10),
    inject_pass2: {
      tampered_key: tamperedKey,
      tampered_payload_sha: "aaaaaaaaaa_WRONG_SHA_PAYLOAD",
      legacy_orphan: legacyOrphanKey,
    },
    before_reload_localStorage: beforeKeys,
    after_reload_localStorage: afterKeys,
    metrics_requests_pass2: metricsRequests,
    sidebar_title: title,
    verification: {
      legacy_orphan_purged_by_boot: !afterKeys.some(e => e.key === legacyOrphanKey),
      tampered_entry_purged_by_GL1: !afterKeys.some(e =>
        e.key === tamperedKey && e.payload_sha === "aaaaaaaaaa_WRONG_SHA_PAYLOAD"
      ),
      refetch_triggered: metricsRequests.includes(pid),
      valid_entry_present: Boolean(validEntry),
      valid_entry_key: validEntry?.key,
      valid_entry_catalog_version: validEntry?.payload_version,
      sidebar_shows_live_catalog_not_FAKE: !title.includes("FAKE") && title.includes("V2.53"),
    },
  };
  await writeFile("artifacts/GL1_proof_report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
