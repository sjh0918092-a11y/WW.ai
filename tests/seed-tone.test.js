/* 실제 사례의 최소 세계. 앱과 같은 소스를 VM에서 실행하며 AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} },
  window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,biblePrompt,tonePrompt,pagePrompt,createWorld,homeHtml});', c);

(async () => {
  const key = c.keyOf('항구');
  const w = { id: 'tone-test', kind: 'world', title: '항구 세계', seed: '항해자들이 오가는 작은 항구 세계이다.', era: '1900년',
    guide: '원문 전용 표식: 전용기를 풍부하게 다룬다.', tone: { label: '해양 모험', guide: ['통합 지침 표식: 기체의 특징을 구체적으로 쓴다.'] },
    rules: [], timeline: [], entities: { [key]: c.newEntity('항구', '지명', '') }, mainKey: key };
  c.S.world = w; c.S.pages = {};
  for (const prompt of [c.pagePrompt(w, key), c.pagePrompt(w, key, '역사를 다시 쓴다.')]) {
    assert(!prompt.includes(w.guide), '작성·다시 쓰기에 작가 지침 원문을 보내지 않는다');
    assert(prompt.includes(w.tone.guide[0]), '대신 통합된 문체 지침을 보낸다');
  }
  for (const prompt of [c.biblePrompt(w.seed, '', w.guide, false), c.tonePrompt(w, '')]) {
    assert(prompt.includes(w.guide), '세계관·문체 생성에는 작가 지침을 보낸다');
    assert(prompt.includes('guide에 통합한다'), '문체 이외의 요구도 통합한다');
  }
  const home = c.homeHtml();
  assert(/id="seedTa"[^>]*maxlength="2000"/.test(home));
  assert(!home.includes('모든 문서에 함께 전달됩니다'));
  vm.runInContext('globalThis.messages=[];globalThis.requests=[];toast=t=>messages.push(t);renderMain=()=>{};DocumentCost.startWorld=()=>null;callJson=async(kind,prompt)=>{requests.push({kind,prompt});return {}};', c);
  c.S.sample = {};
  c.S.seed = '가'.repeat(2001);
  await c.createWorld();
  assert.equal(c.requests.length, 0, '초과 원안은 AI를 호출하지 않는다');
  assert(c.messages.some(t => t.includes('2,000자')));
  c.S.seed = '가'.repeat(2000);
  await c.createWorld();
  assert.equal(c.requests.length, 1, '2,000자 원안은 생성 요청을 허용한다');
  assert(c.requests[0].prompt.includes(c.S.seed));
  console.log('통과: 원안 제한·작가 지침 통합·작성 입력 분리 (유료 AI 호출 0회)');
})().catch(e => { console.error(e); process.exitCode=1; });
