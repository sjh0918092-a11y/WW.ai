const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});
const read=(p,key)=>p.evaluate(key=>new Promise(resolve=>{const r=indexedDB.open('worldwiki-gemini',1);r.onsuccess=()=>{const d=r.result,t=d.transaction('kv'),q=t.objectStore('kv').get(key);q.onsuccess=()=>resolve(q.result);t.oncomplete=()=>d.close();};}),key);
let page;const saved=async()=>{await page.waitForSelector('.article');await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('저장했습니다'));await page.evaluate(()=>{document.querySelector('#toast').textContent='';});};
let n=0;const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),ctx=await browser.newContext();
 await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
 page=await ctx.newPage();const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/v1beta/models/**',r=>{calls.push(r.request().postData());r.abort();});
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('#importFile',{state:'attached'});
  const img=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;return c.toDataURL('image/png');});
  const unit={key:'unit',title:'독수리 중대',type:'단체',summary:'정의 그대로',categories:['분류'],notices:['안내'],infobox:[{label:'인원',value:'2명'}],sections:[{heading:'개요',level:1,body:'본문 그대로 [[대원 갑]]'}],links:['a'],createdAt:1,portrait:img,shortStories:[{id:'s',title:'단편',body:'그대로',createdAt:1}]};
  const a={key:'a',title:'대원 갑',type:'인물',summary:'대원',categories:[],notices:[],infobox:[],sections:[{heading:'개요',level:1,body:'갑의 본문'}],links:[],createdAt:1};
  const w={kind:'world',id:'nb',title:'틀 세계',seed:'세계',era:'1989년',rules:[],userCanon:'',timeline:[],relations:[],
   navboxes:{'unit-0':{src:'unit',srcTitle:'독수리 중대',title:'독수리 중대 대원',members:['a','b'],rows:[{label:'창설 대원',items:['[[대원 갑]] — 1번','[[대원 을]] — 2번']}]}},
   entities:{unit:{title:'독수리 중대',type:'단체',summary:'정의 그대로',facts:[],mentions:[],page:true,box:''},a:{title:'대원 갑',type:'인물',summary:'대원',facts:[],mentions:[{from:'unit',text:'독수리 중대 대원 — 창설 대원: 대원 갑 — 1번'}],page:true,box:''},b:{title:'대원 을',type:'인물',summary:'',facts:[],mentions:[{from:'unit',text:'독수리 중대 대원 — 창설 대원: 대원 을 — 2번'}],page:false,box:''}},mainKey:'unit',createdAt:1};
  await page.setInputFiles('#importFile',{name:'f.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'worldwiki',version:1,worlds:[w],pages:{nb:{unit:unit,a:a}}}))});
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));await page.click('#side [data-act="home"]');await page.locator('.wcard button.open').click();await page.waitForSelector('.article');
  const initial=await read(page,'p:nb:unit');
  assert.equal(await page.locator('.navbox [data-navbox-edit="unit"]').count(),1);
  pass('문서의 틀에 편집 버튼을 표시한다');
  // 구성원 문서에서 틀 편집을 누르면 틀을 만든 문서의 틀 편집으로 이동
  await page.locator('.navbox li',{hasText:'대원 갑'}).locator('[data-k], a').first().click();await page.waitForFunction(()=>document.querySelector('h1.t')?.textContent.includes('대원 갑'));
  await page.locator('.navbox summary').first().click();await page.click('.navbox [data-navbox-edit="unit"]');await page.waitForSelector('#edNavbox');
  assert((await page.locator('h1.t').textContent()).includes('독수리 중대'));assert.equal(await page.locator('#edBody').count(),0);
  assert((await page.inputValue('#edNavbox')).includes('[[대원 을]] — 2번'));
  pass('구성원 문서의 틀에서 편집을 누르면 틀을 만든 문서의 틀 편집 화면이 열린다');
  await page.fill('#edNavbox','= 독수리 중대 대원 =\n== 창설 대원 ==\n[[대원 갑]] — 1번, 대장\n== 보충 대원 ==\n[[대원 병]] — 3번');
  await page.click('#edSave');await saved();
  const nb=(await read(page,'w:nb')).navboxes;const own=Object.values(nb).filter(x=>x.src==='unit');assert.equal(own.length,1);
  assert.deepStrictEqual(own[0].rows,[{label:'창설 대원',items:['[[대원 갑]] — 1번, 대장']},{label:'보충 대원',items:['[[대원 병]] — 3번']}]);
  const stored=await read(page,'p:nb:unit');for(const f of ['title','type','summary','categories','notices','infobox','sections','portrait','shortStories'])assert.deepStrictEqual(stored[f],initial[f],f);
  const ws=await read(page,'w:nb');assert(!ws.entities.b||!ws.entities.b.mentions.some(m=>m.from==='unit'));assert(ws.entities[Object.keys(ws.entities).find(x=>ws.entities[x].title==='대원 병')].mentions.some(m=>m.from==='unit'));
  assert.equal(calls.length,0);
  pass('틀만 바꿔 저장하고 본문·인포박스·분류·이미지·단편은 그대로 두며, 빠진·새 구성원의 언급을 다시 정리한다');
  await page.click('.navbox [data-navbox-edit="unit"]');await page.waitForSelector('#edNavbox');await page.fill('#edNavbox','= 독수리 중대 대원 =\n[[대원 갑]] — 대장 초안');
  await page.click('.ed [data-edit="unit"]');await page.waitForSelector('#edBody');assert((await page.inputValue('#edNavbox')).includes('대장 초안'));await page.click('[data-act="ed-cancel"]');
  pass('틀 편집 초안을 문서 전체 편집으로 이어 갈 수 있다');
  await page.click('.navbox [data-navbox-edit="unit"]');await page.waitForSelector('#edNavbox');await page.fill('#edNavbox','');await page.click('#edSave');await saved();
  assert.equal(Object.values((await read(page,'w:nb')).navboxes).filter(x=>x.src==='unit').length,0);assert.equal(await page.locator('.navbox').count(),0);
  pass('칸을 비우고 저장하면 틀을 지운다');
  assert.deepStrictEqual(errors,[]);console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
