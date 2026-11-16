const assert=require('node:assert/strict'),{chromium}=require('playwright'),{appServer}=require('./helpers/app');
(async()=>{const server=appServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
 await page.route('**/v1beta/**',()=>{throw Error('No paid AI calls expected')});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>S.ready);
 const data=await page.evaluate(()=>{
  const title='항구 경비대',person='클로에 애슈턴',a=keyOf(title),b=keyOf(person);
  const w={id:'definition-test',kind:'world',title:'항구 세계',seed:'항구의 경비대와 주민',era:'2018년',rules:[],timeline:[],relations:[],events:[],navboxes:{},aliases:{},toneTried:true,angleOff:true,relMigrated:true,mainKey:a,entities:{[a]:newEntity(title,'조직','항구를 지키는 경비대')}};
  S.world=w;S.pages={};S.worlds=[w];S.view={name:'article',key:a};
  const goal='남은 복무를 마치고 평범한 대학 생활을 시작하는 것';
  const parent=integrate(w,a,{type:'조직',summary:'항구의 경비 조직이다.',infobox:[],sections:[{heading:'개요',body:`[[${person}]]은 복무를 마치고 대학 진학을 준비한다.`}],newEntities:[{title:person,type:'인물',summary:goal}],facts:[{about:person,fact:'항구 경비대에 소속된 인물이다.'}]},{noAI:true});
  S.pages[a]=parent;
  const temp={...parent};
  const prompts={page:pagePrompt(w,b),discovery:discoveryPrompt(w,'새로운 인물',[]),sync:factSyncPrompt(w,temp,[b]),analyze:analyzePrompt(w,temp,[b],{text:'',refs:[]}),bible:biblePrompt('항구의 이야기','주인공','',true)};
  setupStory(w,{protagonist:{summary:'항구 경비대원',want:'대학 진학'},spine:[],chapter1:{title:'첫날',summary:'경비대에 들어왔다.',era:'2018년',nextChoices:[]}}, {total:8});
  prompts.chapter=chapterPlanPrompt(w,2,'훈련을 한다');
  prompts.block=chapterBlockPrompt(w,a,[1]);
  const corrected='항구 경비대에서 복무하며 대학 진학을 준비하는 인물이다.';
  const result=integrate(w,b,{type:'인물',summary:corrected,infobox:[],sections:[{heading:'개요',body:`${person}은 항구 경비대원이다. 복무를 마치고 대학 생활을 시작하고 싶어 한다.`}]},{noAI:true});
  return {prompts,goal,corrected,resultSummary:result.summary,entitySummary:w.entities[b].summary,stub:w.entities[b].stub.summary,facts:w.entities[b].facts.map(x=>x.t),promise:promiseHtml(w,w.entities[b],'확정 내용')};
 });
 for(const [kind,prompt]of Object.entries(data.prompts)){
  assert(prompt.includes('## 항목의 한 줄 정의'),kind+' definition contract');
  assert(prompt.includes('그 대상이 누구인지 또는 무엇인지'),kind+' identity');
  assert(prompt.includes('목표, 바라는 삶'),kind+' goals are separate');
 }
 assert(data.prompts.page.includes(data.goal),'기존 목표도 생성 문맥에 보존');
 assert.equal(data.resultSummary,data.corrected);assert.equal(data.entitySummary,data.corrected);assert.equal(data.stub,data.goal);
 assert(data.facts.includes('항구 경비대에 소속된 인물이다.'));assert(data.promise.includes(data.corrected));assert.deepEqual(errors,[]);
 console.log('✓ Definition contract across discovery, linked entries, edits, story; goal context and confirmed facts preserved');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
