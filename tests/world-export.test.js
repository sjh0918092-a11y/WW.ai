const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});
const read=(p,key)=>p.evaluate(key=>new Promise(resolve=>{const r=indexedDB.open('worldwiki-gemini',1);r.onsuccess=()=>{const d=r.result,t=d.transaction('kv'),q=t.objectStore('kv').get(key);q.onsuccess=()=>resolve(q.result);t.oncomplete=()=>d.close();};}),key);
let n=0;const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),ctx=await browser.newContext({acceptDownloads:true});
 await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());let ai=0;await ctx.route('**/v1beta/**',r=>{ai++;return r.abort();});await ctx.route('https://api.openai.com/**',r=>{ai++;return r.abort();});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const url=`http://127.0.0.1:${server.address().port}`;
 const take=async(selector='[data-act="export-world"]')=>{const pending=page.waitForEvent('download');await page.click(selector);const d=await pending;assert(!d.failure||!await d.failure());return{data:JSON.parse(fs.readFileSync(await d.path(),'utf8')),name:d.suggestedFilename()};};
 try{
  await page.goto(url);await page.waitForSelector('#importFile',{state:'attached'});const img=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;c.getContext('2d').fillRect(0,0,32,32);return c.toDataURL('image/png');});
  const worlds=['one','two'].map((id,i)=>({kind:'world',id,title:i?'다른 세계':'검증: 세계/하나',seed:id+'의 원안',era:'1989년',rules:['규칙'],relations:[],navboxes:{},userCanon:'확정 설정',imageGuide:'실사 지침',aliases:{별명:'person'},timeline:[{year:'1989년',event:id+'의 사건',src:'seed'}],entities:{person:{title:id+' 인물',type:'인물',summary:id+' 정의',facts:[{t:'확정 사실',src:'seed'}],mentions:[],page:true,box:''}},mainKey:'person',createdAt:1}));
  const pages=Object.fromEntries(worlds.map(w=>[w.id,{person:{key:'person',title:w.entities.person.title,type:'인물',summary:w.id+' 정의',infobox:[],sections:[{heading:'개요',level:1,body:w.id+' 본문'}],links:[],createdAt:1,portrait:img,shortStories:[{id:w.id+'-story',title:'단편',body:w.id+'의 단편 본문',direction:'따뜻한 문체',illustration:img,createdAt:1}]},plain:{key:'plain',title:'평범한 문서',type:'물건',summary:'설명',infobox:[],sections:[{heading:'개요',body:'이미지 없는 문서',level:1}],links:[],createdAt:1}}]));
  const fixture={app:'worldwiki',version:1,worlds,pages};await page.setInputFiles('#importFile',{name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
  const open=async title=>{await page.click('#side [data-act="home"]');await page.getByRole('button',{name:title,exact:true}).click();await page.waitForSelector('.article h2');await page.click('#side [data-act="canon"]');await page.waitForSelector('#worldExport');};
  await open(worlds[0].title);assert(await page.locator('#exportWorldImages').isChecked());assert(await page.locator('#exportWorldStories').isChecked());assert(await page.locator('#worldExport').evaluate(x=>x===x.parentElement.lastElementChild));
  const original=await read(page,'p:one:person'),originalWorld=await read(page,'w:one');const outputs=[];
  for(const [images,stories] of [[true,true],[false,true],[true,false],[false,false]]){
   await page.locator('#exportWorldImages').setChecked(images);await page.locator('#exportWorldStories').setChecked(stories);
   const out=await take(),data=out.data;outputs.push({images,stories,data});assert.equal(data.app,'worldwiki');assert.equal(data.version,1);assert.equal(data.worlds.length,1);assert.equal(data.worlds[0].id,'one');assert.deepStrictEqual(Object.keys(data.pages),['one']);assert.equal(data.worlds[0].imageGuide,'실사 지침');assert.equal(data.worlds[0].aliases.별명,'person');assert.equal(data.pages.one.plain.sections[0].body,'이미지 없는 문서');assert(!out.name.includes('/')&&!out.name.includes(':'));assert(out.name.includes('검증_ 세계_하나'));
   const p=data.pages.one.person;assert.equal('portrait'in p,images);assert.equal('shortStories'in p,stories);if(stories){assert.equal(p.shortStories[0].body,'one의 단편 본문');assert.equal(p.shortStories[0].direction,'따뜻한 문체');assert.equal('illustration'in p.shortStories[0],images);}
   assert.equal(p.summary,original.summary);assert.deepStrictEqual(p.sections,original.sections);assert.deepStrictEqual(data.worlds[0],originalWorld);
  }
  pass('설정 노트 최하단에서 현재 세계관만 내보내고 이미지·단편 4가지 조합을 반영한다');
  assert.deepStrictEqual(await read(page,'p:one:person'),original);assert.deepStrictEqual(await read(page,'w:one'),originalWorld);assert((await read(page,'p:two:person')).portrait);assert.equal(ai,0);
  pass('제외 선택은 파일에만 적용하고 원본·다른 세계관을 변경하거나 API를 호출하지 않는다');
  await page.click('[data-filter="done"]');assert(!await page.locator('#exportWorldImages').isChecked());assert(!await page.locator('#exportWorldStories').isChecked());await open(worlds[1].title);assert(await page.locator('#exportWorldImages').isChecked());assert(await page.locator('#exportWorldStories').isChecked());const other=await take();assert.equal(other.data.worlds[0].id,'two');assert.deepStrictEqual(Object.keys(other.data.pages),['two']);await open(worlds[0].title);assert(!await page.locator('#exportWorldImages').isChecked());
  pass('화면을 다시 그려도 선택을 유지하며 세계관별로 선택과 내보낼 대상을 구분한다');
  await page.fill('#wTitle','아직 저장하지 않은 이름');await take();assert.equal(await page.inputValue('#wTitle'),'아직 저장하지 않은 이름');assert.equal((await read(page,'w:one')).title,worlds[0].title);
  pass('내보내기는 미저장 설정을 임의로 저장하거나 지우지 않는다');
  await page.click('#side [data-act="gset"]');const all=await take('[data-act="export"]');assert.equal(all.data.worlds.length,2);for(const id of ['one','two']){assert(all.data.pages[id].person.portrait);assert(all.data.pages[id].person.shortStories[0].illustration);}
  pass('기존 전체 백업은 선택 여부와 무관하게 모든 세계관·이미지·단편을 포함한다');
  for(const out of outputs){
   const restore=await browser.newContext();await restore.route('https://fonts.googleapis.com/**',r=>r.abort());const rp=await restore.newPage();await rp.goto(url);await rp.waitForSelector('#importFile',{state:'attached'});await rp.setInputFiles('#importFile',{name:'single.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(out.data))});await rp.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));await rp.click('#side [data-act="home"]');assert.equal(await rp.locator('.wcard').count(),1);await rp.locator('.wcard button.open').click();await rp.waitForSelector('.article h2');assert.equal(await rp.locator('.portrait img').count(),out.images?1:0);const restored=await read(rp,'p:one:person');assert.equal('shortStories'in restored,out.stories);if(out.stories){await rp.click('[data-prose-open]');await rp.locator('.prose-saved summary').click();assert.equal(await rp.locator('.prose-illustration img').count(),out.images?1:0);assert((await rp.locator('.prose-saved .prose-text').textContent()).includes('one의 단편'));}assert.equal(await read(rp,'w:two'),undefined);await restore.close();
  }
  pass('4가지 파일을 기존 가져오기로 다른 브라우저에 복원해 읽을 수 있다');
  await open(worlds[0].title);await page.setViewportSize({width:390,height:844});await page.locator('#worldExport').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(process.env.SHOT_DIR){fs.mkdirSync(process.env.SHOT_DIR,{recursive:true});await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:path.join(process.env.SHOT_DIR,'world-export-mobile.png')});}assert.deepStrictEqual(errors,[]);assert.equal(ai,0);
  pass('모바일 화면과 API 연결 없는 내보내기를 확인한다');console.log(`\n모두 통과 (${n}개). 실제 API 호출 0회.`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
