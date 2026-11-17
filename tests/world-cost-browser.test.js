const assert=require('node:assert/strict'),{chromium}=require('playwright'),{appServer}=require('./helpers/app');
(async()=>{const server=appServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
 await page.route('**/v1beta/**',()=>{throw Error('No external AI calls expected')});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>S.ready);
 await page.evaluate(()=>{
  GS.pass='test-pass';GS.main='gemini-3.8-flash';GS.quick='gemini-3.5-flash-lite';GS.preCheck=false;saveGS();window.costCalls=[];
  openWorld=async id=>{S.world=S.worlds.find(w=>w.id===id);S.world.relMigrated=true;S.world.angleOff=true;S.pages={};S.view={name:'canon'};renderAll();};
  S.sample={json:async(prompt,opts)=>{
   const kind=opts.jobMeta.kind;costCalls.push(kind);const model=kind==='timelineDate'?GS.quick:GS.main;opts.onMeta?.({model});
   if(kind==='bible')await new Promise(r=>window.releaseBible=r);
   if(kind==='timelineDate')await new Promise(r=>window.releaseDate=r);
   const usage=kind==='timelineCheck'?{promptTokenCount:0,candidatesTokenCount:0}:{promptTokenCount:kind==='timelineDate'?500:1000,candidatesTokenCount:kind==='timelineDate'?100:200};opts.onUsage?.(usage);opts.onMeta?.({model,usage});
   if(kind==='bible')return{title:'항구 세계',era:'2000년',rules:['항구는 섬에 있다'],mainTitle:'항구',timeline:[{year:'1999년',event:'항구를 건설하였다'}]};
   if(kind==='timelineDate')return{dates:[{i:1,month:3,day:14}]};
   if(kind==='timelineCheck')return{fixes:[]};
   return{title:'항구',type:'지명',summary:'섬의 항구이다.',infobox:[],sections:[{heading:'개요',level:1,body:'항구는 섬에 자리한다.'}],links:[]};
  }};
  S.seed='섬나라의 항구에서 벌어지는 교역 이야기이다.';S.first='항구';S.mode='basic';S.view={name:'home'};window.creatingWorld=createWorld();
 });
 await page.waitForFunction(()=>!!window.releaseBible);await page.waitForSelector('#worldCostPanel');assert((await page.locator('#worldCostPanel summary').innerText()).includes('세계관 초기 생성 비용'));assert((await page.locator('#worldCostPanel summary').innerText()).includes('산정 대기'));
 await page.locator('#worldCostPanel summary').click();await page.evaluate(()=>releaseBible());
 await page.waitForFunction(()=>!!window.releaseDate && S.world && !S.creating);assert.equal(await page.evaluate(()=>DocumentCost.creation.finished),false);assert((await page.locator('#worldCostPanel summary').innerText()).includes('$0.0015'));assert((await page.locator('#worldCostPanel summary').innerText()).includes('미집계'));
 // 첫 문서 요청이 날짜 보완보다 먼저 끝나도 서로 다른 비용 기록에 들어간다.
 await page.evaluate(async()=>{const w=S.world,k=w.mainKey,r=DocumentCost.start(w.id,k);const out=await callJson('page','test page',{recoveryTarget:{wid:w.id,key:k}});DocumentCost.finish(r);const p={key:k,...out,createdAt:Date.now()};await Store.savePage(w.id,p);S.pages[k]=p;w.entities[k].page=true;S.view={name:'article',key:k};renderAll();});
 assert((await page.locator('#docCostPanel summary').innerText()).includes('$0.0015'));assert((await page.locator('#worldCostPanel summary').innerText()).includes('미집계'));
 await page.evaluate(()=>releaseDate());await page.waitForFunction(()=>DocumentCost.creation.finished);assert((await page.locator('#worldCostPanel summary').innerText()).includes('$0.0019'));assert(!(await page.locator('#worldCostPanel summary').innerText()).includes('미집계'));
 const data=await page.evaluate(async()=>{await Store.saveWorld(S.world);return{world:DocumentCost.get(S.world.id,'@world'),doc:DocumentCost.get(S.world.id,S.world.mainKey),calls:costCalls,timeline:S.world.timeline}});
 assert.deepEqual(data.world.rows.map(r=>r.kind),['bible','timelineCheck','timelineDate']);assert.deepEqual(data.doc.rows.map(r=>r.kind),['page']);assert.deepEqual(data.calls,['bible','timelineCheck','timelineDate','page']);assert.equal(data.timeline[0].month,3);
 await page.locator('#worldCostPanel summary').click();await page.waitForFunction(()=>localStorage.getItem('wwiki:worldCostExpanded')==='false');
 await page.reload();await page.waitForSelector('#worldCostPanel');assert((await page.locator('#worldCostPanel summary').innerText()).includes('$0.0019'));assert.equal(await page.locator('#worldCostPanel').getAttribute('open'),null);assert((await page.locator('#docCostPanel summary').innerText()).includes('$0.0015'));
 await page.click('#side [data-act="canon"]');await page.waitForSelector('.canon');assert((await page.locator('#worldCostPanel summary').innerText()).includes('$0.0019'));
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // 응답 뒤 형식 오류가 나도 기존 세계관의 비용을 덮어쓰지 않고 이번 사용량을 표시한다.
 await page.click('#side [data-act="home"]');await page.evaluate(async()=>{S.sample={json:async(prompt,opts)=>{opts.onMeta?.({model:GS.main,usage:{promptTokenCount:1000,candidatesTokenCount:200}});return{}}};S.seed='실패한 원안 생성 요청도 사용량을 남기는 검증이다.';await createWorld();});
 assert(await page.evaluate(()=>!!S.createErr));assert((await page.locator('#worldCostPanel summary').innerText()).includes('$0.0015'));assert.deepEqual(errors,[]);
 console.log('✓ World setup and late timeline costs, document separation, persistence, collapsed state, mobile, and failed setup');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
