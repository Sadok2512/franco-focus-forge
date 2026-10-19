import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=new URL('../../nmf-decoder-front-audit/',import.meta.url).pathname;
const session=JSON.parse(execFileSync('docker',['exec','bc4-api-1','python','-c',`import os,json,httpx
c=httpx.Client(base_url='http://localhost:8000');r=c.post('/auth/login',json={'email':os.environ['BC4_ADMIN_EMAIL'],'password':os.environ['BC4_ADMIN_PASSWORD']});r.raise_for_status();s=r.json();s['user']=c.get('/auth/me',headers={'Authorization':'Bearer '+s['token']}).json();print(json.dumps(s))`],{encoding:'utf8'}));
const browser=await chromium.launch({args:['--no-sandbox']});
const responses=[],errors=[];
try {
 const page=await browser.newPage({viewport:{width:1800,height:1500}});page.setDefaultTimeout(180000);
 await page.addInitScript(s=>localStorage.setItem('bc4.session',JSON.stringify(s)),session);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{if(/\/projects\/[^/]+\/(metrics|captures|decode|tasks)/.test(r.url())){try{responses.push({at:new Date().toISOString(),url:r.url(),status:r.status(),body:await r.json()});}catch{}}});
 await page.goto('http://localhost:5174/projects');
 await page.locator('tr',{hasText:'TEST2'}).first().getByRole('button',{name:'Ouvrir',exact:true}).click();
 await page.locator('nav a',{hasText:'KPI Analytics'}).click();
 const url=new URL(page.url());url.searchParams.set('kpi','AGG_APP_DL_THR');await page.goto(url.toString());
 const card=page.locator('#kpi-graph-AGG_APP_DL_THR');
 await card.getByRole('button',{name:/^Actions /}).click();await page.getByRole('menuitem',{name:'Chronogramme',exact:true}).click();
 const panel=page.getByTestId('chronogram');
 await panel.getByRole('combobox',{name:'Capture du chronogramme'}).selectOption('047e3f34e0af');
 await panel.getByTestId('capture-decode').getByText('Deep 1.0.0',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Débits par couche + BLER / CQI / SINR'}).click();
 const select=panel.getByRole('combobox',{name:'Tâche du chronogramme'});
 await page.waitForFunction(()=>[...document.querySelectorAll('select[aria-label="Tâche du chronogramme"] option')].some(o=>o.textContent.includes('HTTP_DL')));
 const task=await select.locator('option').evaluateAll(options=>options.find(o=>o.textContent.includes('HTTP_DL')).value);
 await select.selectOption(task);
 await panel.getByText('Chargement du chronogramme…').waitFor({state:'hidden'});
 await panel.locator('canvas').waitFor();await page.waitForTimeout(1000);
 const series=responses.filter(r=>r.url.includes('/metrics/series?')&&r.url.includes('from_seq=')).at(-1)?.body;
 assert.equal(series?.capture_id,'047e3f34e0af');assert.equal(series.decoder_version,'1.0.0');assert.equal(series.decode_level,'deep');assert.equal(series.series.length,9);assert.ok(series.series.every(s=>s.n_total>0));
 assert.ok(responses.some(r=>r.body.markers?.some(m=>m.label.startsWith('DAA'))));assert.ok(responses.some(r=>r.body.markers?.some(m=>m.label.startsWith('DCOMP'))));
 await panel.screenshot({path:out+'a-TEST2-deep-layers.png'});await page.screenshot({path:out+'a-TEST2-full.png',fullPage:true});
 await panel.getByTestId('unknown-metrics').locator('summary').click();
 await panel.getByRole('combobox',{name:'Événement non documenté'}).selectOption('CHI');
 assert.ok(await panel.getByRole('checkbox',{name:'unk_CHI_10',exact:true}).isDisabled());
 assert.equal(await panel.getByRole('checkbox',{name:'unk_CHI_10',exact:true}).locator('..').getAttribute('title'),'position non prouvée (NFF 2.19)');
 await panel.getByTestId('unknown-metrics').screenshot({path:out+'c-TEST2-unknown-disabled.png'});
 await card.getByRole('button',{name:/^Infos /}).click();await page.getByRole('heading',{name:'Infos et preuves — Chronogramme'}).waitFor();
 assert.ok(await page.getByRole('dialog').textContent().then(s=>s.includes('"decoder_version": "1.0.0"')));
 await page.screenshot({path:out+'infos-decoder-version.png'});await page.keyboard.press('Escape');
 // Same real KPI route and captured source, but Light exists only in Test_3.
 const lightUrl=new URL(page.url());lightUrl.searchParams.set('project','4b7bfd50ddb6');await page.goto(lightUrl.toString());
 const lightCard=page.locator('#kpi-graph-AGG_APP_DL_THR');
 if (!(await page.getByTestId('chronogram').count())) {await lightCard.getByRole('button',{name:/^Actions /}).click();await page.getByRole('menuitem',{name:'Chronogramme',exact:true}).click();}
 const lightPanel=page.getByTestId('chronogram');
 await lightPanel.getByRole('combobox',{name:'Capture du chronogramme'}).selectOption('047e3f34e0af');
 await lightPanel.getByTestId('capture-decode').getByText('Light 1.0.0',{exact:true}).waitFor();
 await lightPanel.getByText('Chargement du chronogramme…').waitFor({state:'hidden'});
 assert.ok(await lightPanel.getByTestId('capture-decode').getByRole('button',{name:'Analyse approfondie',exact:true}).isEnabled());
 assert.ok((await lightPanel.getByTestId('capture-decode').textContent()).includes('2.3 min'));
 await lightPanel.screenshot({path:out+'b-Test_3-light-action.png'});
 assert.ok((await page.locator('body').innerText()).replace(/\s+/g,' ').includes('BC4 v1.40.0'));
 // Optional explicit live action once, after preserving the Light evidence.
 if(process.env.BC2_RUN_DECODE==='1') {
  await lightPanel.getByTestId('capture-decode').getByRole('button',{name:'Analyse approfondie',exact:true}).click();
  await lightPanel.getByTestId('capture-decode').getByRole('progressbar').waitFor();
  await lightPanel.getByTestId('capture-decode').screenshot({path:out+'progress-live.png'});
  await lightPanel.getByTestId('capture-decode').getByText('Deep 1.0.0',{exact:true}).waitFor({timeout:300000});
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'browser.json',JSON.stringify({at:new Date().toISOString(),url:page.url(),task,errors,responses},null,2));
 console.log('PASS: real navigation, Deep/Light badges, API estimates, 9 task-local series, unknown disabled, decoder Infos, header');
} catch(e) {fs.writeFileSync(out+'browser-failure.json',JSON.stringify({errors,responses},null,2));throw e;} finally {await browser.close();}
