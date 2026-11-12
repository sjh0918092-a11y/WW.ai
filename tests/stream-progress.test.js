/* 실제 대기·과금 없이 가상 시계와 SSE로 진행 감지, 복구, 중단을 검증한다. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const { appSource } = require("./helpers/app");
const html=appSource();
const code=html.slice(html.indexOf('const G_RETRY ='),html.indexOf('async function listGeminiModels()'))+'\nglobalThis.subject=gemini;';
const chunk=(text,thought=false)=>'data: '+JSON.stringify({candidates:[{content:{parts:[{text,thought}]}}]})+'\n\n';
let n=0;const pass=s=>console.log(`  ✓ ${++n}. ${s}`);
async function scenario(plans,opts={},setup){
 let now=0,nextId=0,settled=false,result,error;const timers=new Map(),calls=[],retries=[];let cancels=0;
 const schedule=(f,ms)=>{const id=++nextId;timers.set(id,{at:now+ms,f});return id;};
 const visibilityListeners=new Set();const doc={hidden:false,addEventListener:(name,fn)=>{if(name==='visibilitychange')visibilityListeners.add(fn);},removeEventListener:(name,fn)=>{if(name==='visibilitychange')visibilityListeners.delete(fn);}};
 const hidden=value=>{doc.hidden=value;for(const fn of [...visibilityListeners])fn();};
 const ctx={document:doc,AbortController,TextDecoder,Date:{now:()=>now},setTimeout:schedule,clearTimeout:id=>timers.delete(id),gReady:()=>true,gBase:()=>'',gAuth:()=>({}),GS:{main:'mock'},GDEF:{main:'mock'},gError:async r=>({code:'api_'+r.status}),parseJsonLoose:s=>{try{return JSON.parse(s);}catch{}},
 fetch:async(url,init)=>{
  const index=calls.length;calls.push({at:now,body:JSON.parse(init.body)});const events=plans[index]||plans.at(-1);
  if(events==='headers-hang')return await new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  let queue=[],pending=null,ended=false;
  const drain=()=>{if(pending&&queue.length){const p=pending;pending=null;p.resolve(queue.shift());}};
  const abort=()=>{ended=true;if(pending){pending.reject(new Error('aborted'));pending=null;}};init.signal.addEventListener('abort',abort,{once:true});
  for(const [delay,data] of events)schedule(()=>{if(ended)return;queue.push(data===null?{done:true}:{done:false,value:new TextEncoder().encode(data)});drain();},delay);
  return {ok:true,body:{getReader:()=>({read:()=>{if(init.signal.aborted)return Promise.reject(new Error('aborted'));if(queue.length)return Promise.resolve(queue.shift());return new Promise((resolve,reject)=>{pending={resolve,reject};});},cancel:async()=>{cancels++;ended=true;init.signal.removeEventListener('abort',abort);}})}};
 }};
 vm.createContext(ctx);vm.runInContext(code,ctx);const ctl=new AbortController();setup?.({schedule,ctl,hidden,skipTo:value=>{now=value;}});
 ctx.subject.json('same prompt',{progressWatch:true,signal:ctl.signal,onRetry:r=>retries.push(r),...opts}).then(r=>{settled=true;result=r;},e=>{settled=true;error=e;});
 for(let i=0;i<10000&&!settled;i++){
  for(let j=0;j<25&&!settled;j++)await Promise.resolve();if(settled)break;
  const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first)throw new Error('No pending event');timers.delete(first[0]);now=Math.max(now,first[1].at);first[1].f();
 }
 assert(settled,'scenario must finish');assert.equal(visibilityListeners.size,1,"모든 요청의 가시성 이벤트는 종료 후 정리한다");return {result,error,calls,retries,cancels,now};
}
(async()=>{
 let r=await scenario([[[100000,chunk('{"ok":true}')],[100001,null]]]);assert.equal(r.result.ok,true);assert.equal(r.calls.length,1);pass('처음 80초를 넘겨 내부 사고 중이어도 3분 이내 첫 출력은 기다린다');
 r=await scenario([[[1000,chunk('{')],[71000,chunk('"ok":')],[141000,chunk('true}')],[141001,null]]]);assert(r.result.ok);assert.equal(r.calls.length,1);pass('실제 출력이 이어지면 총 80초를 넘어도 재시도하지 않는다');
 r=await scenario([[[1000,chunk('thinking',true)],[71000,chunk('still thinking',true)],[141000,chunk('{"ok":true}')],[141001,null]]]);assert(r.result.ok);assert.equal(r.calls.length,1);pass('사고 텍스트는 진행으로 보되 최종 JSON에는 섞지 않는다');
 r=await scenario([[[1000,'data: '+JSON.stringify({usageMetadata:{thoughtsTokenCount:1}})+'\n'],[71000,'data: '+JSON.stringify({usageMetadata:{thoughtsTokenCount:2}})+'\n'],[141000,chunk('{"ok":true}')],[141001,null]]]);assert(r.result.ok);assert.equal(r.calls.length,1);pass('증가하는 사고 토큰도 진행으로 인식한다');
 r=await scenario([[[1000,chunk('thinking',true)],[50000,': heartbeat\n\n'],[75000,'data: {}\n\n']],[[1,chunk('{"ok":true}')],[2,null]]]);assert(r.result.ok);assert.equal(r.calls.length,2);assert.equal(r.calls[1].at,82500);assert.equal(r.retries[0].mode,'restart');pass('주석·빈 이벤트는 정체 시간을 초기화하지 않고 해당 요청만 재시도한다');
 r=await scenario([[],[[1,chunk('{"ok":true}')],[2,null]]]);assert(r.result.ok);assert.equal(r.calls[1].at,181500);pass('첫 출력이 없는 경우 3분 뒤 복구하며 재시도 대기 간격을 둔다');
 const partial='{"text":"'+'x'.repeat(240);
 r=await scenario([[[1000,chunk(partial)]],[[1,chunk('done"}')],[2,null]]]);assert.equal(r.result.text,'x'.repeat(240)+'done');assert.equal(r.retries[0].mode,'continue');assert.equal(r.calls[1].body.contents[1].parts[0].text,partial);pass('일부 출력 뒤 멎으면 받은 문장을 보존해 이어 받는다');
 r=await scenario([[]]);assert(r.error);assert.equal(r.calls.length,3);assert.equal(r.retries.length,2);assert.equal(r.cancels,3);pass('반복 정체는 재시도 2회까지만 하고 스트림을 정리한다');
 const events=Array.from({length:11},(_,i)=>[(i+1)*70000,chunk('thinking',true)]);
 r=await scenario([events]);assert.equal(r.error.code,'stage_timeout');assert.equal(r.now,600000);assert.equal(r.calls.length,1);pass('진행 신호가 있어도 한 단계 최대 10분 제한으로 무한 대기를 막는다');
 r=await scenario([[[1000,chunk('{')]]],{},({schedule,ctl})=>schedule(()=>ctl.abort(),2000));assert.equal(r.error.code,'cancelled');assert.equal(r.calls.length,1);assert.equal(r.retries.length,0);pass('사용자 중단은 자동 재시도하지 않는다');
 r=await scenario([[[1000,chunk('thinking',true)]],events]);assert.equal(r.error.code,'stage_timeout');assert.equal(r.now,600000);assert.equal(r.calls.length,2);pass('10분 제한은 재시도마다 새로 시작하지 않고 복구 시간을 포함한다');
 r=await scenario(['headers-hang',[[1,chunk('{"ok":true}')],[2,null]]]);assert(r.result.ok);assert.equal(r.calls[1].at,181500);pass('연결 후 응답 헤더조차 없는 경우도 중단하고 복구한다');
 r=await scenario([[[1000,chunk('thinking',true)],[150000,': heartbeat\n\n'],[250000,chunk('{"ok":true}')],[250001,null]]],{progressWatch:false});assert(r.result.ok);assert.equal(r.calls.length,1);pass('대상 밖의 작업은 기존 무응답 감지 동작을 유지한다');
 const late=Array.from({length:8},(_,i)=>[(i+1)*70000,chunk('thinking',true)]);late.push([599000,'data: {"error":{"message":"temporary failure"}}\n']);
 r=await scenario([late]);assert.equal(r.error.code,'stage_timeout');assert.equal(r.now,600000);assert.equal(r.calls.length,1);pass('복구 대기 간격도 남은 최대 대기 시간을 넘기지 않는다');
 r=await scenario([[[615000,chunk('{"ok":true}')],[615001,null]]],{},({schedule,hidden})=>{schedule(()=>hidden(true),1000);schedule(()=>hidden(false),610000);});assert(r.result.ok);assert.equal(r.calls.length,1);pass('첫 응답 전 10분간 화면을 숨겨도 시간 초과나 중복 요청을 만들지 않는다');
 r=await scenario([[[1000,chunk('{')],[610000,chunk('"ok":true}')],[610001,null]]],{},({schedule,hidden})=>{schedule(()=>hidden(true),2000);schedule(()=>hidden(false),602000);});assert(r.result.ok);assert.equal(r.calls.length,1);pass('일부 응답 뒤 백그라운드에 머물러도 복귀 후 원래 스트림을 이어 읽는다');
 r=await scenario([[[1000,chunk('{')],[685000,chunk('"ok":true}')],[685001,null]]],{},({schedule,hidden})=>{schedule(()=>hidden(true),80000);schedule(()=>hidden(false),680000);});assert(r.result.ok);assert.equal(r.calls.length,1);pass('정체 제한 직전에 화면을 숨겼어도 복귀 직후 10초간 수신 버퍼를 읽을 여유를 준다');
 r=await scenario([[[1000,chunk(partial)],[5000,'data: {"error":{"message":"disconnected"}}\n']],[[1,chunk('done"}')],[2,null]]],{},({schedule,hidden})=>{schedule(()=>hidden(true),2000);schedule(()=>hidden(false),605000);});assert.equal(r.result.text,'x'.repeat(240)+'done');assert.equal(r.calls.length,2);assert(r.calls[1].at>=605000);assert.equal(r.retries[0].mode,'continue');pass('백그라운드에서 실제 연결이 끊기면 복귀 후 받은 문장부터 복구한다');
 r=await scenario([[]],{},({schedule,ctl,hidden})=>{hidden(true);schedule(()=>ctl.abort(),10000);schedule(()=>hidden(false),20000);});assert.equal(r.error.code,'cancelled');assert.equal(r.calls.length,0);pass('숨겨진 화면에서 새 요청을 대기하며 사용자 중단 시 요청 없이 종료한다');
 r=await scenario([[[1000,chunk('{')]]],{},({schedule,ctl,hidden})=>{schedule(()=>hidden(true),2000);schedule(()=>ctl.abort(),5000);});assert.equal(r.error.code,'cancelled');assert.equal(r.calls.length,1);assert.equal(r.retries.length,0);pass('숨겨진 스트림도 사용자 중단은 즉시 처리하며 재시도하지 않는다');
 const pausedEvents=[[1000,chunk('thinking',true)],...Array.from({length:8},(_,i)=>[670000+i*70000,chunk('thinking',true)])];
 r=await scenario([pausedEvents],{},({schedule,hidden})=>{schedule(()=>hidden(true),2000);schedule(()=>hidden(false),602000);});assert.equal(r.error.code,'stage_timeout');assert.equal(r.now,1200000);pass('최대 10분 제한은 숨김 시간을 제외한 전면 활성 시간으로 계산한다');
 r=await scenario([[[205000,chunk('{"ok":true}')],[205001,null]]],{},({schedule,skipTo})=>schedule(()=>skipTo(200000),500));assert(r.result.ok);assert.equal(r.calls.length,1);pass('브라우저가 이벤트 실행을 늦췄다가 재개해도 즉시 시간 초과로 끊지 않는다');
 r=await scenario([[[1000,chunk(partial)],[2000,null]],[[1,chunk('done"}')],[2,null]]],{},({schedule,hidden})=>{schedule(()=>hidden(true),1500);schedule(()=>hidden(false),605000);});assert.equal(r.result.text,'x'.repeat(240)+'done');assert.equal(r.calls.length,2);assert(r.calls[1].at>=605000);pass('완료 신호 없이 일부 JSON만 받고 연결이 끝나도 복귀 후 이어 받는다');
 r=await scenario([[[1000,null]],[[1,chunk('{"ok":true}')],[2,null]]]);assert(r.result.ok);assert.equal(r.calls.length,2);pass('완료 신호 없는 빈 연결 종료도 제한된 횟수 안에서 복구한다');
 console.log(`\n모두 통과 (${n}개). 실제 대기·API 호출 없음.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
