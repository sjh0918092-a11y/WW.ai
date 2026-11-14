/* v6.85 실세계 오탐 회귀. 제공된 문장을 그대로 최소 세계에 넣는다. AI 호출·외부 데이터 없음. */
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
vm.runInContext(source + '\nObject.assign(globalThis,{S,newEntity,parseAgeRules,ageRuleIssues,numericIssues,autoFixList,mergeIssues,routeAutoConflicts,refreshNumeric,numStamp,sameTimelineOccurrence,dedupeTimeline,acceptTimeline});', c);
const rule = '전략 소녀는 14~19세에 발현하며 만 20세에 쇠퇴해 퇴역한다.';
const page = (title, birth, body = '', extra = {}) => ({ title, type: '인물', summary: '전략 소녀', categories: ['전략 소녀'], infobox: birth ? [{ label: '출생일', value: birth }] : [], sections: [{ heading: '생애', body }], links: [], createdAt: 1, ...extra });
function world(pages, extra = {}) {
  c.S.pages = pages;
  const w = { id: 'regression', title: '시험 세계', era: '2018년', rules: [rule], timeline: [], events: [], entities: {}, ...extra };
  for (const [k, p] of Object.entries(pages)) w.entities[k] = c.newEntity(p.title, p.type, p.summary);
  w.ageRules = { text: rule, rules: c.parseAgeRules({ rules: [{ rule: 'R1', subjects: ['전략 소녀'], startMin: 14, startMax: 19, endAge: 20, spanWords: ['거체화', '발현', '현역', '퇴역', '전역'] }] }, w) };
  c.S.world = w; return w;
}
const checks = (w, k) => [...c.ageRuleIssues(w, k), ...c.numericIssues(w, k)];
const tests = []; function test(name, fn) { tests.push([name, fn]); }
const normal = [
  ['1993년 쇠퇴', '마리야 바실리예바', '1973년 9월 1일', '만 20세가 된 1993년 9월부터 거체화 형질이 쇠퇴하기 시작했다.'],
  ['천샤오란 쇠퇴기', '천샤오란', '1980년 1월 24일', '천샤오란은 만 20세가 된 2000년 1월 24일을 기점으로 거체화 형질의 비가역적 쇠퇴기를 맞았다.'],
  ['1980년 감퇴', '레아 벨', '1960년 5월 1일', '1980년 만 20세에 접어들면서 예정대로 거체화 형질의 자연적 감퇴 단계에 들어섰다.'],
  ['해밀턴 쇠퇴기', '엘리자베스 해밀턴', '1965년 9월 17일', '해밀턴은 만 20세 생일을 맞이하며 거체화 형질의 쇠퇴기에 진입했다.'],
  ['벤에프라임의 서로 다른 두 시점', '미리암 벤에프라임', '1957년 1월 1일', '벤에프라임은 14세에 거체화 징후를 보여 군에 징집되었으며, 1977년 만 20세 도달로 통상 체격으로 축소된 뒤 명예 제대했다.'],
  ['비키니 쇼크의 연도', '예카테리나 바실리에바', '1946년 3월 13일', '바실리에바는 1954년 미국의 비키니 쇼크 이후 소련이 단행한 대규모 선별 검사망을 통해 발굴된 자산으로, …'],
  ['앞 관형절의 연도와 도달 후', '류드밀라 파블리첸코', '1973년 9월 21일', '1991년 키이우 기지를 장악했던 우크라이나의 류드밀라 파블리첸코는 20세 도달 후 축소되어 전역했으나, …'],
];
for (const [name, title, birth, body] of normal) test(name + '는 지적하지 않는다', () => {
  const w = world({ p: page(title, birth, body) }); assert.equal(checks(w, 'p').length, 0, body);
});
for (const [label, value, birth] of [['퇴역일', '2003년 1월 10일', '1983년 1월 10일'], ['퇴역 일자', '2011년 5월 27일 (만 20세 도달 영구 퇴역)', '1991년 5월 2일']]) test(label + ': ' + value + '는 발현 범위에 넣지 않는다', () => {
  const p = page('퇴역한 전략 소녀', birth); p.infobox.push({ label, value });
  assert.equal(checks(world({ p }), 'p').length, 0);
});
test('시작 동사가 없는 거체화 형질과 그 명사를 쓰는 인포박스는 발현이 아니다', () => {
  const p = page('천샤오란', '1980년 1월 24일', '천샤오란은 2000년 1월 24일 거체화 형질을 연구했다.');
  p.infobox.push({ label: '거체화 형질', value: '2000년 1월 24일' });
  assert.equal(checks(world({ p }), 'p').length, 0);
  for (const body of ['천샤오란은 2000년 1월 24일 거체화하는 동료를 관찰했다.', '천샤오란은 2000년 1월 24일 각성하기 위한 훈련을 연구했다.', '천샤오란은 2000년 1월 24일 골격 팽창을 연구했다.']) assert.equal(checks(world({ p: page('천샤오란', '1980년 1월 24일', body) }), 'p').length, 0, body);
});
test('본문의 반올림된 신장 60미터는 인포박스 60.2m와 대조하지 않는다', () => {
  const p = page('엘리너 레이놀즈', '', '', { infobox: [{ label: '전성기 전고', value: '60.2m' }] });
  const q = page('비키니 쇼크', '', '엘리너 레이놀즈가 신장 60미터로 거체화하자', { type: '사건' });
  assert.equal(c.numericIssues(world({ p, q }), 'q').length, 0);
  for (const body of ['신장 60미터의 레이놀즈는 출격했다.', '엘리너 레이놀즈는 신장 60미터였다.']) assert.equal(c.numericIssues(world({ p, q: page('기록', '', body, { type: '사건' }) }), 'q').length, 0);
});
test('같은 문단의 유일한 앞 문장 연도를 당시의 기준으로 쓰고 수식받은 인물에 귀속한다', () => {
  const body = '영국 전략 소녀 운용사에서 가장 결정적인 분수령은 1982년 발발한 포클랜드 전쟁이었다. 아르헨티나 군사정권이 포클랜드 제도를 기습 점거하자, 마거릿 대처 총리는 정규 항공모함 전단과 함께 당시 15세이던 제2세대 전략 소녀 엘리자베스 해밀턴(호출부호 브리타니아)의 남대서양 파병을 명령했다.';
  const w = world({ p: page('엘리자베스 해밀턴', '1965년 9월 17일'), q: page('영국 전략 소녀 운용사', '', body, { type: '사건' }) });
  assert(c.ageRuleIssues(w, 'q').some(i => /16~17세/.test(i.conflict) && i.severity === 'low'));
  c.S.pages.q.sections[0].body = body.replace('. 아르헨티나', '.\n\n아르헨티나');
  assert.equal(c.ageRuleIssues(w, 'q').length, 0, '다른 문단이면 당시의 기준으로 가져오지 않는다');
});
test('같은 인물·날짜·결론의 본문·연표·장부 근거는 한 건으로 합치고 low로 유지한다', () => {
  const body = '엘리너 레이놀즈는 1954년 3월 1일 거체화했다.';
  const w = world({ p: page('엘리너 레이놀즈', '1940년 5월 27일', body + '\n\n' + body) }, { timeline: [{ year: '1954', month: 3, day: 1, event: body, src: 'p' }], events: [{ name: '비키니 쇼크', date: '1954년 3월 1일', src: 'p', beats: [{ actor: '엘리너 레이놀즈', action: '거체화했다.' }] }] });
  const issues = c.ageRuleIssues(w, 'p'); assert.equal(issues.length, 1); assert.equal(issues[0].severity, 'low');
  assert.equal(c.autoFixList(issues, 'p').length, 0);
  assert.equal(c.autoFixList(issues.map(i => ({ ...i, severity: 'high' })), 'p').length, 0, '참고 지적은 자동 수정에서 명시적으로 제외한다');
  const merged = c.mergeIssues([...issues, { ...issues[0], claim: '다른 표현의 같은 결론', severity: 'high' }]); assert.equal(merged.length, 1); assert.equal(merged[0].severity, 'low');
});
test('새 퇴역 연도·신장 지적은 모두 low이며 다른 문서의 자동 교정 표시로 보내지 않는다', () => {
  const p = page('엘리자베스 해밀턴', '', '해밀턴은 1985년 명예 전역했다.', { infobox: [{ label: '전성기 전고', value: '61.8m' }] });
  const q = page('전역 기록', '', '해밀턴은 1987년 명예 전역했다. 신장 60.4미터의 해밀턴은 출격했다.', { type: '사건', createdAt: 2 });
  const w = world({ p, q });
  for (const k of ['p', 'q']) { const issues = c.numericIssues(w, k); assert(issues.length > 0); assert(issues.every(i => i.severity === 'low')); assert.equal(c.autoFixList(issues, k).length, 0); c.routeAutoConflicts(w, k, issues); }
  assert.equal(q.autoConflicts?.length || 0, 0); assert.equal(p.autoConflicts?.length || 0, 0);
  const issue = c.numericIssues(w, 'q')[0]; const merged = c.mergeIssues([issue, { claim: issue.claim, conflict: '별도의 AI 판단', severity: 'high' }]);
  assert(merged.find(i => i.advisory)?.severity === 'low');
});
test('버전 갱신으로 옛 high와 다른 문서의 자동 교정 표시를 걷어 내고 low로 다시 계산한다', () => {
  const p = page('엘리자베스 해밀턴', '', '해밀턴은 1985년 명예 전역했다.', { infobox: [{ label: '성별', value: '여성' }] });
  const q = page('전역 기록', '', '해밀턴은 1987년 명예 전역했다.', { type: '사건', createdAt: 2, autoConflicts: [{ by: 'p', old: '해밀턴은 1987년 명예 전역했다.' }] });
  const w = world({ p, q }); p.check = { at: 1, numV: '8:-', issues: [{ claim: '옛 지적', conflict: '옛 지적', by: 'num', severity: 'high' }] };
  c.refreshNumeric(w, 'p'); assert.equal(p.check.numV, c.numStamp(w)); assert(p.check.issues.length > 0); assert(p.check.issues.every(i => i.severity === 'low')); assert.equal(q.autoConflicts.length, 0);
});
const treaty = '제1차 제네바 전략소녀보유제한조약';
const geneva = [
  "스위스 제네바에서 5개 상임이사국이 참가한 가운데 … '제1차 제네바 전략소녀보유제한조약'이 체결되다",
  '제1차 제네바 전략소녀보유제한조약에 서명하며 전략 소녀 가동 자산 상한을 2기로 확정하다.',
  '스위스 제네바에서 미국의 수석대표로서 제1차 제네바 전략소녀보유제한조약에 서명하다.',
  '영국이 제1차 제네바 전략소녀보유제한조약에 서명하여 상시 가동 전력을 2기로 확정하다.',
];
const tl = (event, extra = {}) => ({ year: '1985', month: 7, day: 12, event, ...extra });
test('장부에 없는 같은 날짜의 같은 조약 체결·서명 연표 네 건을 한 건으로 정리한다', () => {
  const w = world({}); w.timelineDedupeV = 1;
  w.timeline = geneva.map((s, i) => tl(s, { src: i === 0 ? 'seed' : 'doc' + i }));
  assert(c.dedupeTimeline(w)); assert.equal(w.timeline.length, 1); assert.equal(w.timeline[0].event, geneva[0]);
  assert.equal(c.dedupeTimeline(w), false);
});
const qingdao = [
  '중국 칭다오 해군기지 소속 전략 소녀 동해가 … 영양액 파이프라인을 파괴해 산둥성 연안에 4,000톤의 칼슘 …',
  '칭다오 해군기지에서 장샤오칭이 영양액 주입 배관을 파괴하여 4,000톤의 농축유가 해양으로 유출되다.',
];
test('장부 없이도 확정된 본명·별칭, 장소, 파괴 대상과 수치가 일치하는 칭다오 기록을 정리한다', () => {
  const p = page('장샤오칭', '', '', { infobox: [{ label: '코드명', value: '동해' }] });
  const w = world({ p }); w.timelineDedupeV = 1; w.timeline = qingdao.map(event => ({ year: '2016', month: 8, day: 22, event, src: 'p' }));
  c.dedupeTimeline(w); assert.equal(w.timeline.length, 1);
  for (const other of [qingdao[1].replace('4,000톤', '5,000톤'), qingdao[1].replace('칭다오 해군기지', '뤼순 해군기지')]) assert.equal(c.sameTimelineOccurrence(w, { year: '2016', month: 8, day: 22, event: qingdao[0] }, { year: '2016', month: 8, day: 22, event: other }), false);
});
test('이름만 같은 후속 행위·다른 날짜·다른 조약과 인물 정체가 불명확한 사고는 남긴다', () => {
  const w = world({});
  for (const other of [tl(treaty + '의 여파로 영국이 조직을 개편하다.'), tl(treaty + '의 체결을 기념하다.'), tl(treaty + '에 서명하다.', { day: 13 }), tl('제2차 제네바 전략소녀보유제한조약에 서명하다.'), tl(treaty + '의 서명을 거부하다.')]) assert.equal(c.sameTimelineOccurrence(w, tl(geneva[0]), other), false);
  assert.equal(c.sameTimelineOccurrence(w, { year: '2016', month: 8, day: 22, event: qingdao[0] }, { year: '2016', month: 8, day: 22, event: qingdao[1] }), false, '본명과 별칭의 근거가 없으면 합치지 않는다');
});
(async () => {
  let passed = 0;
  for (const [name, fn] of tests) try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n' + e.stack); }
  console.log(`\n${passed}/${tests.length} 통과 · AI 호출 0회`); process.exitCode = passed === tests.length ? 0 : 1;
})();
