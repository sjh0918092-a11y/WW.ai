/* 무대 품질: 기존 생성·검사 호출 재사용. 모든 모델 응답을 가짜로 돌리며 유료 호출은 없다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k,v) => local.set(k,v), removeItem: k => local.delete(k) },
  document: { hidden:false, getElementById:()=>null, querySelector:()=>node, addEventListener(){} },
  window: { addEventListener(){} }, navigator:{}, location:{hash:'',pathname:'/',search:''}, history:{} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,traitIndex,pagePrompt,timelineMatchPairs,applyTimelineMatches,runChecks,checkPrompt}); AIJobs.enabled=()=>false;', c);
c.ensureAgeRules = async () => null; c.detIssues = () => [];
const tests = []; const test = (name, fn) => tests.push([name, fn]);
const record = (event,src,k) => ({ year:'서임력 140',month:1,day:1,event,src,k });
function setup(extra={}) {
  const w = { id:'quality',title:'계승전쟁',seed:'칭호를 계승하는 세계',era:'서임력 941년 10월 12일',calendars:['서임력'],rules:[],
    stage:{units:[],now:'계승전을 준비한다',parties:[]}, entities:{old:c.newEntity('옛 문서','국가',''),fresh:c.newEntity('새 문서','인물','')},
    timeline:[record('서임청이 바일부르크 칙령을 선포했다.','old','서임청'),record('가문이 바일부르크 칙령에 따라 계승권을 공인받았다.','fresh','가문')],mainKey:'old',...extra };
  c.S.world=w; c.S.pages={fresh:{key:'fresh',title:'새 문서',type:'인물',createdAt:2,sections:[{heading:'개요',body:'새 문서의 정의다.'}],links:[],infobox:[],categories:[]}};
  return w;
}
const plain = x => JSON.parse(JSON.stringify(x));

test('소재와 시점을 항목에서 고르며 기존 반복 허용 예외를 없앤다', () => {
  const w=setup(); const prompt=c.pagePrompt(w,'fresh');
  assert(prompt.includes('소재와 시점은 이 항목의 고유한 이야기에서 고른다'));
  assert(!prompt.includes('이 세계의 가장 큰 비틀기나 사건') && !prompt.includes('되풀이가 아니다') && !prompt.includes('반복이 아니다'));
  assert(prompt.includes('특징 전체를 대표하는 중심 소재') && prompt.includes('기존 소재와 의미가 같으면 그 이름을 재사용한다'));
  delete w.stage; const old=c.pagePrompt(w,'fresh');
  assert(old.includes('이 세계의 가장 큰 비틀기나 사건') && old.includes('되풀이가 아니다'));
  assert(old.includes('성격을 보여 준 일화의 중심 소재(짧은 명사)'));
});
test('기존 motifs 필드와 모든 특징 구간의 소제목을 재사용한다', () => {
  const w=setup(); w.entities.other=c.newEntity('기존 인물','인물','');
  c.S.pages.other={title:'기존 인물',type:'인물',motifs:['선대 영혼의 환청'],sections:[
    {level:1,heading:'특징'},{level:2,heading:'약속을 기록하는 버릇'},
    {level:1,heading:'생애'},{level:2,heading:'항구에서 자랐다'},
    {level:1,heading:'능력'},{level:2,heading:'선대와의 대화'},
    {level:1,heading:'성격'},{level:2,heading:'함께 일하는 방식'}]};
  const text=c.traitIndex(w,'fresh');
  for(const t of ['약속을 기록하는 버릇','선대와의 대화','함께 일하는 방식','선대 영혼의 환청']) assert(text.includes(t));
  assert(!text.includes('항구에서 자랐다'));
  delete w.stage; const old=c.traitIndex(w,'fresh'); assert(!old.includes('선대와의 대화') && !old.includes('함께 일하는 방식'));
});
test('날짜가 같아도 모델이 별개 사건으로 답하면 보존하고 검사 두 호출만 실행한다', async () => {
  const w=setup(), calls=[];
  c.callJson=async(kind,prompt)=>{calls.push({kind,prompt});return {issues:[],timelineSame:[]};};
  const issues=await c.runChecks(w,'fresh',{},'검사');
  assert.deepEqual(plain(issues),[]); assert.equal(w.timeline.length,2);
  assert.deepEqual(calls.map(x=>x.kind),['check','read']);
  assert(calls[0].prompt.includes('## 연표 대조') && calls[0].prompt.includes('서임청이 바일부르크 칙령') && calls[0].prompt.includes('가문이 바일부르크 칙령'));
  assert(calls[0].prompt.includes('"timelineSame":[1]')); assert(!calls[1].prompt.includes('timelineSame'));
});
test('같은 날짜·다른 k의 동일 사건은 기존 check 응답으로 합치고 기존 기록을 보존한다', async () => {
  const w=setup();w.timeline[1].event='바일부르크 칙령이 서임청에서 선포되다.';const keep=w.timeline[0],calls=[];
  c.callJson=async kind=>{calls.push(kind);return kind==='check'?{issues:[],timelineSame:[1]}:{issues:[]};};
  const issues=await c.runChecks(w,'fresh',{},'검사');
  assert.deepEqual(plain(issues),[]);assert.deepEqual(calls,['check','read']);assert.equal(w.timeline.length,1);assert.equal(w.timeline[0],keep);
  assert.equal(keep.k,'서임청');assert.equal(keep.src,'old');
});
test('가·나 픽스처도 추가 호출 없이 모델의 동일 사건 응답을 적용한다', async () => {
  for(const pair of require('./fixtures/timeline-succession.json')) {
    const w=setup({timeline:plain(pair).map((t,i)=>({...t,src:i?'fresh':'seed',k:i?'new-subject':'old-subject'}))});
    c.callJson=async kind=>kind==='check'?{issues:[],timelineSame:[1]}:{issues:[]};
    // 후보 날짜는 기존 입력 정규화와 같은 값으로 맞춘다.
    w.timeline[1].year=w.timeline[0].year;
    await c.runChecks(w,'fresh',{},'검사');assert.equal(w.timeline.length,1);assert.equal(w.timeline[0].src,'seed');
  }
});
test('번호가 깨졌거나 응답이 없고 실패하면 기록을 삭제하지 않는다', async () => {
  for(const response of [{issues:[]},{issues:[],timelineSame:['1',0,-1,1.5,99,null]}, {timelineSame:[1]}]) {
    const w=setup(),pairs=c.timelineMatchPairs(w,'fresh');assert(!c.applyTimelineMatches(w,pairs,response));assert.equal(w.timeline.length,2);
  }
  const w=setup();c.callJson=async kind=>{if(kind==='check')throw Error('실패');return {issues:[]};};
  await c.runChecks(w,'fresh',{},'검사');assert.equal(w.timeline.length,2);
});
test('검사 중 기록·문서·세계가 바뀌거나 취소하면 중복 응답을 적용하지 않는다', async () => {
  for(const mode of ['record','page','world','cancel']) {
    const w=setup(),ctl=new AbortController();
    c.callJson=async kind=>{
      if(kind==='check') {
        if(mode==='record')w.timeline[1].event='검사 중 바뀐 별개 사건';
        if(mode==='page')c.S.pages.fresh={...c.S.pages.fresh};
        if(mode==='world')c.S.world={...w};
        if(mode==='cancel'){ctl.abort();throw {code:'cancelled'};}
      }
      return {issues:[],timelineSame:[1]};
    };
    if(mode==='cancel')await assert.rejects(c.runChecks(w,'fresh',{signal:ctl.signal},'검사'));
    else await c.runChecks(w,'fresh',{signal:ctl.signal},'검사');
    assert.equal(w.timeline.length,2,mode);
  }
});
test('날짜·기년법이 다르거나 무대가 없고 스토리·직접 편집 문서면 적용하지 않는다', () => {
  for(const mode of ['day','calendar','undated','legacy','story','edited']) {
    const w=setup();
    if(mode==='day')w.timeline[1].day=2;
    if(mode==='calendar'){w.calendars.push('성력');w.timeline[1].year='성력 140';}
    if(mode==='undated')delete w.timeline[1].day;
    if(mode==='legacy')delete w.stage;
    if(mode==='story'){w.mode='story';w.story={};}
    if(mode==='edited')c.S.pages.fresh.editedAt=3;
    assert.equal(c.timelineMatchPairs(w,'fresh').length,0,mode);if(mode!=='story')assert(!c.checkPrompt(w,'fresh').includes('timelineSame'));
  }
});
(async()=>{let n=0;for(const [name,fn]of tests){await fn();console.log(`  ✓ ${++n}. ${name}`);}console.log(`\n${n}/${tests.length} 통과 · 추가 모델 호출 0회`);})().catch(e=>{console.error(e);process.exitCode=1;});
