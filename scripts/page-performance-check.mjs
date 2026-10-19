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


const out="performance-evidence";fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:["--no-sandbox"]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(120000);
 await page.addInitScript(s=>localStorage.setItem("bc4.session",JSON.stringify(s)),session);
 const requests=[];const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("requestfinished",r=>{
  const t=r.timing(); requests.push({url:r.url(),ms:Math.round(t.responseEnd),type:r.resourceType()});
 });
 const samples=[];
 const save=()=>fs.writeFileSync(out+"/"+(process.env.PHASE||"before")+".json",JSON.stringify({at:new Date().toISOString(),project:"4b7bfd50ddb6",samples,requests,errors},null,2));
 page.on("requestfinished",save);
 page.on("requestfailed",r=>{errors.push(r.url()+": "+r.failure()?.errorText);save();});
 let start=Date.now();
 await page.goto("http://localhost:5174/projects");
 await page.locator("tr",{hasText:"Test_3"}).first().waitFor();
 samples.push({page:"projects",readyMs:Date.now()-start});
 await page.locator("tr",{hasText:"Test_3"}).first().getByRole("button",{name:"Ouvrir",exact:true}).click();
 for(const [label,ready] of [["Dictionnaire RRC","[data-testid=dict-leaf-highSpeedFlag]"],["KPI Analytics",".kpi-filterbar"],["Dictionnaire RRC","[data-testid=dict-leaf-highSpeedFlag]"]]){
  start=Date.now();
  await page.locator("nav a",{hasText:label}).first().click();
  if(label==="Dictionnaire RRC") {
   await page.getByTestId("dict-tree-search").fill("highSpeedFlag");
   await page.locator(ready).first().waitFor();
  }else await page.locator(ready).waitFor();
  samples.push({page:label,readyMs:Date.now()-start});
  await page.waitForTimeout(4000);
 }
 await page.waitForTimeout(5000);
 const report={at:new Date().toISOString(),project:"4b7bfd50ddb6",samples,requests:requests.sort((a,b)=>b.ms-a.ms),errors};
 fs.writeFileSync(out+"/"+(process.env.PHASE||"before")+".json",JSON.stringify(report,null,2));
 console.log(JSON.stringify({samples,slow:report.requests.filter(r=>r.ms>500).slice(0,25),errors},null,2));
}finally{await browser.close();}
