import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.KPI_EVIDENCE_DIR ?? '../kpi-0.54.3-report';
const session=JSON.parse(execFileSync('docker',['exec','bc4-api-1','python','-c',`import os,json,httpx
c=httpx.Client(base_url='http://localhost:8000');r=c.post('/auth/login',json={'email':os.environ['BC4_ADMIN_EMAIL'],'password':os.environ['BC4_ADMIN_PASSWORD']});r.raise_for_status();s=r.json();s['user']=c.get('/auth/me',headers={'Authorization':'Bearer '+s['token']}).json();print(json.dumps(s))`],{encoding:'utf8'}));
const browser=await chromium.launch({args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);
 await page.addInitScript(s=>localStorage.setItem('bc4.session',JSON.stringify(s)),session);
 const responses=[];page.on('response',async r=>{if(/\/kpi\/(axes|[^/]+\/points)/.test(r.url()))responses.push({url:r.url(),status:r.status(),body:await r.json()});});
 await page.goto('http://localhost:5174/projects');
 await page.locator('tr',{hasText:'TEST2'}).first().getByRole('button',{name:'Ouvrir',exact:true}).click();
 await page.locator('nav a',{hasText:'KPI Analytics'}).click();
 const url=new URL(page.url());url.searchParams.set('kpi','AGG_APP_DL_THR');
 await page.evaluate(()=>sessionStorage.setItem('bc4.kpi.visualizations.134af70a06eb',JSON.stringify({AGG_APP_DL_THR:{kpiCode:'AGG_APP_DL_THR',visualization:'task_scatter',xMetric:'operator_band',yMetric:'AGG_APP_DL_THR',groupBy:'operator_band',statistic:null}})));
 await page.goto(url.toString());
 await page.getByTestId('task-scatter-chart').waitFor();
 const select=page.getByRole('combobox',{name:'Axe X du nuage'});assert.equal(await select.inputValue(),'rsrp');
 assert.ok(await page.locator('.recharts-scatter-symbol').count()>0);
 const reasons=page.getByTestId('exclusion-reasons');await reasons.waitFor();
 const apiPoints=responses.filter(r=>r.url.includes('/points')).at(-1).body;
 assert.ok((await reasons.innerText()).includes(`${apiPoints.excluded.nr_no_profile} NR sans profil RSRP`));
 assert.ok((await reasons.innerText()).includes(`${apiPoints.excluded.lte_not_enriched} LTE non enrichies`));
 await page.screenshot({path:out+'/TEST2-debit-RSRP.png',fullPage:true});
 await page.getByTestId('task-scatter').screenshot({path:out+'/nuage-TEST2.png'});
 const downloadPromise=page.waitForEvent('download');await page.getByTestId('task-scatter').getByRole('button',{name:'CSV des points'}).click();const dl=await downloadPromise;await dl.saveAs(out+'/points-front.csv');
 assert.ok(fs.readFileSync(out+'/points-front.csv','utf8').includes('seq_gap'));
 const options=await select.locator('option').evaluateAll(xs=>xs.map(x=>x.value));assert.deepEqual(options,responses.find(r=>r.url.endsWith('/axes')).body.map(a=>a.code));
 fs.writeFileSync(out+'/browser.json',JSON.stringify({at:new Date().toISOString(),url:page.url(),options,responses},null,2));
 console.log('PASS: API catalogue, RSRP scatter, CSV seq_gap, PNG');
} finally {await browser.close();}
