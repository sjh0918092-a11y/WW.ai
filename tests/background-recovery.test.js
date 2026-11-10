/* 브라우저 가시성과 가상 시계를 사용해 모바일 복귀 동작을 재현한다. */
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});
let n=0;const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),ctx=await browser.newContext();
 await ctx.addInitScript(()=>{window.testHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testHidden?'hidden':'visible'});if(!localStorage.getItem('wwiki:gemini'))localStorage.setItem('wwiki:gemini',JSON.stringify({mode:'key',key:'test',openaiKey:'sk-test',preCheck:false}));});
 await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
 const page=await ctx.newPage();await page.clock.install();const errors=[],calls=[],pending=[];let kind='check';
 page.on('pageerror',e=>errors.push(e.message));const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const handler=async r=>{const record={url:r.request().url(),body:JSON.parse(r.request().postData()||'{}'),kind};calls.push(record);await new Promise(resolve=>pending.push(resolve));try{if(record.kind==='image')await r.fulfill({json:{data:[{b64_json:png}]}});else{const out=record.kind==='page'?{title:'새 문서',type:'인물',summary:'새 문서의 정의',infobox:[{label:'성별',value:'여성'}],sections:[{heading:'개요',level:1,body:'복귀 뒤 받은 새 본문이다.'}],facts:[],newEntities:[],timeline:[],relations:[]}:{issues:[]};await r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(out)}]},finishReason:'STOP'}]})+'\n\n'});}}catch{}};
 await ctx.route('**/v1beta/models/**',handler);await ctx.route('https://api.openai.com/v1/images/**',handler);
 const hide=async()=>page.evaluate(()=>{window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});const show=async()=>page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
 const waitCalls=async count=>{for(let i=0;i<200&&pending.length<count;i++)await new Promise(r=>setTimeout(r,10));assert.equal(pending.length,count);};const release=()=>pending.splice(0).forEach(fn=>fn());
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.click('#side [data-act="gset"]');
  const p={key:'person',title:'기존 인물',type:'인물',summary:'기존 정의',infobox:[{label:'성별',value:'여성'}],sections:[{heading:'개요',level:1,body:'기존 본문이다.'}],links:[],createdAt:1};
  const ent=(title,page)=>({title,type:'인물',summary:'정의',facts:[],mentions:[],page,box:''});
  const w={kind:'world',id:'background',title:'복귀 세계',seed:'테스트 세계',era:'1989년',rules:[],timeline:[],relations:[],navboxes:{},entities:{person:ent(p.title,true),new:ent('새 문서',false)},mainKey:'person',tone:{label:'기록',guide:[]},createdAt:1};
  await page.setInputFiles('#importFile',{name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'worldwiki',version:1,worlds:[w],pages:{background:{person:p}}}))});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));await page.click('#side [data-act="home"]');await page.locator('.wcard button.open').click();await page.waitForSelector('.article h2');
  await page.click('[data-check]');await waitCalls(2);await hide();await page.clock.fastForward(700000);assert.equal(calls.length,2);await show();release();await page.waitForFunction(()=>document.querySelector('.memo-line')?.textContent.includes('설정 노트와 맞춰 봤습니다'));assert.equal(calls.length,2);
  pass('설정 대조·문서 읽기 도중 10분 넘게 탭을 숨겨도 복귀 후 원래 결과를 받고 중복 요청하지 않는다');
  kind='page';await page.fill('#q','새 문서');await page.press('#q','Enter');await waitCalls(1);await hide();await page.clock.fastForward(700000);assert.equal(calls.length,3);await show();release();await page.waitForFunction(()=>document.querySelector('.article')?.textContent.includes('복귀 뒤 받은 새 본문'));assert.equal(calls.length,3);
  pass('문서 생성 도중 화면을 숨겼다가 돌아와도 원래 결과를 문서로 저장한다');
  await page.fill('#q','기존 인물');await page.press('#q','Enter');await page.waitForSelector('.article h2');await page.locator('.portrait-menu summary').click();await page.click('[data-image-open]');kind='image';await page.click('[data-act="image-generate"]');await waitCalls(1);await hide();await page.clock.fastForward(400000);assert.equal(calls.length,4);await show();release();await page.waitForSelector('.image-gen .preview');assert.equal(calls.length,4);
  pass('이미지도 숨김 시간이 5분을 넘어도 중단·중복 과금 요청 없이 미리보기를 받는다');
  await page.click('[data-act="image-close"]');kind='check';await hide();await page.click('[data-check]');await page.clock.fastForward(400000);assert.equal(pending.length,0);assert.equal(calls.length,4);await show();await waitCalls(2);release();await page.waitForFunction(()=>document.querySelector('.memo-line')?.textContent.includes('설정 노트와 맞춰 봤습니다'));assert.equal(calls.length,6);
  pass('백그라운드에서 예약된 새 검사는 화면으로 복귀한 뒤에만 요청한다');
  assert.deepStrictEqual(errors,[]);console.log(`\n모두 통과 (${n}개). 실제 API 호출 0회. 실제 iPhone 절전·메모리 종료는 재현하지 않음.`);
 }finally{release();await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
