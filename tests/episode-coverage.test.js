/* 다른 문서들이 기록한 이 항목의 일과 문서 읽기의 규모 제약. AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,addMention,recordedEpisodes,episodeIssues,detIssues,pagePrompt,readPrompt});', c);
const K = t => c.keyOf(t);
const page = (title, type, body, createdAt) => ({ key: K(title), title, type, summary: '', categories: [], infobox: [{ label: '성별', value: '여성' }], sections: [{ heading: '개요', level: 1, body }], links: [], createdAt });
function world() {
  const list = [page('레이첼 반스', '인물', '반스는 해군 전략 소녀다. 1995년 퇴역했다.', 4), page('걸프전', '사건', '1991년의 전쟁이다.', 1), page('미국', '국가', '미국이다.', 2), page('이라크', '국가', '이라크다.', 3)];
  const pages = {}, w = { id: 't', kind: 'world', title: '시험', era: '2017년', seed: '가상', rules: ['전략 소녀는 평소 신장 80m의 거체로 지낸다.'], timeline: [], events: [], entities: {} };
  for (const p of list) { pages[p.key] = p; w.entities[p.key] = { ...c.newEntity(p.title, p.type, ''), page: true }; }
  w.mainKey = list[0].key; c.S.pages = pages; c.S.world = w;
  const b = w.entities[K('레이첼 반스')];
  c.addMention(b, K('걸프전'), '레이첼 반스는 6개월 동안 페르시아만에 배치되었다.');
  c.addMention(b, K('미국'), '걸프전 당시 레이첼 반스를 6개월 배치했다.');
  c.addMention(b, K('이라크'), '걸프전에서 레이첼 반스가 해안을 봉쇄했다.');
  return w;
}
const tests = []; const test = (n, f) => tests.push([n, f]);
test('다른 문서 둘 이상이 엮어 기록한 사건을 찾는다', () => {
  const w = world(), eps = c.recordedEpisodes(w, K('레이첼 반스'));
  assert.equal(eps.length, 1); assert.equal(eps[0].docs.size, 3);
});
test('그 사건을 다루지 않은 문서에 참고 지적을 띄우고, 작성 입력에도 넣는다', () => {
  const w = world(), is = c.episodeIssues(w, K('레이첼 반스'));
  assert.equal(is.length, 1); assert.equal(is[0].advisory, true); assert.equal(is[0].severity, 'low');
  assert.ok(c.detIssues(w, K('레이첼 반스')).some(i => i.issueKey === 'episode:' + K('걸프전')));
  assert.match(c.pagePrompt(w, K('레이첼 반스')), /다른 문서들이 기록한 이 항목의 일/);
});
test('이미 다뤘으면 지적하지 않는다', () => {
  const w = world(); c.S.pages[K('레이첼 반스')].sections[0].body += ' 걸프전에 6개월 배치되었다.';
  assert.equal(c.episodeIssues(w, K('레이첼 반스')).length, 0);
});
test('문서 읽기 검사가 크기 제약과 핵심 규칙을 함께 본다', () => {
  const w = world(), r = c.readPrompt(w, K('레이첼 반스'));
  assert.match(r, /중환자실/); assert.match(r, /신장 80m의 거체/);
});
let failed = 0;
for (const [n, f] of tests) { try { f(); console.log('통과', n); } catch (e) { failed++; console.log('실패', n, '\n', e.message); } }
if (failed) process.exit(1);
