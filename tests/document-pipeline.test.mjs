/* 실제 SQLite와 브라우저 공유 엔진. 유료 제공자 대신 고정 응답만 사용한다. */
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
const db=new D1(), origin='https://sjh0918092-a11y.github.io', env={DB:db,GEMINI_KEY:'private-server-key',PASSWORDS:'relay-pass'};
await worker.fetch(new Request(origin+'/api/sync',{headers:{Origin:origin}}),env);
db.sqlite.exec("INSERT INTO users VALUES('alice','s','h',1); INSERT INTO sessions VALUES('alice-token','alice',1)");
const ent=(title,type,page=false)=>({title,type,summary:'',facts:[],mentions:[],page,box:''});
const world=()=>({kind:'world',id:'test-world',title:'항구',seed:'항구 세계',era:'1900년',guide:'',rules:[],userCanon:'',timeline:[],relations:[],events:[],navboxes:{},aliases:{},toneTried:true,angleOff:true,relMigrated:true,entities:{[A]:ent('항구','지명',true),[B]:ent('선장','인물')},mainKey:A,updatedAt:100,createdAt:1});
const page=()=>({key:A,title:'항구',type:'지명',summary:'항구 도시',infobox:[],sections:[{heading:'개요',level:1,body:'거대한 항구이다.'}],links:[],savedAt:100,createdAt:1});
let calls=[],behavior='ok',gate,release,n=0;
const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
const originalFetch=globalThis.fetch;
const response=(kind)=> kind==='page'?{title:'선장',type:'인물',summary:'해양 탐험가',infobox:[{label:'성별',value:'남성'}],sections:[{heading:'개요',level:1,body:'선장은 푸른 바다를 항해한다.'}],categories:['소속:항구','유형:인물'],facts:[],newEntities:[],relations:[],timeline:[]}:kind==='fix'?{edits:[{field:'body',old:'푸른',new:'붉은',memo:1}]}:kind==='analyze'?{facts:[{about:'선장',fact:'붉은 바다를 항해한다.'}],relations:[],timeline:[]}:kind==='check'&&behavior==='fix'?{issues:[{claim:'푸른 바다를 항해한다.',evidence:'세계의 바다는 붉다.',conflict:'붉은 바다여야 한다.',severity:'high'}]}:{issues:[]};
// 스텝 종류는 큐의 공개 상태로 확인한다. 프롬프트 문구 변경에 테스트가 의존하지 않는다.
let activeEntry;
globalThis.fetch=async(url,opts)=>{
 const job=activeEntry.storage.data.get('jobs').find(j=>j.status==='running');
 const step=job.steps.at(-1), kind=step.kind;
 calls.push({kind,url,body:JSON.parse(opts.body)});
 assert.equal(opts.headers['x-goog-api-key'],'private-server-key');
 if(behavior==='hold'&&kind==='page') { gate?.(); await new Promise(r=>{release=r}); }
 if(behavior==='unknown'&&kind==='check') throw new Error('private-key must not leak');
 if(behavior==='reject'&&kind==='read') return Response.json({error:{message:'private-key'}},{status:429});
 if(behavior==='thinking'&&kind==='page'&&JSON.parse(opts.body).generationConfig.thinkingConfig) return Response.json({error:{message:'thinking unsupported'}},{status:400});
 return Response.json({candidates:[{content:{parts:[{text:'hidden',thought:true},{text:JSON.stringify(response(kind))}]},finishReason:'STOP'}]});
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
 assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert(r.result.pipeline.saved);assert(r.result.pipeline.checked);assert(storedPage(B)?.check);assert.deepEqual(calls.map(c=>c.kind),['page','check','read']);assert(calls[0].url.includes('custom-main'));assert(calls[1].url.includes('custom-check'));assert.equal(calls[1].body.generationConfig.thinkingConfig.thinkingLevel,'high');
 assert(!JSON.stringify(r).includes('private-server-key'));assert(![...e.storage.data.keys()].some(k=>/^(key:|in:|pipe:)/.test(k)));pass('매 alarm마다 서버 객체를 재생성해도 생성·두 검사·D1 저장까지 완료하며 완료된 호출은 재실행하지 않는다');

 e=await reset({rewrite:true});behavior='fix';await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert.equal(r.result.pipeline.fixed,1);assert(storedPage(B).sections[0].body.includes('붉은'));assert.deepEqual(storedPage(B).portrait,{src:'original-image'});assert.equal(storedPage(B).shortStories[0].body,'소중한 원문');assert(calls.some(c=>c.kind==='analyze'));const savedWorld=JSON.parse(db.sqlite.prepare('SELECT data FROM worlds WHERE uid=?').get('alice').data);assert(savedWorld.entities[B].facts.some(f=>f.t.includes('붉은')));pass('재작성·자동 수정 뒤 확정 사실까지 마치고, 원래 이미지·단편을 보존한다');

 for(const mutation of ['edit','pageEdit','delete','aba']){
  e=await reset();await request(e,'',e.body);await fireAlarm(e.obj);assert.equal(calls.length,1);
  if(mutation==='edit')db.sqlite.prepare('UPDATE worlds SET data=json_set(data,\'$.guide\',\'수동 변경\'),updated=110 WHERE uid=?').run('alice');
  else if(mutation==='pageEdit')db.sqlite.prepare("UPDATE pages SET data=json_set(data,'$.summary','참고 문서 변경') WHERE pkey=?").run(A);
  else {db.sqlite.prepare('UPDATE worlds SET deleted=1 WHERE uid=?').run('alice');if(mutation==='aba')db.sqlite.prepare('UPDATE worlds SET deleted=0 WHERE uid=?').run('alice');}
  r=await run(e);assert.equal(r.job.status,'failed');assert.equal(r.job.error.code,'source_changed');assert(!r.result.pipeline.saved);assert.equal(storedPage(B),null);assert(r.result.candidates[0].content.parts[0].text);}
 pass('작업 중 수정·삭제·삭제 후 복원은 DB 버전으로 감지하고 초안만 보관한다');

 e=await reset();e.body.input.worldHash='0'.repeat(64);await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'failed');assert.equal(calls.length,0);pass('접수 전 원본이 다르면 유료 AI를 호출하기 전에 중단한다');

 for(const mode of ['unknown','reject']){
 e=await reset();behavior=mode;await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,mode==='unknown'?'interrupted':'failed');assert(!r.result.pipeline.saved);assert(!r.result.pipeline.checked);assert.equal(storedPage(B),null);const before=calls.length;await fireAlarm(e.obj);assert.equal(calls.length,before);assert(r.result.candidates[0].content.parts[0].text);assert(!JSON.stringify(r).includes('private-key'));}
 pass('불명확한 제공자 결과·검사 실패는 원본을 유지하고 생성된 초안을 보관하며 자동 재호출하지 않는다');

 e=await reset();await request(e,'',e.body);await fireAlarm(e.obj);
 // 다음 호출의 running 기록만 남긴 재시작: 제공자 결과를 모르므로 재전송 금지.
 await e.storage.transaction(async tx=>{const jobs=await tx.get('jobs');jobs[0].status='running';const key='pipe:'+e.id+':0',s=JSON.parse(await tx.get(key));s.steps.push({slot:'check:1',kind:'check',model:'custom-check',status:'running',fingerprint:'unknown'});await tx.put(key,JSON.stringify(s));await tx.put('jobs',jobs)});
 r=await run(e);assert.equal(r.job.status,'interrupted');assert.equal(calls.length,1);assert(!r.result.pipeline.saved);pass('요청 진행 중 서버가 종료되면 해당 호출과 후속 호출을 보내지 않는다');

 e=await reset();await request(e,'',e.body);await fireAlarm(e.obj);const before=calls.length;await request(e,e.id+'/cancel',{});r=await run(e);assert.equal(r.job.status,'cancelled');assert.equal(calls.length,before);assert.equal(storedPage(B),null);assert(![...e.storage.data.keys()].some(k=>/^(key:|in:|pipe:)/.test(k)));pass('단계 사이 취소는 후속 호출과 저장을 막고 임시 기록을 정리한다');

 e=await reset();await request(e,'',e.body);behavior='hold';let started;const start=new Promise(r=>started=r);gate=started;const running=e.obj.alarm();await start;await request(e,e.id+'/cancel',{});release();await running;assert.equal((await request(e,e.id)).job.status,'cancelled');assert.equal(storedPage(B),null);pass('실행 중 취소 뒤 늦게 도착한 제공자 응답도 저장하지 않는다');

 e=await reset();behavior='thinking';await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert.equal(calls.filter(c=>c.kind==='page').length,2);pass('생각 설정 미지원의 명확한 400 응답만 설정을 빼고 다시 요청한다');

 // D1 성공 직후 DO 기록 실패를 모사한다. 같은 job gate가 이후 수동 수정을 덮어쓰지 않는다.
 e=await reset();const snap=await snapshotWorld(db,'alice',e.input);const out={world:e.w,pages:{[B]:{...page(),key:B}},removed:[]};assert(await commitDocument(db,'alice',e.id,snap,out));db.sqlite.prepare("UPDATE pages SET data=json_set(data,'$.summary','후속 편집') WHERE pkey=?").run(B);assert(await commitDocument(db,'alice',e.id,snap,out));assert.equal(storedPage(B).summary,'후속 편집');pass('D1 저장 직후 재시작해도 작업 번호로 중복 저장을 막아 후속 편집을 보존한다');

 e=await reset();const snap2=await snapshotWorld(db,'alice',e.input);const bad={world:{...e.w,title:'덮어쓰기 금지'},pages:{[B]:{...page(),key:B}},removed:[]};const originalBatch=db.batch.bind(db);db.batch=async statements=>originalBatch([...statements.slice(0,-1),db.prepare('INSERT INTO missing_table VALUES(1)'),...statements.slice(-1)]);await assert.rejects(()=>commitDocument(db,'alice',e.id,snap2,bad));db.batch=originalBatch;assert.equal(storedPage(B),null);assert.equal(JSON.parse(db.sqlite.prepare('SELECT data FROM worlds').get().data).title,e.w.title);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM pipeline_commits').get().n,0);pass('저장 중 SQL 오류는 세계관·문서·완료 표시를 모두 롤백한다');

 e=await reset();e.body.input.action='check';e.body.input.key=A;e.body.input.pageHash=await digest(sourcePage(e.pages[A]));await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert.deepEqual(calls.map(c=>c.kind),['check','read']);assert(storedPage(A).check);pass('단독 설정 검사도 두 검사와 결과 저장을 서버에서 완료한다');

 e=await reset();delete e.w.entities[B];e.w.angles=[{id:'angle-1',label:'고독한 항해',area:'해양',uses:0}];db.sqlite.prepare('UPDATE worlds SET data=? WHERE uid=?').run(JSON.stringify(e.w),'alice');e.body.input={...e.input,novel:true,entity:{title:'선장',type:'인물',summary:'새 탐험가',src:'discovery'},angleId:'angle-1',worldHash:await digest(e.w)};await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded',JSON.stringify(r));assert(r.result.pipeline.angleRecorded);const novelWorld=JSON.parse(db.sqlite.prepare('SELECT data FROM worlds WHERE uid=?').get('alice').data);assert.equal(novelWorld.angles[0].uses,1);assert(novelWorld.entities[B].page);pass('탐색에서 고른 새 후보도 저장하고 각도 사용은 한 번만 기록한다');

 e=await reset({settings:{preCheck:false}});await request(e,'',e.body);r=await run(e);assert.equal(r.job.status,'succeeded');assert(!r.result.pipeline.checked);assert.deepEqual(calls.map(c=>c.kind),['page']);pass('자동 검사 끄기 설정은 유지하며 수행하지 않은 검사를 완료로 표시하지 않는다');

 db.sqlite.exec("INSERT INTO users VALUES('한글계정','s','h',1);INSERT INTO sessions VALUES('korean-token','한글계정',1)");
 let forwarded;
 const koreanEnv={...env,AI_JOBS:{idFromName:n=>n,get:name=>({fetch:async req=>{forwarded={name,uid:decodeURIComponent(req.headers.get('X-WW-Account'))};return Response.json({jobs:[]})}})}};
 const korean=await worker.fetch(new Request('https://relay.test/api/jobs',{headers:{Origin:origin,Authorization:'Bearer korean-token','X-WW-Account':'forged'}}),koreanEnv);assert.equal(korean.status,200);assert.deepEqual(forwarded,{name:'account:한글계정',uid:'한글계정'});pass('한글 계정도 내부 전달이 되며 사용자가 넣은 계정 헤더는 인증 계정으로 덮어쓴다');
}finally{globalThis.fetch=originalFetch;db.sqlite.close()}
