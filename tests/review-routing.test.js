/* 리뷰 경로: 등급 규칙(결정론), 빨간 링크 항목 우선 전달, 진단 기록, 백업 진단 도구. AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,gradeIssues,detIssues,checkKeys,checkPrompt,noteCheck,commitFix,pagePrompt,ownerExcerptBlock,eventIssues,eventBlock});', c);
const K = t => c.keyOf(t);
const page = (title, type, body, createdAt, extra = {}) => ({ key: K(title), title, type, summary: '', categories: [], infobox: [], sections: [{ heading: '개요', level: 1, body }], links: [...body.matchAll(/\[\[([^\]|]+)/g)].map(m => K(m[1])), createdAt, ...extra });
function world(list, extra = {}) {
  const pages = {}, w = { id: 't', kind: 'world', title: '시험 세계', era: '2020년', seed: '가상', rules: [], timeline: [], events: [], glossary: [], entities: {}, ...extra };
  for (const p of list) { pages[p.key] = p; w.entities[p.key] = { ...c.newEntity(p.title, p.type, p.summary), page: true }; }
  w.mainKey = list[0].key; c.S.pages = pages; c.S.world = w; return w;
}
const table = () => page('마법소녀', '개념', '출력은 킬로타우로 잰다. 1등급(1~5kτ)은 국소 방호, 3등급(10~25kτ)은 항공기 요격, 5등급(50kτ 초과)은 전략 타격을 뜻한다. 단 한 명의 5등급 개체가 50킬로타우(kτ)를 초과하는 화력을 낸다.', 1);
const person = (title, grade, kt, at, more = '') => ({ ...page(title, '인물', `${title}는 ${grade}등급 개체로 최대 출력은 ${kt}kτ였다.${more}`, at), infobox: [{ label: '마력 등급', value: `${grade}등급 (최대 출력 ${kt}kτ)` }] });
const tests = []; const test = (n, f) => tests.push([n, f]);

test('다른 등급의 닫힌 구간에 드는 출력을 다른 등급으로 적으면 다듬을 곳으로 짚는다', () => {
  const w = world([table(), person('레베카 던', 4, 18, 2)]);
  const is = c.gradeIssues(w, K('레베카 던'));
  assert.ok(is.length >= 1); assert.equal(is[0].severity, 'high');
  assert.match(is[0].conflict, /3등급 구간\(10~25kτ\)/); assert.match(is[0].conflict, /「마법소녀」/);
});
test('등급과 출력이 등급표에 맞으면 짚지 않는다', () => {
  const w = world([table(), person('올가 이바노바', 3, 18, 2), person('번스', 5, 52, 3)]);
  assert.equal(c.gradeIssues(w, K('올가 이바노바')).length, 0);
  assert.equal(c.gradeIssues(w, K('번스')).length, 0);
});
test('같은 등급의 구간을 벗어나면 짚는다', () => {
  const w = world([table(), person('A', 3, 30, 2)]);
  assert.match(c.gradeIssues(w, K('A'))[0].conflict, /3등급의 구간은 10~25kτ/);
});
test('경계 표현(아래·초과·수준)과 구간 정의 자체는 출력 주장으로 읽지 않는다', () => {
  const w = world([table(), page('번스2', '인물', '부상 뒤 출력은 2등급 수준인 15kτ 아래로 떨어졌다. 4등급 이상 개체는 미사일 파편을 견딘다.', 2)]);
  assert.equal(c.gradeIssues(w, K('번스2')).length, 0);
  assert.equal(c.gradeIssues(w, K('마법소녀')).length, 0);
});
test('기준선 표현도 등급 구간으로 읽고, 결정론 지적 목록에 들어간다', () => {
  const w = world([page('밴스', '인물', '마력 검사에서 4등급 기준선인 35킬로타우(kτ)를 기록했다.', 1), person('C', 4, 20, 2)]);
  const is = c.detIssues(w, K('C')).filter(i => /등급 규칙/.test(i.conflict));
  assert.ok(is.length >= 1); assert.equal(is[0].by, 'num'); assert.match(is[0].conflict, /35kτ 이상/);
});
test('사용자가 고친 문서는 등급 규칙으로 짚지 않는다', () => {
  const w = world([table(), { ...person('D', 4, 18, 2), editedAt: 5 }]);
  assert.equal(c.gradeIssues(w, K('D')).length, 0);
});

test('링크가 많아도 단독 문서가 없는 항목(빨간 링크)은 설정 대조의 관련 항목에 먼저 들어간다', () => {
  const names = Array.from({ length: 12 }, (_, i) => `문서${i + 1}`);
  const others = names.map((n, i) => page(n, '조직', `${n}이다.`, i + 1));
  const body = names.map(n => `[[${n}]]`).join(', ') + '가 관여했다. 현장 지휘는 [[로버트 W. 매키넌]] 중령이 맡았다.';
  const mk = page('MK-4', '물건', body, 50);
  const w = world([...others, page('미국', '국가', '1968년 [[로버트 W. 매키넌]] 대위가 현장을 통제했다.', 20), mk]);
  w.entities[K('로버트 W. 매키넌')] = { ...c.newEntity('로버트 W. 매키넌', '인물', '미군 장교'), page: false,
    mentions: [{ from: K('미국'), text: '1968년 로버트 W. 매키넌 대위가 현장을 통제했다.' }, { from: K('문서1'), text: '1980년대 초 로버트 W. 매키넌 중령이 통합 지휘 체계를 건의했다.' }, { from: K('문서2'), text: '로버트 W. 매키넌은 준장으로 진급한 뒤 사령부를 설계했다.' }] };
  const keys = c.checkKeys(w, K('MK-4'));
  assert.ok(keys.includes(K('로버트 W. 매키넌')));
  const pr = c.checkPrompt(w, K('MK-4'), []);
  assert.match(pr, /단독 문서가 없는 항목: 아래 다른 문서들의 서술이 기준이다/);
  assert.match(pr, /준장으로 진급한 뒤/); assert.match(pr, /1980년대 초 로버트 W. 매키넌 중령/);
});

test('검사 요약이 진단 기록(checkLog)에 쌓이고 수정 요청·못 보낸 요청을 구분한다', () => {
  const w = world([table(), person('E', 3, 18, 2)]);
  const p = c.S.pages[K('E')];
  p.check = { at: 1, auto: true, sources: ['마법소녀'], batches: 1, issues: [{ claim: 'a', conflict: 'x', severity: 'low', target: K('마법소녀') }, { claim: 'b', conflict: 'y', severity: 'low', unrouted: '마법소녀' }], fixed: [{ claim: 'c', conflict: 'z' }] };
  c.noteCheck(p);
  assert.equal(p.checkLog.length, 1);
  assert.deepEqual([...p.checkLog[0].routed], ['마법소녀']); assert.deepEqual([...p.checkLog[0].unrouted], ['마법소녀']);
  assert.equal(p.checkLog[0].fixed, 1); assert.equal(p.checkLog[0].sources, 1);
  for (let i = 0; i < 10; i++) c.noteCheck(p);
  assert.equal(p.checkLog.length, 8);
});

test('백업 진단 도구가 앱 함수로 보고서를 만든다 (읽기 전용 내보내기는 거절)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-'));
  const pages = [table(), person('레베카 던', 4, 18, 2), page('사령부', '조직', '[[레베카 던]]의 편대가 침투했다.', 3), { ...page('사령부2', '조직', '1991년 1월 17일 새벽 편대 4명이 침투했다.', 4), sections: [{ heading: '1991년 걸프전', level: 1, body: '1991년 1월 17일 새벽 편대 4명이 침투했다.' }] }, page('걸프전', '사건', '걸프전이다.', 5)];
  const w = { id: 'w1', kind: 'world', title: '시험 세계', era: '2020년', seed: '가상', rules: [], timeline: [], events: [], glossary: [], entities: {} };
  for (const p of pages) w.entities[p.key] = { ...c.newEntity(p.title, p.type, ''), page: true, facts: [], mentions: [] };
  pages[1].check = { at: 2, issues: [{ claim: 'x', conflict: '근거: 「마법소녀」: “3등급(10~25kτ)은 항공기 요격” · 다르다', severity: 'low' }], auto: true };
  const f = path.join(dir, 'b.json');
  fs.writeFileSync(f, JSON.stringify({ app: 'worldwiki', version: 1, worlds: [w], pages: { w1: Object.fromEntries(pages.map(p => [p.key, p])) } }));
  const tool = path.join(__dirname, '..', 'tools', 'diagnose-backup.cjs');
  const rep = execFileSync(process.execPath, [tool, f], { encoding: 'utf8' });
  assert.match(rep, /# 백업 진단: 「시험 세계」/);
  assert.match(rep, /등급 규칙: 18kτ는 3등급 구간/);
  assert.match(rep, /「레베카 던」 → 근거 「마법소녀」: 찾음/);
  assert.match(rep, /\| 레베카 던 \| 사령부 \| 0 \|/);
  assert.match(rep, /## 재서술 지표/); assert.match(rep, /\| 사령부2 \| 1 \| 걸프전 \|/);
  const pr = execFileSync(process.execPath, [tool, f, '--pair', '레베카 던', '사령부'], { encoding: 'utf8' });
  assert.match(pr, /「사령부」 리뷰에 「레베카 던」 원문이 들어감/);
  const ro = path.join(dir, 'r.json'); fs.writeFileSync(ro, JSON.stringify({ app: 'worldwiki-readonly', documents: [] }));
  assert.throws(() => execFileSync(process.execPath, [tool, ro], { encoding: 'utf8', stdio: 'pipe' }), /백업 내보내기/);
});

test('작성 지침은 다른 항목의 일을 역할 한두 문장과 연도까지만 쓰게 하고, 빨간 링크에도 같은 규칙을 둔다', () => {
  const w = world([page('러시아', '국가', '러시아다.', 1), page('옥사나', '인물', '1992년 옥사나는 [[러시아]] 해군으로 옮겼다.', 2)]);
  const pr = c.pagePrompt(w, K('러시아'));
  assert.match(pr, /다른 항목은 짧고 간단하게:/); assert.match(pr, /빨간 링크든/); assert.match(pr, /자세한 내용은 \[\[항목\]\] 참고/);
  const ex = c.ownerExcerptBlock(w, K('러시아'), [K('옥사나')]);
  assert.match(ex, /옮겨 쓸 자료가 아니다/); assert.doesNotMatch(ex, /다시 말할 때는 이 대목을 따르고/);
  assert.match(pr, /절정은 이 문서만의 장면이어야 한다/);
  assert.match(pr, /'이 항목 자신이 한 일'은 좁게 읽는다/); assert.match(pr, /다른 인물이 내린 결정과 그 인물의 계급·직위는/); assert.match(pr, /나쁜 예: '2003년 3월 20일/);
});

test('주인 문서를 쓸 때는 다른 문서의 재서술을 연도와 결과만 지키게 하고, 사용자 확정 사실과 이야기 모드는 그대로 지키게 한다', () => {
  const mk = () => { const w = world([page('전략 소녀', '개념', '[[레베카]]는 2003년 방어선 14km를 4시간 만에 평탄화했다.', 1)]);
    w.entities[K('레베카')] = { ...c.newEntity('레베카', '인물', '전략 소녀'), page: false, facts: [{ t: '레베카는 2003년 방어선 14km를 4시간 만에 평탄화했다.', src: K('전략 소녀') }], mentions: [{ from: K('전략 소녀'), text: '레베카는 2003년 방어선 14km를 4시간 만에 평탄화했다.' }] };
    return w; };
  let pr = c.pagePrompt(mk(), K('레베카'));
  assert.match(pr, /이 문서가 이 항목의 단독 문서다/); assert.match(pr, /\[사용자 확정\]이 붙은 것은 반드시 지킨다/); assert.match(pr, /연도와 결과\(생사, 소속, 승패, 무엇을 해냈는지\)는 지키되/);
  assert.doesNotMatch(pr, /아래 확정 사실과 언급의 내용은 반드시 지킨다/);
  const sw = mk(); sw.mode = 'story'; sw.story = { chapter: 1, chapters: [], cast: [] };
  pr = c.pagePrompt(sw, K('레베카'));
  assert.match(pr, /아래 확정 사실과 언급의 내용은 반드시 지킨다/);
});
test('다른 항목을 요약한 자리에는 참고 문구를 반드시 붙이고, 장면의 주체는 이 항목 자신으로 한정한다', () => {
  const w = world([page('러시아', '국가', '러시아다.', 1)]);
  const pr = c.pagePrompt(w, K('러시아'));
  assert.match(pr, /바로 뒤에는 반드시 '자세한 내용은 \[\[항목\]\] 참고\.'를/);
  assert.match(pr, /장면의 주체는 이 항목 자신이다/); assert.match(pr, /다른 인물이 주인공인 장면/);
  assert.match(pr, /사례는 '\[\[인물\]\]이 몇 년 \[\[사건\]\]에서/);
});
test('사건 장부: 상세 서술을 맡은 참가자 문서는 먼저 쓴 개념 문서의 재서술 값에 맞추라고 짚지 않는다', () => {
  const concept = page('전략 소녀', '개념', '개념이다.', 1), person = page('레베카', '인물', '레베카다.', 2);
  const w = world([concept, person]);
  const ek = K('이라크 침공');
  w.entities[ek] = { ...c.newEntity('이라크 침공', '사건', ''), page: false, facts: [], mentions: [] };
  const rec = (src, v, extra = {}) => ({ k: ek, name: '이라크 침공', date: '2003년', place: '', nums: [{ name: '돌파 구간', value: v, unit: 'km' }], parts: [K('레베카')], result: '', src, createdAt: c.S.pages[src].createdAt, ...extra });
  w.events = [rec(K('전략 소녀'), '14'), rec(K('레베카'), '9', { detail: true })];
  assert.equal(c.eventIssues(w, K('레베카')).length, 0);
  c.S.pages[K('전략 소녀')].editedAt = 9;   // 사용자가 직접 고친 기록은 따른다
  assert.equal(c.eventIssues(w, K('레베카')).length, 1);
  assert.match(c.eventBlock(w, K('레베카'), []), /장부는 어긋남을 막는 기준이지 채워 넣을 재료가 아니다/);
});

let failed = 0;
for (const [n, f] of tests) { try { f(); console.log('통과', n); } catch (e) { failed++; console.log('실패', n, '\n', e.message); } }
if (failed) process.exit(1);
