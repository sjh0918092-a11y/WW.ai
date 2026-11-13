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
 const C=(id,axis,label,consequence,extra={})=>({id,axis,label,area:label+' 영역',consequence,surprise:'원안은 재능 있는 학생만 비춘다',contrast:'기존 문서는 재능을 영광으로만 본다',scene:label+'이 등장하는 교정 게시판의 손글씨 공지',safe:'규칙을 어기지 않고 차분한 기록체로 쓸 수 있다',...extra});
 const anglesReply={dominant:'기존 문서들은 마법 재능을 영광으로 본다',candidates:[C('c1','감정 반전','마법을 거의 못 쓰는 학생','재능 선별이 오래 이어지며 낙제생끼리 즐기는 비공식 축제가 생겼다'),C('c2','의외의 수혜자','마법 도구를 파는 상인','길드 등록 의무 때문에 졸업 앨범 대필업이 번성했다'),C('c3','감정 반전','규칙 되풀이','마법은 재능이 있는 사람만 쓸 수 있다'),C('c4','문화적 반응','안전 근거 없음','마법 결투가 방송 스포츠가 되었다',{safe:''}),C('c5','개인적 관계','학생의 가족','기숙 생활이 길어져 집으로 보내는 편지 양식이 정형화되었다'),C('c7','체계의 지지자','결론 비교 없음','선별 제도를 옹호하는 교사회가 생겼다',{contrast:''}),C('c8','일상화','장면 없음','마법 관용구가 생겼다',{scene:''}),C('c9','일상화','이미 많이 다룬 영역','시험 문화가 학교 전체를 지배하게 되었다'),C('c6','일상화','고르지 않은 후보','낙제 마법사의 우스개가 관용구로 굳었다'),C('c10','감정 반전','같은 영역 다른 문구','낙제생들이 시험 실패를 기념하는 날을 만들었다',{area:'마법을 거의 못 쓰는 학생, 영역!'})],picked:['c1','c2','c3','c4','c5','c7','c8','c9','c10','없는id'],classify:[{key:pupil,angle:'c5'},{key:hero,angle:null},{key:'없는키',angle:'c1'},{key:guild,angle:'c1'},...exams.map(k=>({key:k,angle:'c9'})),{key:exams[0],angle:'c9'}]};
 const regenReply={...anglesReply,candidates:anglesReply.candidates.map(c=>({...c,area:c.area+' 새판'}))};
 const R=(id,label,area,axis='일상화')=>({id,axis,label,area,consequence:label+'이 오래 이어져 생긴 결과',surprise:'떠올리기 어렵다',contrast:'기존 결론과 다르다',scene:label+'의 장면',safe:'규칙과 문체를 지킨다'});
 const refillReply={candidates:[R('r1','보충 하나','보충 영역 하나'),R('r2','보충 둘','보충 영역 둘'),R('r3','은퇴 영역 재탕','  마법을 거의 못 쓰는... 학생 영역 '),R('r4','보충 셋','보충 영역 셋','감정 반전')],picked:['r1','r2','r3','r4'],classify:[]};
 const make=title=>({fit:'strong',title,type:'인물',summary:title+'은 학교와 이어진 인물이다.',connection:'마법 재능 규칙과 이어진다.',direction:'학교 생활과 연결한다.',aliases:[],novelty:{verdict:'novel',reason:'기존 항목과 역할이 다르다',comparisons:[{key:pupil,reason:'수석 학생과 다른 인물이다'}]}});
 const page=await ctx.newPage(),calls=[],errors=[];let plans=[],angleMode='fail',refillMode='fail',refillRelease=null,pageMode='ok',planAngle,pageAngleUsed,pageScene='낙제생 축제 포스터가 붙은 복도',hold=false,release=null;
 page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message);});
 await ctx.route('**/v1beta/models/**',async r=>{const req=JSON.parse(r.request().postData()),prompt=req.contents[0].parts[0].text;const kind=prompt.includes('## 각도 목록 만들기')?(prompt.includes('## 할 일 3: 6개 고르기')?'refill':'angles'):prompt.includes('## 랜덤 서핑의 새 대상 선정')?'plan':prompt.includes('## 작성할 문서:')?'page':'unexpected';calls.push({kind,prompt});let out;
  const fail=async()=>{try{await r.fulfill({status:404,json:{error:{message:'model missing'}}});}catch{}};
  if(kind==='angles'){if(angleMode==='fail')return fail();out=prompt.includes('## 이미 있는 각도')?regenReply:anglesReply;}
  else if(kind==='refill'){if(refillMode==='hold')await new Promise(res=>refillRelease=res);if(refillMode==='fail')return fail();out=refillReply;}
  else if(kind==='plan'){if(hold)await new Promise(res=>release=res);out=plans.shift();if(out&&planAngle!==undefined)out={...out,angle:planAngle};}
  else if(kind==='page'){if(pageMode==='hold')await new Promise(res=>release=res);if(pageMode==='fail')return fail();const title=/## 작성할 문서: 「([^」]+)」/.exec(prompt)[1];out={title,type:'인물',summary:title+'의 정의',infobox:[{label:'성별',value:'여성'}],sections:[{heading:'개요',level:1,body:title+'은 마법 학교와 이어진 인물이다.'}],links:[],facts:[],newEntities:[],relations:[],timeline:[]};if(pageAngleUsed!==undefined)out.angleUsed=pageAngleUsed;if(prompt.includes('"sceneUsed"'))out.sceneUsed=pageScene;}
  else return fail();
  try{await r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(out)}]},finishReason:'STOP'}]})+'\n\n'});}catch{}});
 const port=server.address().port;
 const waitTitle=t=>page.waitForFunction(t=>document.querySelector('h1.t')?.textContent===t,t);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#discoveryBtn').disabled);
 const surf=async()=>{await page.click('#discoveryBtn');};
 const rand=v=>page.evaluate(v=>{window.__rand??=Math.random;Math.random=v===null?window.__rand:()=>v;},v);
 const openWorldFrom=async()=>{await page.click('#side [data-act="home"]');await page.locator('.wcard button.open').click();await page.waitForSelector('.article h2');};
 const since=i=>calls.slice(i).map(x=>x.kind).filter(x=>x!=='refill');const at=i=>calls.slice(i).filter(x=>x.kind!=='refill');
 try{
  await page.goto(`http://127.0.0.1:${port}`);await page.click('#side [data-act="gset"]');await page.setInputFiles('#importFile',{name:'f.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));await openWorldFrom();
  await page.click('#side [data-act="canon"]');await page.waitForSelector('#angles');assert((await page.locator('.sheet').innerText()).includes('아직 만들지 않았습니다'));assert.equal((await read(page,'w:mage')).angles,undefined);
  pass('각도가 없는 기존 세계를 열고 설정 노트를 봐도 오류 없이 빈 상태를 보여 준다');

  const r1=await page.evaluate(()=>{const A=(id,count,off=false)=>({id,label:id,why:'규칙',count,off});const w={angles:[A('a',2),A('b',0),A('c',0),A('d',0,true)]};const seq=xs=>{let i=0;return()=>xs[i++%xs.length];};
   const picks=new Set();for(const x of [0,0.4,0.99])picks.add(pickAngle(w,null,seq([0.1,x]))?.id);
   return{old:angleBlock({id:'o',label:'옛 각도',why:'옛 근거'}),rate:ANGLE_RATE,person:pickAngle(w,null,()=>0,{person:true}),personFlip:pickAngle({angles:[...w.angles,{id:'f',label:'f',axis:'감정 반전',count:9}]},null,()=>0,{person:true})?.id,retired:pickAngle({angles:[A('r',0),A('s',1)].map((a,i)=>i?a:{...a,retired:true})},null,()=>0)?.id,removed:pickAngle({angles:[{...A('r',0),removed:true}]},null,()=>0),miss:pickAngle(w,null,()=>0.3),last:pickAngle({...w,angleLast:true},null,()=>0),off:pickAngle({...w,angleOff:true},null,()=>0),none:pickAngle({angles:[A('x',0,true)]},null,()=>0),empty:pickAngle({},null,()=>0),picks:[...picks].sort()};});
  assert(r1.old.includes('「옛 각도」 (근거: 옛 근거)'));assert.equal(r1.rate,0.3);assert.equal(r1.person,null);assert.equal(r1.retired,'s');assert.equal(r1.removed,null);assert.equal(r1.personFlip,'f');assert.equal(r1.miss,null);assert.equal(r1.last,null);assert.equal(r1.off,null);assert.equal(r1.none,null);assert.equal(r1.empty,null);assert.deepStrictEqual(r1.picks,['b','c']);
  const oldList=[{id:'a1',label:'옛 각도',why:'옛 근거',count:2,off:false}],c0=calls.length;const kept=await page.evaluate(async list=>{const w={id:'old',title:'옛',entities:{},angles:JSON.parse(JSON.stringify(list))};await ensureAngles(w,new AbortController().signal);return w.angles;},oldList);assert.deepStrictEqual(kept,oldList);assert.equal(calls.length,c0);
  const span=await page.evaluate(()=>{const W=(era,timeline,extra={})=>({era,timeline,entities:{},...extra});const T=(...ys)=>ys.map(year=>({year,event:'사건'}));const run=w=>{try{return{n:worldSpan(w),line:spanLine(worldSpan(w))};}catch(e){return{err:e.message};}};
   return{empty:run(W('1990년',[])),noTl:run(W('1990년',undefined)),badEra:run(W('먼 옛날',T('1945년'))),badTl:run(W('1990년',T('태초','언젠가'))),west:run(W('1989년',T('1950년','1945','1970년'))),sup:run(W('1989년',[{year:'1900년',event:'x',sup:{by:'a'}},{year:'1980',event:'y'}])),fict:run(W('성력 312년',T('성력 300년','성력 305'))),mixed:run(W('성력 312년',T('1945년'))),era2:run(W('건안 13년',T('건안 원년','건안 5'),{calendars:['건안']})),bc:run(W('서기 5년',T('기원전 3년'))),future:run(W('1980년',T('1990년'))),same:run(W('2024년 3월',T('2024년 1월'))),nul:run(null)};});
  assert.deepStrictEqual(Object.fromEntries(Object.entries(span).map(([k,v])=>[k,v.err?'ERR '+v.err:v.n])),{empty:null,noTl:null,badEra:null,badTl:null,west:44,sup:9,fict:12,mixed:null,era2:12,bc:7,future:null,same:0,nul:null});
  assert.equal(span.empty.line,'경과 시간 알 수 없음. 원안과 연표를 보고 판단할 것');assert.equal(span.west.line,'세계의 핵심 설정이 성립한 뒤 작중 시점까지 약 44년');assert(span.same.line.includes('1년이 채 되지 않음'));
  pass('경과 시간: 연표가 비었거나 연도를 못 읽거나 기년법이 다르면 알 수 없음, 서기·가상 기년법·연호·기원전은 올바른 햇수');
  const nb=await page.evaluate(()=>{const saved=S.pages;const A=(id,count=0)=>({id,label:id,area:id,count});try{S.pages={p1:{links:['t'],angle:'a'},p2:{links:[],angle:'b'},t:{links:['p3']},p3:{angle:'c'},p4:{links:[],angle:'d'}};
    const w={angles:['a','b','c','d','e'].map(x=>A(x)),entities:{t:{mentions:[{from:'p2',text:'x'}],facts:[]}}},only={...w,angles:['a','b','c'].map(x=>A(x))};
    return{near:[...neighborAngles(w,'t')].sort(),pick:pickAngle(w,'t',()=>0)?.id,none:pickAngle(only,'t',()=>0),free:pickAngle(only,'zz',()=>0)?.id};}finally{S.pages=saved;}});
  assert.deepStrictEqual(nb,{near:['a','b','c'],pick:'d',none:null,free:'a'});
  pass('이웃 문서(링크하거나 언급한 문서)가 쓴 각도는 후보에서 빠지고, 남는 각도가 없으면 각도를 쓰지 않는다');
  const pa=await page.evaluate(()=>{const C=(id,area)=>({id,axis:'일상화',label:'새 '+id,area,consequence:id+'가 오래 이어져 생긴 결과',surprise:'의외',contrast:'다름',scene:id+' 장면',safe:'규칙과 문체를 지킨다'});
    const prior=[{id:'a3',label:'은퇴 각도',area:'낙제생 문화',retired:true,scenes:['복도']},{id:'a7',label:'삭제 각도',area:'졸업 앨범 산업',removed:true},{id:'a2',label:'활성 각도',area:'편지 양식'}];
    const r=parseAngles({seed:'',rules:[],entities:{}},{candidates:[C('x1','낙제생, 문화!'),C('x2','졸업앨범 산업'),C('x3','편지·양식'),C('x4','새 영역'),C('x5','새  영역.'),C('x6','다른 영역')],picked:['x1','x2','x3','x4','x5','x6']},prior,6);
    const ended=Array.from({length:35},(_,i)=>({id:'e'+i,label:'끝난 각도 '+i,area:'끝난 영역 '+i,retired:true,endedAt:1000+i,scenes:['장면 '+i]}));const blk=priorAnglesBlock([...ended,{id:'n',label:'지금 각도',area:'지금 영역',scenes:['안 보임']}]);
    const recent=blk.slice(blk.indexOf('은퇴·삭제한 각도(쓴 장면 포함)'),blk.indexOf('그보다 오래된')),old=blk.slice(blk.indexOf('그보다 오래된'));
    return{list:r.angles.map(a=>[a.id,a.area]),blk,recentHas:[recent.includes('끝난 각도 34'),recent.includes('장면 34'),recent.includes('끝난 각도 5'),recent.includes('끝난 각도 4')],oldHas:[old.includes('끝난 각도 4'),old.includes('끝난 영역 0'),old.includes('장면'),old.includes('scenes'),old.includes('끝난 각도 5')]};});
  assert.deepStrictEqual(pa.list,[['a8','새 영역'],['a9','다른 영역']]);
  assert(pa.blk.includes('아래 각도와 영역(area)이 같거나 문구만 바꾼 후보는 내지 않는다'));assert(pa.blk.includes('지금 각도'));assert(!pa.blk.includes('안 보임'));
  assert.deepStrictEqual(pa.recentHas,[true,true,true,false]);assert.deepStrictEqual(pa.oldHas,[true,true,false,false,false]);
  pass('보충 후보의 area가 활성·은퇴·삭제 각도와 공백·문장부호만 다르면 버리고, 은퇴·삭제가 30개를 넘으면 오래된 것은 label·area만 넘긴다');
  pass('pickAngle: 연속 사용·꺼진 각도·30% 밖이면 null, count가 가장 작은 켜진 각도만 후보, 인물은 감정 반전 축만, 은퇴·삭제한 각도 제외, 기존 목록(옛 형식 포함)은 자동으로 다시 만들지 않는다');

  angleMode='fail';plans=[make('카르멘 벨')];let i=calls.length;await surf();await waitTitle('카르멘 벨');await ready();assert.deepStrictEqual(since(i),['angles','plan','page']);let w=await read(page,'w:mage');assert.equal(w.angles,undefined);assert(w.entities[key('카르멘 벨')].page);assert(!at(i)[1].prompt.includes('## 이번 각도'));
  plans=[make('도로시 크레인')];i=calls.length;await surf();await waitTitle('도로시 크레인');await ready();assert.deepStrictEqual(since(i),['plan','page']);
  pass('각도 목록 생성이 실패해도 랜덤 서핑은 각도 없이 완료되고, 같은 접속에서 다시 부르지 않는다');

  await page.reload();await page.waitForSelector('.article h2, .wcard');if(!(await page.locator('.article h2').count()))await openWorldFrom();
  angleMode='ok';await rand(0);plans=[make('토마스 그린')];planAngle=undefined;hold=true;release=null;i=calls.length;await surf();
  for(let k=0;k<400&&!release;k++)await new Promise(r=>setTimeout(r,10));assert(release);assert.equal(await page.locator('#discoveryAngle').innerText(),'이번 각도: 마법을 거의 못 쓰는 학생');hold=false;release();
  await waitTitle('토마스 그린');await ready();assert.deepStrictEqual(since(i),['angles','plan','page']);
  w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>[a.id,a.label,a.count,a.off]),[['a1','마법을 거의 못 쓰는 학생',1,false],['a2','마법 도구를 파는 상인',0,false],['a3','학생의 가족',1,false],['a4','고르지 않은 후보',0,false]]);assert.equal(w.angleLast,true);
  const anglePara='## 이번 각도: 「마법을 거의 못 쓰는 학생」 (근거: 재능 선별이 오래 이어지며 낙제생끼리 즐기는 비공식 축제가 생겼다)';assert.deepStrictEqual(w.angles.map(a=>a.axis),['감정 반전','의외의 수혜자','개인적 관계','일상화']);assert(w.angles.every(a=>a.consequence&&a.surprise&&a.safe&&a.scene&&a.contrast&&!('why' in a)));assert.equal(w.angleDominant,'기존 문서들은 마법 재능을 영광으로 본다');assert(!w.angles.some(a=>a.label==='같은 영역 다른 문구'));assert.deepStrictEqual(w.angles[0].scenes,['낙제생 축제 포스터가 붙은 복도']);assert(at(i)[2].prompt.includes('"sceneUsed"'));assert(w.angles.every(a=>a.area));
  assert(at(i)[1].prompt.includes(anglePara));assert(at(i)[1].prompt.includes('어조·문체·세계 규칙은 바꾸지 않는다'));assert(at(i)[1].prompt.includes('"angle":"a1"'));assert(at(i)[2].prompt.includes(anglePara));assert(at(i)[1].prompt.includes('이 각도의 예시 장면: 마법을 거의 못 쓰는 학생이 등장하는 교정 게시판의 손글씨 공지'));
  for(const t of [world.seed,'리나 하르트','마법 길드 본부','졸업생이 등록하는 길드의 본부','빨간 링크·미작성','이미 문서나 빨간 링크로 다뤄진 영역은 각도로 내지 않는다','핵심 설정이 작중 시점까지 지속된 기간 동안 생겼을 법한 2차·3차 결과','## 세계의 경과 시간','경과 시간 알 수 없음. 원안과 연표를 보고 판단할 것','며칠~몇 달: 부정과 혼란','시작점이 없는 세계','사태 일주일 만에 생긴 관광 산업','규칙을 다시 말하거나 요약한 것은 근거로 인정하지 않는다','후보 15개','8개를 고른다','원안을 읽은 사람이 바로 떠올릴 법한가? 그렇다면 버린다','safe를 설명하지 못하는 후보는 의외성이 높아도 버린다','감정 반전','일상화','의외의 수혜자','문화적 반응','체계의 지지자','개인적 관계','문체는 톤 지침 그대로','"surprise"','"safe"','"consequence"','"scene"','"contrast"','"dominant"','세계 안의 공식 입장이 아니라','기존 문서들의 공통 결론(dominant)을 뒤집는다','악역이나 허수아비가 아니라 독자가 일부 수긍할 만한 논리','"주제나 결론을 유지한다"는 safe의 근거로 인정하지 않는다','범주만 있고 장면이 없는 후보는 버린다','"area"','같은 area의 후보는 하나만 남긴다','교실 벽에 붙은 역장 충격파 대피 안내문','갑자기 코미디'])assert(at(i)[0].prompt.includes(t),t);
  assert.equal((await read(page,'p:mage:'+key('토마스 그린'))).angle,'a1');
  pass('목록 생성 호출 한 번으로 공통 결론·장면·영역·근거 있는 각도(같은 영역은 하나만)와 기존 문서 분류를 받고, 장면·결론 비교가 없거나 관련 문서가 3개 이상인 후보는 버리고 남은 후보로 채우며, 고른 각도를 선정·작성 프롬프트와 상태 문구에 반영한 뒤 저장 성공 시에만 기록한다');

  plans=[make('에밀 바스')];i=calls.length;await surf();await waitTitle('에밀 바스');await ready();assert.deepStrictEqual(since(i),['plan','page']);assert(!at(i)[0].prompt.includes('## 이번 각도'));w=await read(page,'w:mage');assert.equal(w.angleLast,false);assert.equal((await read(page,'p:mage:'+key('에밀 바스'))).angle,undefined);
  pass('직전 랜덤 서핑이 각도를 썼으면 이번에는 중심 소재로 돌아간다');

  pageMode='fail';plans=[make('실패 후보')];i=calls.length;await surf();await page.waitForSelector('[role="alert"]');await ready();assert.deepStrictEqual(since(i),['plan','page']);assert(at(i)[0].prompt.includes('「마법 도구를 파는 상인」'));w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,0,1,0]);assert.equal(w.angleLast,false);assert(!w.entities[key('실패 후보')]);
  pageMode='hold';release=null;plans=[make('중단 후보')];await surf();for(let k=0;k<400&&!release;k++)await new Promise(r=>setTimeout(r,10));assert(release);assert((await page.locator('#genAngle').innerText()).includes('이번 각도: 마법 도구를 파는 상인'));await page.click('[data-act="stop"]');release();await page.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('중단'));await ready();pageMode='ok';w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,0,1,0]);assert(!w.entities[key('중단 후보')]);
  pass('문서 작성이 실패하거나 중단되면 각도 count와 연속 사용 기록이 바뀌지 않는다');

  planAngle=null;plans=[make('각도 거부 후보')];i=calls.length;await surf();await waitTitle('각도 거부 후보');await ready();planAngle=undefined;assert(!at(i)[1].prompt.includes('## 이번 각도'));w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,0,1,0]);
  pass('선정 응답이 angle:null이면 각도 없이 작성하고 count를 올리지 않는다');

  const guided=async(text,title)=>{await page.locator('#discoveryBtn').dblclick();await page.waitForSelector('#discoveryDirection');await page.fill('#discoveryDirection',text);plans=[make(title)];const at=calls.length;await page.click('[data-act="discovery-create"]');await waitTitle(title);await ready();return at;};
  i=await guided('학교 매점 주인','매점 주인 오토');assert(at(i)[0].prompt.includes('## 이번 각도: 「마법 도구를 파는 상인」'));assert(at(i)[0].prompt.includes('사용자 설명이 성격·태도·시선을 이미 정했다면 이번 각도는 버리고'));assert(at(i)[0].prompt.includes('사용자가 정한 대상·이름·역할은 각도보다 항상 우선한다'));assert(!at(i)[1].prompt.includes('## 이번 각도'));w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,0,1,0]);assert.equal((await read(page,'p:mage:'+key('매점 주인 오토'))).angle,undefined);
  planAngle='a2';i=await guided('학교 매점 주인의 동생','매점 동생 우타');planAngle=undefined;assert(at(i)[1].prompt.includes('## 이번 각도: 「마법 도구를 파는 상인」'));w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,1,1,0]);assert.equal(w.angleLast,true);assert.equal((await read(page,'p:mage:'+key('매점 동생 우타'))).angle,'a2');
  pass('설명을 적은 랜덤 서핑에도 각도를 제안하되, 선정 응답이 그 각도를 명시해 받아들였을 때만 쓰고 기록한다');

  await page.locator('#discoveryBtn').dblclick();await page.waitForSelector('#discoveryDirection');await page.fill('#discoveryDirection','');await page.check('[data-angle-off]');await page.waitForFunction(()=>S.world.angleOff===true);assert.equal((await read(page,'w:mage')).angleOff,true);plans=[make('끔 후보')];i=calls.length;await page.click('[data-act="discovery-create"]');await waitTitle('끔 후보');await ready();assert(!at(i)[0].prompt.includes('## 이번 각도'));
  await page.locator('#discoveryBtn').dblclick();await page.waitForSelector('[data-angle-off]');assert(await page.locator('[data-angle-off]').isChecked());await page.uncheck('[data-angle-off]');await page.waitForFunction(()=>S.world.angleOff===false);
  assert.equal((await read(page,'w:mage')).angleLast,false);
  pass('"각도 쓰지 않기"는 세계별로 저장되고 켜 두면 각도를 쓰지 않는다');

  const red=async(title,type='',facts=[],{holdPage=false}={})=>{const k=key(title);if(holdPage){pageMode='hold';release=null;}const at=calls.length;await page.evaluate(({k,title,type,facts})=>{if(!S.world.entities[k]){S.world.entities[k]=newEntity(title,type,'');S.world.entities[k].facts=facts;}openEntity(k);},{k,title,type,facts});
   if(holdPage){for(let x=0;x<400&&!release;x++)await new Promise(r=>setTimeout(r,10));assert(release);const shown=await page.locator('#genAngle').count()?await page.locator('#genAngle').innerText():'';pageMode='ok';release();await page.waitForFunction(k=>S.pages[k]&&!S.gen,k);await page.evaluate(()=>Store.q);return{at,shown};}
   await page.waitForFunction(k=>S.pages[k]&&!S.gen,k);await page.evaluate(()=>Store.q);return{at};};
  pageAngleUsed=true;let g=await red('마법 길드 본부','지명',[],{holdPage:true});assert.equal(g.shown,'이번 각도: 고르지 않은 후보');let pp=at(g.at)[0].prompt;assert.equal(at(g.at)[0].kind,'page');
  for(const t of ['## 이번 각도: 「고르지 않은 후보」','섹션 하나를 「고르지 않은 후보」의 시선으로 쓴다','어울리지 않으면 쓰지 않는다','[[링크]]로 남긴다','문서의 대상·이름·정체를 바꾸지 않는다','이번 각도는 감정 반전 축이 아니므로 인물 문서라면 버린다','"angleUsed"'])assert(pp.includes(t),t);
  w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,1,1,1]);assert.equal(w.angleLast,true);assert.equal((await read(page,'p:mage:'+guild)).angle,'a4');assert.equal((await read(page,'p:mage:'+guild)).angleUsed,undefined);
  g=await red('길드 서기관');assert(!at(g.at)[0].prompt.includes('## 이번 각도'));assert(!at(g.at)[0].prompt.includes('"angleUsed"'));w=await read(page,'w:mage');assert.equal(w.angleLast,false);assert.equal((await read(page,'p:mage:'+key('길드 서기관'))).angle,undefined);
  pass('빨간 링크 문서: 각도를 섹션 하나로 얹어 angleUsed가 true일 때만 기록하고, 다음 빨간 링크에는 연속으로 쓰지 않는다');

  pageAngleUsed=false;g=await red('패배주의 연구회 회장','인물',[{t:'늘 침울하고 비관적인 성격이다',src:pupil}]);pp=at(g.at)[0].prompt;assert(pp.includes('## 이번 각도: 「마법을 거의 못 쓰는 학생」'));assert(pp.includes('늘 침울하고 비관적인 성격이다'));assert(pp.includes('확정 사실·언급과 충돌하면 각도를 버린다'));assert(pp.includes('성격이나 태도가 정해져 있지 않을 때만'));assert(pp.includes('이전 장면: 낙제생 축제 포스터가 붙은 복도. 이와 다른 장면·인물·장소를 쓴다'));assert(!pp.includes('감정 반전 축이 아니므로'));
  w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,1,1,1]);assert.equal(w.angleLast,false);assert.equal((await read(page,'p:mage:'+key('패배주의 연구회 회장'))).angle,undefined);
  pass('인물 문서는 감정 반전 축만 쓰고, 같은 각도의 이전 장면을 피하라고 알리며, 확정 사실과 충돌해 angleUsed가 false면 count와 p.angle을 남기지 않는다');

  pageAngleUsed=true;i=calls.length;await page.evaluate(k=>generatePage(k,true,''),key('에밀 바스'));await page.waitForFunction(()=>!S.gen);await page.evaluate(()=>Store.q);assert.deepStrictEqual(since(i),['page']);assert(!at(i)[0].prompt.includes('## 이번 각도'));assert(!at(i)[0].prompt.includes('"angleUsed"'));assert(at(i)[0].prompt.includes('## 다시 쓰기'));w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.map(a=>a.count),[1,1,1,1]);assert.equal(w.angleLast,false);assert.equal((await read(page,'p:mage:'+key('에밀 바스'))).angle,undefined);
  pass('다시 쓰기에는 각도를 넣지 않고 기록도 바꾸지 않는다');

  refillMode='hold';refillRelease=null;const r0=calls.filter(x=>x.kind==='refill').length;
  plans=[make('혼합 서핑 하나')];i=calls.length;await surf();await waitTitle('혼합 서핑 하나');await ready();assert(at(i)[0].prompt.includes('## 이번 각도: 「마법을 거의 못 쓰는 학생」'));w=await read(page,'w:mage');assert.equal(w.angleLast,true);assert.equal(w.angles[0].count,2);assert.equal(w.angles[0].retired,true);assert(w.angles[0].endedAt);
  for(let x=0;x<400&&!refillRelease;x++)await new Promise(r=>setTimeout(r,10));assert(refillRelease,'활성 각도가 4개 미만이면 생성 뒤 보충한다');
  const rp=calls.filter(x=>x.kind==='refill').pop().prompt;for(const t of ['## 이미 있는 각도','아래 각도와 영역(area)이 같거나 문구만 바꾼 후보는 내지 않는다','은퇴·삭제한 각도(쓴 장면 포함)','낙제생 축제 포스터가 붙은 복도','마법 도구를 파는 상인'])assert(rp.includes(t),t);
  g=await red('혼합 링크 하나');assert(!at(g.at)[0].prompt.includes('## 이번 각도'));assert.equal((await read(page,'w:mage')).angleLast,false);
  assert.equal(calls.filter(x=>x.kind==='refill').length,r0+1,'보충이 진행 중이면 다시 부르지 않는다');
  refillMode='ok';refillRelease();await page.waitForFunction(()=>S.world.angles.length===7);await page.evaluate(()=>Store.q);w=await read(page,'w:mage');assert.deepStrictEqual(w.angles.slice(4).map(a=>[a.id,a.label]),[['a5','보충 하나'],['a6','보충 둘'],['a7','보충 셋']]);
  g=await red('혼합 링크 둘');assert(at(g.at)[0].prompt.includes('## 이번 각도'));assert.equal((await read(page,'w:mage')).angleLast,true);
  plans=[make('혼합 서핑 둘')];i=calls.length;await surf();await waitTitle('혼합 서핑 둘');await ready();assert(!at(i)[0].prompt.includes('## 이번 각도'));assert(!at(i)[1].prompt.includes('## 이번 각도'));assert.equal((await read(page,'w:mage')).angleLast,false);pageAngleUsed=undefined;
  assert.equal(calls.filter(x=>x.kind==='refill').length,r0+1,'보충 뒤 활성 각도가 충분하면 다시 보충하지 않는다');
  pass('count가 2에 도달하면 은퇴하고, 활성 각도가 4개 미만이면 생성 뒤 기존 각도를 넘겨 한 번만 보충하며 겹치는 영역은 버린다');
  pass('랜덤 서핑과 빨간 링크를 섞어도 각도는 두 문서 연속으로 쓰이지 않는다');

  await page.click('#side [data-act="canon"]');await page.waitForSelector('.angles li');assert.equal(await page.locator(`[data-angle-of="${guild}"]`).textContent(),'작성 각도: 고르지 않은 후보');assert.equal(await page.locator('.angles li').count(),7);assert((await page.locator('.sheet').innerText()).includes('기존 문서들의 공통 결론: 기존 문서들은 마법 재능을 영광으로 본다'));assert((await page.locator('.angles').innerText()).includes('장면: 마법 도구를 파는 상인이 등장하는'));
  assert(await page.locator('[data-angle-retired="a1"]').count());assert((await page.locator('.angles').innerText()).includes('쓴 장면: 낙제생 축제 포스터가 붙은 복도'));
  await page.click('[data-angle-revive="a1"]');await page.waitForFunction(()=>document.querySelector('[data-angle-toggle="a1"]'));assert.equal((await read(page,'w:mage')).angles[0].retired,undefined);
  await page.click('[data-angle-toggle="a3"]');await page.waitForFunction(()=>document.querySelector('[data-angle-toggle="a3"]')?.textContent==='켜기');await page.fill('[data-angle-label="a4"]','고친 문구');await page.click('[data-angle-save="a4"]');await page.waitForFunction(()=>S.world.angles[3].label==='고친 문구');
  const liBefore=await page.locator('.angles li').count();await page.click('[data-angle-del="a6"]');assert.equal(await page.locator('.angles li').count(),liBefore);await page.click('[data-angle-del="a6"]');await page.waitForFunction(n=>document.querySelectorAll('.angles li').length===n-1,liBefore);assert((await page.locator('#anglesRemoved').innerText()).includes('삭제한 각도 1개'));
  w=await read(page,'w:mage');assert.equal(w.angles.length,7);assert.equal(w.angles[5].removed,true);assert.equal(w.angles[2].off,true);assert.equal(w.angles[3].label,'고친 문구');
  i=calls.length;await page.click('[data-act="angles-regen"]');await page.waitForFunction(()=>S.world.angles.length===11&&!S.angleGen);assert.deepStrictEqual(since(i),['angles']);assert(at(i)[0].prompt.includes('## 이미 있는 각도'));w=await read(page,'w:mage');assert(w.angles.slice(0,7).every(a=>a.retired||a.removed));assert.deepStrictEqual(w.angles.slice(7).map(a=>a.id),['a8','a9','a10','a11']);assert(w.angles.slice(7).every(a=>!a.off&&a.area.endsWith('새판')));
  pass('설정 노트에서 각도를 끄고 문구를 고치고 지우고 목록을 다시 만들 수 있다');

  const pending=page.waitForEvent('download');await page.click('[data-act="export-world"]');const dl=await pending;const data=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));assert.deepStrictEqual(data.worlds[0].angles,w.angles);assert.equal(data.pages.mage[key('토마스 그린')].angle,'a1');
  data.worlds[0].id='mage2';data.pages={mage2:data.pages.mage};await page.click('#side [data-act="gset"]');await page.setInputFiles('#importFile',{name:'e.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
  const imported=await read(page,'w:mage2');assert.deepStrictEqual(imported.angles,w.angles);assert.equal((await read(page,'p:mage2:'+key('토마스 그린'))).angle,'a1');
  pass('세계 내보내기·가져오기에 각도 목록과 문서의 각도 기록이 유지된다');

  await rand(null);assert(calls.every(x=>x.kind!=='unexpected'));assert.deepStrictEqual(errors,[]);console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
