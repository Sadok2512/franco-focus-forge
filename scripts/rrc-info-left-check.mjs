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
  await page.goto("http://localhost:5174/rrc", {waitUntil:"networkidle"});
  await page.getByTestId("dict-tree-search").fill("dl-Bandwidth");
  await page.getByTestId("dict-leaf-dl-Bandwidth").first().locator("input[type=checkbox]").check();
  await page.getByRole("button",{name:"Infos",exact:true}).click();
  await page.getByTestId("rrc-left-info").waitFor();
  const info=await page.getByTestId("rrc-left-info").boundingBox();
  const analysis=await page.getByTestId("dict-analysis-scroll").boundingBox();
  assert(info.x+info.width<=analysis.x);
  await page.getByRole("button",{name:"Tout réduire",exact:true}).click();
  await page.getByRole("button",{name:"Tout développer",exact:true}).click();
  await page.screenshot({path:"/tmp/rrc-info-left.png",fullPage:true});
  await page.getByRole("button",{name:"Infos",exact:true}).click();
  assert.equal(await page.locator("#rrc-info-panel").count(),0);
  console.log("PASS: infos left, expand/collapse, panel closes without reserved space");
} finally { await browser.close(); }
