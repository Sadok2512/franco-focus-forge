import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4-api-1",
      "python",
      "-c",
      `import os,json,httpx
c=httpx.Client(base_url='http://localhost:8000')
r=c.post('/auth/login',json={'email':os.environ['BC4_ADMIN_EMAIL'],'password':os.environ['BC4_ADMIN_PASSWORD']});r.raise_for_status();s=r.json();s['user']=c.get('/auth/me',headers={'Authorization':'Bearer '+s['token']}).json();print(json.dumps(s))`,
    ],
    { encoding: "utf8" },
  ),
);


const browser=await chromium.launch({args:["--no-sandbox"]});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(90000);
 await page.addInitScript(s=>localStorage.setItem("bc4.session",JSON.stringify(s)),session);
 const calls=[];
 page.on("response",r=>{if(/\/kpi\//.test(r.url())) console.log(r.status(),r.url());});
 page.on("requestfailed",r=>console.log("FAILED",r.url(),r.failure()));
 page.on("request",r=>{if(/\/dict\/v2\/|\/kpis?\//.test(r.url())) calls.push(r.url());});
 await page.goto("http://localhost:5174/projects");
 await page.locator("tr",{hasText:"Test_3"}).first().getByRole("button",{name:"Ouvrir",exact:true}).click();
 const visit=async(label)=>{
  await page.locator("nav a",{hasText:label}).first().click();
  if(label==="Dictionnaire RRC"){
   await page.getByTestId("dict-tree-search").fill("highSpeedFlag");
   await page.getByTestId("dict-leaf-highSpeedFlag").first().waitFor();
  } else await page.locator(".kpi-filterbar").waitFor();
  await page.waitForLoadState("networkidle");
 };
 await visit("Dictionnaire RRC");
 await visit("KPI Analytics");
 const initial=calls.length;
 // Move wall-clock time beyond the former 60s freshness interval, without waiting.
 await page.clock.setFixedTime(new Date(Date.now()+120000));
 await visit("Dictionnaire RRC");
 await visit("KPI Analytics");
 const repeated=calls.slice(initial);
 assert.deepEqual(repeated,[],"Returning to loaded pages must not re-download analytics");
 fs.mkdirSync("performance-evidence",{recursive:true});
 fs.writeFileSync("performance-evidence/navigation-cache.json",JSON.stringify({initialRequests:calls,repeatRequests:repeated},null,2));
 console.log("PASS: RRC → KPI → RRC → KPI, after 120s clock advance: zero repeated analytical requests.");
} finally {await browser.close();}
