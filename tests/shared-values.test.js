/* 주인 없는 값: 공통 값 장부, 소속 구성원 현황, 기간표. AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,ingestAffil,ingestSpan,ingestEvents,eventDetailIn,ingestTerms,rosterBlock,periodBlock,glossaryBlock,pagePrompt,checkPrompt,readPrompt,integrate,purgeTerms});', c);
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
  c.ingestSpan(w, K('체르넨코'), { what: '발현', start: '1987년', end: '', endWhat: '' });
  c.S.pages[K('슬라바')] = page('슬라바', '인물', '[[러시아]]의 전략 소녀였다.', 4, { infobox: [{ label: '아무 이름', value: '1986년 7월' }] });
  w.entities[K('슬라바')] = { ...c.newEntity('슬라바', '인물', ''), page: true };
  c.ingestSpan(w, K('슬라바'), { what: '발현', start: '1970', end: '1986년', endWhat: '퇴역' });
  c.S.pages[K('베레진스카야')].sections[0].body = '[[러시아]]의 전략 소녀로 [[체르넨코]]와 [[슬라바]]가 같은 도크를 썼다.';
  c.S.pages[K('베레진스카야')].links = [K('러시아'), K('체르넨코'), K('슬라바')];
  const ck = c.checkPrompt(w, K('베레진스카야'));
  assert.match(ck, /소속 구성원 현황/); assert.match(ck, /등장 대상의 존속·소속 기간/); assert.match(ck, /슬라바: 발현 1970 ~ 퇴역 1986/); assert.match(ck, /체르넨코: 발현 1987/); assert.doesNotMatch(ck.slice(ck.indexOf('## 등장 대상의 존속')), /아무 이름/);
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
test('존속 기간은 문서가 낸 필드로만 받고 작성 입력에도 들어간다', () => {
  const w = world([page('기동 질량 등급', '개념', '1968년 도입된 체계다.', 1), page('쿠바 위기', '사건', '[[기동 질량 등급]] 시험이 있었다.', 2)]);
  c.ingestSpan(w, K('기동 질량 등급'), { what: '도입', start: '1968', end: '' });
  assert.equal(w.entities[K('기동 질량 등급')].span.start, '1968');
  c.ingestSpan(w, K('쿠바 위기'), { what: '', start: '', end: '' });
  assert.equal(w.entities[K('쿠바 위기')].span, undefined);
  assert.match(c.checkPrompt(w, K('쿠바 위기')), /기동 질량 등급: 도입 1968/);
  assert.match(c.pagePrompt(w, K('쿠바 위기')), /관련 항목의 존속·소속 기간[\s\S]*기동 질량 등급: 도입 1968/);
  assert.match(c.pagePrompt(w, K('쿠바 위기')), /"existence":\{/);
});
test('구성원 현황이 기준 시점 현역과 구성원이 없던 기간을 계산한다', () => {
  const w = russia();
  c.ingestAffil(w, K('체르넨코'), [{ org: '러시아', role: '전략 소녀', state: '퇴역', from: '1970', to: '1986' }]);
  const b = c.rosterBlock(w, [K('러시아')], 30, true);
  assert.match(b, /기준 시점 현역 1\(베레진스카야\)/); assert.match(b, /구성원이 없던 기간: 1987~2008/); assert.match(b, /최초/);
});
test('구성원 현황: 상태를 정한 문서가 없으면 현역 0으로 적지 않는다', () => {
  const w = world([page('전력기동처', '조직', '[[홍련]]을 앞세웠다.', 1)]);
  w.entities[K('홍련')] = { ...c.newEntity('홍련', '인물', ''), page: false, facts: [], mentions: [], cats: [{ axis: '소속', name: '전력기동처' }] };
  const b = c.rosterBlock(w, [K('전력기동처')], 30, true);
  assert.doesNotMatch(b, /기준 시점 현역 0/); assert.match(b, /현역 수를 알 수 없음\(상태 미정 \d+명\)/);
});
test('상세 서술은 사건 문서, 그다음 참가자 문서가 맡고 참가하지 않은 개념 문서는 맡지 않는다', () => {
  const w = world([page('전략 소녀', '개념', '개념.', 1), page('세라 바커', '인물', '바커.', 2), page('걸프 전쟁', '사건', '전쟁.', 3)]);
  const ev = (detail, parts) => ({ name: '걸프전', date: '1991년 1월 17일', place: '쿠웨이트', detail, participants: parts, beats: [] });
  c.ingestEvents(w, K('전략 소녀'), [ev(true, ['세라 바커'])]);
  assert.equal(c.eventDetailIn(w, K('걸프전')), null, '참가자도 사건 문서도 아니면 맡지 않는다');
  c.ingestEvents(w, K('세라 바커'), [ev(true, ['세라 바커'])]);
  assert.equal(c.eventDetailIn(w, K('걸프전')), K('세라 바커'));
  c.ingestEvents(w, K('걸프 전쟁'), [ev(true, ['세라 바커'])]);
  assert.equal(c.eventDetailIn(w, K('걸프전')), K('걸프 전쟁'), '이름이 달라도 사건 문서가 먼저 맡는다');
});
test('핵심 경과는 7줄까지 받는다', () => {
  const w = world([page('걸프 전쟁', '사건', '전쟁.', 1)]);
  c.ingestEvents(w, K('걸프 전쟁'), [{ name: '걸프전', date: '1991년 1월 17일', place: '쿠웨이트', detail: true, participants: [], beats: Array.from({ length: 9 }, (_, i) => ({ actor: '바커', action: `${i + 1}단계` })) }]);
  assert.equal(w.events[0].beats.length, 7);
});
let failed = 0;
for (const [n, f] of tests) { try { f(); console.log('통과', n); } catch (e) { failed++; console.log('실패', n, '\n', e.message); } }
if (failed) process.exit(1);
