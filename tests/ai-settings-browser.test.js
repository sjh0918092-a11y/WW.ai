const assert=require('node:assert/strict');
const {chromium}=require('playwright'),{appServer}=require('./helpers/app');
(async()=>{
 const server=appServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  await page.route('**/api/**',r=>r.fulfill({json:{worlds:[],pages:[],next:0}}));
  await page.addInitScript(()=>{localStorage.setItem('wwiki:acct',JSON.stringify({id:'tester',token:'session-test',since:0}));if(!localStorage.getItem('wwiki:gemini'))localStorage.setItem('wwiki:gemini',JSON.stringify({pass:'do-not-export',relay:'https://relay.test',main:'gemini-3.8-flash',check:'claude-sonnet-4-6',checkThink:'high'}))});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>S.ready);await page.click('#side [data-act="gset"]');
  await page.locator('#gTasks summary').click();await page.selectOption('#gTask-factSync','gemini-3.5-flash-lite');await page.selectOption('#gTaskThink-factSync','minimal');
  await page.selectOption('#gTask-read','claude-sonnet-4-6');await page.selectOption('#gTaskThink-read','low');
  await page.locator('#gInputs summary').click();await page.uncheck('#gInput-seed');await page.fill('#gInput-factsCount','2');await page.fill('#gInput-indexCount','1');
  await page.click('[data-act="gset-save"]');await page.reload();await page.waitForSelector('#gTask-factSync',{state:'attached'});
  assert.equal(await page.inputValue('#gTask-factSync'),'gemini-3.5-flash-lite');assert.equal(await page.inputValue('#gTaskThink-factSync'),'minimal');assert.equal(await page.isChecked('#gInput-seed'),false);assert.equal(await page.inputValue('#gInput-factsCount'),'2');
  const routing=await page.evaluate(async()=>{const calls=[],old=AIJobs.run;AIJobs.run=async(type,model,input)=>{calls.push({type,model,think:input.generationConfig.thinkingConfig?.thinkingLevel});return {candidates:[{content:{parts:[{text:'{"facts":[],"issues":[]}'}]},finishReason:'STOP'}]}};try{await callJson('factSync','extract',{modelTier:'check'});await callJson('read','read',{modelTier:'check'});await callJson('check','check',{modelTier:'check'});return calls}finally{AIJobs.run=old}});
  assert.deepEqual(routing,[{type:'gemini.generate',model:'gemini-3.5-flash-lite',think:'minimal'},{type:'claude.generate',model:'claude-sonnet-4-6',think:'low'},{type:'claude.generate',model:'claude-sonnet-4-6',think:'high'}]);
  const download=page.waitForEvent('download');await page.click('[data-act="gset-export"]');const file=await download;const fs=require('node:fs');const exported=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
  assert.equal(exported.settings.taskModels.factSync.model,'gemini-3.5-flash-lite');assert.equal(exported.settings.prompt.factsCount,2);assert(!JSON.stringify(exported).includes('do-not-export'));assert(!JSON.stringify(exported).includes('session-test'));
  exported.settings.taskModels.factSync={model:'claude-haiku-4-5',think:''};exported.settings.prompt.factsCount=0;
  await page.setInputFiles('#aiSettingsFile',{name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await page.waitForFunction(()=>GS.taskModels.factSync.model==='claude-haiku-4-5');
  assert.equal(await page.inputValue('#gTaskThink-factSync'),'');assert.equal(await page.inputValue('#gInput-factsCount'),'0');assert.equal(await page.evaluate(()=>GS.pass),'do-not-export');
  const invalid={...exported,settings:{...exported.settings,pass:'stolen'}};await page.setInputFiles('#aiSettingsFile',{name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>document.querySelector('#gRes').textContent.includes('가져오지 못했습니다'));assert.equal(await page.evaluate(()=>GS.pass),'do-not-export');
  await page.evaluate(()=>{ModelCatalog.remember("openai",[{id:"gpt-6-luna",label:"GPT-6 Luna"},{id:"gpt-4.1",label:"GPT-4.1"}]);document.querySelector("#gTasks").open=true});
  await page.selectOption("#gTask-factSync","gpt-6-luna");await page.selectOption("#gTaskThink-factSync","max");await page.click('[data-act="gset-save"]');
  const openai=await page.evaluate(async()=>{const old=AIJobs.run;let called;AIJobs.run=async(type,model,input)=>{called={type,model,level:input.generationConfig.thinkingConfig?.thinkingLevel};return {candidates:[{content:{parts:[{text:'{"facts":[]}'}]},finishReason:"STOP"}]}};try{await callJson("factSync","JSON extract",{modelTier:"check"});return called}finally{AIJobs.run=old}});
  assert.deepEqual(openai,{type:"openai.generate",model:"gpt-6-luna",level:"max"});assert.equal(await page.locator('#gImage option[value="gpt-6-luna"]').count(),0);
  await page.evaluate(()=>{document.querySelector("#gTasks").open=true});await page.selectOption("#gTask-factSync","gpt-4.1");await page.selectOption("#gTaskThink-factSync","");await page.click('[data-act="gset-save"]');assert.equal(await page.evaluate(()=>GS.taskModels.factSync.think),"");
  const checks=await page.evaluate(()=>{
   const a=keyOf('검사대상'),b=keyOf('관련도시'),c=keyOf('색인도시');const ent=(title,type='지명')=>({title,type,summary:title+'요약',facts:[],mentions:[],page:false,box:''});
   const w={kind:'world',id:'test',title:'시험',seed:'원안고유문장',era:'1900년',rules:['규칙고유문장'],userCanon:'사용자설정고유문장',timeline:[{year:'1890',event:'원안연표고유문장',src:'seed'},{year:'1900',event:'일반연표첫째',src:b},{year:'1901',event:'일반연표둘째',src:c}],relations:[],events:[],glossary:[{term:'고유용어',definition:'용어뜻고유문장'}],navboxes:{},aliases:{},entities:{[a]:ent('검사대상','인물'),[b]:ent('관련도시'),[c]:ent('색인도시')}};
   w.entities[a].facts=[{t:'일반사실첫째',src:b},{t:'일반사실둘째',src:b},{t:'일반사실셋째',src:b},{t:'사용자사실고유문장',src:'user'}];w.entities[a].mentions=[{from:b,text:'언급고유문장'}];
   w.entities[b].facts=[{t:'관련사실고유문장',src:'user'}];w.entities[b].box='관련인포박스고유문장';S.world=w;S.pages={};
   GS.prompt=normalizePromptOptions({factsCount:1,mentionsCount:0,relatedCount:1,indexCount:0,timelineCount:1,fixedTimeline:false});const limited=pagePrompt(w,a);
   const allOff=Object.fromEntries(AI_PROMPT_FIELDS.map(([key])=>[key,false]));GS.prompt=normalizePromptOptions(allOff);const off=pagePrompt(w,a);
   S.pages[a]={key:a,title:'검사대상',type:'인물',summary:'검사대상요약',infobox:[],sections:[],links:[],createdAt:1};const check=checkPrompt(w,a,[],'');
   return {oneFact:['일반사실첫째','일반사실둘째','일반사실셋째'].filter(x=>limited.includes(x)).length,user:limited.includes('사용자사실고유문장'),noMention:!limited.includes('언급고유문장'),noFixedTimeline:!limited.includes('원안연표고유문장'),oneTimeline:['일반연표첫째','일반연표둘째'].filter(x=>limited.includes(x)).length,off:['원안고유문장','규칙고유문장','사용자설정고유문장','사용자사실고유문장','언급고유문장','용어뜻고유문장','관련인포박스고유문장','관련사실고유문장','## 절제'].every(x=>!off.includes(x)),json:off.includes('JSON 객체 하나만 출력'),checkKept:check.includes('원안고유문장')&&check.includes('규칙고유문장')};
  });
  assert.deepEqual(checks,{oneFact:1,user:true,noMention:true,noFixedTimeline:true,oneTimeline:1,off:true,json:true,checkKept:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{S.view={name:'gset'};renderMain()});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/ww-ai-task-settings-mobile.png',fullPage:true});
  console.log('✓ Per-task routing/thinking, persisted controls, safe JSON export/import, actual prompt exclusions/counts, separate check context, mobile layout; mocked AI only');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
