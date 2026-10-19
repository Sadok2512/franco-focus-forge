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
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(90000);
 await page.addInitScript(s=>localStorage.setItem("bc4.session",JSON.stringify(s)),session);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const urls=[];page.on("request",r=>{if(r.url().includes("/overview?")||r.url().endsWith("/overview"))urls.push(r.url());});
 await page.goto("http://localhost:5174/projects");
 await page.locator("tr",{hasText:"Test_3"}).first().getByRole("button",{name:"Ouvrir",exact:true}).click();
 const start=Date.now();
 await page.locator("nav a",{hasText:"Vue d'ensemble"}).first().click();
 await page.getByRole("combobox",{name:"Projet",exact:true}).waitFor();
 const readyMs=Date.now()-start;
 const resources=await page.evaluate(()=>performance.getEntriesByType("resource").filter(r=>r.initiatorType==="fetch" && r.name.includes("/overview")).map(r=>({url:r.name,duration:r.duration,encoded:r.encodedBodySize,decoded:r.decodedBodySize})));
 await page.screenshot({path:"performance-evidence/overview-final.png"});
 const report={at:new Date().toISOString(),project:"4b7bfd50ddb6",readyMs,resources,requests:urls.filter(u=>u.includes("/api/")),errors};
 fs.writeFileSync("performance-evidence/overview-final.json",JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 assert.equal(errors.length,0);
 assert.equal(report.requests.length,1);
}finally{await browser.close();}
