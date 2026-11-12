/* OpenAI 요청을 가로채 과금 없이 실제 브라우저 설정·생성·참조·오류를 검증한다. */
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { appServer } = require("./helpers/app");
const { chromium } = require('playwright');
const server=appServer();
let n=0; const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch(), ctx=await browser.newContext({acceptDownloads:true});
 const calls=[], errors=[]; let pixels, mode='ok', release;
 await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());
 await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
 await ctx.route('**/v1beta/**',()=>{throw new Error('OpenAI 사용 중 Gemini 요청 금지');});
 await ctx.route('https://api.openai.com/v1/images/**',async r=>{
  calls.push({url:r.request().url(), headers:await r.request().allHeaders(), body:r.request().postData()});
  if(mode==='delay') await new Promise(resolve=>{release=resolve;});
  try {
   if(mode==='auth') return await r.fulfill({status:401,json:{error:{message:'Invalid API key'}}});
   if(mode==='quota') return await r.fulfill({status:429,json:{error:{message:'Insufficient quota'}}});
   if(mode==='empty') return await r.fulfill({json:{data:[]}});
   await r.fulfill({json:{data:[{b64_json:pixels.split(',')[1]}]}});
  }catch{}
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('#gOpenAI');
  pixels=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;c.getContext('2d').fillRect(0,0,600,800);return c.toDataURL('image/png');});
  const p={key:'person',title:'검증 인물',type:'인물',summary:'인물',infobox:[],sections:[{heading:'개요',level:1,body:'신장 60m. 1989년 군인.'}],links:[],createdAt:1,portrait:pixels};
  const w={id:'openai',kind:'world',title:'OpenAI 검증',era:'1989년',seed:'군 기록사진',imageGuide:'실사 기록사진, 성인 대비 35배 축척',rules:[],timeline:[],mainKey:p.key,entities:{person:{title:p.title,type:p.type,summary:p.summary,facts:[],mentions:[],page:true,box:''}},createdAt:1,updatedAt:1};
  await page.setInputFiles('#importFile',{name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'worldwiki',version:1,worlds:[w],pages:{openai:{person:p}}}))});
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
  const open=async()=>{await page.click('#side [data-act="home"]');await page.click('.wcard button.open');await page.waitForSelector('.article h2');await page.locator('.portrait-menu summary').click();await page.click('[data-image-open]');};
  await open();await page.selectOption('#imageModel','gpt-image-2.5-flare');
  assert(await page.locator('[data-act="image-generate"]').isDisabled());assert((await page.locator('.image-gen').innerText()).includes('OpenAI API 키'));assert.equal(calls.length,0);
  pass('OpenAI 키가 없으면 안내하고 요청을 보내지 않는다');
  await page.click('.image-gen [data-act="gset"]');await page.fill('#gOpenAI','sk-test-openai');await page.selectOption('#gMode','key');await page.fill('#gKey','');await page.fill('#gImage','gpt-image-2.5-flare');await page.click('[data-act="gset-save"]');
  await page.reload();await page.waitForSelector('#gOpenAI');assert.equal(await page.inputValue('#gOpenAI'),'sk-test-openai');assert.equal(await page.getAttribute('#gOpenAI','type'),'password');
  await open();assert(await page.locator('[data-act="image-generate"]').isEnabled());
  pass('Gemini 연결 없이 별도 OpenAI 키와 기본 이미지 모델을 저장·복원한다');
  await page.selectOption('#imageStyle','실사');await page.uncheck('[data-igf="useRef"]');await page.fill('#imageDirection','성인과 같은 거리에서 촬영');await page.click('[data-act="image-generate"]');await page.waitForSelector('.image-gen .preview');
  let req=calls.at(-1),b=JSON.parse(req.body);assert(req.url.endsWith('/generations'));assert.equal(b.model,'gpt-image-2.5-flare');assert.equal(b.size,'1152x1536');assert.equal(b.quality,'high');assert.equal(b.n,1);assert(b.prompt.includes(w.imageGuide)&&b.prompt.includes('신장 60m')&&b.prompt.includes('희망 화풍: 실사')&&b.prompt.includes('성인과 같은 거리'));assert.equal(req.headers.authorization,'Bearer sk-test-openai');assert(!req.headers['x-goog-api-key']&&!req.headers['x-ww-pass']);
  pass('공통 지침·문서·요청을 OpenAI에만 보내고 높은 품질로 한 장 생성한다');
  await page.click('[data-act="image-discard"]');await page.selectOption('#imageModel','gpt-image-2.5-sunburst');await page.selectOption('#imageRatio','16:9');await page.selectOption('#imageQuality','medium');await page.check('[data-igf="useRef"]');await page.click('[data-act="image-generate"]');await page.waitForSelector('.image-gen .preview');
  req=calls.at(-1);assert(req.url.endsWith('/edits'));assert(req.headers['content-type'].includes('multipart/form-data; boundary='));for(const t of ['image[]','reference.png','gpt-image-2.5-sunburst','1536x864','medium',w.imageGuide])assert(req.body.includes(t),t);
  await page.click('.image-gen .preview');await page.waitForSelector('.image-viewer[open]');await page.click('[data-viewer-close]');await page.click('[data-act="image-apply"]');await page.waitForSelector('.image-gen',{state:'detached'});
  pass('Sunburst 참조 이미지는 multipart edits로 전달하고 확대·적용할 수 있다');
  await page.locator('.portrait-menu summary').click();await page.click('[data-image-open]');
  for(const [m,msg] of [['auth','Invalid API key'],['quota','Insufficient quota'],['empty','이미지를 반환하지']]){
   mode=m;const before=calls.length;await page.click('[data-act="image-generate"]');await page.waitForFunction(s=>document.querySelector('.image-gen [role="alert"]')?.textContent.includes(s),msg);assert.equal(calls.length,before+1);assert.equal(await page.locator('.portrait img').count(),1);
  }
  pass('인증·한도·빈 결과 오류는 원본을 유지하고 자동 재시도하지 않는다');
  mode='delay';await page.click('[data-act="image-generate"]');await page.waitForFunction(()=>document.querySelector('[data-act="image-close"]')?.textContent==='생성 중단');
  while(!release)await new Promise(r=>setTimeout(r,10));
  await page.click('[data-act="image-close"]');release();await page.waitForSelector('.image-gen',{state:'detached'});assert.equal(await page.locator('.portrait img').count(),1);
  pass('OpenAI 생성 중단은 원본을 보존한다');
  await page.click('#side [data-act="gset"]');const download=page.waitForEvent('download');await page.click('[data-act="export"]');const d=await download;const backup=fs.readFileSync(await d.path(),'utf8');assert(!backup.includes('sk-test-openai'));assert(backup.includes(w.imageGuide));assert(!backup.includes('openaiKey'));
  pass('백업에는 공통 지침과 이미지만 포함하고 API 키는 제외한다');
  await open();await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.locator('#imageQuality').isVisible());
  if(process.env.SHOT_DIR){fs.mkdirSync(process.env.SHOT_DIR,{recursive:true});await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:path.join(process.env.SHOT_DIR,'openai-image-mobile.png'),fullPage:true});}
  await page.selectOption('#imageModel','gemini-nano-banana-2.1');assert(await page.locator('[data-act="image-generate"]').isDisabled());assert.equal(await page.locator('#imageQuality').count(),0);
  await page.selectOption('#imageModel','gpt-image-2.5-flare');assert(await page.locator('[data-act="image-generate"]').isEnabled());
  pass('모바일 표시와 Gemini·OpenAI 전환 시 각 공급자 연결 상태를 따로 확인한다');
  assert.deepStrictEqual(errors,[]);console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
