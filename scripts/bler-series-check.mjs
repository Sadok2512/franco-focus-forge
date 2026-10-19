import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=new URL('../../nemo-metrics-audit',import.meta.url).pathname;
const session=JSON.parse(execFileSync('docker',['exec','bc4-api-1','python','-c',`import os,json,httpx
c=httpx.Client(base_url='http://localhost:8000');r=c.post('/auth/login',json={'email':os.environ['BC4_ADMIN_EMAIL'],'password':os.environ['BC4_ADMIN_PASSWORD']});r.raise_for_status();s=r.json();s['user']=c.get('/auth/me',headers={'Authorization':'Bearer '+s['token']}).json();print(json.dumps(s))`],{encoding:'utf8'}));
const urlApi='http://localhost:8000/projects/134af70a06eb/kpi/catalog';const r=await fetch(urlApi,{headers:{Authorization:'Bearer '+session.token}});assert.equal(r.status,200);const catalog=await r.json();
const bler=catalog.tree.flatMap(t=>t.families.flatMap(f=>f.kpis)).find(k=>k.code==='LTE_DL_BLER');assert.equal(bler.unit,'%');assert.equal(bler.temporal_source,null);
fs.writeFileSync(out+'/catalog-after.json',JSON.stringify({at:new Date().toISOString(),url:urlApi,headers:{Authorization:'Bearer <masked>'},body:catalog},null,2));
const browser=await chromium.launch({args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);
 await page.addInitScript(s=>localStorage.setItem('bc4.session',JSON.stringify(s)),session);
 const seriesRequests=[],errors=[];page.on('request',r=>{if(r.url().includes('/kpi/LTE_DL_BLER/series'))seriesRequests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5174/projects');await page.locator('tr',{hasText:'TEST2'}).first().getByRole('button',{name:'Ouvrir',exact:true}).click();await page.locator('nav a',{hasText:'KPI Analytics'}).click();
 const url=new URL(page.url());url.searchParams.set('kpi','LTE_DL_BLER');await page.goto(url.toString());
 const card=page.locator('#kpi-graph-LTE_DL_BLER');await card.getByRole('button',{name:/^Actions /}).click();
 const item=page.getByRole('menuitem',{name:'Série (Task Time)'});assert.equal(await item.getAttribute('aria-disabled'),'true');assert.equal(await item.locator('..').getAttribute('title'),'pas de série temporelle pour ce KPI (source agrégée)');
 await page.screenshot({path:out+'/bler-series-disabled.png',fullPage:true});await page.keyboard.press('Escape');
 await page.evaluate(()=>sessionStorage.setItem('bc4.kpi.visualizations.134af70a06eb',JSON.stringify({LTE_DL_BLER:{kpiCode:'LTE_DL_BLER',visualization:'task_series',xMetric:'operator_band',yMetric:'LTE_DL_BLER',groupBy:'operator_band',statistic:null}})));
 await page.reload();await page.getByText('pas de série temporelle pour ce KPI (source agrégée)',{exact:true}).waitFor();
 await page.screenshot({path:out+'/bler-stale-series.png',fullPage:true});assert.deepEqual(seriesRequests,[]);assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/bler-browser.json',JSON.stringify({at:new Date().toISOString(),url:page.url(),bler,seriesRequests,errors},null,2));
 console.log('PASS: BLER unit %, disabled Series tooltip, restored invalid Series explains absence without API request or contract error');
}finally{await browser.close();}
