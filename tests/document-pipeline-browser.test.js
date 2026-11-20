/* 브라우저 → 인증된 Worker → SQLite → 단계별 alarm. 제공자 호출은 모두 대체한다. */
const cacheCalls=[];
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{appServer}=require('./helpers/app');
const server=appServer();let browser,context,page,n=0,hold=true,release,calls=[],errors=[],submissions=[],loseSubmit=false,identityFailure='';
const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
const until=async(fn,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('브라우저 작업 대기 시간 초과')};
(async()=>{
 const {default:worker}=await import('../relay/worker.js'),{AiJobs}=await import('../relay/jobs.js'),{JobStorage,fireAlarm}=await import('./helpers/jobs.mjs'),{D1}=await import('./helpers/d1.mjs');
 const db=new D1(), entries=new Map(),originalFetch=globalThis.fetch;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const schedule=e=>{if(e.timer||e.executing||e.obj.active||!(e.storage.data.get('jobs')||[]).some(j=>j.status==='queued'))return;e.timer=setTimeout(async()=>{e.timer=null;e.executing=true;try{e.obj=new AiJobs({storage:e.storage},env);await fireAlarm(e.obj);}catch(err){errors.push(err.stack||String(err));}finally{e.executing=false;schedule(e)}},10)};
 const env={DB:db,GEMINI_KEY:'server-key',PASSWORDS:'relay-pass',ALLOWED_ORIGINS:origin,AI_JOBS:{idFromName:n=>n,get:name=>{if(!entries.has(name)){const storage=new JobStorage();entries.set(name,{storage,obj:new AiJobs({storage},env)})}const e=entries.get(name);return{fetch:async req=>{const r=await e.obj.fetch(req);schedule(e);return r}}}}};
 await worker.fetch(new Request(origin+'/api/sync',{headers:{Origin:origin}}),env);db.sqlite.exec("INSERT INTO users VALUES('tester','s','h',1);INSERT INTO sessions VALUES('token','tester',1)");
 const jobs=()=>entries.get('account:tester')?.storage.data.get('jobs')||[];
 globalThis.fetch=async(url,opts)=>{
 if(String(url).includes("/cachedContents")){cacheCalls.push({url:String(url),method:(opts||{}).method,body:(opts||{}).body});return Response.json({name:"cachedContents/test-cache",expireTime:new Date(Date.now()+900000).toISOString()})}if(String(url).endsWith(":countTokens"))return Response.json({totalTokens:5000});
  const j=jobs().find(j=>j.status==='running');assert(j);const step=j.steps.find(s=>s.status==='running'&&!calls.some(c=>c.id===j.id&&c.slot===s.slot));const kind=step.kind;calls.push({id:j.id,slot:step.slot,kind,url});
  if(hold&&kind==='page')await new Promise(r=>{release=r});
  const out=kind==='page'?{title:j.meta.title,type:'인물',summary:'해양 탐험가',infobox:[{label:'성별',value:'남성'}],sections:[{heading:'개요',level:1,body:'서버가 끝까지 완성한 항해 기록이다.'}],categories:['소속:항구','유형:인물'],facts:[],newEntities:[],relations:[],timeline:[]}:kind==='fix'?{edits:[]}:kind==='analyze'||kind==='factSync'?{facts:[],relations:[],timeline:[],...(identityFailure===j.meta.title?{newEntities:[{title:'미확정 호출부호',type:'물건',infobox:[{label:'본명',value:'미확정 인물'},{label:'호출부호',value:'미확정 호출부호'}]}]}:{})}:{issues:[]};
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(out)}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:100,thoughtsTokenCount:20}});
 };
 try{
  browser=await chromium.launch();context=await browser.newContext();
  await context.addInitScript(()=>{
   if(!localStorage.getItem('wwiki:gemini'))localStorage.setItem('wwiki:gemini',JSON.stringify({mode:'relay',relay:'https://relay.test',pass:'relay-pass',main:'gemini-3.8-flash',check:'custom-check',preCheck:true}));
   if(!localStorage.getItem('wwiki:acct'))localStorage.setItem('wwiki:acct',JSON.stringify({id:'tester',token:'token',since:0}));
   window.testHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});
  });
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.route('**/api/**',async route=>{const req=route.request(),body=req.postData();if(req.method()==='POST'&&req.url().endsWith('/jobs'))submissions.push(JSON.parse(body));const res=await worker.fetch(new Request(req.url(),{method:req.method(),headers:await req.allHeaders(),...(body?{body}:{})}),env);if(loseSubmit&&req.method()==='POST'&&req.url().endsWith('/jobs')){loseSubmit=false;return route.abort()}try{await route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:await res.text()})}catch{}});
  await context.route('**/v1beta/**',r=>{errors.push('직접 AI 호출');r.abort()});
  const open=async()=>{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.stack));await p.goto(origin);await p.waitForFunction(()=>S.ready);return p};
  page=await open();
  const fixture=async name=>page.evaluate(async name=>{
   const A=keyOf('항구'),B=keyOf(name),ent=(title,type,pg)=>({...newEntity(title,type,''),page:pg});
   const w={kind:'world',id:'browser-world',title:'항구',seed:'항구 세계',era:'1900년',guide:'',rules:[],userCanon:'',timeline:[],relations:[],events:[],navboxes:{},aliases:{},toneTried:true,angleOff:true,relMigrated:true,entities:{[A]:ent('항구','지명',true),[B]:ent(name,'인물',false)},mainKey:A,createdAt:1};
   const p={key:A,title:'항구',type:'지명',summary:'항구 도시',infobox:[],sections:[{heading:'개요',level:1,body:'거대한 항구이다.'}],links:[],createdAt:1};
   S.world=w;S.pages={[A]:p};S.worlds=[w];S.view={name:'article',key:B};await Store.saveWorld(w);await Store.savePage(w.id,p);await Sync.flush();renderAll();return B;
  },name);
  const B=await fixture('선장');await page.evaluate(k=>{generatePage(k)},B);await until(()=>release);assert((await page.locator('#docCostPanel summary').innerText()).includes('산정 대기'));const id=jobs().at(-1).id;await page.close();hold=false;release();release=null;
  await until(()=>jobs().find(j=>j.id===id)?.status==='succeeded');assert.deepEqual(calls.filter(c=>c.id===id).map(c=>c.kind),['page','check','read','factSync']);
  const saved=JSON.parse(db.sqlite.prepare('SELECT data FROM pages WHERE pkey=?').get(B).data);assert(saved.check);pass('접수 뒤 탭을 닫아도 서버가 두 검사까지 끝내고 문서를 자동 저장한다');

  page=await open();await page.click('#side [data-act="jobs"]');await page.waitForSelector('.jobs');await page.click('[data-job-preview="'+id+'"]');await page.waitForSelector('[data-job-apply]');assert.equal(await page.locator('[data-job-apply]').innerText(),'저장된 문서 열기');assert((await page.locator('.job-detail .doc-cost summary').innerText()).includes('$0.0012'));const before=calls.length;await page.click('[data-job-apply]');await page.waitForSelector('.article');assert.equal(calls.length,before);assert((await page.locator('#docCostPanel').textContent()).includes('4,000'));assert((await page.locator('#docCostPanel summary').innerText()).includes('$0.0012'));assert.equal(await page.evaluate(k=>S.pages[k].sections[0].body,B),'서버가 끝까지 완성한 항해 기록이다.');pass('다시 연 탭은 작업 센터에서 저장된 문서를 AI 재호출 없이 연다');

  const C=await fixture('부선장');hold=true;await page.evaluate(k=>{generatePage(k)},C);await until(()=>release);const id2=jobs().at(-1).id;await page.evaluate(()=>{window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'))});hold=false;release();release=null;
  await until(()=>jobs().find(j=>j.id===id2)?.status==='succeeded');await page.waitForFunction(k=>!!S.pages[k]?.check&&!S.gen,C);await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'))});pass('화면이 숨겨진 동안에도 탭이 서버 작업을 계속 확인해 완성된 결과를 받는다');

  const D=await fixture('기관장');hold=true;loseSubmit=true;await page.evaluate(k=>{generatePage(k)},D);await until(()=>release);const id3=jobs().at(-1).id;
  db.sqlite.prepare("UPDATE worlds SET data=json_set(data,'$.entities.'||?||'.summary','다른 기기 수정'),updated=updated+1 WHERE wid='browser-world'").run(D);hold=false;release();release=null;
  await until(()=>jobs().find(j=>j.id===id3)?.status==='failed');await page.waitForFunction(()=>!S.gen);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM pages WHERE pkey=?').get(D).n,0);assert.equal(calls.filter(c=>c.id===id3&&c.kind==='page').length,1);
  await page.evaluate(id=>AIRecovery.open(id),id3);await page.waitForSelector('[data-job-download]');assert.equal(await page.locator('[data-job-apply]').count(),0);assert((await page.locator('.job-detail').innerText()).includes('초안'));pass('접수 응답이 유실돼도 중복 생성하지 않고, 다른 기기의 원본 수정 시 초안만 내려받게 한다');

  // 업로드 응답을 기다리는 동안 같은 문서가 다시 저장되는 경쟁 조건.
  await page.evaluate(async()=>{
   await Sync.flush(); const req=Sync.req.bind(Sync); let gated=false;
   window.originalSyncReq=req; Sync.req=async(path,opts)=>{if(path==='/sync'&&opts?.method==='POST'&&!gated){gated=true;window.syncStarted=true;await new Promise(r=>{window.releaseSync=r})}return req(path,opts)};
   const p=await Store.getPage('browser-world',keyOf('항구'));p.summary='첫 수정';await Store.savePage('browser-world',p);window.firstPush=Sync.push();
  });
  await page.waitForFunction(()=>window.syncStarted);
  await page.evaluate(async()=>{const p=await Store.getPage('browser-world',keyOf('항구'));p.summary='업로드 중 두 번째 수정';await Store.savePage('browser-world',p);window.releaseSync();await window.firstPush;window.keptDirty=Sync.dirty.p.has('browser-world'+'\u0001'+keyOf('항구'));Sync.req=window.originalSyncReq;await Sync.flush()});
  assert(await page.evaluate(()=>window.keptDirty));const aKey=await page.evaluate(()=>keyOf('항구'));assert.equal(JSON.parse(db.sqlite.prepare('SELECT data FROM pages WHERE pkey=?').get(aKey).data).summary,'업로드 중 두 번째 수정');pass('업로드 중 새 수정도 동기화 대기 목록에 남겨 다음 업로드에서 보존한다');

  // 서버 작성 중 검색창으로 만든(저장 전) 항목을 대기열에 넣으면, 앞 문서가 끝나 세계관이 저장본으로 바뀐 뒤에도 차례가 와서 작성된다.
  const E=await fixture('조타수'),Q=await page.evaluate(()=>keyOf('검색 선원'));hold=true;await page.evaluate(k=>{generatePage(k)},E);await until(()=>release);
  await page.evaluate(()=>goSearch('검색 선원'));assert.deepEqual(await page.evaluate(()=>S.genQ.map(q=>q.title)),['검색 선원']);
  hold=false;release();release=null;
  await page.waitForFunction(k=>!!S.pages[k],E);await page.waitForFunction(k=>!!S.pages[k]&&!S.gen,Q,{timeout:20000});
  assert.equal(await page.evaluate(()=>S.genQ.length),0);assert.equal(jobs().filter(j=>j.meta?.title==='검색 선원').length,1);
  pass('서버 작성 중 검색창으로 넣은 대기 문서도 앞 문서가 끝난 뒤 건너뛰지 않고 작성한다');

  // 교정 뒤 사실 정리의 저장이 끝나기 전에 서버 검사를 접수하면 같은 원본을 서로 바꾸게 된다.
  await fixture('교정 대기 항목');
  const beforeFixJobs=jobs().length;
  await page.evaluate(()=>{
   const k=S.world.mainKey,p=S.pages[k],original=callJson;
   window.restoreFixCalls=()=>{callJson=original};
   callJson=async(kind,...args)=>{
    if(kind!=='factSync')return original(kind,...args);
    await new Promise(r=>{window.releaseFixFacts=r});
    return {facts:[{about:p.title,fact:'교역의 중심지이다.'}],relations:[],timeline:[]};
   };
   startFix({key:k,items:[{claim:'거대한 항구이다.',conflict:'항구의 역할을 밝혀야 한다.',severity:'high'}],sel:new Set([0]),phase:'review',
    edits:[{n:0,field:'body',old:'거대한 항구이다.',new:'교역의 중심지이다.',on:true}],note:'',err:'',skipped:0},{run:false});
   window.fixedFlow=applyFix();
  });
  await page.waitForFunction(()=>!!window.releaseFixFacts);
  assert.equal(await page.evaluate(()=>S.checking),null,'사실 정리를 기다리는 동안 설정 검사를 시작하지 않는다');
  assert.equal(jobs().length,beforeFixJobs,'사실 정리의 저장 전에는 서버 검사 작업도 접수하지 않는다');
  await page.evaluate(()=>{window.releaseFixFacts();return window.fixedFlow});
  await until(()=>jobs().length>beforeFixJobs&&jobs().at(-1).status==='succeeded');
  await page.waitForFunction(()=>!S.checking&&!!S.pages[S.world.mainKey].check);
  const fixedKey=await page.evaluate(()=>S.world.mainKey),fixedPage=JSON.parse(db.sqlite.prepare('SELECT data FROM pages WHERE pkey=?').get(fixedKey).data);
  assert.equal(fixedPage.sections[0].body,'교역의 중심지이다.');assert(fixedPage.check);
  assert(JSON.parse(db.sqlite.prepare("SELECT data FROM worlds WHERE wid='browser-world'").get().data).entities[fixedKey].facts.some(f=>f.t==='교역의 중심지이다.'));
  assert.equal(await page.evaluate(()=>Sync.pending()),0);await page.evaluate(()=>window.restoreFixCalls());
  pass('교정 뒤 사실 정리·저장·동기화를 마친 원본으로 서버 검사를 진행해 충돌 없이 수정과 검사 결과를 보존한다');
  const F=await fixture('후속 선원');identityFailure='실패한 검색 선원';
  await page.evaluate(title=>goSearch(title),identityFailure);
  await until(()=>jobs().some(j=>j.meta.title===identityFailure&&j.status==='failed'));
  await page.waitForFunction(()=>!S.gen);
  const failed=jobs().find(j=>j.meta.title===identityFailure);
  assert.equal(failed.error.code,'identity_conflict');assert.equal(calls.filter(c=>c.id===failed.id&&c.kind==='factSync').length,2);
  const beforeBlocked=jobs().length;
  const blocked=await page.evaluate(async k=>{
   const before=S.world.guide;S.world.guide='아직 저장하지 않은 사용자 설정';
   try{await DocumentPipeline.request('generate',k);return '';}catch(e){return e.message;}finally{S.world.guide=before;}
  },F);
  assert.match(blocked,/화면의 설정과 저장된 원본/);assert.equal(jobs().length,beforeBlocked,'실제 미저장 설정은 덮어쓰거나 AI를 접수하지 않는다');
  const now=Date.now()+100;
  db.sqlite.prepare("UPDATE worlds SET data=json_set(data,'$.guide','다른 기기의 최신 설정','$.updatedAt',?),updated=? WHERE wid='browser-world'").run(now,now);
  await page.evaluate(async()=>{
   S.gen={wid:S.world.id,key:S.world.mainKey};try{await Sync.pull();}finally{S.gen=null;}
   if(S.world.guide==='다른 기기의 최신 설정')throw Error('작업 중 화면은 이전 원본으로 남아야 한다');
  });
  await page.evaluate(k=>generatePage(k),F);
  assert.equal(await page.evaluate(()=>S.genErr?.msg||''),'','실패한 미저장 검색 항목이 다른 문서 작성을 막지 않는다');
  assert(await page.evaluate(k=>!!S.pages[k],F));
  assert.equal(await page.evaluate(()=>S.world.guide),'다른 기기의 최신 설정','이전 접수 원본과 같은 화면은 자동으로 최신 저장본을 받는다');
  const failedKey=await page.evaluate(()=>keyOf('실패한 검색 선원'));
  assert(await page.evaluate(k=>!!S.world.entities[k]&&!S.pages[k],failedKey),'실패한 검색 후보는 화면에 보존한다');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM pages WHERE pkey=?').get(failedKey).n,0,'실패한 초안을 다음 작업에 섞어 저장하지 않는다');
  identityFailure='';await page.evaluate(k=>generatePage(k),failedKey);
  assert(await page.evaluate(k=>!!S.pages[k],failedKey),'남겨 둔 검색 후보도 다시 작성할 수 있다');
  pass('실패한 검색 후보와 초안을 보존하면서 최신 저장본으로 후속·재시도 문서를 작성하고 실제 미저장 편집은 보호한다');

  await fixture('작성 경로 기준');
  await page.evaluate(()=>composeFromSearch('방향 작성 선원'));
  const guided=await page.evaluate(()=>S.view.key);
  await page.fill('#cpDir','항해 경력에 집중해 작성한다.');await page.click('[data-compose-go]');
  await page.waitForFunction(()=>!S.gen);
  assert.equal(await page.evaluate(()=>S.genErr?.msg||''),'','방향 작성의 guided 경로를 서버가 접수한다');
  assert(await page.evaluate(k=>!!S.pages[k],guided));
  assert.equal(submissions.find(b=>b.meta.title==='방향 작성 선원').input.entity.src,'guided');
  assert.equal(jobs().at(-1).meta.direction,'항해 경력에 집중해 작성한다.');
  await page.evaluate(()=>{S.view={name:'notfound',title:'강제 작성 선원'};S.nf.add(keyOf('강제 작성 선원'));renderAll();});
  await page.click('[data-force]');await page.waitForFunction(()=>!S.gen);
  assert.equal(await page.evaluate(()=>S.genErr?.msg||''),'','강제 작성의 force 경로를 서버가 접수한다');
  assert(await page.evaluate(()=>!!S.pages[keyOf('강제 작성 선원')]));
  assert.equal(submissions.find(b=>b.meta.title==='강제 작성 선원').input.entity.src,'force');
  pass('방향 작성과 없는 문서의 강제 작성도 해당 경로로 접수해 서버에서 문서를 완성한다');

  assert.deepEqual(errors,[]);pass('공유 엔진·작업 화면·문서 열기에서 브라우저 오류가 없다');
 }finally{globalThis.fetch=originalFetch;for(const e of entries.values())clearTimeout(e.timer);await context?.close();await browser?.close();await new Promise(r=>server.close(r));db.sqlite.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
