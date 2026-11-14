/* 브라우저 → 인증된 Worker → SQLite → 단계별 alarm. 제공자 호출은 모두 대체한다. */
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{appServer}=require('./helpers/app');
const server=appServer();let browser,context,page,n=0,hold=true,release,calls=[],errors=[],loseSubmit=false;
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
  const j=jobs().find(j=>j.status==='running');assert(j);const kind=j.steps.at(-1).kind;calls.push({id:j.id,kind,url});
  if(hold&&kind==='page')await new Promise(r=>{release=r});
  const out=kind==='page'?{title:j.meta.title,type:'인물',summary:'해양 탐험가',infobox:[{label:'성별',value:'남성'}],sections:[{heading:'개요',level:1,body:'서버가 끝까지 완성한 항해 기록이다.'}],categories:['소속:항구','유형:인물'],facts:[],newEntities:[],relations:[],timeline:[]}:kind==='fix'?{edits:[]}:kind==='analyze'?{facts:[],relations:[],timeline:[]}:{issues:[]};
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(out)}]},finishReason:'STOP'}]});
 };
 try{
  browser=await chromium.launch();context=await browser.newContext();
  await context.addInitScript(()=>{
   if(!localStorage.getItem('wwiki:gemini'))localStorage.setItem('wwiki:gemini',JSON.stringify({mode:'relay',relay:'https://relay.test',pass:'relay-pass',main:'custom-main',check:'custom-check',preCheck:true}));
   if(!localStorage.getItem('wwiki:acct'))localStorage.setItem('wwiki:acct',JSON.stringify({id:'tester',token:'token',since:0}));
   window.testHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});
  });
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.route('**/api/**',async route=>{const req=route.request(),body=req.postData();const res=await worker.fetch(new Request(req.url(),{method:req.method(),headers:await req.allHeaders(),...(body?{body}:{})}),env);if(loseSubmit&&req.method()==='POST'&&req.url().endsWith('/jobs')){loseSubmit=false;return route.abort()}try{await route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:await res.text()})}catch{}});
  await context.route('**/v1beta/**',r=>{errors.push('직접 AI 호출');r.abort()});
  const open=async()=>{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.stack));await p.goto(origin);await p.waitForFunction(()=>S.ready);return p};
  page=await open();
  const fixture=async name=>page.evaluate(async name=>{
   const A=keyOf('항구'),B=keyOf(name),ent=(title,type,pg)=>({...newEntity(title,type,''),page:pg});
   const w={kind:'world',id:'browser-world',title:'항구',seed:'항구 세계',era:'1900년',guide:'',rules:[],userCanon:'',timeline:[],relations:[],events:[],navboxes:{},aliases:{},toneTried:true,angleOff:true,relMigrated:true,entities:{[A]:ent('항구','지명',true),[B]:ent(name,'인물',false)},mainKey:A,createdAt:1};
   const p={key:A,title:'항구',type:'지명',summary:'항구 도시',infobox:[],sections:[{heading:'개요',level:1,body:'거대한 항구이다.'}],links:[],createdAt:1};
   S.world=w;S.pages={[A]:p};S.worlds=[w];S.view={name:'article',key:B};await Store.saveWorld(w);await Store.savePage(w.id,p);await Sync.flush();renderAll();return B;
  },name);
  const B=await fixture('선장');await page.evaluate(k=>{generatePage(k)},B);await until(()=>release);const id=jobs().at(-1).id;await page.close();hold=false;release();release=null;
  await until(()=>jobs().find(j=>j.id===id)?.status==='succeeded');assert.deepEqual(calls.filter(c=>c.id===id).map(c=>c.kind),['page','check','read']);
  const saved=JSON.parse(db.sqlite.prepare('SELECT data FROM pages WHERE pkey=?').get(B).data);assert(saved.check);pass('접수 뒤 탭을 닫아도 서버가 두 검사까지 끝내고 문서를 자동 저장한다');

  page=await open();await page.waitForSelector('.jobs');await page.click('[data-job-preview="'+id+'"]');await page.waitForSelector('[data-job-apply]');assert.equal(await page.locator('[data-job-apply]').innerText(),'저장된 문서 열기');const before=calls.length;await page.click('[data-job-apply]');await page.waitForSelector('.article');assert.equal(calls.length,before);assert.equal(await page.evaluate(k=>S.pages[k].sections[0].body,B),'서버가 끝까지 완성한 항해 기록이다.');pass('다시 연 탭은 작업 센터에서 저장된 문서를 AI 재호출 없이 연다');

  const C=await fixture('부선장');hold=true;await page.evaluate(k=>{generatePage(k)},C);await until(()=>release);const id2=jobs().at(-1).id;await page.evaluate(()=>{window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'))});hold=false;release();release=null;
  await until(()=>jobs().find(j=>j.id===id2)?.status==='succeeded');assert(await page.evaluate(()=>!!S.gen));await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'))});await page.waitForFunction(k=>!!S.pages[k]?.check&&!S.gen,C);pass('화면이 숨겨진 동안 서버가 저장하고 돌아온 탭이 완성된 결과를 동기화한다');

  const D=await fixture('기관장');hold=true;loseSubmit=true;await page.evaluate(k=>{generatePage(k)},D);await until(()=>release);const id3=jobs().at(-1).id;
  db.sqlite.prepare("UPDATE worlds SET data=json_set(data,'$.guide','다른 기기 수정'),updated=updated+1 WHERE wid='browser-world'").run();hold=false;release();release=null;
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

  assert.deepEqual(errors,[]);pass('공유 엔진·작업 화면·문서 열기에서 브라우저 오류가 없다');
 }finally{globalThis.fetch=originalFetch;for(const e of entries.values())clearTimeout(e.timer);await context?.close();await browser?.close();await new Promise(r=>server.close(r));db.sqlite.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
