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

const out = "rrc-geography-ui-evidence";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({args:["--no-sandbox"]});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(60000);
 await page.addInitScript(s=>localStorage.setItem("bc4.session",JSON.stringify(s)),session);
 await page.goto("http://localhost:5174/projects");
 await page.locator("tr",{hasText:"Test_3"}).first().getByRole("button",{name:"Ouvrir",exact:true}).click();
 for (const [name,nav] of [["rrc","Dictionnaire RRC"],["kpi","KPI"]]) {
  await page.locator("nav a",{hasText:nav}).first().click();
  await page.getByRole("button",{name:/Zone géographique/}).first().click();
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("heading",{name:"Dimensions géographiques",exact:true}).waitFor();
  assert.equal(await dialog.getByText("Commune",{exact:true}).count(),0);
  assert.equal(await dialog.getByText("INSEE",{exact:true}).count(),0);
  for(const label of ["DOR","Plaque","Zone ARCEP"]) assert.equal(await dialog.getByRole("switch",{name:"Activer "+label,exact:true}).count(),1);
  await page.screenshot({path:out+"/"+name+".png"});
  await page.keyboard.press("Escape");
  await dialog.waitFor({state:"hidden"});
  await page.setViewportSize({width:400,height:900});
  await page.getByRole("button",{name:/Zone géographique/}).first().click();
  const box=await dialog.boundingBox();
  assert(box.x>=0 && box.x+box.width<=400);
  await page.screenshot({path:out+"/"+name+"-400.png"});
  await page.keyboard.press("Escape");
  await page.setViewportSize({width:1440,height:900});
 }
 console.log("PASS: RRC/KPI geographic headings, available controls, Commune/INSEE absent, Escape close, 400px popovers contained.");
} finally {await browser.close();}
