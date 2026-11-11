const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});
const doc=(key,title,type)=>({key,title,type,summary:title+'의 기록',infobox:[{label:'성별',value:'여성'},{label:'신장',value:'60m'}],sections:[{heading:'개요',level:1,body:'1989년 출동 대기 중 정비병 [[동료]]와 만났다.'}],links:['e16a81iwb4cu'],createdAt:1});
const p=doc('person','검증 인물','인물'),friend=doc('e16a81iwb4cu','동료','인물'),event=doc('event','항구 출동','사건');
const w={kind:'world',id:'prose',title:'단편 세계',seed:'거인이 있는 세계',era:'1989년',rules:['거인은 60m다'],userCanon:'출동은 11월이다',timeline:[{year:'1989년',event:'항구 출동',src:'seed'}],entities:Object.fromEntries([p,friend,event].map(p=>[p.key,{title:p.title,type:p.type,summary:p.summary,facts:[{t:'정비병과 친하다',src:'seed'}],mentions:[],page:true,box:'신장: 60m'}])),mainKey:'person',createdAt:1,updatedAt:1,tone:{label:'기록',guide:[]}};
const fixture={app:'worldwiki',version:1,worlds:[w],pages:{prose:{person:p,[friend.key]:friend,event}}};
const read=(page,key)=>page.evaluate(key=>new Promise((resolve,reject)=>{const r=indexedDB.open('worldwiki-gemini',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('kv'),q=t.objectStore('kv').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=reject;t.oncomplete=()=>db.close();};r.onerror=reject;}),key);
const write=(page,key,value)=>page.evaluate(({key,value})=>new Promise((resolve,reject)=>{const r=indexedDB.open('worldwiki-gemini',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('kv','readwrite');t.objectStore('kv').put(value,key);t.oncomplete=()=>{db.close();resolve();};t.onerror=reject;};}),{key,value});
const longBody='정비병은 창밖을 바라보며 동료의 말을 기다렸다.\n\n'.repeat(1000).slice(0,13999)+'끝';
let n=0;const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),ctx=await browser.newContext({acceptDownloads:true});
 await ctx.addInitScript(()=>{if(!localStorage.getItem('wwiki:gemini'))localStorage.setItem('wwiki:gemini',JSON.stringify({mode:'key',key:'test-key',preCheck:false}));});
 await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
 const requests=[],errors=[];let mode='ok',release,serial=0;
 await ctx.route('**/v1beta/models/**',async r=>{
  const req=JSON.parse(r.request().postData()),prompt=req.contents[0].parts[0].text;requests.push(prompt);
  let out;
  if(prompt.includes('## 文서'))throw new Error('unexpected');
  if(prompt.includes('## 문서 기반 단편 소설')){
   if(mode==='delay')await new Promise(resolve=>release=resolve);
   if(mode==='bad')out={title:'빈 결과'};else out={title:'대기실 '+(++serial),body:mode==='long'?longBody:'정비병은 손을 멈췄다.\n\n<script>window.proseXss=1</script>\n“조금만 기다려.”'};
  }else if(prompt.includes('## 작성할 문서:'))out={...p,facts:[],relations:[],newEntities:[],timeline:[]};
  else if(prompt.includes('사용자가 직접 수정한 최종본'))out={facts:[],relations:[],timeline:[],conflicts:[],newEntities:[]};
  else throw new Error('unexpected AI call: '+prompt.slice(0,100));
  try{await r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(out)}]},finishReason:'STOP'}]})+'\n\n'});}catch{}
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const openWorld=async()=>{await page.click('#side [data-act="home"]');await page.click('.wcard button.open');await page.waitForSelector('.article h2');};
 const generate=async()=>{await page.click('[data-act="prose-generate"]');await page.waitForSelector('.prose-preview');await page.waitForFunction(()=>!document.querySelector('[data-act="prose-save"]').disabled);};
 const save=async()=>{await page.click('[data-act="prose-save"]');await page.waitForSelector('.prose-preview',{state:'detached'});await page.waitForFunction(()=>!document.querySelector('[data-act="prose-generate"]').disabled);};
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.click('#side [data-act="gset"]');await page.setInputFiles('#importFile',{name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));await openWorld();
  const before=await read(page,'p:prose:person'),canon=await read(page,'w:prose');
  await page.click('[data-prose-open]');await page.fill('#proseDirection','출동 전날 밤. 정비병 시점, 조용하고 따뜻하게. 감정을 행동으로 표현.');await page.selectOption('#proseLength','short');await generate();
  const prompt=requests.at(-1);for(const text of [p.title,'60m','출동은 11월이다','정비병과 친하다','조용하고 따뜻하게','약 2,000~3,500자','위키 문서를 소설체로 요약'])assert(prompt.includes(text),text);
  assert.equal(await page.evaluate(()=>window.proseXss),undefined);assert((await page.locator('.prose-preview .prose-text').textContent()).includes('<script>'));
  assert.deepStrictEqual(await read(page,'p:prose:person'),before);assert.deepStrictEqual(await read(page,'w:prose'),canon);assert.equal(requests.length,1);
  pass('요청·문서·확정 설정으로 산문을 만들고 안전한 미리보기로만 표시한다');
  await save();const stored=await read(page,'p:prose:person');assert.equal(stored.shortStories.length,1);delete stored.shortStories;assert.deepStrictEqual(stored,{...before,savedAt:stored.savedAt});assert.deepStrictEqual(await read(page,'w:prose'),canon);
  await page.reload(); await page.waitForSelector('#main h1, #main .wcard, #gMode'); await page.click('#side [data-act="home"]'); await page.waitForSelector('.wcard');await openWorld();await page.click('[data-prose-open]');assert.equal(await page.locator('[data-prose-id]').count(),1);await page.locator('.prose-saved summary').click();assert((await page.locator('.prose-saved .prose-text').textContent()).includes('정비병'));
  pass('보관·새로고침 후에도 단편을 읽고 본문·세계관·확정 사실은 유지한다');
  const labels=await page.locator('#proseLength option').allTextContents();assert.deepStrictEqual(labels,['약 2,000~3,500자','약 5,000~8,000자','약 10,000~15,000자']);await page.selectOption('#proseLength','medium');await generate();assert(requests.at(-1).includes('약 5,000~8,000자'));mode='long';await page.selectOption('#proseLength','long');await generate();assert(requests.at(-1).includes('약 10,000~15,000자'));assert(requests.at(-1).includes('제목을 제외한 본문(공백 포함)'));assert(requests.at(-1).includes('여러 장면'));assert.equal(await page.locator('.prose-preview .prose-text').textContent(),longBody);await save();assert.equal((await read(page,'p:prose:person')).shortStories[1].body,longBody);assert.equal(longBody.length,14000);mode='ok';pass('확대된 세 분량을 UI와 요청에 반영하고 14,000자 본문을 잘라내지 않고 미리보기·저장한다');assert.equal((await read(page,'p:prose:person')).shortStories.length,2);await page.locator('.prose-saved summary').first().click();await page.locator('[data-prose-delete]').first().click();assert.equal((await read(page,'p:prose:person')).shortStories.length,2);await page.locator('[data-prose-delete]').first().click();await page.waitForFunction(()=>document.querySelectorAll('[data-prose-id]').length===1);
  pass('여러 편을 보관하고 확인을 거쳐 선택한 단편만 삭제한다');
  mode='bad';await page.click('[data-act="prose-generate"]');await page.waitForSelector('#prosePanel [role="alert"]');assert.equal((await read(page,'p:prose:person')).shortStories.length,1);
  pass('잘못된 응답은 기존 단편을 덮어쓰지 않는다');
  mode='delay';release=null;await page.click('[data-act="prose-generate"]');while(!release)await new Promise(r=>setTimeout(r,10));await page.click('[data-act="prose-close"]');release();await page.waitForSelector('#prosePanel',{state:'detached'});assert.equal((await read(page,'p:prose:person')).shortStories.length,1);
  pass('생성 중단은 보관한 단편과 본문을 보존한다');
  mode='ok';await page.click('[data-prose-open]');await generate();const original=await read(page,'p:prose:person');await write(page,'p:prose:person',{...original,summary:'다른 기기에서 고친 정의'});await page.click('[data-act="prose-save"]');await page.waitForFunction(()=>document.querySelector('#prosePanel [role="alert"]')?.textContent.includes('문서가 바뀌었습니다'));assert.equal((await read(page,'p:prose:person')).summary,'다른 기기에서 고친 정의');assert.equal(await page.locator('.prose-preview').count(),1);await write(page,'p:prose:person',original);
  pass('생성 중 원본이 바뀌면 저장을 거절하고 미리보기와 다른 기기 수정을 보존한다');
  await page.evaluate(()=>{const old=IDBObjectStore.prototype.put;window.restorePut=()=>IDBObjectStore.prototype.put=old;IDBObjectStore.prototype.put=function(){throw new DOMException('full','QuotaExceededError');};});await page.click('[data-act="prose-save"]');await page.waitForFunction(()=>document.querySelector('#prosePanel [role="alert"]')?.textContent.includes('저장하지 못했습니다'));assert.equal(await page.locator('.prose-preview').count(),1);assert.equal((await read(page,'p:prose:person')).shortStories.length,1);await page.evaluate(()=>window.restorePut());await save();
  pass('저장 실패 시 결과를 잃지 않고 다시 보관할 수 있다');
  await page.click('[data-act="prose-close"]');await page.click('[data-rw]');await page.click('[data-rw-yes]');await page.waitForSelector('.article h2');assert.equal((await read(page,'p:prose:person')).shortStories.length,2);
  await page.click('[data-edit]');await page.fill('#edBody','= 개요 =\n직접 고친 본문이다.');await page.click('#edSave');await page.waitForSelector('.article h2');assert.equal((await read(page,'p:prose:person')).shortStories.length,2);
  pass('AI 다시 쓰기와 직접 편집 뒤에도 보관한 단편을 유지한다');
  await page.fill('#q','항구 출동');await page.press('#q','Enter');await page.waitForSelector('.article h2');await page.click('[data-prose-open]');assert.equal(await page.locator('[data-prose-id]').count(),0);await page.fill('#proseDirection','항구 출동을 현장의 병사 시점으로');await generate();assert(requests.at(-1).includes('항구 출동'));await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await save();
  if(process.env.SHOT_DIR){fs.mkdirSync(process.env.SHOT_DIR,{recursive:true});await page.locator('.prose-saved summary').click();await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:path.join(process.env.SHOT_DIR,'prose-mobile.png'),fullPage:true});}
  pass('사건 문서에서도 단편을 만들고 모바일에서 가로 넘침 없이 읽는다');
  await page.click('#side [data-act="gset"]');const dl=page.waitForEvent('download');await page.click('[data-act="export"]');const d=await dl,backup=JSON.parse(fs.readFileSync(await d.path(),'utf8'));assert.equal(backup.pages.prose.person.shortStories.length,2);assert.equal(backup.pages.prose.event.shortStories.length,1);assert(!JSON.stringify(backup).includes('test-key'));
  const restored=await browser.newContext();await restored.route('https://fonts.googleapis.com/**',r=>r.abort());const rp=await restored.newPage();await rp.goto(`http://127.0.0.1:${server.address().port}`);await rp.waitForSelector('#importFile',{state:'attached'});await rp.setInputFiles('#importFile',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await rp.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));await rp.click('#side [data-act="home"]');await rp.click('.wcard button.open');await rp.waitForSelector('.article h2');await rp.click('[data-prose-open]');assert.equal(await rp.locator('[data-prose-id]').count(),2);assert(await rp.locator('[data-act="prose-generate"]').isDisabled());await restored.close();
  pass('다른 브라우저에 백업 복원하면 API 키 없이도 저장한 단편을 읽는다');
  const friendPage=await read(page,'p:prose:e16a81iwb4cu');friendPage.shortStories=[{id:'existing-friend-story',title:'이전 단편',body:'친구의 기록',createdAt:1}];await write(page,'p:prose:e16a81iwb4cu',friendPage);
  await page.reload(); await page.waitForSelector('#main h1, #main .wcard, #gMode'); await page.click('#side [data-act="home"]'); await page.waitForSelector('.wcard');await openWorld();await page.fill('#q','항구 출동');await page.press('#q','Enter');await page.waitForSelector('.article h2');await page.click('[data-mg]');await page.fill('#mgTo','동료');await page.click('[data-mg-yes]');await page.waitForFunction(()=>document.querySelector('h1.t')?.textContent==='동료');assert.equal((await read(page,'p:prose:e16a81iwb4cu')).shortStories.length,2);
  pass('문서 합치기는 양쪽의 보관 단편을 모두 남긴다');
  const merged=await read(page,'p:prose:e16a81iwb4cu');await write(page,'p:prose:e16a81iwb4cu',{...merged,shortStories:Array.from({length:20},(_,i)=>({id:'limit-'+i,title:'보관 단편 '+i,body:'이미 보관한 본문',createdAt:1}))});
  await page.reload(); await page.waitForSelector('#main h1, #main .wcard, #gMode'); await page.click('#side [data-act="home"]'); await page.waitForSelector('.wcard');await openWorld();await page.fill('#q','동료');await page.press('#q','Enter');await page.waitForSelector('.article h2');await page.click('[data-prose-open]');await generate();await page.click('[data-act="prose-save"]');await page.waitForFunction(()=>document.querySelector('#prosePanel [role="alert"]')?.textContent.includes('20편'));assert.equal((await read(page,'p:prose:e16a81iwb4cu')).shortStories.length,20);assert.equal(await page.locator('.prose-preview').count(),1);
  pass('보관 한도에서는 기존 20편과 새 미리보기를 보존한다');
  assert.deepStrictEqual(errors,[]);console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
