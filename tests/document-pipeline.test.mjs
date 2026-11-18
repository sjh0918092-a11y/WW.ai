/* 실제 SQLite와 브라우저 공유 엔진. 유료 제공자 대신 고정 응답만 사용한다. */
const cacheCalls=[];
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('js/core.js','utf8');
const keyOf=vm.runInNewContext(core.slice(core.indexOf('function cyrb53('),core.indexOf('const LINK_RE ='))+';keyOf');
const A=keyOf('항구'), B=keyOf('선장');
import {execFileSync} from 'node:child_process';
import worker from '../relay/worker.js';
import {AiJobs} from '../relay/jobs.js';
import {digest,sourcePage,commitDocument,snapshotWorld} from '../relay/pipeline-store.js';
import {D1} from './helpers/d1.mjs';
import {JobStorage,fireAlarm} from './helpers/jobs.mjs';
execFileSync(process.execPath,['relay/build-engine.cjs','--check']);
const db=new D1(), origin='https://sjh0918092-a11y.github.io', env={DB:db,GEMINI_KEY:'private-server-key',ANTHROPIC_API_KEY:'private-claude-key',OPENAI_API_KEY:'private-openai-key',PASSWORDS:'relay-pass'};
await worker.fetch(new Request(origin+'/api/sync',{headers:{Origin:origin}}),env);
db.sqlite.exec("INSERT INTO users VALUES('alice','s','h',1); INSERT INTO sessions VALUES('alice-token','alice',1)");
const ent=(title,type,page=false)=>({title,type,summary:'',facts:[],mentions:[],page,box:''});
const world=()=>({kind:'world',id:'test-world',title:'항구',seed:'항구 세계',era:'1900년',guide:'',rules:[],userCanon:'',timeline:[],relations:[],events:[],navboxes:{},aliases:{},toneTried:true,angleOff:true,relMigrated:true,entities:{[A]:ent('항구','지명',true),[B]:ent('선장','인물')},mainKey:A,updatedAt:100,createdAt:1});
const page=()=>({key:A,title:'항구',type:'지명',summary:'항구 도시',infobox:[],sections:[{heading:'개요',level:1,body:'거대한 항구이다.'}],links:[],savedAt:100,createdAt:1});
let fixClaim='푸른 바다를 항해한다.', fixEdits=null, extraIssues=[];
let calls=[],behavior='ok',gate,release,n=0;
let checkHolds=[],inFlight=0,peakChecks=0;
const waitFor=async fn=>{const end=Date.now()+3000;while(!await fn()){if(Date.now()>end)throw Error('검사 대기 시간 초과');await new Promise(r=>setTimeout(r,5));}};
const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
// 두 검사는 병렬로 준비하므로 둘 사이의 접수 순서만 정규화한다.
const orderedChecks=rows=>{const out=[...rows];for(let i=0;i<out.length-1;i++)if(out[i].kind==='read'&&out[i+1].kind==='check')[out[i],out[i+1]]=[out[i+1],out[i]];return out;};
const originalFetch=globalThis.fetch;
const response=(kind)=> kind==='page'?{title:'선장',type:'인물',summary:'해양 탐험가',infobox:[{label:'성별',value:'남성'}],sections:[{heading:'개요',level:1,body:'선장은 푸른 바다를 항해한다.'}],categories:['소속:항구','유형:인물'],facts:[],newEntities:[],relations:[],timeline:behavior==='dedupe'?[{year:'1900',month:1,day:1,about:'선장',event:'선장이 참여한 항구 항해법 공표가 이루어지다.'}]:[]}:kind==='check'&&behavior==='dedupe'?{issues:[],timelineSame:[1]}:kind==='fix'?{edits:fixEdits||[{field:'body',old:'푸른',new:'붉은',memo:1}]}:kind==='factSync'?{facts:[{about:'선장',fact:'붉은 바다를 항해한다.'}],relations:[],timeline:[]}:kind==='check'&&['fix','timeout-fix','parallel'].includes(behavior)?{issues:[{claim:fixClaim,evidence:'세계의 바다는 붉다.',conflict:'붉은 바다여야 한다.',severity:'high'},...extraIssues]}:{issues:[]};
// 스텝 종류는 큐의 공개 상태로 확인한다. 프롬프트 문구 변경에 테스트가 의존하지 않는다.
let activeEntry;
let tokenCounts=0, liveSeen=null;
globalThis.fetch=async(url,opts)=>{
 if(String(url).includes("/cachedContents")){cacheCalls.push({url:String(url),method:(opts||{}).method,body:(opts||{}).body});return Response.json({name:"cachedContents/test-cache",expireTime:new Date(Date.now()+900000).toISOString()})}if(String(url).endsWith(":countTokens"))return Response.json({totalTokens:5000});
 if (String(url).endsWith(':countTokens')) { tokenCounts++; return Response.json({totalTokens:5000}); }
 const job=activeEntry.storage.data.get('jobs').find(j=>j.status==='running');
 const step=job.steps.find(s=>s.status==='running'&&!calls.some(c=>c.slot===s.slot)), kind=step.kind;
 calls.push({slot:step.slot,kind,url,body:JSON.parse(opts.body)});
 if (kind==='page'&&!liveSeen) { const g=await activeEntry.obj.fetch(new Request('https://jobs.test/'+job.id)); liveSeen=(await g.json()).job; }
 if (url==='https://api.openai.com/v1/responses') {assert.equal(opts.headers.Authorization,'Bearer private-openai-key');return Response.json({model:step.model,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(response(kind))}]}],usage:{input_tokens:1000,output_tokens:120,input_tokens_details:{cached_tokens:200,cache_write_tokens:100},output_tokens_details:{reasoning_tokens:20}}});}
 if (url.includes('anthropic.com')) {
  assert.equal(opts.headers['x-api-key'], 'private-claude-key');
  return Response.json({content:[{type:'thinking',thinking:'private reasoning'},{type:'text',text:JSON.stringify(response(kind))}],stop_reason:'end_turn'});
 }
 assert.equal(opts.headers['x-goog-api-key'],'private-server-key');
 if(behavior==='parallel'&&['check','read'].includes(kind)) {
  inFlight++;peakChecks=Math.max(peakChecks,inFlight);
  await new Promise(resolve=>checkHolds.push({slot:step.slot,resolve:()=>{inFlight--;resolve();}}));
 }
 if(behavior==='parallel'&&kind==='fix') {assert.equal(inFlight,0);assert.equal(calls.filter(c=>['check','read'].includes(c.kind)).length,7,'모든 검사 뒤에만 수정한다');}

 if(behavior==='hold'&&kind==='page') { gate?.(); await new Promise(r=>{release=r}); }
 if(behavior==='unknown'&&kind==='check') throw new Error('private-key must not leak');
 if(behavior==='missing-model'&&kind==='check') return Response.json({error:{message:'private-key'}},{status:404});
 if(behavior==='reject'&&kind==='read') return Response.json({error:{message:'private-key'}},{status:429});
 if ((behavior==='timeout-page'&&kind==='page')||(behavior==='timeout-fix'&&kind==='fix')) return new Response('private-key',{status:524});
 if(behavior==='thinking'&&kind==='page'&&JSON.parse(opts.body).generationConfig.thinkingConfig) return Response.json({error:{message:'thinking unsupported'}},{status:400});
 return Response.json({candidates:[{content:{parts:[{text:'hidden',thought:true},{text:JSON.stringify(response(kind))}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:100,thoughtsTokenCount:20,cachedContentTokenCount:50}});
};
async function reset({rewrite=false,settings={}}={}) {
 calls=[];behavior='ok'; db.sqlite.exec('DELETE FROM worlds; DELETE FROM pages; DELETE FROM pipeline_commits;');
 const w=world(),pages={[A]:page()}; if(rewrite){w.entities[B].page=true;pages[B]={...page(),key:B,title:'선장',type:'인물',portrait:{src:'original-image'},shortStories:[{id:'s',title:'이전 단편',body:'소중한 원문'}]};}
 db.sqlite.prepare('INSERT INTO worlds VALUES(?,?,?,100,0,100)').run('alice',w.id,JSON.stringify(w));
 for(const [k,p]of Object.entries(pages))db.sqlite.prepare('INSERT INTO pages VALUES(?,?,?,?,100,0,100)').run('alice',w.id,k,JSON.stringify(p));
 const storage=new JobStorage(), obj=new AiJobs({storage},env),id=crypto.randomUUID();activeEntry={storage,obj};
 const input={action:'generate',wid:w.id,key:B,rewrite,settings:{main:'custom-main',quick:'custom-quick',check:'custom-check',mainThink:'low',checkThink:'high',preCheck:true,...settings},worldHash:await digest(w),pageHash:await digest(sourcePage(pages[B]||null))};
 const body={id,type:'document.pipeline',model:'custom-main',input,meta:{kind:'page',wid:w.id,key:B,title:'선장',recoveryV:1}};
 return {...activeEntry,id,input,body,w,pages};
}
async function request(e,path='',body) {
 const r=await e.obj.fetch(new Request('https://jobs.test/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-WW-Account':'alice'},body:body===undefined?undefined:JSON.stringify(body)}));return{status:r.status,...await r.json()};
}
async function run(e,limit=45){for(let i=0;i<limit;i++){const r=await request(e,e.id);if(!['queued','running'].includes(r.job.status))return r;e.obj=new AiJobs({storage:e.storage},env);activeEntry=e;await fireAlarm(e.obj);}throw new Error('단계 상한 초과');}
const storedPage=k=>JSON.parse(db.sqlite.prepare('SELECT data FROM pages WHERE uid=? AND pkey=? AND deleted=0').get('alice',k)?.data||'null');
try {
 let e=await reset();let r=await request(e,'',e.body);assert.equal(r.status,202);await request(e,'',e.body);r=await run(e);
 assert(r.job.steps.some(s=>s.usage?.promptTokenCount===1000));assert(r.result.pipeline.steps.some(s=>s.usage?.thoughtsTokenCount===20));assert(!JSON.stringify(r.job.steps).includes('private-server-key'));
 assert(liveSeen?.serverNow&&liveSeen.liveSteps?.some(s=>s.kind==='page'&&s.status==='running'&&Number.isFinite(s.timing?.at)&&s.timing.headers===null),JSON.stringify(liveSeen?.liveSteps));
 { const page=r.result.pipeline.steps.find(s=>s.kind==='page'); assert(page.cache.chars>7000&&page.cache.hashes.length===2&&page.cache.tokens===5000,JSON.stringify(page.cache)); assert(r.job.steps.find(s=>s.kind==='page').cache.hash===page.cache.hash); }
 { const gen=calls.find(c=>c.kind==='page'); assert.equal(gen.body.cachedContent,'cachedContents/test-cache'); assert.equal(gen.body.contents[0].parts.length,1); const created=cacheCalls.filter(c=>c.method==='POST'); assert(created.length>=1); const cb=JSON.parse(created[0].body); assert.equal(cb.ttl,'900s'); assert.equal(cb.contents[0].parts.length,2); assert(cb.model.startsWith('models/')); }
 assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert(r.result.pipeline.saved);assert(r.result.pipeline.checked);assert(storedPage(B)?.check);assert.deepEqual(orderedChecks(calls).map(c=>c.kind),['page','check','read','factSync']);assert(calls[0].url.includes('custom-main'));assert(calls[1].url.includes('custom-check'));assert.equal(calls[1].body.generationConfig.thinkingConfig.thinkingLevel,'high');
 assert(!JSON.stringify(r).includes('private-server-key'));assert(![...e.storage.data.keys()].some(k=>/^(key:|in:|pipe:)/.test(k)));pass('매 alarm마다 서버 객체를 재생성해도 생성·두 검사·D1 저장까지 완료하며 완료된 호출은 재실행하지 않는다');

 async function parallelFixture() {
  const e=await reset({rewrite:true});behavior='parallel';checkHolds=[];inFlight=0;peakChecks=0;
  for(let i=0;i<6;i++) {
   const key='reference-'+i;e.w.entities[key]=ent('참고 문서 '+i,'지명',true);
   const p={...page(),key,title:'참고 문서 '+i,links:[B],sections:[{heading:'개요',level:1,body:'항구 기록 '.repeat(6000)}]};
   db.sqlite.prepare('INSERT INTO pages VALUES(?,?,?,?,100,0,100)').run('alice',e.w.id,key,JSON.stringify(p));
  }
  db.sqlite.prepare('UPDATE worlds SET data=? WHERE uid=?').run(JSON.stringify(e.w),'alice');e.input.worldHash=await digest(e.w);
  await request(e,'',e.body);await fireAlarm(e.obj);return e;
 }
 e=await parallelFixture();let batch=e.obj.alarm();await waitFor(()=>checkHolds.length===4);assert.equal(peakChecks,4);
 const first=checkHolds.pop();first.resolve();
 await waitFor(async()=> (await e.obj.pipelineState(e.id)).steps.some(s=>s.slot===first.slot&&s.status==='done'));
 assert.equal(calls.some(c=>c.kind==='fix'),false,'빠른 검사 하나만 끝나도 수정하지 않는다');
 for(const h of checkHolds.reverse())h.resolve();await batch;
 checkHolds=[];e.obj=new AiJobs({storage:e.storage},env);activeEntry=e;batch=e.obj.alarm();await waitFor(()=>checkHolds.length===3);
 assert.equal(calls.some(c=>c.kind==='fix'),false,'두 번째 검사 묶음이 끝나기 전에는 수정하지 않는다');
 for(const h of checkHolds.reverse())h.resolve();await batch;r=await run(e);
 assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert.equal(r.result.pipeline.fixed,1);assert.equal(r.result.pipeline.remaining,0);assert.equal(peakChecks,4);
 assert.equal(new Set(calls.map(c=>c.slot)).size,calls.length,'완료된 호출은 다시 보내지 않는다');
 pass('검사 7개를 최대 4개씩 실행하고 역순 완료에도 모든 검사 후 한 번만 수정한다');

 e=await parallelFixture();batch=e.obj.alarm();await waitFor(()=>checkHolds.length===4);
 const completed=checkHolds.pop();completed.resolve();
 await waitFor(async()=> (await e.obj.pipelineState(e.id)).steps.some(s=>s.slot===completed.slot&&s.status==='done'));
 const completedIndex=(await e.obj.pipelineState(e.id)).steps.findIndex(s=>s.slot===completed.slot);
 const crashed=new JobStorage();crashed.data=structuredClone(e.storage.data);
 await request(e,e.id+'/cancel',{});for(const h of checkHolds)h.resolve();await batch;
 e={...e,storage:crashed,obj:new AiJobs({storage:crashed},env)};activeEntry=e;const beforeRestart=calls.length;r=await run(e);
 assert.equal(r.job.status,'interrupted');assert.equal(calls.length,beforeRestart);assert(!r.result.pipeline.saved);
 assert.equal(r.result.pipeline.steps.filter(s=>s.status==='unknown').length,3);
 assert.equal(r.result.pipeline.steps[completedIndex].status,'done');
 pass('병렬 검사 중 재시작하면 완료 결과를 보존하고 나머지 3개를 모두 미확인으로 처리해 재호출과 저장을 막는다');

 for(const preCheck of [true,false]) {
  e=await reset({settings:{preCheck}});behavior='dedupe';
  e.w.stage={units:[],now:'항해법을 시행한다',parties:[]};
  e.w.timeline=[{year:'1900',month:1,day:1,event:'항구 항해법이 공표되다.',src:'seed',k:A}];
  db.sqlite.prepare('UPDATE worlds SET data=? WHERE uid=?').run(JSON.stringify(e.w),'alice');e.input.worldHash=await digest(e.w);
  await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));
  assert.deepEqual(orderedChecks(calls).map(c=>c.kind),preCheck?['page','check','read','factSync']:['page','factSync']);
  const timeline=JSON.parse(db.sqlite.prepare('SELECT data FROM worlds WHERE uid=?').get('alice').data).timeline;
  assert.equal(timeline.length,preCheck?1:2);assert.equal(timeline[0].src,'seed');
 }
 pass('무대 세계관 연표 중복은 기존 검사 응답으로 저장하고 검사 끄기 설정에서도 호출을 늘리지 않는다');

 e=await reset({rewrite:true});behavior='fix';await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert.equal(r.result.pipeline.fixed,1);assert(storedPage(B).sections[0].body.includes('붉은'));assert.deepEqual(storedPage(B).portrait,{src:'original-image'});assert.equal(storedPage(B).shortStories[0].body,'소중한 원문');assert.deepEqual(orderedChecks(calls).map(c=>c.kind),['page','check','read','fix','factSync']);const savedWorld=JSON.parse(db.sqlite.prepare('SELECT data FROM worlds WHERE uid=?').get('alice').data);assert(savedWorld.entities[B].facts.some(f=>f.t.includes('붉은')));pass('자동 수정 뒤 AI 검사를 반복하지 않고 확정 사실을 정리하며 원래 이미지·단편을 보존한다');

 e=await reset({rewrite:true});behavior='fix';fixClaim='선장의 항해지가 푸른 바다로 설정되어 있다';
 await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));
 assert.equal(r.result.pipeline.fixed,1);assert.equal(r.result.pipeline.remaining,0);assert.deepEqual(storedPage(B).check.issues,[]);
 assert(storedPage(B).sections[0].body.includes('붉은'));assert.deepEqual(orderedChecks(calls).map(c=>c.kind),['page','check','read','fix','factSync']);{const st=r.result.pipeline.steps;assert(st.find(x=>x.kind==='fix').text.includes('"edits"'),'자동 수정 응답이 결과에 남는다');assert(st.find(x=>x.kind==='check').text.includes('"issues"'));assert(!st.find(x=>x.kind==='page').text,'문서 본문 응답은 따로 남기지 않는다');}
 fixClaim='푸른 바다를 항해한다.';
 pass('검사 메모가 원문을 요약했어도 실제로 적용한 자동 수정에 해당하는 경고는 닫고 재검사를 호출하지 않는다');

 for (const [claim, old, replacement] of [
  ['바다를 항해한다.', '선장은 푸른 바다를 항해한다.', '선장은 붉은 바다를 항해한다.'],
  ['선장의 항해지', '푸른 바다', '항구 앞의 붉은 바다'],
  ['선장의 항해지', '푸른 바다', '붉은 바다\n'],
  ['푸른 바다를 항해한다.', '푸른 바다를 항해한다.', ''],
 ]) {
  e=await reset({rewrite:true});behavior='fix';fixClaim=claim;fixEdits=[{field:'body',old,new:replacement,memo:1}];
  await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));
  assert.equal(r.result.pipeline.fixed,1,JSON.stringify({claim,old,replacement}));assert.equal(r.result.pipeline.remaining,0);assert.deepEqual(storedPage(B).check.issues,[]);
  if(replacement.includes('항구'))assert(storedPage(B).sections[0].body.includes('[[항구]]'));
  assert.deepEqual(orderedChecks(calls).map(c=>c.kind),['page','check','read','fix','factSync']);
 }
 fixEdits=null;fixClaim='푸른 바다를 항해한다.';
 pass('메모의 일부 표현이 남거나 저장 시 링크·줄바꿈이 정리되거나 문장을 삭제해도 적용한 수정의 메모를 닫는다');

 for (const [edit, fixed] of [[{field:'body',old:'푸른 바다',new:'붉은 바다'},1],[{field:'body',old:'푸른',new:'붉은'},0]]) {
  e=await reset({rewrite:true});behavior='fix';fixEdits=[edit];extraIssues=[{claim:'선장은 푸른 옷을 입는다.',evidence:'제복은 검다.',conflict:'제복 색이 다르다.',severity:'high'}];
  await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));
  assert.equal(r.result.pipeline.fixed,fixed,JSON.stringify(edit));assert.equal(storedPage(B).check.issues.length,2-fixed);
 }
 fixEdits=null;extraIssues=[];
 pass('메모 번호가 빠진 수정은 고친 구절과 겹치는 메모가 하나뿐일 때만 그 메모를 닫는다');

 for (const edits of [
  [{field:'body',old:'원문에 없는 구절',new:'붉은',memo:1}],
  [{field:'body',old:'푸른',new:'붉은',memo:2}],
  [{field:'body',old:'푸른',new:'아주 푸른',memo:1}],
 ]) {
  e=await reset({rewrite:true});behavior='fix';fixEdits=edits;fixClaim='선장의 항해지가 푸른 바다로 설정되어 있다';
  await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));
  assert.equal(r.result.pipeline.fixed,0);assert.equal(r.result.pipeline.remaining,1);assert.equal(storedPage(B).check.issues.length,1);
 }
 fixEdits=null;fixClaim='푸른 바다를 항해한다.';
 pass('적용 실패·잘못된 메모 번호·기존 구절이 남은 수정은 경고를 닫지 않는다');

 e=await reset({rewrite:true,settings:{taskModels:{page:{model:'gemini-writer',think:'minimal'},check:{model:'claude-sonnet-4-6',think:'high'},read:{model:'claude-haiku-4-5',think:'low'},fix:{model:'gemini-fixer',think:''},factSync:{model:'gemini-extractor',think:'minimal'}},prompt:{seed:false,guidelines:false}}});behavior='fix';await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));
 assert.deepEqual(orderedChecks(r.job.steps).map(s=>[s.kind,s.model]),[['page','gemini-writer'],['check','claude-sonnet-4-6'],['read','claude-haiku-4-5'],['fix','gemini-fixer'],['factSync','gemini-extractor']]);
 const writer=calls.find(c=>c.kind==='page');assert(!JSON.stringify(writer.body).includes('항구 세계'));assert(!JSON.stringify(writer.body).includes('## 절제'));assert(calls.find(c=>c.kind==='check').body.messages[0].content[0].text.includes('항구 세계'));
 assert.equal(calls.find(c=>c.kind==='read').body.thinking.budget_tokens,2048);assert.equal(calls.find(c=>c.kind==='factSync').body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
 pass('작업별 모델·생각 수준과 작성 입력 스위치를 서버에서도 반영하며 설정 검사 자료는 유지한다');

 e=await reset({rewrite:true,settings:{taskModels:{page:{model:'gpt-6.1-terra',think:'low'},check:{model:'claude-sonnet-4-6',think:'high'},read:{model:'gpt-6-luna',think:'none'},fix:{model:'gemini-3.8-flash',think:''},factSync:{model:'gpt-6-luna',think:'low'}}}});behavior='fix';await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert(storedPage(B).sections[0].body.includes('붉은'));for(const kind of ['page','read','factSync'])assert.equal(calls.find(c=>c.kind===kind).url,'https://api.openai.com/v1/responses');assert.equal(calls.find(c=>c.kind==='page').body.reasoning.effort,'low');assert.equal(calls.find(c=>c.kind==='read').body.reasoning.effort,'none');assert.equal(r.job.steps.find(s=>s.kind==='factSync').usage.thoughtsTokenCount,20);pass('OpenAI 작성·읽기·추출을 Claude 검사·Gemini 수정과 섞어 실행하고 비용 사용량과 문서를 저장한다');

 for(const mutation of ['edit','pageEdit','noop','ledger']){
  e=await reset();await request(e,'',e.body);await fireAlarm(e.obj);assert.equal(calls.length,1);
  if(mutation==='edit')db.sqlite.prepare('UPDATE worlds SET data=json_set(data,\'$.guide\',\'수동 변경\',\'$.updatedAt\',110),updated=110 WHERE uid=?').run('alice');
  else if(mutation==='pageEdit')db.sqlite.prepare("UPDATE pages SET data=json_set(data,'$.summary','참고 문서 변경'),updated=110 WHERE pkey=?").run(A);
  else if(mutation==='ledger'){const cur=JSON.parse(db.sqlite.prepare('SELECT data FROM worlds WHERE uid=?').get('alice').data);(cur.timeline||=[]).push({year:'1999',event:'동시에 끝난 다른 작업의 사건',src:'other-doc'});for(const o of Object.values(cur.entities))(o.mentions||=[]).push({from:'other-doc',text:'동시에 끝난 다른 작업의 언급'});db.sqlite.prepare('UPDATE worlds SET data=?,updated=110 WHERE uid=?').run(JSON.stringify(cur),'alice');}
  else db.sqlite.prepare('UPDATE worlds SET updated=110 WHERE uid=?').run('alice');
  r=await run(e);assert.equal(r.job.status,'succeeded',mutation+JSON.stringify(r.job.error));assert(r.result.pipeline.saved);assert(storedPage(B));
  const w=JSON.parse(db.sqlite.prepare('SELECT data FROM worlds WHERE uid=?').get('alice').data);assert(w.entities[B].page);
  if(mutation==='edit')assert.equal(w.guide,'수동 변경');if(mutation==='pageEdit')assert.equal(storedPage(A).summary,'참고 문서 변경');
  if(mutation==='ledger'){assert(w.timeline.some(t=>t.src==='other-doc'));assert(Object.values(w.entities).every(o=>o.mentions.some(m=>m.from==='other-doc')));}}
 pass('작업 중 다른 설정·참고 문서 변경, 다른 작업이 장부에 더한 항목, 내용 없는 재저장은 합쳐서 저장한다');
 for(const mutation of ['delete','entity','target']){
  e=await reset();await request(e,'',e.body);await fireAlarm(e.obj);
  if(mutation==='delete')db.sqlite.prepare('UPDATE worlds SET deleted=1 WHERE uid=?').run('alice');
  else if(mutation==='entity')db.sqlite.prepare(`UPDATE worlds SET data=json_set(data,'$.entities.${B}.summary','다른 기기 요약') WHERE uid=?`).run('alice');
  else db.sqlite.prepare('INSERT INTO pages(uid,wid,pkey,data,updated,deleted,stamp) VALUES(?,?,?,?,?,0,?)').run('alice','test-world',B,JSON.stringify({key:B,title:'선장',sections:[]}),120,1);
  r=await run(e);assert.equal(r.job.status,'failed',mutation);assert.equal(r.job.error.code,'source_changed');assert(!r.result.pipeline.saved);assert(r.result.candidates[0].content.parts[0].text);
  if(mutation!=='target')assert.equal(storedPage(B),null);}
 pass('작업 중 세계관 삭제, 같은 항목·대상 문서의 다른 변경은 덮어쓰지 않고 초안만 보관한다');

 e=await reset();e.body.input.worldHash='0'.repeat(64);await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'failed');assert.equal(calls.length,0);pass('접수 전 원본이 다르면 유료 AI를 호출하기 전에 중단한다');

 for(const mode of ['unknown','reject']){
 e=await reset();behavior=mode;await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,mode==='unknown'?'interrupted':'failed');assert(!r.result.pipeline.saved);assert(!r.result.pipeline.checked);assert.equal(storedPage(B),null);const before=calls.length;await fireAlarm(e.obj);assert.equal(calls.length,before);assert(r.result.candidates[0].content.parts[0].text);assert(!JSON.stringify(r).includes('private-key'));}
 pass('불명확한 제공자 결과·검사 실패는 원본을 유지하고 생성된 초안을 보관하며 자동 재호출하지 않는다');

 for (const failedKind of ['page','fix']) {
  e=await reset();behavior='timeout-'+failedKind;await request(e,'',e.body);r=await run(e);
  assert.equal(r.job.status,'failed');
  assert.equal(r.result.pipeline.error.code,'api_524');
  assert.equal(r.result.pipeline.error.httpStatus,524);
  assert.match(r.result.pipeline.error.message,/응답 시간이 초과/);
  assert.equal(r.result.pipeline.steps.find(s=>s.kind===failedKind).error.code,'api_524');
  assert.equal(Boolean(r.result.candidates[0].content.parts[0].text),failedKind==='fix');
  assert.equal(storedPage(B),null);assert(!JSON.stringify(r).includes('private-key'));
 }
 pass('초안 생성과 자동 수정의 524 오류를 단계별로 보존하고, 오류가 난 초안은 자동 저장하지 않는다');

 e=await reset();await request(e,'',e.body);await fireAlarm(e.obj);
 // 다음 호출의 running 기록만 남긴 재시작: 제공자 결과를 모르므로 재전송 금지.
 await e.storage.transaction(async tx=>{const jobs=await tx.get('jobs');jobs[0].status='running';const key='pipe:'+e.id+':0',s=JSON.parse(await tx.get(key));s.steps.push({slot:'check:1',kind:'check',model:'custom-check',status:'running',fingerprint:'unknown'});await tx.put(key,JSON.stringify(s));await tx.put('jobs',jobs)});
 r=await run(e);assert.equal(r.job.status,'interrupted');assert.equal(calls.length,1);assert(!r.result.pipeline.saved);pass('요청 진행 중 서버가 종료되면 해당 호출과 후속 호출을 보내지 않는다');

 e=await reset();await request(e,'',e.body);await fireAlarm(e.obj);const before=calls.length;await request(e,e.id+'/cancel',{});r=await run(e);assert.equal(r.job.status,'cancelled');assert.equal(calls.length,before);assert.equal(storedPage(B),null);assert(![...e.storage.data.keys()].some(k=>/^(key:|in:|pipe:)/.test(k)));pass('단계 사이 취소는 후속 호출과 저장을 막고 임시 기록을 정리한다');

 e=await reset();await request(e,'',e.body);behavior='hold';let started;const start=new Promise(r=>started=r);gate=started;const running=e.obj.alarm();await start;await request(e,e.id+'/cancel',{});release();await running;assert.equal((await request(e,e.id)).job.status,'cancelled');assert.equal(storedPage(B),null);pass('실행 중 취소 뒤 늦게 도착한 제공자 응답도 저장하지 않는다');

 e=await reset();behavior='thinking';await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert.equal(calls.filter(c=>c.kind==='page').length,2);pass('생각 설정 미지원의 명확한 400 응답만 설정을 빼고 다시 요청한다');

 // 같은 공유 엔진이 Claude의 단계별 생각 설정을 실제 요청에 전달한다.
 e=await reset({settings:{main:'claude-sonnet-4-5',quick:'claude-haiku-4-5',check:'claude-opus-4-5',mainThink:'high',checkThink:'low'}});
 await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));
 assert.equal(calls.find(c=>c.kind==='page').body.thinking.budget_tokens,8192);
 for(const c of calls.filter(c=>['check','read'].includes(c.kind))) assert.equal(c.body.thinking.budget_tokens,2048);
 assert(r.result.pipeline.saved);assert(!JSON.stringify(r.result).includes('private reasoning'));
 pass('Claude 문서 작성·검사가 각 단계의 확장 사고 예산으로 실행되고 저장된다');

 e=await reset();behavior='missing-model';await request(e,'',e.body);r=await run(e);
 assert.equal(r.job.error.code,'model_not_found');assert.equal(r.job.error.model,'custom-check');assert.equal(r.job.error.phase,'check');assert.equal(r.result.pipeline.error.model,'custom-check');assert(!JSON.stringify(r).includes('private-key'));
 pass('모델 404 오류에 실제 실패한 검사 모델과 단계를 보존하며 제공자 원문은 숨긴다');

 // D1 성공 직후 DO 기록 실패를 모사한다. 같은 job gate가 이후 수동 수정을 덮어쓰지 않는다.
 e=await reset();const snap=await snapshotWorld(db,'alice',e.input);const out={world:e.w,pages:{[B]:{...page(),key:B}},removed:[]};assert(await commitDocument(db,'alice',e.id,snap,out));db.sqlite.prepare("UPDATE pages SET data=json_set(data,'$.summary','후속 편집') WHERE pkey=?").run(B);assert(await commitDocument(db,'alice',e.id,snap,out));assert.equal(storedPage(B).summary,'후속 편집');pass('D1 저장 직후 재시작해도 작업 번호로 중복 저장을 막아 후속 편집을 보존한다');

 e=await reset();const snap2=await snapshotWorld(db,'alice',e.input);const bad={world:{...e.w,title:'덮어쓰기 금지'},pages:{[B]:{...page(),key:B}},removed:[]};const originalBatch=db.batch.bind(db);db.batch=async statements=>originalBatch([...statements.slice(0,-1),db.prepare('INSERT INTO missing_table VALUES(1)'),...statements.slice(-1)]);await assert.rejects(()=>commitDocument(db,'alice',e.id,snap2,bad));db.batch=originalBatch;assert.equal(storedPage(B),null);assert.equal(JSON.parse(db.sqlite.prepare('SELECT data FROM worlds').get().data).title,e.w.title);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM pipeline_commits').get().n,0);pass('저장 중 SQL 오류는 세계관·문서·완료 표시를 모두 롤백한다');

 e=await reset();e.body.input.action='check';e.body.input.key=A;e.body.input.pageHash=await digest(sourcePage(e.pages[A]));await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert.deepEqual(orderedChecks(calls).map(c=>c.kind),['check','read']);assert(storedPage(A).check);pass('단독 설정 검사도 두 검사와 결과 저장을 서버에서 완료한다');

 e=await reset();delete e.w.entities[B];e.w.angles=[{id:'angle-1',label:'고독한 항해',area:'해양',uses:0}];db.sqlite.prepare('UPDATE worlds SET data=? WHERE uid=?').run(JSON.stringify(e.w),'alice');e.body.input={...e.input,novel:true,entity:{title:'선장',type:'인물',summary:'새 탐험가',src:'discovery'},angleId:'angle-1',worldHash:await digest(e.w)};await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert(r.result.pipeline.angleRecorded);const novelWorld=JSON.parse(db.sqlite.prepare('SELECT data FROM worlds WHERE uid=?').get('alice').data);assert.equal(novelWorld.angles[0].uses,1);assert(novelWorld.entities[B].page);pass('탐색에서 고른 새 후보도 저장하고 각도 사용은 한 번만 기록한다');

 e=await reset({settings:{preCheck:false}});await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded');assert(!r.result.pipeline.checked);assert.deepEqual(orderedChecks(calls).map(c=>c.kind),['page','factSync']);pass('자동 검사 끄기 설정은 유지하며 수행하지 않은 검사를 완료로 표시하지 않는다');

 db.sqlite.exec("INSERT INTO users VALUES('한글계정','s','h',1);INSERT INTO sessions VALUES('korean-token','한글계정',1)");
 let forwarded;
 const koreanEnv={...env,AI_JOBS:{idFromName:n=>n,get:name=>({fetch:async req=>{forwarded={name,uid:decodeURIComponent(req.headers.get('X-WW-Account'))};return Response.json({jobs:[]})}})}};
 const korean=await worker.fetch(new Request('https://relay.test/api/jobs',{headers:{Origin:origin,Authorization:'Bearer korean-token','X-WW-Account':'forged'}}),koreanEnv);assert.equal(korean.status,200);assert.deepEqual(forwarded,{name:'account:한글계정',uid:'한글계정'});pass('한글 계정도 내부 전달이 되며 사용자가 넣은 계정 헤더는 인증 계정으로 덮어쓴다');
}finally{globalThis.fetch=originalFetch;db.sqlite.close()}
