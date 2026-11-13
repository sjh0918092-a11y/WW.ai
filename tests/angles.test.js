/* 랜덤 서핑 각도: 목록 생성·선택·프롬프트 반영·기록·화면·내보내기. Gemini 응답은 모두 가로챈다(유료 호출 0회) */
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const { appServer, appSource } = require("./helpers/app");
const {chromium}=require('playwright');
const html=appSource(),keyContext={};vm.createContext(keyContext);vm.runInContext(html.slice(html.indexOf('function cyrb53('),html.indexOf('const LINK_RE ='))+'globalThis.makeKey=keyOf;',keyContext);const key=keyContext.makeKey;
const server=appServer();
const read=(p,k)=>p.evaluate(k=>new Promise(resolve=>{const r=indexedDB.open('worldwiki-gemini',1);r.onsuccess=()=>{const d=r.result,t=d.transaction('kv'),q=t.objectStore('kv').get(k);q.onsuccess=()=>resolve(q.result);t.oncomplete=()=>d.close();};}),k);
let n=0;const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),ctx=await browser.newContext({acceptDownloads:true});
 await ctx.addInitScript(()=>{if(!localStorage.getItem('wwiki:gemini'))localStorage.setItem('wwiki:gemini',JSON.stringify({mode:'key',key:'test-key',main:'test-main',quick:'test-quick',preCheck:false}));});
 await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
 const hero=key('마법 학교'),pupil=key('리나 하르트'),guild=key('마법 길드 본부'),examTitles=['입학 시험','중간 시험','졸업 시험'],exams=examTitles.map(key);
 const ent=(title,page,summary,type='지명')=>({title,type,summary,facts:[],mentions:[],page,box:''});
 const pg=(k,title,type)=>({key:k,title,type,summary:title+' 요약',infobox:[],sections:[{heading:'개요',level:1,body:title+'은 마법 학교의 일부다.'}],links:[],createdAt:1});
 const world={kind:'world',id:'mage',title:'마법 학교',seed:'마법을 배우는 기숙 학교 세계관.',era:'1990년',guide:'학교 생활이 중심이다',rules:['마법은 재능이 있는 사람만 쓸 수 있다','졸업생은 마법 길드에 등록한다'],userCanon:'',timeline:[],relations:[],navboxes:{},aliases:{},entities:{[hero]:ent('마법 학교',true,'기숙 학교'),[pupil]:ent('리나 하르트',true,'수석 학생','인물'),[guild]:ent('마법 길드 본부',false,'졸업생이 등록하는 길드의 본부'),...Object.fromEntries(examTitles.map(t=>[key(t),ent(t,true,t+' 제도','제도')]))},mainKey:hero,tone:{label:'학원 판타지',guide:['차분한 기록']},createdAt:1};
 const fixture={app:'worldwiki',version:1,worlds:[world],pages:{mage:{[hero]:pg(hero,'마법 학교','지명'),[pupil]:pg(pupil,'리나 하르트','인물'),...Object.fromEntries(examTitles.map(t=>[key(t),pg(key(t),t,'제도')]))}}};
 const C=(id,axis,label,consequence,extra={})=>({id,axis,label,consequence,surprise:'원안은 재능 있는 학생만 비춘다',contrast:'기존 문서는 재능을 영광으로만 본다',scene:label+'이 등장하는 교정 게시판의 손글씨 공지',safe:'규칙을 어기지 않고 차분한 기록체로 쓸 수 있다',...extra});
 const anglesReply={dominant:'기존 문서들은 마법 재능을 영광으로 본다',candidates:[C('c1','감정 반전','마법을 거의 못 쓰는 학생','재능 선별이 오래 이어지며 낙제생끼리 즐기는 비공식 축제가 생겼다'),C('c2','의외의 수혜자','마법 도구를 파는 상인','길드 등록 의무 때문에 졸업 앨범 대필업이 번성했다'),C('c3','감정 반전','규칙 되풀이','마법은 재능이 있는 사람만 쓸 수 있다'),C('c4','문화적 반응','안전 근거 없음','마법 결투가 방송 스포츠가 되었다',{safe:''}),C('c5','개인적 관계','학생의 가족','기숙 생활이 길어져 집으로 보내는 편지 양식이 정형화되었다'),C('c7','체계의 지지자','결론 비교 없음','선별 제도를 옹호하는 교사회가 생겼다',{contrast:''}),C('c8','일상화','장면 없음','마법 관용구가 생겼다',{scene:''}),C('c9','일상화','이미 많이 다룬 영역','시험 문화가 학교 전체를 지배하게 되었다'),C('c6','일상화','고르지 않은 후보','낙제 마법사의 우스개가 관용구로 굳었다')],picked:['c1','c2','c3','c4','c5','c7','c8','c9','없는id'],classify:[{key:pupil,angle:'c5'},{key:hero,angle:null},{key:'없는키',angle:'c1'},{key:guild,angle:'c1'},...exams.map(k=>({key:k,angle:'c9'})),{key:exams[0],angle:'c9'}]};
 const make=title=>({fit:'strong',title,type:'인물',summary:title+'은 학교와 이어진 인물이다.',connection:'마법 재능 규칙과 이어진다.',direction:'학교 생활과 연결한다.',aliases:[],novelty:{verdict:'novel',reason:'기존 항목과 역할이 다르다',comparisons:[{key:pupil,reason:'수석 학생과 다른 인물이다'}]}});
 const page=await ctx.newPage(),calls=[],errors=[];let plans=[],angleMode='fail',pageMode='ok',planAngle,hold=false,release=null;
 page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message);});
 await ctx.route('**/v1beta/models/**',async r=>{const req=JSON.parse(r.request().postData()),prompt=req.contents[0].parts[0].text;const kind=prompt.includes('## 각도 목록 만들기')?'angles':prompt.includes('## 랜덤 서핑의 새 대상 선정')?'plan':prompt.includes('## 작성할 문서:')?'page':'unexpected';calls.push({kind,prompt});let out;
  const fail=async()=>{try{await r.fulfill({status:404,json:{error:{message:'model missing'}}});}catch{}};
  if(kind==='angles'){if(angleMode==='fail')return fail();out=anglesReply;}
  else if(kind==='plan'){if(hold)await new Promise(res=>release=res);out=plans.shift();if(out&&planAngle!==undefined)out={...out,angle:planAngle};}
  else if(kind==='page'){if(pageMode==='hold')await new Promise(res=>release=res);if(pageMode==='fail')return fail();const title=/## 작성할 문서: 「([^」]+)」/.exec(prompt)[1];out={title,type:'인물',summary:title+'의 정의',infobox:[{label:'성별',value:'여성'}],sections:[{heading:'개요',level:1,body:title+'은 마법 학교와 이어진 인물이다.'}],links:[],facts:[],newEntities:[],relations:[],timeline:[]};}
  else return fail();
  try{await r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(out)}]},finishReason:'STOP'}]})+'\n\n'});}catch{}});
 const port=server.address().port;
 const waitTitle=t=>page.waitForFunction(t=>document.querySelector('h1.t')?.textContent===t,t);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#discoveryBtn').disabled);
 const surf=async()=>{await page.click('#discoveryBtn');};
 const rand=v=>page.evaluate(v=>{window.__rand??=Math.random;Math.random=v===null?window.__rand:()=>v;},v);
 const openWorldFrom=async()=>{await page.click('#side [data-act="home"]');await page.locator('.wcard button.open').click();await page.waitForSelector('.article h2');};
 const since=i=>calls.slice(i).map(x=>x.kind);
 try{
  await page.goto(`http://127.0.0.1:${port}`);await page.click('#side [data-act="gset"]');await page.setInputFiles('#importFile',{name:'f.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));await openWorldFrom();
  await page.click('#side [data-act="canon"]');await page.waitForSelector('#angles');assert((await page.locator('.sheet').innerText()).includes('아직 만들지 않았습니다'));assert.equal((await read(page,'w:mage')).angles,undefined);
  pass('각도가 없는 기존 세계를 열고 설정 노트를 봐도 오류 없이 빈 상태를 보여 준다');

  const r1=await page.evaluate(()=>{const A=(id,count,off=false)=>({id,label:id,why:'규칙',count,off});const w={angles:[A('a',2),A('b',0),A('c',0),A('d',0,true)]};const seq=xs=>{let i=0;return()=>xs[i++%xs.length];};
   const picks=new Set();for(const x of [0,0.4,0.99])picks.add(pickAngle(w,seq([0.1,x]))?.id);
   return{old:angleBlock({id:'o',label:'옛 각도',why:'옛 근거'}),rate:ANGLE_RATE,direction:pickAngle(w,()=>0,'사용자 설명'),miss:pickAngle(w,()=>0.3),last:pickAngle({...w,angleLast:true},()=>0),off:pickAngle({...w,angleOff:true},()=>0),none:pickAngle({angles:[A('x',0,true)]},()=>0),empty:pickAngle({},()=>0),picks:[...picks].sort()};});
  assert(r1.old.includes('「옛 각도」 (근거: 옛 근거)'));assert.equal(r1.rate,0.3);assert.equal(r1.direction,null);assert.equal(r1.miss,null);assert.equal(r1.last,null);assert.equal(r1.off,null);assert.equal(r1.none,null);assert.equal(r1.empty,null);assert.deepStrictEqual(r1.picks,['b','c']);
  const oldList=[{id:'a1',label:'옛 각도',why:'옛 근거',count:2,off:false}],c0=calls.length;const kept=await page.evaluate(async list=>{const w={id:'old',title:'옛',entities:{},angles:JSON.parse(JSON.stringify(list))};await ensureAngles(w,new AbortController().signal);return w.angles;},oldList);assert.deepStrictEqual(kept,oldList);assert.equal(calls.length,c0);
  const span=await page.evaluate(()=>{const W=(era,timeline,extra={})=>({era,timeline,entities:{},...extra});const T=(...ys)=>ys.map(year=>({year,event:'사건'}));const run=w=>{try{return{n:worldSpan(w),line:spanLine(worldSpan(w))};}catch(e){return{err:e.message};}};
   return{empty:run(W('1990년',[])),noTl:run(W('1990년',undefined)),badEra:run(W('먼 옛날',T('1945년'))),badTl:run(W('1990년',T('태초','언젠가'))),west:run(W('1989년',T('1950년','1945','1970년'))),sup:run(W('1989년',[{year:'1900년',event:'x',sup:{by:'a'}},{year:'1980',event:'y'}])),fict:run(W('성력 312년',T('성력 300년','성력 305'))),mixed:run(W('성력 312년',T('1945년'))),era2:run(W('건안 13년',T('건안 원년','건안 5'),{calendars:['건안']})),bc:run(W('서기 5년',T('기원전 3년'))),future:run(W('1980년',T('1990년'))),same:run(W('2024년 3월',T('2024년 1월'))),nul:run(null)};});
  assert.deepStrictEqual(Object.fromEntries(Object.entries(span).map(([k,v])=>[k,v.err?'ERR '+v.err:v.n])),{empty:null,noTl:null,badEra:null,badTl:null,west:44,sup:9,fict:12,mixed:null,era2:12,bc:7,future:null,same:0,nul:null});
  assert.equal(span.empty.line,'경과 시간 알 수 없음. 원안과 연표를 보고 판단할 것');assert.equal(span.west.line,'세계의 핵심 설정이 성립한 뒤 작중 시점까지 약 44년');assert(span.same.line.includes('1년이 채 되지 않음'));
  pass('경과 시간: 연표가 비었거나 연도를 못 읽거나 기년법이 다르면 알 수 없음, 서기·가상 기년법·연호·기원전은 올바른 햇수');
  pass('pickAngle: 사용자 설명·연속 사용·꺼진 각도·30% 밖이면 null, count가 가장 작은 켜진 각도만 후보, 기존 목록(옛 형식 포함)은 자동으로 다시 만들지 않는다');

  angleMode='fail';plans=[make('카르멘 벨')];let i=calls.length;await surf();await waitTitle('카르멘 벨');await ready();assert.deepStrictEqual(since(i),['angles','plan','page']);let w=await read(page,'w:mage');assert.equal(w.angles,undefined);assert(w.entities[key('카르멘 벨')].page);assert(!calls[i+1].prompt.includes('## 이번 각도'));
  plans=[make('도로시 크레인')];i=calls.length;await surf();await waitTitle('도로시 크레인');await ready();assert.deepStrictEqual(since(i),['plan','page']);
  pass('각도 목록 생성이 실패해도 랜덤 서핑은 각도 없이 완료되고, 같은 접속에서 다시 부르지 않는다');

  await page.reload();await page.waitForSelector('.article h2, .wcard');if(!(await page.locator('.article h2').count()))await openWorldFrom();
  angleMode='ok';await rand(0);plans=[make('토마스 그린')];planAngle=undefined;hold=true;release=null;i=calls.length;await surf();
  for(let k=0;k<400&&!release;k++)await new Promise(r=>setTimeout(r,10));assert(release);assert.equal(await page.locator('#discoveryAngle').innerText(),'이번 각도: 마법을 거의 못 쓰는 학생');hold=false;release();
  await waitTitle('토마스 그린');await ready();assert.deepStrictEqual(since(i),['angles','plan','page']);
  w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>[a.id,a.label,a.count,a.off]),[['a1','마법을 거의 못 쓰는 학생',1,false],['a2','마법 도구를 파는 상인',0,false],['a3','학생의 가족',1,false],['a4','고르지 않은 후보',0,false]]);assert.equal(w.angleLast,true);
  const anglePara='## 이번 각도: 「마법을 거의 못 쓰는 학생」 (근거: 재능 선별이 오래 이어지며 낙제생끼리 즐기는 비공식 축제가 생겼다)';assert.deepStrictEqual(w.angles.map(a=>a.axis),['감정 반전','의외의 수혜자','개인적 관계','일상화']);assert(w.angles.every(a=>a.consequence&&a.surprise&&a.safe&&a.scene&&a.contrast&&!('why' in a)));assert.equal(w.angleDominant,'기존 문서들은 마법 재능을 영광으로 본다');
  assert(calls[i+1].prompt.includes(anglePara));assert(calls[i+1].prompt.includes('어조·문체·세계 규칙은 바꾸지 않는다'));assert(calls[i+1].prompt.includes('"angle":"a1"'));assert(calls[i+2].prompt.includes(anglePara));assert(calls[i+1].prompt.includes('이 각도의 예시 장면: 마법을 거의 못 쓰는 학생이 등장하는 교정 게시판의 손글씨 공지'));
  for(const t of [world.seed,'리나 하르트','마법 길드 본부','졸업생이 등록하는 길드의 본부','빨간 링크·미작성','이미 문서나 빨간 링크로 다뤄진 영역은 각도로 내지 않는다','핵심 설정이 작중 시점까지 지속된 기간 동안 생겼을 법한 2차·3차 결과','## 세계의 경과 시간','경과 시간 알 수 없음. 원안과 연표를 보고 판단할 것','며칠~몇 달: 부정과 혼란','시작점이 없는 세계','사태 일주일 만에 생긴 관광 산업','규칙을 다시 말하거나 요약한 것은 근거로 인정하지 않는다','후보 15개','8개를 고른다','원안을 읽은 사람이 바로 떠올릴 법한가? 그렇다면 버린다','safe를 설명하지 못하는 후보는 의외성이 높아도 버린다','감정 반전','일상화','의외의 수혜자','문화적 반응','체계의 지지자','개인적 관계','문체는 톤 지침 그대로','"surprise"','"safe"','"consequence"','"scene"','"contrast"','"dominant"','세계 안의 공식 입장이 아니라','기존 문서들의 공통 결론(dominant)을 뒤집는다','악역이나 허수아비가 아니라 독자가 일부 수긍할 만한 논리','"주제나 결론을 유지한다"는 safe의 근거로 인정하지 않는다','범주만 있고 장면이 없는 후보는 버린다','교실 벽에 붙은 역장 충격파 대피 안내문','갑자기 코미디'])assert(calls[i].prompt.includes(t),t);
  assert.equal((await read(page,'p:mage:'+key('토마스 그린'))).angle,'a1');
  pass('목록 생성 호출 한 번으로 공통 결론·장면·근거 있는 각도와 기존 문서 분류를 받고, 장면·결론 비교가 없거나 관련 문서가 3개 이상인 후보는 버리고 남은 후보로 채우며, 고른 각도를 선정·작성 프롬프트와 상태 문구에 반영한 뒤 저장 성공 시에만 기록한다');

  plans=[make('에밀 바스')];i=calls.length;await surf();await waitTitle('에밀 바스');await ready();assert.deepStrictEqual(since(i),['plan','page']);assert(!calls[i].prompt.includes('## 이번 각도'));w=await read(page,'w:mage');assert.equal(w.angleLast,false);assert.equal((await read(page,'p:mage:'+key('에밀 바스'))).angle,undefined);
  pass('직전 랜덤 서핑이 각도를 썼으면 이번에는 중심 소재로 돌아간다');

  pageMode='fail';plans=[make('실패 후보')];i=calls.length;await surf();await page.waitForSelector('[role="alert"]');await ready();assert.deepStrictEqual(since(i),['plan','page']);assert(calls[i].prompt.includes('「마법 도구를 파는 상인」'));w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,0,1,0]);assert.equal(w.angleLast,false);assert(!w.entities[key('실패 후보')]);
  pageMode='hold';release=null;plans=[make('중단 후보')];await surf();for(let k=0;k<400&&!release;k++)await new Promise(r=>setTimeout(r,10));assert(release);assert((await page.locator('#genAngle').innerText()).includes('이번 각도: 마법 도구를 파는 상인'));await page.click('[data-act="stop"]');release();await page.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('중단'));await ready();pageMode='ok';w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,0,1,0]);assert(!w.entities[key('중단 후보')]);
  pass('문서 작성이 실패하거나 중단되면 각도 count와 연속 사용 기록이 바뀌지 않는다');

  planAngle=null;plans=[make('각도 거부 후보')];i=calls.length;await surf();await waitTitle('각도 거부 후보');await ready();planAngle=undefined;assert(!calls[i+1].prompt.includes('## 이번 각도'));w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,0,1,0]);
  pass('선정 응답이 angle:null이면 각도 없이 작성하고 count를 올리지 않는다');

  await page.locator('#discoveryBtn').dblclick();await page.waitForSelector('#discoveryDirection');await page.fill('#discoveryDirection','학교 매점 주인');plans=[make('매점 주인 오토')];i=calls.length;await page.click('[data-act="discovery-create"]');await waitTitle('매점 주인 오토');await ready();assert(!calls[i].prompt.includes('## 이번 각도'));assert(!calls[i+1].prompt.includes('## 이번 각도'));
  pass('사용자가 설명을 적으면 각도를 쓰지 않는다');

  await page.locator('#discoveryBtn').dblclick();await page.waitForSelector('#discoveryDirection');await page.fill('#discoveryDirection','');await page.check('[data-angle-off]');await page.waitForFunction(()=>S.world.angleOff===true);assert.equal((await read(page,'w:mage')).angleOff,true);plans=[make('끔 후보')];i=calls.length;await page.click('[data-act="discovery-create"]');await waitTitle('끔 후보');await ready();assert(!calls[i].prompt.includes('## 이번 각도'));
  await page.locator('#discoveryBtn').dblclick();await page.waitForSelector('[data-angle-off]');assert(await page.locator('[data-angle-off]').isChecked());await page.uncheck('[data-angle-off]');await page.waitForFunction(()=>S.world.angleOff===false);
  pass('"각도 쓰지 않기"는 세계별로 저장되고 켜 두면 각도를 쓰지 않는다');

  await page.click('#side [data-act="canon"]');await page.waitForSelector('.angles li');assert.equal(await page.locator('.angles li').count(),4);assert((await page.locator('.sheet').innerText()).includes('기존 문서들의 공통 결론: 기존 문서들은 마법 재능을 영광으로 본다'));assert((await page.locator('.angles').innerText()).includes('장면: 마법 도구를 파는 상인이 등장하는'));
  await page.click('[data-angle-toggle="a1"]');await page.waitForFunction(()=>document.querySelector('[data-angle-toggle="a1"]')?.textContent==='켜기');await page.fill('[data-angle-label="a2"]','마법 도구 노점상');await page.click('[data-angle-save="a2"]');await page.waitForFunction(()=>S.world.angles[1].label==='마법 도구 노점상');
  await page.click('[data-angle-del="a3"]');assert.equal(await page.locator('.angles li').count(),4);await page.click('[data-angle-del="a3"]');await page.waitForFunction(()=>S.world.angles.length===3);
  w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>[a.id,a.label,a.off]),[['a1','마법을 거의 못 쓰는 학생',true],['a2','마법 도구 노점상',false],['a4','고르지 않은 후보',false]]);
  i=calls.length;await page.click('[data-act="angles-regen"]');await page.waitForFunction(()=>S.world.angles.length===4&&!S.angleGen);assert.deepStrictEqual(since(i),['angles']);w=await read(page,'w:mage');assert.equal(w.angles.length,4);assert(w.angles.every(a=>!a.off));
  pass('설정 노트에서 각도를 끄고 문구를 고치고 지우고 목록을 다시 만들 수 있다');

  const pending=page.waitForEvent('download');await page.click('[data-act="export-world"]');const dl=await pending;const data=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));assert.deepStrictEqual(data.worlds[0].angles,w.angles);assert.equal(data.pages.mage[key('토마스 그린')].angle,'a1');
  data.worlds[0].id='mage2';data.pages={mage2:data.pages.mage};await page.click('#side [data-act="gset"]');await page.setInputFiles('#importFile',{name:'e.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
  const imported=await read(page,'w:mage2');assert.deepStrictEqual(imported.angles,w.angles);assert.equal((await read(page,'p:mage2:'+key('토마스 그린'))).angle,'a1');
  pass('세계 내보내기·가져오기에 각도 목록과 문서의 각도 기록이 유지된다');

  await rand(null);assert(calls.every(x=>x.kind!=='unexpected'));assert.deepStrictEqual(errors,[]);console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
