import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/upload-20261031T0107Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";
const CSV = "/home/devmat/ref_cell_4G5G.csv";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling|settings)/, { timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  const apiLog = [];
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
  page.on("response", r => {
    const u = r.url();
    if (/\/reference\/cell|\/settings\/cell-ref/.test(u)) {
      apiLog.push({ url: u.replace(BASE,""), status: r.status(), method: r.request().method(), when: Date.now() });
    }
  });
  const t0 = Date.now();
  await login(page);
  await page.goto(`${BASE}/settings/cellular-reference`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/panel-before.png`, fullPage: false });
  const bodyBefore = await page.locator("body").innerText().catch(()=>"");
  // Find and set the file input
  const fileInput = page.locator('input[type="file"]').first();
  if (!(await fileInput.count())) {
    writeFileSync(`${OUT}/preupload-fail.json`, JSON.stringify({ apiLog, errs, bodyBefore: bodyBefore.slice(0, 2000) }, null, 2));
    throw new Error("No file input on panel");
  }
  const uploadStart = Date.now();
  await fileInput.setInputFiles(CSV);
  // Wait for /settings/cell-ref/upload response (should be fast — 202 with job_id)
  const uploadResp = await page.waitForResponse(r => /\/settings\/cell-ref\/upload$/.test(r.url()) && r.request().method()==="POST", { timeout: 180000 }).catch(e=>null);
  const uploadMs = Date.now() - uploadStart;
  let uploadStatus = null, uploadBody = null;
  if (uploadResp) {
    uploadStatus = uploadResp.status();
    try { uploadBody = await uploadResp.json(); } catch (_) {}
  }
  await page.screenshot({ path: `${OUT}/panel-after-upload.png`, fullPage: false });
  // Watch for processing + completion
  // The UI polls /settings/cell-ref/jobs/{id} and refreshes /reference/cell/imports when done
  // Wait up to 10 min for processing to complete
  const done = await page.waitForResponse(r => /\/settings\/cell-ref\/jobs\//.test(r.url()) && r.status()===200, { timeout: 600000 }).catch(e=>null);
  // Poll body text for "terminé" or "completed"
  let processingObserved = false;
  for (let i=0; i<40; i++) {
    const t = await page.locator("body").innerText().catch(()=>"");
    if (/(Import serveur|serveur|processing|en cours)/i.test(t)) processingObserved = true;
    if (/(terminé|completed|réussi|success|importé)/i.test(t) && !/en cours|processing/i.test(t)) break;
    await page.waitForTimeout(5000);
  }
  await page.screenshot({ path: `${OUT}/panel-processing.png`, fullPage: false });
  // Wait for final history refresh
  await page.waitForTimeout(10000);
  const bodyAfter = await page.locator("body").innerText().catch(()=>"");
  await page.screenshot({ path: `${OUT}/panel-after-final.png`, fullPage: true });
  const totalMs = Date.now() - t0;
  const result = {
    uploadMs, uploadStatus, uploadBody,
    processingObserved,
    totalMs,
    bodyBeforeSnip: bodyBefore.slice(0, 1500),
    bodyAfterSnip: bodyAfter.slice(0, 2500),
    apiLogCount: apiLog.length,
    apiLogLast10: apiLog.slice(-10),
    errs: errs.slice(0, 10),
  };
  writeFileSync(`${OUT}/upload-result.json`, JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify({ uploadMs, uploadStatus, uploadBody, processingObserved, totalMs, apiLogCount: apiLog.length, errsCount: errs.length }, null, 2));
})();
