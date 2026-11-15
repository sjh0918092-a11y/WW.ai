/* 실제 사례의 최소 세계. 앱과 같은 소스를 VM에서 실행하며 AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, crypto: require("node:crypto").webcrypto, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} },
  window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,LOG,IDB,inputAudit,saveLogs,loadLogs,callJson,importPipelineLogs,logText,logHtml});', c);


(async () => {
  const prompt = '집필 지침\n## 세계관 원안\n항구의 기록\n\n## 관련 문서\n상세 원문 <script>test</script>\n';
  const body = { contents: [{role:'user',parts:[{text:prompt}]},{role:'model',parts:[{text:'이전 조각'}]},{role:'user',parts:[{text:'이어 쓰기'}]}], generationConfig:{responseMimeType:'application/json'}, secret:'기록 금지 키' };
  const audit = c.inputAudit(body);
  assert.equal(audit.messages[0].text,prompt);
  assert.equal(audit.chars,prompt.length+'이전 조각'.length+'이어 쓰기'.length);
  assert.equal(audit.sections.reduce((n,s)=>n+s.chars,0),audit.chars);
  assert.equal(audit.sections.map(s=>audit.messages[s.message].text.slice(s.start,s.end)).join(''),prompt+'이전 조각'+'이어 쓰기');
  assert(!JSON.stringify(audit).includes(body.secret));
  for(const model of ['claude-sonnet-4-6','gpt-6-luna'])assert(c.inputAudit(body,model).messages[0].text.includes('Return only a valid JSON value.'));
  c.S.sample={json:async(p,o)=>{o.onInput(body);return {issues:[]}}};
  await c.callJson('check',prompt);
  assert.equal(c.LOG.length,1);
  assert.equal(c.LOG[0].requests[0].chars,audit.chars);
  c.S.sample.json=async()=>{throw {code:'test_failure'}};
  await assert.rejects(()=>c.callJson('fix',prompt));
  assert.equal(c.LOG[1].ok,false);
  assert.equal(c.LOG[1].input.messages[0].text,prompt,'실패한 단계도 원문을 남긴다');
  const receipt={id:'job-1',createdAt:Date.now(),meta:{title:'항구'}};
  const result={pipeline:{steps:[{slot:'page:1',kind:'page',model:'gemini-test',status:'done',input:audit},{slot:'check:1',kind:'check',model:'gemini-test',status:'failed',input:audit}]}};
  c.importPipelineLogs(receipt,result);c.importPipelineLogs(receipt,result);
  assert.equal(c.LOG.length,4,'서버 결과를 다시 읽어도 중복되지 않는다');
  assert(c.logText().includes(prompt));
  assert(c.logHtml().includes('&lt;script&gt;test&lt;/script&gt;'));
  assert(c.logHtml().includes('비중'));
  assert(c.logHtml().includes('전문 로그 내려받기'));
  let saved;
  c.IDB.db={};c.IDB.put=async(k,v)=>{saved=structuredClone(v)};c.IDB.get=async()=>saved;
  await c.saveLogs();c.LOG.length=0;await c.loadLogs();
  assert.equal(c.LOG.length,4);assert.equal(c.LOG[0].requests[0].messages[0].text,prompt);
  c.LOG.length=0;await c.saveLogs();await c.loadLogs();assert.equal(c.LOG.length,0);
  console.log('통과: 입력 전문·구간 합계·재전송·실패 기록·서버 중복 제거·저장 복원·삭제');
})().catch(e=>{console.error(e);process.exitCode=1});
