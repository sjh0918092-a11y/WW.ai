/* 주인 문서 원칙: 항목에 관한 세부는 그 항목의 단독 문서가 기준이다. AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,checkSourceBatches,checkPrompt,parseIssues,pagePrompt,ownerExcerptBlock,routeAutoConflicts,autoFixList});', c);
const K = t => c.keyOf(t);
const page = (title, type, body, createdAt, extra = {}) => ({ key: K(title), title, type, summary: '', categories: [], infobox: [], sections: [{ heading: '개요', level: 1, body }], links: [...body.matchAll(/\[\[([^\]|]+)/g)].map(m => K(m[1])), createdAt, ...extra });
function world(list, extra = {}) {
  const pages = {}, w = { id: 't', kind: 'world', title: '시험 세계', era: '2017년', seed: '가상', rules: [], timeline: [], events: [], entities: {}, ...extra };
  for (const p of list) { pages[p.key] = p; w.entities[p.key] = { ...c.newEntity(p.title, p.type, p.summary), page: true }; }
  w.mainKey = list[0].key; c.S.pages = pages; c.S.world = w; return w;
}
const hub = () => page('러시아', '국가', '[[옥사나 체르넨코]]는 우크라이나 국적 전환을 거부하고 러시아 흑해함대에 남았다.', 1);
const owner = () => page('옥사나 체르넨코', '인물', '1992년 소련 해체 뒤 체르넨코는 우크라이나 해군으로 옮겨 1993년까지 복무했고, 이후 러시아로 돌아왔다.', 2);
const tests = []; const test = (n, f) => tests.push([n, f]);

test('먼저 쓴 허브 문서를 검사할 때 나중에 쓴 주인 문서도 기준 자료가 된다', () => {
  world([hub(), owner()]);
  assert.match(c.checkSourceBatches(c.S.world, K('러시아')).join('\n'), /우크라이나 해군으로 옮겨/);
  assert.match(c.checkPrompt(c.S.world, K('러시아')), /주인 문서 원칙/);
});
test('허브가 이름만 적지 않은 나중 문서는 여전히 기준에서 빠진다', () => {
  const late = page('흑해 함대 기지', '지명', '[[러시아]] 해군의 기지다. 1995년 확장했다.', 3);
  world([hub(), owner(), late]);
  assert.doesNotMatch(c.checkSourceBatches(c.S.world, K('러시아')).join('\n'), /1995년 확장/);
});
test('이야기 모드는 쓴 순서 기준을 유지한다', () => {
  const w = world([hub(), owner()], { mode: 'story', story: { chapter: 9, chapters: [], cast: [] } });
  assert.doesNotMatch(c.checkSourceBatches(w, K('러시아')).join('\n'), /우크라이나 해군으로 옮겨/);
});
test('주인 문서 검사가 허브를 고칠 쪽으로 지목하면 허브에 수정 요청을 단다', () => {
  const w = world([hub(), owner()]);
  const r = { issues: [{ claim: '1992년 소련 해체 뒤 체르넨코는 우크라이나 해군으로 옮겨 1993년까지 복무했고', evidence: '옥사나 체르넨코는 우크라이나 국적 전환을 거부하고 러시아 흑해함대에 남았다.', conflict: '국적 전환 여부가 다르다', severity: 'high', fixDoc: '러시아' }] };
  const is = c.parseIssues(r, w, K('옥사나 체르넨코'));
  assert.equal(is[0].target, K('러시아')); assert.equal(is[0].severity, 'low');
  c.routeAutoConflicts(w, K('옥사나 체르넨코'), is);
  assert.equal(c.S.pages[K('러시아')].autoConflicts.length, 1);
  assert.match(c.S.pages[K('러시아')].autoConflicts[0].claim, /단독 문서/);
});
test('근거 구절이 지목한 문서에 없거나 그 문서를 사용자가 고쳤으면 수정 요청을 만들지 않는다', () => {
  let w = world([hub(), owner()]);
  const r = ev => ({ issues: [{ claim: '우크라이나 해군으로 옮겨', evidence: ev, conflict: '다르다', severity: 'high', fixDoc: '러시아' }] });
  assert.equal(c.parseIssues(r('지어낸 문장'), w, K('옥사나 체르넨코'))[0].target, undefined);
  w = world([hub(), owner()]); c.S.pages[K('러시아')].editedAt = 5;
  assert.equal(c.parseIssues(r('우크라이나 국적 전환을 거부하고'), w, K('옥사나 체르넨코'))[0].target, undefined);
});
test('근거에 「문서 제목」: 접두어와 따옴표가 붙어도 수정 요청을 단다', () => {
  for (const ev of ['「러시아」: “옥사나 체르넨코는 우크라이나 국적 전환을 거부하고 러시아 흑해함대에 남았다.”', '「러시아」 문서: "우크라이나 국적 전환을 거부하고 러시아 흑해함대에 남았다"', '「러시아」의 서술: “체르넨코는 국적 전환을 거부했다” 그리고 “우크라이나 국적 전환을 거부하고 러시아 흑해함대에 남았다.”']) {
    const w = world([hub(), owner()]);
    const is = c.parseIssues({ issues: [{ claim: '우크라이나 해군으로 옮겨', evidence: ev, conflict: '다르다', severity: 'high', fixDoc: '러시아' }] }, w, K('옥사나 체르넨코'));
    assert.equal(is[0].target, K('러시아'), ev);
    assert.ok(c.S.pages[K('러시아')].sections[0].body.replace(/\[\[|\]\]/g, '').includes(is[0].targetOld), is[0].targetOld);
  }
});
test('근거 구절을 못 찾아 수정 요청을 못 보내면 주인 문서를 자동으로 고치지 않고 기록한다', () => {
  const w = world([hub(), owner()]);
  const is = c.parseIssues({ issues: [{ claim: '우크라이나 해군으로 옮겨', evidence: '「러시아」: “지어낸 문장이 여기에 있다”', conflict: '다르다', severity: 'high', fixDoc: '러시아' }] }, w, K('옥사나 체르넨코'));
  assert.equal(is[0].target, undefined); assert.equal(is[0].unrouted, '러시아'); assert.equal(is[0].severity, 'low');
  assert.equal(c.autoFixList(is, K('옥사나 체르넨코')).length, 0);
});
test('허브 작성 입력에 관련 항목 문서의 해당 문단이 들어간다', () => {
  const w = world([page('러시아', '국가', '러시아다.', 1), page('옥사나 체르넨코', '인물', '1992년 체르넨코는 [[우크라이나]] 해군으로 옮겼다.\n\n1994년 [[러시아]]로 귀환해 흑해함대에 복귀했다.', 2)]);
  const block = c.ownerExcerptBlock(w, K('러시아'), [K('옥사나 체르넨코')]);
  assert.match(block, /1994년 러시아로 귀환/); assert.doesNotMatch(block, /1992년 체르넨코는/);
  assert.match(c.pagePrompt(w, K('러시아')), /다른 항목과 얽힌 일:/);
});
let failed = 0;
for (const [n, f] of tests) { try { f(); console.log('통과', n); } catch (e) { failed++; console.log('실패', n, '\n', e.message); } }
if (failed) process.exit(1);
