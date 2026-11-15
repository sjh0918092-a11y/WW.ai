const assert=require('node:assert/strict'),{chromium}=require('playwright'),{appServer}=require('./helpers/app');
(async()=>{const server=appServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>S.ready);
 await page.evaluate(async()=>{const w={id:'cost-world',kind:'world',title:'비용 검증',seed:'항구',era:'1900년',rules:[],timeline:[],entities:{person:{title:'선장',type:'인물',summary:'선장',facts:[],mentions:[],page:true}},mainKey:'person',createdAt:1};const p={key:'person',title:'선장',type:'인물',summary:'선장',infobox:[],sections:[{heading:'개요',level:1,body:'선장의 기록이다.'}],createdAt:1};await Store.saveWorld(w);await Store.savePage(w.id,p);S.worlds=[w];S.world=w;S.pages={person:p};S.view={name:'article',key:'person'};window.costRecord=DocumentCost.start(w.id,'person');renderAll();});
 await page.waitForSelector('#docCostPanel');assert((await page.locator('#docCostPanel summary').innerText()).includes('산정 대기'));assert.equal(await page.locator('#docCostPanel').getAttribute('open'),null);
 await page.locator('#docCostPanel summary').click();await page.evaluate(()=>DocumentCost.server(window.costRecord,{steps:[{kind:'page',model:'claude-sonnet-4-5',slot:'page:1',status:'done',usage:{promptTokenCount:1000,candidatesTokenCount:100}},{kind:'check',model:'claude-haiku-4-5',slot:'check:1',status:'running'}]}));
 assert((await page.locator('#docCostPanel summary').innerText()).includes('$0.0045'));assert((await page.locator('#docCostPanel').innerText()).includes('미집계'));assert.equal(await page.locator('#docCostPanel').getAttribute('open'),'');
 await page.evaluate(()=>renderMain());assert.equal(await page.locator('#docCostPanel').getAttribute('open'),'');
 await page.locator('#docCostPanel summary').click();await page.waitForFunction(()=>localStorage.getItem('wwiki:costExpanded')==='false');
 await page.evaluate(()=>{DocumentCost.server(window.costRecord,{steps:[{kind:'page',model:'claude-sonnet-4-5',status:'done',usage:{promptTokenCount:1000,candidatesTokenCount:100}},{kind:'check',model:'claude-haiku-4-5',status:'done',usage:{promptTokenCount:1000,candidatesTokenCount:100}}]});DocumentCost.finish(window.costRecord);});
 assert((await page.locator('#docCostPanel summary').innerText()).includes('$0.0060'));assert.equal(await page.locator('#docCostPanel').getAttribute('open'),null);
 await page.reload();await page.waitForSelector('#docCostPanel');assert((await page.locator('#docCostPanel summary').innerText()).includes('$0.0060'));assert.equal(await page.locator('#docCostPanel').getAttribute('open'),null);
 await page.setViewportSize({width:390,height:844});await page.locator('#docCostPanel summary').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'/tmp/ww-ai-doc-cost-mobile.png',fullPage:true});const retried=await page.evaluate(async()=>{
 const original=gemini.stream;let n=0;GS.pass='test-pass';S.sample=gemini;const record=DocumentCost.start(S.world.id,'person');
 gemini.stream=async(model,body,opts)=>{n++;const usage={promptTokenCount:n*100,candidatesTokenCount:n*10};opts.onUsage?.(usage);if(n===1)throw{code:'upstream_error'};return{text:'{"ok":true}',finish:'STOP',usage};};
 try{await callJson('page','retry test');DocumentCost.finish(record);return{n,usage:record.rows[0].usage};}finally{gemini.stream=original;}
 });assert.equal(retried.n,2);assert.equal(retried.usage.promptTokenCount,300);assert.equal(retried.usage.candidatesTokenCount,30);
 await page.evaluate(()=>{Sync.acct={id:'other',token:'other'};DocumentCost.render();});assert.equal(await page.locator('#docCostPanel').count(),0);
 assert.deepEqual(errors,[]);
 console.log('✓ Cost updates, collapse preference, completion, reload, and mobile layout without AI calls');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
