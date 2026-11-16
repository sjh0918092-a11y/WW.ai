const assert=require('node:assert/strict'),{chromium}=require('playwright'),{appServer}=require('./helpers/app');
(async()=>{const server=appServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
 await page.route('**/v1beta/**',()=>{throw Error('Paid API must not be called')});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>S.ready);
 const result=await page.evaluate(async()=>{
  const w={id:'usage-world',kind:'world',title:'누적 비용 검증',seed:'항구',era:'1900년',rules:[],timeline:[],entities:{person:{title:'선장',type:'인물',summary:'선장',facts:[],mentions:[],page:true}},mainKey:'person',createdAt:1};
  const p={key:'person',title:'선장',type:'인물',summary:'선장',infobox:[],sections:[{heading:'개요',level:1,body:'선장이다.'}],createdAt:1};
  await Store.saveWorld(w);await Store.savePage(w.id,p);S.worlds=[w];S.world=w;S.pages={person:p};S.view={name:'article',key:'person'};
  GS.serverJobs=false;GS.pass='test';
  S.sample={json:async(prompt,o)=>{o.onMeta?.({model:'claude-sonnet-4-5',usage:{promptTokenCount:1000,candidatesTokenCount:100}});if(prompt==='fail')throw{code:'invalid_json'};return{};}};
  for(let i=0;i<2;i++){const r=DocumentCost.start(w.id,p.key);await callJson('page','page');DocumentCost.finish(r);}
  await Promise.all(['analyze','factSync','angles','cats','worldCheck','relMigrate','choices'].map(k=>callJson(k,'background')));
  try{await callJson('check','fail');}catch{}
  const originalResult=imageResultSrc,originalFetch=gFetch;
  imageResultSrc=async()=> 'data:image/png;base64,AA==';gFetch=async()=>({ok:true,json:async()=>({usageMetadata:{promptTokenCount:100,candidatesTokenCount:1000}})});
  try{await requestDocImage(w,p,{model:'gemini-3-pro-image',ratio:'1:1'});}finally{imageResultSrc=originalResult;gFetch=originalFetch;}
  renderAll();const ledger=DocumentCost.ledger(w.id);
  return {count:ledger.rows.length,total:ledger.rows.reduce((n,row)=>n+(DocumentCost.estimate(row,row.at)||0),0),failed:ledger.rows.filter(x=>x.status==='failed').length,kinds:ledger.rows.map(x=>x.kind)};
 });
 assert.equal(result.count,11);assert.equal(result.failed,1);assert(Math.abs(result.total-.179)<1e-10);
 assert(result.kinds.includes('analyze'));assert(result.kinds.includes('factSync'));assert(result.kinds.includes('image'));
 await page.waitForSelector('#worldUsagePanel');const summary=await page.locator('#worldUsagePanel summary').innerText();assert(summary.includes('이 세계관 누적 AI 비용'));assert(summary.includes('₩268.50'));
 await page.locator('#worldUsagePanel summary').click();assert((await page.locator('#worldUsagePanel').innerText()).includes('직접 편집 설정 대조'));
 assert((await page.locator('#worldUsagePanel').innerText()).includes('$1 = ₩1,500'));
 await page.reload();await page.waitForSelector('#worldUsagePanel');assert((await page.locator('#worldUsagePanel summary').innerText()).includes('₩268.50'));assert.equal(await page.evaluate(()=>DocumentCost.ledger(S.world.id).rows.length),11);
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/ww-ai-world-usage-mobile.png',fullPage:true});
 await page.evaluate(()=>{Sync.acct={id:'another-account',token:'test'};DocumentCost.render();});assert(!(await page.locator('#worldUsagePanel summary').innerText()).includes('₩268.50'));
 assert.deepEqual(errors,[]);console.log('✓ All background/edit/image calls, cumulative regeneration costs, KRW, reload, mobile, account isolation');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
