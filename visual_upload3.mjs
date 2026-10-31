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
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(CSV);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/panel-file-selected.png`, fullPage: false });
  // Click the Upload button
  const uploadStart = Date.now();
  const uploadButton = page.locator('button:has-text("Uploader la référence"), button:has-text("Upload")').first();
  await uploadButton.waitFor({ state: "visible", timeout: 10000 });
  await uploadButton.click();
  // Wait for the POST /settings/cell-ref/upload response (should be 202 quickly thanks to 0.117.2)
  const uploadResp = await page.waitForResponse(r => /\/settings\/cell-ref\/upload$/.test(r.url()) && r.request().method()==="POST", { timeout: 300000 }).catch(e=>({ error: e.message }));
  const uploadMs = Date.now() - uploadStart;
  let uploadStatus = null, uploadBody = null;
  if (uploadResp && typeof uploadResp.status === "function") {
    uploadStatus = uploadResp.status();
    try { uploadBody = await uploadResp.json(); } catch (_) {}
  }
  await page.screenshot({ path: `${OUT}/panel-after-click.png`, fullPage: false });
  // Watch for processing + completion for up to 10 min
  let processingObserved = false, completed = false;
  for (let i=0; i<80; i++) {
    const t = await page.locator("body").innerText().catch(()=>"");
    if (/(Import serveur|en cours|processing|%)/i.test(t)) processingObserved = true;
    if (/(terminé|completed|réussi|success|importé|Terminé)/i.test(t)) { completed = true; break; }
    if (/(échec|failed|erreur)/i.test(t) && !processingObserved) break;
    await page.waitForTimeout(5000);
  }
  await page.screenshot({ path: `${OUT}/panel-after-final.png`, fullPage: true });
  const bodyAfter = await page.locator("body").innerText().catch(()=>"");
  const totalMs = Date.now() - t0;
  const result = {
    uploadMs, uploadStatus, uploadBody,
    processingObserved, completed,
    totalMs,
    bodyBeforeSnip: bodyBefore.slice(0, 1800),
    bodyAfterSnip: bodyAfter.slice(0, 3500),
    apiLogCount: apiLog.length,
    apiLogSummary: apiLog.slice(-15),
    errs: errs.slice(0, 10),
  };
  writeFileSync(`${OUT}/upload-result.json`, JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify({ uploadMs, uploadStatus, uploadBody, processingObserved, completed, totalMs, apiLogCount: apiLog.length, errsCount: errs.length }, null, 2));
})();
