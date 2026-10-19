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


const out="rrc-table-premium-evidence";
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:["--no-sandbox"]});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},permissions:["clipboard-read","clipboard-write"]});
 page.setDefaultTimeout(60000);
 await page.addInitScript(s=>localStorage.setItem("bc4.session",JSON.stringify(s)),session);
 await page.goto("http://localhost:5174/projects");
 await page.locator("tr",{hasText:"Test_3"}).first().getByRole("button",{name:"Ouvrir",exact:true}).click();
 await page.locator("nav a",{hasText:"Dictionnaire RRC"}).first().click();
 for(const name of ["highSpeedFlag","prach-ConfigIndex"]) {
  await page.getByTestId("dict-tree-search").fill(name);
  await page.getByTestId("dict-leaf-"+name).first().locator("input[type=checkbox]").check();
 }
 const table=page.locator(".rrc-hierarchy");
 await table.locator("[data-row-kind=parameter]").nth(1).waitFor();
 await table.locator("[data-row-kind=value]").first().waitFor();
 await table.getByTestId("dict-csv-copy").click();
 await table.getByText("CSV copié",{exact:true}).waitFor();
 const snapshot={
 cells:await table.locator(".rrc-number").evaluateAll(c=>c.map(e=>({text:e.textContent,title:e.title,bar:e.querySelector(".rrc-cell-track > span")?.getAttribute("style")}))),
 csv:await page.evaluate(()=>navigator.clipboard.readText())
 };
 if(process.env.BASELINE) {
  fs.writeFileSync(out+"/baseline.json",JSON.stringify(snapshot,null,2));
  console.log("PASS: live baseline captured");
 } else {
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),JSON.parse(fs.readFileSync(out+"/baseline.json","utf8")));
  assert(snapshot.csv.split("\r\n")[0].includes('"total"'));
  assert.equal(await table.getByRole("columnheader",{name:/^Total/}).count(),0);
  const values=await table.locator("[data-row-kind=value]").count();
  await table.getByRole("button",{name:"Tout réduire",exact:true}).click();
  assert.equal(await table.locator("[data-row-kind=value]").count(),0);
  await table.getByRole("button",{name:"Tout développer",exact:true}).click();
  assert.equal(await table.locator("[data-row-kind=value]").count(),values);
  await table.getByLabel("Rechercher une valeur",{exact:true}).fill("prach-ConfigIndex");
  assert.equal(await table.locator("[data-row-kind=parameter]").count(),1);
  await table.getByLabel("Ordre des valeurs").selectOption("desc");
  await table.locator("thead th").nth(1).getByRole("button").click();
  assert.equal(await table.locator("[data-row-kind=parameter]").count(),1);
  await table.getByLabel("Rechercher une valeur",{exact:true}).fill("");
  for(const width of [2560,1920,1440,1280,400]) {
   await page.setViewportSize({width,height:900});
   await table.scrollIntoViewIfNeeded();
   const chartBounds=await page.getByTestId("dict-charts").boundingBox();
   const tableBounds=await table.boundingBox();
   assert(chartBounds && tableBounds);
   assert(tableBounds.y>=chartBounds.y+chartBounds.height, `Table must be below charts at ${width}px`);
   assert(Math.abs(tableBounds.width-chartBounds.width)<2, `Table must use full content width at ${width}px`);
   const widths=await table.locator("thead th").evaluateAll(c=>c.slice(1).map(e=>e.getBoundingClientRect().width));
   assert(Math.max(...widths)-Math.min(...widths)<2);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:out+"/"+width+".png"});
  }
  console.log("PASS: live counts, percentages, colors and CSV identical; Total absent; collapse/search/sort; full-width table below charts at 2560/1920/1440/1280/400.");
 }
}finally{await browser.close();}
