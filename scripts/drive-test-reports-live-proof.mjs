import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const front = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5174";
const api = process.env.BC4_API_BASE ?? "http://127.0.0.1:8000";
const output = process.env.BC4_PROOF_OUTPUT ?? "audit/drive-test-reports/deployed-proof.png";
const email = process.env.BC4_ADMIN_EMAIL ?? "admin@bc4.local";
const password = process.env.BC4_ADMIN_PASSWORD ?? "ChangeMeAdmin123!";

const login = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
let session;
if (login.ok) session = await login.json();
else {
  session = JSON.parse(execFileSync("docker", [
    "exec", "bc4-api-1", "python", "-c",
    "from app.db import SessionLocal; from app.models import AppUser; from app.config import settings; from app.services.auth import create_token; import json; db=SessionLocal(); u=db.query(AppUser).filter(AppUser.active.is_(True)).first(); t,e=create_token(user_id=u.id,role=u.role,ttl_min=settings.jwt_ttl_min,secret=settings.jwt_secret); print(json.dumps({'token':t,'token_type':'Bearer','expires_at':e.isoformat(),'user':{'id':u.id,'email':u.email,'role':u.role,'active':u.active,'created_at':u.created_at.isoformat(),'must_change_password':u.must_change_password}}))",
  ], { encoding: "utf8" }));
}

const headers = { authorization: `Bearer ${session.token}` };
const projectsResponse = await fetch(`${api}/projects`, { headers });
if (!projectsResponse.ok) throw new Error(`projects HTTP ${projectsResponse.status}`);
const projects = await projectsResponse.json();
const project = projects.find(item => item.status === "ready") ?? projects[0];
if (!project) throw new Error("no project available");

const filtersResponse = await fetch(`${api}/projects/${project.id}/drive-test-reports/filters`, { headers });
if (!filtersResponse.ok) throw new Error(`filters HTTP ${filtersResponse.status}`);
const filters = await filtersResponse.json();
const dataResponse = await fetch(`${api}/projects/${project.id}/drive-test-reports/data?limit=200`, { headers });
if (!dataResponse.ok) throw new Error(`data HTTP ${dataResponse.status}`);
const data = await dataResponse.json();
const operatorSplitResponse = await fetch(`${api}/projects/${project.id}/drive-test-reports/data?limit=200&split_by=operator`, { headers });
if (!operatorSplitResponse.ok) throw new Error(`operator split HTTP ${operatorSplitResponse.status}`);
const operatorSplit = await operatorSplitResponse.json();
const streamSplitResponse = await fetch(`${api}/projects/${project.id}/drive-test-reports/data?limit=200&split_by=stream`, { headers });
if (!streamSplitResponse.ok) throw new Error(`stream split HTTP ${streamSplitResponse.status}`);
const streamSplit = await streamSplitResponse.json();

await mkdir(output.slice(0, output.lastIndexOf("/")), { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const errors = [];
const consoleErrorTasks = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {
  if (message.type() !== "error") return;
  errors.push(message.text());
  consoleErrorTasks.push(Promise.all(message.args().map(argument => argument.jsonValue().catch(() => null))));
});
await page.addInitScript(([auth, active]) => {
  localStorage.setItem("bc4.session", JSON.stringify(auth));
  localStorage.setItem(`bc4.activeProject.v1.${auth.user.email}`, JSON.stringify({ id: active.id, name: active.name }));
}, [session, project]);

await page.goto(`${front}/rf`, { waitUntil: "networkidle", timeout: 30_000 });
const link = page.getByRole("link", { name: /Drive Test Reports/i }).first();
await link.waitFor({ state: "visible", timeout: 15_000 });
await link.click();
await page.waitForURL(/\/rf\/reports(?:\?|$)/, { timeout: 15_000 });
await page.locator(".dt-report-shell").waitFor({ state: "visible", timeout: 15_000 });
await page.waitForTimeout(5_000);
await page.getByLabel("Split report").selectOption("operator");
await page.getByRole("button", { name: "Generate Report" }).click();
await page.getByText("Comparison report split by operator", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
await page.screenshot({ path: output, fullPage: true });

const kpiSummaryVisible = await page.getByText(/^(KPI Summary|KPI comparison by split)$/).first().isVisible();
const pageText = (await page.locator("body").innerText()).slice(0, 2_000);
const consoleErrorArgs = await Promise.all(consoleErrorTasks);

const report = {
  url: page.url(),
  project: project.id,
  screenshot: output,
  api: {
    filtersStatus: filtersResponse.status,
    dataStatus: dataResponse.status,
    captures: filters.captures?.length ?? 0,
    samples: data.population?.samples ?? 0,
    returned: data.population?.returned ?? 0,
    sources: data.sources?.length ?? 0,
    operatorGroups: operatorSplit.groups?.length ?? 0,
    streamGroups: streamSplit.groups?.length ?? 0,
  },
  kpiSummaryVisible,
  errors,
  consoleErrorArgs,
  title: await page.title(),
};
await writeFile(output.replace(/\.png$/, ".json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!kpiSummaryVisible) throw new Error(`KPI Summary missing: ${pageText}`);
if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
