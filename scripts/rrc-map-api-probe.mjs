import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "rrc-points-evidence";
fs.mkdirSync(out, { recursive: true });
// Credentials remain in the API container; neither credentials nor session are logged/saved.
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4-api-1",
      "python",
      "-c",
      `
import os,json,httpx
c=httpx.Client(base_url="http://localhost:8000")
r=c.post("/auth/login",json={"email":os.environ["BC4_ADMIN_EMAIL"],"password":os.environ["BC4_ADMIN_PASSWORD"]})
r.raise_for_status()
s=r.json()
s["user"]=c.get("/auth/me",headers={"Authorization":"Bearer "+s["token"]}).json()
print(json.dumps(s))
`,
    ],
    { encoding: "utf8" },
  ),
);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1720, height: 1080 } });
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.stack || e.message));
page.on("request", (r) => {
  if (r.url().includes("/dict/v2/distribution")) requests.push(r.url());
});
await page.addInitScript(
  (s) => {
    localStorage.setItem("bc4.session", JSON.stringify(s));
    localStorage.setItem(
      "bc4.activeProject.v1." + s.user.email,
      JSON.stringify({ id: "134af70a06eb", name: "TEST2" }),
    );
  },
  { ...session, expires_at: session.expires_at ?? new Date(Date.now() + 3600000).toISOString() },
);

try {
  const response = await fetch(
    "http://localhost:8000/projects/134af70a06eb/dict/v2/map?keys=dl-Bandwidth",
    { headers: { Authorization: "Bearer " + session.token } },
  );
  const data = await response.json();
  console.log(
    JSON.stringify({
      status: response.status,
      total: data.total_occurrences,
      geo: data.geolocated_occurrences,
      points: data.points?.length,
      coordinates: [...new Set(data.points?.map((p) => `${p.lat},${p.lon}`))],
      fields: Object.keys(data.points?.[0] ?? {}),
    }),
  );
} finally {
  await browser.close();
}
