/* 주인 없는 값: 공통 값 장부, 소속 구성원 현황, 기간표. AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,ingestAffil,ingestTerms,rosterBlock,periodBlock,glossaryBlock,pagePrompt,checkPrompt,readPrompt,integrate,purgeTerms});', c);
const K = t => c.keyOf(t);
const page = (title, type, body, createdAt, extra = {}) => ({ key: K(title), title, type, summary: '', categories: [], infobox: [], sections: [{ heading: '개요', level: 1, body }], links: [...body.matchAll(/\[\[([^\]|]+)/g)].map(m => K(m[1])), createdAt, ...extra });
function world(list, extra = {}) {
  const pages = {}, w = { id: 't', kind: 'world', title: '시험 세계', era: '2017년', seed: '가상', rules: [], timeline: [], events: [], entities: {}, ...extra };
  for (const p of list) { pages[p.key] = p; w.entities[p.key] = { ...c.newEntity(p.title, p.type, p.summary), page: true }; }
  w.mainKey = list[0].key; c.S.pages = pages; c.S.world = w; return w;
}
const tests = []; const test = (n, f) => tests.push([n, f]);
function russia() {
  const w = world([page('러시아', '국가', '러시아다.', 1), page('베레진스카야', '인물', '[[러시아]] 해군의 전략 소녀다.', 2), page('체르넨코', '인물', '[[러시아]] 해군 출신이다.', 3)]);
  c.ingestAffil(w, K('베레진스카야'), [{ org: '러시아', role: '해군 전략 소녀', state: '현역', from: '2009', to: '' }]);
  c.ingestAffil(w, K('체르넨코'), [{ org: '러시아', role: '해군 전략 소녀', state: '퇴역', from: '1987년', to: '2001년' }, { org: '없는 조직', state: '현역' }]);
  return w;
}
test('항목 자신의 문서가 정한 소속만 받고, 링크하지 않은 소속은 버린다', () => {
  const w = russia();
  assert.equal(w.entities[K('체르넨코')].affil.list.length, 1);
  assert.equal(w.entities[K('체르넨코')].affil.list[0].from, '1987');
});
test('구성원 현황은 상태별 수와 구성원을 보여 준다', () => {
  const w = russia(), b = c.rosterBlock(w, [K('러시아')], 30, true);
  assert.match(b, /현역 1, 퇴역 1/); assert.match(b, /베레진스카야: 해군 전략 소녀, 현역, 2009~현재/); assert.match(b, /N기 중/);
});
test('허브 작성 입력과 소속 인물 작성 입력에 구성원 현황이 들어간다', () => {
  const w = russia();
  assert.match(c.pagePrompt(w, K('러시아')), /소속 구성원 현황/);
  assert.match(c.pagePrompt(w, K('베레진스카야')), /체르넨코: 해군 전략 소녀, 퇴역, 1987~2001/);
  assert.match(c.pagePrompt(w, K('베레진스카야')), /"affiliations":\[/);
});
test('설정 대조에 구성원 현황과 등장 대상의 기간이 들어간다', () => {
  const w = russia();
  c.S.pages[K('체르넨코')].infobox = [{ label: '발현', value: '1987년' }];
  c.S.pages[K('슬라바')] = page('슬라바', '인물', '[[러시아]]의 전략 소녀였다.', 4, { infobox: [{ label: '퇴역', value: '1986년 7월' }] });
  w.entities[K('슬라바')] = { ...c.newEntity('슬라바', '인물', ''), page: true };
  c.S.pages[K('베레진스카야')].sections[0].body = '[[러시아]]의 전략 소녀로 [[체르넨코]]와 [[슬라바]]가 같은 도크를 썼다.';
  c.S.pages[K('베레진스카야')].links = [K('러시아'), K('체르넨코'), K('슬라바')];
  const ck = c.checkPrompt(w, K('베레진스카야'));
  assert.match(ck, /소속 구성원 현황/); assert.match(ck, /등장 대상의 기간/); assert.match(ck, /슬라바: 퇴역 1986년 7월/); assert.match(ck, /체르넨코: 발현 1987년/);
});
test('공통 값은 대상 이름만 나와도 대조 자료에 들어간다', () => {
  const w = world([page('사토', '인물', '전략 소녀 사토의 체중은 4,200톤이다.', 1)]);
  c.ingestTerms(w, K('사토'), [{ term: '전략 소녀의 체중', about: '전략 소녀', definition: '신장 80m급 개체의 체중은 5만~5만 2천 톤이다.' }]);
  assert.equal(w.glossary[0].about, '전략 소녀');
  assert.match(c.glossaryBlock(w, '전략 소녀 사토의 체중은 4,200톤'), /5만~5만 2천 톤/);
  assert.match(c.readPrompt(w, K('사토')), /공통 값/);
});
test('문서를 지우거나 다시 쓰면 그 문서가 정한 자기 소속을 걷어 낸다', () => {
  const w = russia(); c.purgeTerms(w, K('체르넨코'));
  assert.equal(w.entities[K('체르넨코')].affil, undefined); assert.ok(w.entities[K('베레진스카야')].affil);
});
let failed = 0;
for (const [n, f] of tests) { try { f(); console.log('통과', n); } catch (e) { failed++; console.log('실패', n, '\n', e.message); } }
if (failed) process.exit(1);
