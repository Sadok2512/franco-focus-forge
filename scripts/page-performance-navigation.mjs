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
const report=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(60000);
 await page.addInitScript(s=>localStorage.setItem("bc4.session",JSON.stringify(s)),session);
 const pending=new Set();
 let lastActivity=Date.now();
 page.on("request",r=>{if(r.resourceType()==="fetch"){pending.add(r);lastActivity=Date.now();}});
 const complete=r=>{pending.delete(r);lastActivity=Date.now();};
 page.on("requestfinished",complete);page.on("requestfailed",complete);
 await page.goto("http://localhost:5174/projects");
 await page.locator("tr",{hasText:"Test_3"}).first().getByRole("button",{name:"Ouvrir",exact:true}).click();
 for(const label of ["Vue d'ensemble","RF Modules","Assistant IA","Projets"]){
  const requests=[];const errors=[];
  const listener=async r=>{if(r.request().resourceType()==="fetch")requests.push({url:r.url(),status:r.status()});};
  const errorListener=e=>errors.push(e.message);
  page.on("response",listener);page.on("pageerror",errorListener);
  const start=Date.now();
  await page.locator("nav a",{hasText:label}).first().click();
  lastActivity=Date.now();
  while(Date.now()-start<90000 && (pending.size || Date.now()-lastActivity<800 || Date.now()-start<1200)) await page.waitForTimeout(100);
  const settled=pending.size===0 && Date.now()-lastActivity>=800;
  report.push({page:label,networkSettled:settled,ms:Date.now()-start,url:page.url(),requests,errors});
  page.off("response",listener);page.off("pageerror",errorListener);
 }
 fs.writeFileSync("performance-evidence/other-pages.json",JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
