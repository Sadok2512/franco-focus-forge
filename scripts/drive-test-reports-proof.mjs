import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const front = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5173";
const api = process.env.BC4_API_BASE ?? "http://127.0.0.1:8000";
const email = process.env.BC4_ADMIN_EMAIL ?? "admin@bc4.local";
const password = process.env.BC4_ADMIN_PASSWORD ?? "ChangeMeAdmin123!";
const output = "audit/drive-test-reports/empty-source-proof.png";

const login = await fetch(`${api}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
let session;
if (login.ok) session = await login.json();
else session = JSON.parse(execFileSync("docker", ["exec", "bc4-api-1", "python", "-c", "from app.db import SessionLocal; from app.models import AppUser; from app.config import settings; from app.services.auth import create_token; import json; db=SessionLocal(); u=db.query(AppUser).filter(AppUser.active.is_(True)).first(); t,e=create_token(user_id=u.id,role=u.role,ttl_min=settings.jwt_ttl_min,secret=settings.jwt_secret); print(json.dumps({'token':t,'token_type':'Bearer','expires_at':e.isoformat(),'user':{'id':u.id,'email':u.email,'role':u.role,'active':u.active,'created_at':u.created_at.isoformat(),'must_change_password':u.must_change_password}}))"], { encoding: "utf8" }));
const projectsResponse = await fetch(`${api}/projects`, { headers: { authorization: `Bearer ${session.token}` } });
if (!projectsResponse.ok) throw new Error(`projects HTTP ${projectsResponse.status}`);
const projects = await projectsResponse.json();
const project = projects.find(item => item.status === "ready") ?? projects[0];
if (!project) throw new Error("no project available");

await mkdir("audit/drive-test-reports", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
await page.addInitScript(([auth, active]) => {
  localStorage.setItem("bc4.session", JSON.stringify(auth));
  localStorage.setItem(`bc4.activeProject.v1.${auth.user.email}`, JSON.stringify({ id: active.id, name: active.name }));
}, [session, project]);
await page.route("**/settings/appearance", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ org_primary_hex: null }) }));
await page.route("**/settings/organization", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "", short_name: "", description: "", logo_data_url: null, admin_contact: "", domain: "", show_in_header: false, show_in_exports: false, limits: { name_max: 120, logo_max_bytes: 1000000, logo_types: [] } }) }));
await page.route("**/health", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", env: "proof", version: "local" }) }));
await page.route(`**/projects/${project.id}/drive-test-reports/filters`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ project_id: project.id, captures: [], operators: [], rats: [], bands: [], services: [], cells: [], sites: [], time_min: null, time_max: null }) }));
await page.route(`**/projects/${project.id}/drive-test-reports/data*`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
  project_id: project.id, filters: {}, methodology: "Persisted decoded observations ordered by (capture_id, seq); no interpolation", split_by: "none", groups: [],
  population: { samples: 0, returned: 0, sampling: "none" },
  metrics: ["dl","thrpt_ul","rsrp","rsrq","sinr","cqi","mimo_rank"].map((code, index) => ({ code, label: ["DL Throughput","UL Throughput","RSRP","RSRQ","SINR","CQI","Rank / Layers"][index], unit: ["Mbit/s","Mbit/s","dBm","dB","dB","index","rank"][index], status: "UNAVAILABLE", reason: `No non-null ${code} samples in the filtered dataset`, n: 0, avg: null, p10: null, p50: null, p90: null, max: null })),
  unsupported: ["erab","nr_pdu_session","bler_dl","bler_ul","mcs_dl","mcs_ul","prb_dl","prb_ul"].map(code => ({ code, status: "UNAVAILABLE", value: null, n: 0, reason: "No proven decoded source in this dataset" })),
  points: [], tasks: [], task_summary: { attempts: 0, successes: 0, failures: 0, avg_duration_s: null, volume_bytes: null }, services: [], failures: [], sources: [],
}) }));
await page.goto(`${front}/rf/reports`, { waitUntil: "networkidle", timeout: 30_000 });
await page.screenshot({ path: output, fullPage: true });
const report = { url: page.url(), project: project.id, screenshot: output, emptySourceProof: true, errors, title: await page.title() };
await writeFile(output.replace(/\.png$/, ".json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
