/* 호출 범위 이름 캐시·3000자×50문서 성능과 실제 문단의 시점 귀속 회귀. AI 호출 없음. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + `
Object.assign(globalThis,{S,newEntity,parseAgeRules,ageRuleIssues,detIssues});
const originalOwner = nameOwner; let ownerCalls = 0;
nameOwner = (...args) => { ownerCalls++; return originalOwner(...args); };
`, c);
const page = (title, birth, body, type = '인물') => ({ title, type, summary: type === '인물' ? '전략 소녀' : '', categories: type === '인물' ? ['전략 소녀'] : [], infobox: [...(birth ? [{ label: '출생', value: birth }] : []), { label: '성별', value: '여성' }], sections: [{ heading: '생애', body }], links: [], createdAt: 1 });
const rule = '전략 소녀는 14~19세에 발현하며 만 20세에 쇠퇴해 퇴역한다.';
function world(pages) {
  c.S.pages = pages;
  const w = { id: 'performance', era: '2018년', entities: {}, rules: [rule], timeline: [], events: [] };
  for (const [k, p] of Object.entries(pages)) w.entities[k] = c.newEntity(p.title, p.type, p.summary);
  w.ageRules = { text: rule, rules: c.parseAgeRules({ rules: [{ rule: 'R1', subjects: ['전략 소녀'], startMin: 14, startMax: 19, endAge: 20, spanWords: ['발현', '거체화', '현역'] }] }, w) };
  c.S.world = w; return w;
}
const tests = []; const test = (name, fn) => tests.push([name, fn]);
const birthParagraph = '1957년 텔아비브 외곽 키부츠에서 태어난 벤에프라임은 14세에 거체화 징후를 보여 군에 징집되었으며, 1977년 만 20세 도달로 통상 체격으로 축소된 뒤 명예 제대했다.';
const kyivParagraph = '1991년 연방 붕괴가 가시화되자 모스크바 중앙정부는 우크라이나 키이우 기지에 주둔 중이던 전략 소녀 체르노젬과 저장 영양액 2만 톤을 러시아 소비에트 연방 사회주의 공화국 내부로 회수하려 시도했다. 12월 26일, 소련군 소장 발레리 소콜로프가 수송 열차를 동원해 기지 봉쇄를 명령했으나, 17세였던 파블리첸코는 중력 간섭장으로 주 보급 격납고를 장악하고 명령을 거부했다.';
test('출생 관형절의 1957년을 발현과 나이 시점으로 쓰지 않는다', () => {
  const w = world({ p: page('미리암 벤에프라임', '1957년 8월 23일', birthParagraph) });
  assert.equal(c.ageRuleIssues(w, 'p').length, 0);
  for (const text of ['1957년생인 벤에프라임은 14세에 거체화 징후를 보였다.', '1957년 출생의 벤에프라임은 14세에 거체화 징후를 보였다.']) {
    c.S.pages.p.sections[0].body = text; assert.equal(c.ageRuleIssues(w, 'p').length, 0);
  }
});
test('같은 문단의 유일한 연도와 나이가 붙은 문장의 월·일을 합쳐 만 18세를 지적한다', () => {
  const w = world({ p: page('류드밀라 파블리첸코', '1973년 9월 21일', ''), q: page('연방 붕괴', '', kyivParagraph, '사건') });
  const issues = c.ageRuleIssues(w, 'q'); assert.equal(issues.length, 1); assert(issues[0].conflict.includes('만 18세')); assert.equal(issues[0].severity, 'low');
  c.S.pages.q.sections[0].body = kyivParagraph.replace('. 12월', '.\n\n12월');
  assert.equal(c.ageRuleIssues(w, 'q').length, 0, '다른 문단의 연도는 가져오지 않는다');
});
test('캐시 최적화로 출생·시점 판정을 바꾸지 않으며 호출이 끝나면 이름 변경도 반영한다', () => {
  const w = world({ p: page('류드밀라 파블리첸코', '1973년 9월 21일', ''), q: page('연방 붕괴', '', kyivParagraph, '사건'), other: page('안나 이바노바', '', '') });
  assert.equal(c.ageRuleIssues(w, 'q').length, 1);
  w.entities.other.title = c.S.pages.other.title = '안나 파블리첸코';
  assert.equal(c.ageRuleIssues(w, 'q').length, 0, '같은 세계 객체라도 성이 겹치게 바뀌면 약칭의 유일성을 다시 판단한다');
  w.entities.other.title = c.S.pages.other.title = '안나 이바노바';
  c.S.pages.q = page('출생 기록', '', birthParagraph, '사건');
  assert.equal(c.ageRuleIssues(w, 'q').length, 0, '같은 키의 문서 교체 뒤 이전 문장 판정을 재사용하지 않는다');
  c.S.pages.q = page('연방 붕괴', '', kyivParagraph, '사건');
  assert.equal(c.ageRuleIssues(w, 'q').length, 1);
});
function largeWorld() {
  const titles = Array.from({ length: 30 }, (_, i) => `시험인물${String(i).padStart(2, '0')} 하린${String(i).padStart(2, '0')}`), pages = {};
  for (let i = 0; i < 50; i++) {
    let body = i === 30 ? `${titles[0]}은 만 18세이던 1960년 6월 1일 출격했다.\n\n` : '';
    for (let j = 0; body.length < 3000; j++) body += `${titles[(i + j) % 30]}은 1960년 6월 1일 만 20세였다. 그날의 기록에는 대피소와 보급로를 살피고 동료들과 귀환한 과정이 담겼다. 기록관은 보고서를 정리하고 다음 교대조에게 남은 물자를 인계했다.\n\n`;
    pages['p' + i] = page(i < 30 ? titles[i] : '기록 문서 ' + i, i < 30 ? '1940년 1월 1일' : '', body.slice(0, 3000), i < 30 ? '인물' : '사건');
  }
  return world(pages);
}
test('인물 30명·3000자 문서 50개의 ageRuleIssues 한 번이 200ms 미만이고 판정은 유지한다', () => {
  const w = largeWorld();
  assert.equal(Object.values(c.S.pages).filter(p => p.type === '인물').length, 30); assert.equal(Object.keys(c.S.pages).length, 50); assert(Object.values(c.S.pages).every(p => p.sections[0].body.length === 3000));
  vm.runInContext('ownerCalls = 0', c); const t = performance.now(), issues = c.ageRuleIssues(w, 'p0'), elapsed = performance.now() - t;
  console.log(`    ageRuleIssues: ${elapsed.toFixed(1)}ms · nameOwner ${vm.runInContext('ownerCalls', c)}회`);
  assert(elapsed < 200, `200ms 한도 초과: ${elapsed.toFixed(1)}ms`);
  assert.equal(issues.length, 1); assert.equal(issues[0].target, 'p30'); assert.equal(issues[0].severity, 'low'); assert(issues[0].conflict.includes('만 20세'));
  assert(vm.runInContext('ownerCalls', c) <= 60, '인물별 두 이름 조각은 한 번씩만 계산한다');
});
test('detIssues 한 번에서도 인물별 이름을 한 번만 계산하고 검사 호출 사이에는 버린다', () => {
  const w = largeWorld();
  for (let i = 0; i < 2; i++) {
    vm.runInContext('ownerCalls = 0', c); const issues = c.detIssues(w, 'p0');
    const calls = vm.runInContext('ownerCalls', c); assert(calls > 0 && calls <= 60, `호출 단위 조회 수: ${calls}`);
    assert(issues.some(x => x.target === 'p30' && /만 20세/.test(x.conflict)));
  }
});
(async () => {
  let passed = 0;
  for (const [name, fn] of tests) try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n' + e.stack); }
  console.log(`\n${passed}/${tests.length} 통과 · AI 호출 0회`); process.exitCode = passed === tests.length ? 0 : 1;
})();
