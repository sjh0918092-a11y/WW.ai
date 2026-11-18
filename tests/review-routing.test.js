/* 리뷰 경로: 등급 규칙(결정론), 빨간 링크 항목 우선 전달, 진단 기록, 백업 진단 도구. AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,gradeIssues,detIssues,checkKeys,checkPrompt,noteCheck,commitFix,pagePrompt,ownerExcerptBlock,eventIssues,eventBlock,biblePrompt,readPrompt,autoRealNameTitle,nameMergeOk,refEventKeys,parentEventKeys,preWritePrompt,preWriteNeeded,runPreWrite,taskSelection,GS,fixBatchPrompt,taskThinkOptions,preCheck,registerPersonNames,sharedNames,kOf,realNameFor,readPrompt,checkTimeline,timelineCheckPrompt,readTimelineForm,timelineEditHtml,promptTimeline});', c);
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

test('주인 문서를 쓸 때는 다른 문서의 재서술을 연도와 결과만 지키게 하고, 사용자 확정 사실과 이야기 모드는 그대로 지키게 한다', () => {
  const mk = () => { const w = world([page('전략 소녀', '개념', '[[레베카]]는 2003년 방어선 14km를 4시간 만에 평탄화했다.', 1)]);
    w.entities[K('레베카')] = { ...c.newEntity('레베카', '인물', '전략 소녀'), page: false, facts: [{ t: '레베카는 2003년 방어선 14km를 4시간 만에 평탄화했다.', src: K('전략 소녀') }], mentions: [{ from: K('전략 소녀'), text: '레베카는 2003년 방어선 14km를 4시간 만에 평탄화했다.' }] };
    return w; };
  let pr = c.pagePrompt(mk(), K('레베카'));
  assert.match(pr, /이 문서가 이 항목의 단독 문서다/); assert.match(pr, /사건 항목이 있는 일과 다른 인물과 함께 겪은 일의 공통 사실은 받은 그대로 따른다/); assert.match(pr, /\[사용자 확정\]이 붙은 것은 반드시 지킨다/); assert.match(pr, /연도와 결과\(생사, 소속, 무엇을 해냈는지\)만 지키고 세부는 이 문서가 정한다/);
  assert.doesNotMatch(pr, /아래 확정 사실과 언급의 내용은 반드시 지킨다/);
  const sw = mk(); sw.mode = 'story'; sw.story = { chapter: 1, chapters: [], cast: [] };
  pr = c.pagePrompt(sw, K('레베카'));
  assert.match(pr, /아래 확정 사실과 언급의 내용은 반드시 지킨다/);
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

test('다른 항목과 얽힌 일: 세 경우로 주인을 가르고, 참고 문구는 사건에만, 큰 일은 사건 항목으로 만든다', () => {
  const w = world([page('러시아', '국가', '러시아다.', 1), page('옥사나', '인물', '1992년 옥사나는 [[러시아]] 해군으로 옮겼다.', 2)]);
  const pr = c.pagePrompt(w, K('러시아'));
  assert.match(pr, /다른 항목과 얽힌 일: 그 일을 누가 정하는지\(주인\)는 아래 세 경우로만 가른다/);
  assert.match(pr, /1\. 사건 항목이 있는 일:/); assert.match(pr, /2\. 사건 항목이 없고 이 항목만 겪은 일: 이 문서가 주인이다/); assert.match(pr, /3\. 사건 항목이 없고 다른 인물과 함께 겪은 일: 공통 사실/);
  assert.match(pr, /참고 문구의 대상은 1의 사건뿐이다/); assert.match(pr, /개요만 한두 문장으로 쓰고/); assert.match(pr, /혁명, 체제 붕괴, 조약 체결, 재난처럼 여러 세력이 얽힌 일\)이나 실제 역사의 큰 사건/); assert.match(pr, /나쁜 예: '2003년 3월 20일/);
  assert.match(pr, /필요한 만큼 만들어 링크한다/); assert.doesNotMatch(pr, /두세 개 만들어/);
  assert.match(pr, /장면의 주체는 이 항목 자신이다/); assert.match(pr, /다른 인물이 주인공인 장면/); assert.match(pr, /절정은 이 문서만의 장면이어야 한다/);
  const ex = c.ownerExcerptBlock(w, K('러시아'), [K('옥사나')]);
  assert.match(ex, /옮겨 쓸 재료가 아니라 어긋나지 않기 위한 기준이며/); assert.doesNotMatch(ex, /참고\.'를 붙인다/);
});
test('참고로 넘길 사건 목록은 앱이 항목 유형으로 정한다(인물·개념은 들어가지 않는다)', () => {
  const w = world([page('전략 소녀', '개념', '개념이다.', 1), page('바그다드 공방전', '사건', '[[조슬린]]과 [[레이첼]]이 나온다.', 2), page('레이첼', '인물', '레이첼이다.', 3)]);
  w.entities[K('바그다드 공방전')].type = '사건'; w.entities[K('레이첼')].type = '인물'; w.entities[K('전략 소녀')].type = '개념';
  w.entities[K('스프래틀리 군도 대치')] = { ...c.newEntity('스프래틀리 군도 대치', '사건', ''), page: false, facts: [], mentions: [] };
  w.entities[K('조슬린')] = { ...c.newEntity('조슬린', '인물', ''), page: false, facts: [{ t: '조슬린은 스프래틀리 군도 대치에 나섰다.', src: K('전략 소녀') }],
    mentions: [{ from: K('바그다드 공방전'), text: '조슬린이 나온다.' }, { from: K('레이첼'), text: '레이첼이 조슬린을 만났다.' }, { from: K('전략 소녀'), text: '조슬린이 대치 중이다.' }] };
  const pr = c.pagePrompt(w, K('조슬린'));
  const b = pr.slice(pr.indexOf('## 참고로 넘길 사건'), pr.indexOf('## 참고로 넘길 사건') + 400);
  assert.match(b, /\[\[바그다드 공방전\]\]/); assert.match(b, /\[\[스프래틀리 군도 대치\]\] \(아직 문서 없음\)/);
  assert.doesNotMatch(b, /\[\[레이첼\]\]|\[\[전략 소녀\]\]/);
});
test('엔진: 이 문서가 주인인 일만 크게 쓰는 전제, 사람의 끝 없음, 절정의 무대와 인물 관계 한정', () => {
  const w = world([page('레이첼', '인물', '레이첼이다.', 1)]);
  w.entities[K('레이첼')].type = '인물';
  const pr = c.pagePrompt(w, K('레이첼'));
  const engine = pr.slice(pr.indexOf('## 이 문서의 엔진'), pr.indexOf('## 이 문서의 엔진') + 3000);
  assert.match(engine, /세 가지를 먼저 정하고/); assert.match(engine, /전제: 이 문서가 크게 쓰는 것은 이 문서가 주인인 일뿐이다/);
  assert.match(engine, /참고 문구는 세부를 대신하는 것이므로/); assert.match(engine, /절정과 큰길은 이 문서가 주인인 일에서 고른다/); assert.match(engine, /무대는 이 항목의 눈에 보인 것/);
  assert.doesNotMatch(pr, /사람의 끝/); assert.doesNotMatch(engine, /4\. /);
  assert.match(pr, /상대 인물의 직위, 그 인물이 내린 결정, 그 인물의 이후 경력은 그 인물의 문서에 남긴다/);
});
test('원안의 지금 진행 중인 일은 짧게 만들게 하고, 넘길 때는 무대 설명으로 세부를 옮기지 않게 한다', () => {
  const bp = c.biblePrompt('가상 세계', true, '', false);
  assert.match(bp, /거리, 인원, 수치, 명령, 기동이나 장면 묘사, 중재·조치·결말의 세부는 넣지 않는다/);
  assert.match(bp, /원하는 목표 한 줄\. 수단, 수치, 명령/);
  const w = world([page('조슬린', '인물', '조슬린이다.', 1)], { stage: { units: [{ name: '관리국', kind: '조직' }], now: '관리국과 사령부가 남중국해에서 대치 중이다.', parties: [{ name: '관리국', kind: '조직', want: '항행의 자유' }] } });
  const pr = c.pagePrompt(w, K('조슬린'));
  assert.match(pr, /## 지금 진행 중인 일\n관리국과 사령부가[^\n]*\n\(무대 설명이다\. 문서에서는 이 항목이 이 일에서 맡은 역할만 쓰고/);
});

test('문서 읽기 검사: 앱이 정한 사건의 재서술을 다듬을 곳으로 짚게 하고, 자동 수정은 문단째 줄이게 한다', () => {
  const ev = page('바그다드 참호 돌파', '사건', '2003년 3월 20일 새벽 5시 15분에 시작했다.', 1);
  const con = page('전략 소녀', '개념', '개념이다.', 2);
  const per = page('레베카 헤이즈', '인물', '2003년 [[바그다드 참호 돌파]]에서 새벽 5시 15분 참호에 도달했다. 152mm 포탄이 쏟아졌다. 자세한 내용은 [[바그다드 참호 돌파]] 참고.\n\n[[전략 소녀]]로 복무했다.', 3);
  const w = world([ev, con, per]);
  w.entities[K('바그다드 참호 돌파')].type = '사건'; w.entities[K('전략 소녀')].type = '개념'; w.entities[K('레베카 헤이즈')].type = '인물';
  w.entities[K('남중국해 대치')] = { ...c.newEntity('남중국해 대치', '사건', ''), page: false, facts: [], mentions: [] };
  c.S.pages[K('레베카 헤이즈')].sections[0].body += '\n\n2015년 [[남중국해 대치]]를 지켜봤다.';
  c.S.pages[K('레베카 헤이즈')].links.push(K('남중국해 대치'));
  const rp = c.readPrompt(w, K('레베카 헤이즈'));
  const b = rp.slice(rp.indexOf('## 다른 사건의 재서술'), rp.indexOf('## 다른 사건의 재서술') + 2500);
  assert.match(b, /\[\[바그다드 참호 돌파\]\]/); assert.match(b, /\[\[남중국해 대치\]\] \(아직 문서 없음\)/); assert.doesNotMatch(b.slice(0, b.indexOf('이 사건들을')), /\[\[전략 소녀\]\]/);
  assert.match(b, /문단마다 하나씩 severity high로 지적하되/); assert.match(b, /'재서술\(줄임\):'으로 시작해/); assert.match(b, /'재서술\(지움\):'으로 시작해/); assert.match(b, /같은 섹션 안에서 같은 사건의 요약이 되풀이된 곳/); assert.match(b, /인물 관계, 현재처럼 다른 목적의 섹션이/); assert.match(b, /참고 문구 앞이든 뒤든/);
  const none = c.readPrompt(w, K('전략 소녀'));   // 연결된 사건이 없어도 사건 항목 없는 큰 사건의 재서술은 짚는다
  assert.match(none, /## 다른 사건의 재서술 \(앱이 정한 목록\)\n아래[^\n]*\n- \(없음\)/); assert.match(none, /사건 항목 없음: \[\[붙일 사건 이름\]\]/); assert.match(none, /체제 붕괴/);
  const fp = c.fixBatchPrompt(w, c.S.pages[K('레베카 헤이즈')], { summary: '', cats: '', infobox: '', body: '본문' }, [{ claim: '2003년', conflict: '근거: 참고로 넘길 사건: [[바그다드 참호 돌파]] · 재서술: 줄인다' }]);
  assert.match(fp, /'재서술\(지움\):' 메모는 지적된 문단이나 인용문 전체를 old로 잡아 new를 빈 문자열로 둔다/); assert.match(fp, /'재서술\(줄임\):' 메모는/); assert.match(fp, /근거가 '사건 항목 없음:'이면/); assert.match(fp, /이 대상의 일로 바꾸지 않는다/);
});

test('설정 검사: 같은 이름이 날짜·나이로 맞지 않으면 단정하지 않고 보이는 메모(low)로 남기게 한다', () => {
  const w = world([page('리버티 벨', '인물', '1998년생이다.', 1)]);
  const pr = c.checkPrompt(w, K('리버티 벨'), []);
  assert.match(pr, /같은 대상인지 먼저 확인한다/); assert.match(pr, /severity low로 남긴다/); assert.match(pr, /'같은 대상인지 확인 필요:'로 시작해/);
  assert.match(pr, /이 문서가 스스로 이 대상에게 불가능한 나이나 시점의 일을 붙였으면 그것은 이 문서의 오류이므로 high/);
  assert.match(pr, /'같은 대상인지 먼저 확인한다'에 걸리는 경우는 그 기준을 따른다/);
});

test('작업별 생각 수준: OpenAI 모델에서 공통 배정 따름이 "inherit (지원하지 않음)"으로 한 번 더 나오지 않는다', () => {
  const html = c.taskThinkOptions('gpt-6-luna', 'inherit');
  assert.equal((html.match(/value="inherit"/g) || []).length, 1);
  assert.doesNotMatch(html, /inherit \(지원하지 않음\)/); assert.match(html, /value="inherit" selected>공통 배정 따름/);
});

test('자동 수정: 같은 문단에 재서술(지움)과 다른 수정이 겹치면 지움을 먼저 적용하고, 지워진 문장의 메모는 남기지 않는다', async () => {
  const P1 = '2003년 [[이라크 침공]] 때 진격로를 열었다. 자세한 내용은 [[이라크 침공]] 참고.';
  const S1 = '바그다드 외곽에서 케인은 메디나 기갑사단과 정면으로 맞닥뜨렸다.', S2 = '사령부는 케인을 달래려고 포도당을 공급했다.';
  const per = { ...page('케인', '인물', P1 + '\n\n' + S1 + ' ' + S2, 2), sections: [{ heading: '개요', level: 1, body: '케인은 전략 소녀다.' }, { heading: '이라크', level: 1, body: P1 + '\n\n' + S1 + ' ' + S2 }] };
  const w = world([page('이라크 침공', '사건', '침공이다.', 1), per]);
  w.entities[K('이라크 침공')].type = '사건'; w.entities[K('케인')].type = '인물';
  c.__mock = { check: { issues: [{ claim: S2, evidence: '핵심 규칙: 진정제를 쓴다', conflict: '절차가 다르다', severity: 'high' }] },
    read: { issues: [{ claim: S1, evidence: '참고로 넘길 사건: [[이라크 침공]]', conflict: '재서술(지움): 앞 문단에서 요약했으므로 지운다', severity: 'high' }] } };
  vm.runInContext(`callJson = async (kind, prompt) => {
    if (kind !== 'fix') return JSON.parse(JSON.stringify(__mock[kind] || { issues: [] }));
    const n = {}; for (const m of prompt.matchAll(/(\\d+)\\. 문서의 서술: (.*)/g)) n[m[2].trim()] = +m[1];
    return { edits: [{ memo: n[${JSON.stringify(S2)}], field: 'body', old: ${JSON.stringify(S2)}, new: '사령부는 케인에게 진정제를 투여했다.' }, { memo: n[${JSON.stringify(S1)}], field: 'body', old: ${JSON.stringify(S1 + ' ' + S2)}, new: '' }] };
  }`, c);
  const res = await c.preCheck(w, K('케인'), c.S.pages[K('케인')], { ctl: new AbortController() }, () => {});
  const body = res.page.sections.map(s => s.body).join('\n');
  assert.doesNotMatch(body, /메디나/); assert.doesNotMatch(body, /포도당|진정제를 투여/);
  assert.equal(res.page.check.issues.filter(i => /메디나|포도당/.test(i.claim)).length, 0);
  assert.equal(res.fixed, 2);
});

test('설정 검사: 근거가 없다는 것만으로는 지적하지 않고, 조약 자체의 문서가 정한 조항은 대조하지 않는다', () => {
  const w = world([page('제네바 협정', '제도', '제7조는 축소 저지를 금지한다.', 1)]);
  const pr = c.checkPrompt(w, K('제네바 협정'), []);
  assert.match(pr, /이 문서가 그 조약·제도·기록 자체의 문서이면 그 조항의 내용은 이 문서가 정하는 것이므로 대조 대상이 아니다/);
  assert.match(pr, /확정 설정에 근거가 없다는 것만으로는 지적하지 않는다/); assert.doesNotMatch(pr, /인용 근거를 확정할 수 없으면 low로 쓰고/);
});

test('같은 이명: 처음 연결은 유지하고 나중 인물에게 이명(본명)을 링크용으로 붙이며, 작성·검사 프롬프트에 목록을 넘긴다', async () => {
  const box = n => [{ label: '본명', value: n }, { label: '호출부호', value: '블랙버드' }];
  const A = { ...page('마리아 로페스', '인물', '마리아다.', 1), infobox: box('마리아 로페스') }, B = { ...page('한서진', '인물', '한서진이다.', 2), infobox: box('한서진') };
  const w = world([A, B]); w.entities[K('마리아 로페스')].type = '인물'; w.entities[K('한서진')].type = '인물';
  w.aliases = { [K('블랙버드')]: K('마리아 로페스') };
  await c.registerPersonNames(w, K('한서진'));
  assert.equal(w.aliases[K('블랙버드')], K('마리아 로페스'));   // 처음 연결 유지
  assert.equal(w.aliases[K('블랙버드(한서진)')], K('한서진'));
  assert.equal(c.kOf(w, '블랙버드(한서진)'), K('한서진'));
  const pr = c.pagePrompt(w, K('한서진'));
  assert.match(pr, /## 같은 이명을 쓰는 인물\n- 블랙버드: 마리아 로페스 → \[\[블랙버드\]\], 한서진 → \[\[블랙버드\(한서진\)\]\]/);
  assert.match(pr, /괄호는 링크를 구분하려고 붙인 표기일 뿐이고, 실제 이명은 모두 괄호 없는 이름이다/);
  assert.doesNotMatch(pr, /조슬린|인디펜던스/);
  assert.match(c.checkPrompt(w, K('한서진'), []), /conflict는 '이명 링크:'로 시작해/);
  const w2 = world([A, B]); w2.entities[K('마리아 로페스')].type = '인물'; w2.entities[K('한서진')].type = '인물'; w2.aliases = { [K('블랙버드')]: K('마리아 로페스') };
  c.sharedNames(w2); assert.equal(w2.aliases[K('블랙버드(한서진)')], K('한서진'));   // 기존 세계관도 링크용 이명이 생긴다
});

test('문서 내부 검사: 링크 표기를 살리고 인물의 이명을 넘기며, 오타·잘못 쓴 낱말은 자동으로 고치게 한다', () => {
  const sara = { ...page('사라 밀러', '인물', '사라다.', 1), infobox: [{ label: '본명', value: '사라 밀러' }, { label: '호출부호', value: '새러토가' }] };
  const doc = page('조약 위반 사건', '사건', '[[사라 밀러|새러토가]]를 이송했다. 사라 밀러는 주저앉아 있었다.', 2);
  const w = world([sara, doc]); w.entities[K('사라 밀러')].type = '인물';
  const rp = c.readPrompt(w, K('조약 위반 사건'));
  assert.match(rp, /\[\[사라 밀러\|새러토가\]\]를 이송했다/);
  assert.match(rp, /## 이 문서에 나온 인물의 다른 이름 \(같은 인물이다\)\n- 사라 밀러: 새러토가/);
  assert.match(rp, /이런 곳은 severity high로 써서 작성 직후 자동으로 고치게 한다/);
});

test('자동 수정: 재서술 지움으로 섹션이 통째로 비면 그 지움은 되돌린다', async () => {
  const R = '[[적벽]]: 2016년 [[스카버러 해상 대치]]에서 맞선 상대다.';
  const per = { ...page('네브래스카', '인물', '네브래스카다.', 2), sections: [{ heading: '개요', level: 1, body: '네브래스카는 전략 소녀다.' }, { heading: '대치', level: 1, body: '2016년 [[스카버러 해상 대치]]에서 맞섰다. 자세한 내용은 [[스카버러 해상 대치]] 참고.' }, { heading: '인물 관계', level: 1, body: R }] };
  const w = world([page('스카버러 해상 대치', '사건', '대치다.', 1), per]);
  w.entities[K('스카버러 해상 대치')].type = '사건'; w.entities[K('네브래스카')].type = '인물';
  const claim = '적벽: 2016년 스카버러 해상 대치에서 맞선 상대다.';
  c.__mock = { check: { issues: [] }, read: { issues: [{ claim, evidence: '참고로 넘길 사건: [[스카버러 해상 대치]]', conflict: '재서술(지움): 되풀이', severity: 'high' }] } };
  vm.runInContext(`callJson = async (kind, prompt) => {
    if (kind !== 'fix') return JSON.parse(JSON.stringify(__mock[kind] || { issues: [] }));
    const n = {}; for (const m of prompt.matchAll(/(\\d+)\\. 문서의 서술: (.*)/g)) n[m[2].trim()] = +m[1];
    return { edits: [{ memo: n[${JSON.stringify(claim)}], field: 'body', old: ${JSON.stringify(R)}, new: '' }] };
  }`, c);
  const res = await c.preCheck(w, K('네브래스카'), c.S.pages[K('네브래스카')], { ctl: new AbortController() }, () => {});
  const rel = res.page.sections.find(s => s.heading === '인물 관계');
  assert.ok(rel && /적벽/.test(rel.body), JSON.stringify(res.page.sections));
});

test('제목을 본명으로 바꾸기: 본명 칸의 링크 표시 이름과 한글 이름을 원어 표기보다 먼저 고른다', () => {
  const mk = v => { const p = { ...page('네브래스카', '인물', '네브래스카다.', 1), infobox: [{ label: '본명', value: v }, { label: '호출부호', value: '네브래스카' }] }; const w = world([p]); w.entities[K('네브래스카')].type = '인물'; return w; };
  assert.equal(c.realNameFor(mk('[[헤일리 앤 젠킨스|헤일리 앤 젠킨스]] (Hailey Anne Jenkins)'), K('네브래스카')), '헤일리 앤 젠킨스');
  assert.equal(c.realNameFor(mk('[[Hailey Anne Jenkins|헤일리 앤 젠킨스]] (Hailey Anne Jenkins)'), K('네브래스카')), '헤일리 앤 젠킨스');
  assert.equal(c.realNameFor(mk('Hailey Anne Jenkins (헤일리 앤 젠킨스)'), K('네브래스카')), '헤일리 앤 젠킨스');
  assert.equal(c.realNameFor(mk('에밀리 앤 카터 (Emily Ann Carter)'), K('네브래스카')), '에밀리 앤 카터');
  { const p = { ...page('빅토리아', '인물', '빅토리아다.', 1), infobox: [{ label: '호출명', value: '빅토리아 (Victoria)' }, { label: '본명', value: '빅토리아 애들레이드 스펜서' }] }; const w = world([p]); w.entities[K('빅토리아')].type = '인물';
    assert.equal(c.realNameFor(w, K('빅토리아')), '빅토리아 애들레이드 스펜서', "'호출명' 칸도 호출부호로 읽는다"); }
});

test('참고 문구는 문서에서 한 번만: 중복은 참고 문장만 지우고, 개요 정의·인물 관계는 지키게 한다', () => {
  const ev = page('카리브해 대치', '사건', '대치다.', 1), per = page('캔자스', '인물', '2. [[카리브해 대치]]에서 막았다. 자세한 내용은 [[카리브해 대치]] 참고.', 2);
  const w = world([ev, per]); w.entities[K('카리브해 대치')].type = '사건'; w.entities[K('캔자스')].type = '인물';
  assert.match(c.pagePrompt(w, K('캔자스')), /같은 사건의 참고 문구는 문서 전체에서 한 번만 쓰고/);
  const rp = c.readPrompt(w, K('캔자스'));
  assert.match(rp, /'재서술\(참고 중복\):'으로 시작하는 conflict/); assert.match(rp, /개요의 첫 문장\(이 항목이 무엇인지 밝히는 정의\)과 인물 관계 항목은 재서술로 줄이거나 지우라고 짚지 않는다/);
  const fp = c.fixBatchPrompt(w, c.S.pages[K('캔자스')], { summary: '', cats: '', infobox: '', body: '본문' }, [{ claim: 'x', conflict: '재서술(참고 중복): y' }]);
  assert.match(fp, /'재서술\(참고 중복\):' 메모는 지적된 참고 문장 하나만/); assert.match(fp, /인물 관계 항목을 사건 요약이나 참고 문구로 바꾸지 않는다/);
});

test('사건 문서가 다른 사건 항목을 다룰 때는 그 사건 문서가 주인이고, 의미를 두세 문장으로 쓰게 한다', () => {
  const big = page('쿠바 미사일 위기', '사건', '위기다. [[카리브해 대치]]가 있었다.', 1), sub = page('카리브해 대치', '사건', '대치다.', 2), per = page('캔자스', '인물', '[[카리브해 대치]]에 나갔다.', 3);
  const w = world([big, sub, per]); for (const t of ['쿠바 미사일 위기', '카리브해 대치']) w.entities[K(t)].type = '사건'; w.entities[K('캔자스')].type = '인물';
  assert.match(c.pagePrompt(w, K('쿠바 미사일 위기')), /사건 문서에서는 그 사건이 전체 흐름에서 어떤 의미였는지 두세 문장으로 쓰고/);
  const rb = c.readPrompt(w, K('쿠바 미사일 위기'));
  assert.match(rb, /그 사건이 이 사건의 흐름에서 어떤 의미였는지 두세 문장으로만 쓰고/); assert.match(rb, /이 항목이 한 일 두세 문장을 넘는 서술/);
  assert.match(c.readPrompt(w, K('캔자스')), /이 항목이 한 일 한두 문장을 넘는 서술/);
});

test('작성 직후 리뷰가 실패하면 진단 기록에 남긴다', async () => {
  const ev = page('디에고 사건', '사건', '사건이다.', 1);
  const w = world([ev]); w.entities[K('디에고 사건')].type = '사건';
  vm.runInContext(`callJson = async () => { throw { code: 'api_524' }; }`, c);
  const res = await c.preCheck(w, K('디에고 사건'), c.S.pages[K('디에고 사건')], { ctl: new AbortController() }, () => {});
  assert.equal(res.done, false);
  const log = res.page.checkLog || [];
  assert.equal(log.at(-1).event, '작성 직후 리뷰 실패'); assert.equal(log.at(-1).code, 'api_524');
});

test('작성 직후 리뷰에서 고칠 곳이 없어도 검사 요약을 진단 기록에 남긴다', async () => {
  const ev = page('바르셀 사건', '사건', '사건이다.', 1);
  const w = world([ev]); w.entities[K('바르셀 사건')].type = '사건';
  vm.runInContext(`callJson = async (kind) => ({ issues: [] })`, c);
  const res = await c.preCheck(w, K('바르셀 사건'), c.S.pages[K('바르셀 사건')], { ctl: new AbortController() }, () => {});
  assert.equal(res.done, true);
  const log = res.page.checkLog || [];
  assert.equal(log.length, 1); assert.equal(log[0].issues, 0); assert.equal(log[0].fixed, 0);
});
test('자동 수정 지침: 지운 문단에 기대는 앞뒤 문장도 고치고, 참고 문장은 문서에서 한 번만 붙인다', () => {
  const w = world([page('카일', '인물', '카일은 병사다.', 1)]);
  const p = c.fixBatchPrompt(w, c.S.pages[K('카일')], { summary: '', cats: '', infobox: '', body: '카일은 병사다.' }, [{ claim: '카일은 병사다.', conflict: '재서술(지움): x', severity: 'high' }]);
  assert.match(p, /참고 문장은 문서 전체에서 한 번만/); assert.match(p, /반드시 하나는 남긴다/); assert.match(p, /참여하지 않고 다른 항목의 일이나 배경으로만 나오는 문단이면, 짧게 줄이되 참고 문장을 붙이지 않고/); assert.match(p, /개요가 아닌 첫 섹션의 수정 하나에 붙이고/); assert.match(p, /이름을 문장마다 주어로 되풀이하지 않고/); assert.match(p, /그 내용을 전제로 하는 앞뒤 문장/); assert.match(p, /되풀이하게 되면/);
});

test('일반 서술: 작성은 원문 사례와 맞을 때만 묶어 쓰고, 리뷰는 양쪽 방향으로 개별 사례와 대조한다', () => {
  const w = world([page('카일', '인물', '카일은 병사다.', 1)]);
  const pp = c.pagePrompt(w, K('카일'));
  assert.match(pp, /여러 항목을 묶는 일반 서술/); assert.match(pp, /원문에 없는 부분은 이 문서가 정한다/); assert.match(pp, /독자가 자연스럽게 기대할 상태를 기본으로/); assert.doesNotMatch(pp, /정원을 채운 상태/); assert.match(pp, /이 항목에만 해당하는 구체적인 사실/); assert.match(pp, /우두머리\(이름\)/);
  const cp = c.checkPrompt(w, K('카일'), '');
  assert.match(cp, /일반 서술과 개별 사례/); assert.match(cp, /연결된 문서의 일반 서술이/); assert.match(cp, /함께 성립할 수 없으면 지적한다/);
});

test('연표 점검: 규칙과 함께 성립하지 않는 원안 항목을 고치고 이유를 남기며, 사용자 수정 항목은 바꾸지 않는다', async () => {
  const w = world([page('카일', '인물', '카일은 병사다.', 1)], { rules: ['능력은 14~19세에만 쓴다.'], timeline: [
    { year: '1954', month: 11, day: 3, event: '갑이 처음 발현하다.', src: 'seed' },
    { year: '1962', month: 10, day: 22, event: '갑이 해협에서 교전하다.', src: 'seed' },
    { year: '1970', event: '을이 태어나다.', src: 'user' }] });
  c.S.sample = true;
  let prompt = '';
  vm.runInContext(`callJson = async (kind, p) => { globalThis.__p = p; return { fixes: [{ i: 2, year: '1958', month: 10, day: 22, event: '갑이 해협에서 교전하다.', why: '14~19세 사이 활동 기간 안에 들도록 옮김' }, { i: 3, year: '1999', event: '을이 태어나다.', why: 'x' }] }; }`, c);
  const n = await c.checkTimeline(w); prompt = c.__p;
  assert.equal(n, 1);
  const t = w.timeline.find(x => x.event.includes('교전'));
  assert.equal(t.year, '1958'); assert.match(t.fix.why, /활동 기간/); assert.match(t.fix.before, /1962년 10월 22일/);
  assert.equal(w.timeline.find(x => x.event.includes('을')).year, '1970', '사용자 수정 항목은 그대로');
  assert.match(prompt, /능력은 14~19세에만 쓴다/); assert.match(prompt, /사용자 수정/); assert.equal(w.timelineCheck.fixed, 1);
  assert.match(c.timelineEditHtml(w), /연표 점검으로 고침: 14~19세/);
});
test('연표 편집: 고친 항목은 사용자 수정이 되고, 사건을 비우면 지우며, 새 줄을 더한다', () => {
  const w = world([page('카일', '인물', '카일은 병사다.', 1)], { timeline: [
    { year: '1954', event: '갑이 발현하다.', src: 'seed' }, { year: '1960', event: '병이 태어나다.', src: K('카일') }, { year: '1962', event: '을이 지다.', src: 'seed' }] });
  const vals = { 'data-tl-ev="0"': '갑이 발현하다.', 'data-tl-y="0"': '1956', 'data-tl-ev="1"': '', 'data-tl-y="1"': '1960', 'data-tl-ev="2"': '을이 지다.', 'data-tl-y="2"': '1962', 'data-tl-ev="n0"': '정이 오다.', 'data-tl-y="n0"': '1970', 'data-tl-m="n0"': '3', 'data-tl-d="n0"': '1', 'data-tl-ev="n1"': '', 'data-tl-y="n1"': '' };
  const el = k => vals[k] === undefined ? null : { value: vals[k], dataset: { tlEv: k.match(/"(.+)"/)[1] } };
  const doc = c.document, saved = { q: doc.querySelector, qa: doc.querySelectorAll };
  doc.querySelector = sel => { const m = sel.match(/\[(data-tl-[a-z]+="[^"]+")\]/); return m ? el(m[1]) : sel === '[data-tl-ev]' ? {} : null; };
  doc.querySelectorAll = () => Object.keys(vals).filter(k => k.startsWith('data-tl-ev')).map(el);
  try { c.readTimelineForm(w); } finally { doc.querySelector = saved.q; doc.querySelectorAll = saved.qa; }
  assert.equal(w.timeline.length, 3);
  const a = w.timeline.find(x => x.event.startsWith('갑')); assert.equal(a.year, '1956'); assert.equal(a.src, 'user'); assert.equal(a.from, 'seed');
  assert.ok(!w.timeline.some(x => x.event.startsWith('병')), '사건을 비우면 지운다');
  const n = w.timeline.find(x => x.event.startsWith('정')); assert.equal(n.src, 'user'); assert.equal(n.month, 3); assert.equal(n.day, 1);
  assert.equal(w.timeline.find(x => x.event.startsWith('을')).src, 'seed', '안 바꾼 항목은 그대로');
  assert.ok(c.promptTimeline(w, '', w.timeline, 0).some(x => x.src === 'user'), '사용자 수정 항목은 언제나 프롬프트에 들어간다');
});

test('문서 내부 검사: 원안과 무대를 넘기고, 어긋난 두 서술 중 원안·무대와 맞지 않는 쪽을 고칠 쪽으로 잡게 한다', () => {
  const w = world([page('사령부', '조직', '사령부는 현역 1기를 운용한다.', 1)], { seed: '각국은 상시 3기까지 배치한다.', stage: { units: [{ name: '사령부', kind: '조직', desc: '현역 3기를 총괄한다' }], now: '', parties: [] } });
  const rp = c.readPrompt(w, K('사령부'));
  assert.match(rp, /세계관 원안과 무대/); assert.match(rp, /각국은 상시 3기까지 배치한다/); assert.match(rp, /현역 3기를 총괄한다/); assert.match(rp, /맞지 않는 쪽을 claim으로 잡는다/); assert.match(rp, /같은 인물을 본명과 호출부호·코드명·이명으로 따로 세어/);
});

test('구성원 목록: 소속 장부로 구성원(다른 이름·자리·상태)을 넣고, 국가는 소속 조직의 구성원까지 한 단계 따라가며, 인물 문서에는 넣지 않는다', () => {
  const nation = page('라데니아', '국가', '라데니아는 섬나라다.', 1);
  const org = page('해안 수비대', '조직', '수비대는 해안을 지킨다.', 2);
  const hero = { ...page('엘라 무어', '인물', '엘라는 [[해안 수비대]] 소속이다.', 3), infobox: [{ label: '호출부호', value: '스톰 실드' }] };
  const w = world([nation, org, hero]);
  w.entities[K('라데니아')].type = '국가'; w.entities[K('해안 수비대')].type = '조직'; w.entities[K('엘라 무어')].type = '인물';
  w.entities[K('해안 수비대')].affil = { src: K('해안 수비대'), list: [{ org: K('라데니아'), role: '', state: '현역', from: '', to: '' }] };
  w.entities[K('엘라 무어')].affil = { src: K('엘라 무어'), list: [{ org: K('해안 수비대'), role: '대원', state: '현역', from: '2014', to: '' }] };
  const pp = c.pagePrompt(w, K('해안 수비대'));
  assert.match(pp, /## 구성원 목록/); assert.match(pp, /- 엘라 무어 \(다른 이름: 스톰 실드\) — 대원, 현역, 2014~현재/);
  assert.match(pp, /가상의 집단에는 '역대'라는 제목을 쓰지 않는다/); assert.match(pp, /실제 역사에서 명단이 확정된/); assert.match(pp, /이명은 한 자리로 세며/);
  assert.match(c.pagePrompt(w, K('라데니아')), /- 엘라 무어 .*· 「해안 수비대」 소속/, '국가는 소속 조직의 구성원까지 따라간다');
  assert.doesNotMatch(c.pagePrompt(w, K('엘라 무어')), /## 구성원 목록/);
});
test('작성 전 점검: 조직·국가·유형 미정 항목만 묻고, 확정 사실과 소속 인물을 넘기며, 답을 작성 프롬프트에 넣고 빈 유형을 채운다', async () => {
  const org = page('해안 수비대', '조직', '수비대는 해안을 지킨다.', 1);
  const w = world([org, page('엘라 무어', '인물', '엘라는 병사다.', 2)], { seed: '섬나라들이 해안 수비대를 경쟁적으로 키운다.' });
  w.entities[K('해안 수비대')].type = '조직'; w.entities[K('엘라 무어')].type = '인물';
  w.entities[K('해안 수비대')].facts = [{ t: '수비대는 1990년에 창설되었다.', src: K('엘라 무어') }];
  assert.equal(c.preWriteNeeded(w, K('해안 수비대')), true); assert.equal(c.preWriteNeeded(w, K('엘라 무어')), false);
  w.entities[K('새 항목')] = c.newEntity('새 항목', '', ''); assert.equal(c.preWriteNeeded(w, K('새 항목')), true, '유형 미정은 묻는다'); assert.equal(c.preWriteNeeded(w, K('새 항목'), '인물'), false, '다시 쓰기 전 문서가 인물이면 묻지 않는다');
  const pp = c.preWritePrompt(w, K('해안 수비대'));
  assert.match(pp, /섬나라들이 해안 수비대를/); assert.match(pp, /수비대는 1990년에 창설되었다/); assert.match(pp, /갖추고 있을 것으로 예상되는 주요 구성원/); assert.match(pp, /'최대', '까지', '이하'로 답하지 않는다/); assert.match(pp, /예상 주요 구성원: N명/); assert.match(pp, /이름은 정하지 않는다/);
  vm.runInContext(`callJson = async (kind) => kind === 'preWrite' ? { type: '조직', notes: '이 집단의 기대 구성원 수: 5명. 이유: 경쟁.' } : {}`, c);
  const r = await c.runPreWrite(w, K('새 항목'), new AbortController().signal);
  assert.equal(r.notes, '이 집단의 기대 구성원 수: 5명. 이유: 경쟁.'); assert.equal(w.entities[K('새 항목')].type, '조직'); assert.equal(r.record.type, '조직'); assert.equal(r.record.notes, r.notes);
  const wp = c.pagePrompt(w, K('해안 수비대'), null, '', null, 'section', null, null, r.notes);
  assert.match(wp, /## 작성 전 점검 결과[^\n]*\n이 집단의 기대 구성원 수: 5명/);
  vm.runInContext(`callJson = async () => { throw { code: 'api_500' }; }`, c);
  { const f = await c.runPreWrite(w, K('해안 수비대'), new AbortController().signal); assert.equal(f.notes, '', '실패하면 점검 없이 쓴다'); assert.equal(f.record.failed, 'api_500', '실패도 기록한다'); }
});
test('작성 전 점검의 모델·생각 수준은 따로 정하지 않으면 문서 작성의 배정을 따른다', () => {
  const st = { main: 'm-main', mainThink: 'low', check: 'm-check', taskModels: { page: { model: 'm-page', think: 'high' } } };
  assert.deepEqual({ ...c.taskSelection('preWrite', 'main', st) }, { model: 'm-page', think: 'high' });
  assert.deepEqual({ ...c.taskSelection('preWrite', 'main', { ...st, taskModels: { page: { model: 'm-page', think: 'high' }, preWrite: { model: '', think: 'minimal' } } }) }, { model: 'm-page', think: 'minimal' });
  assert.deepEqual({ ...c.taskSelection('preWrite', 'main', { ...st, taskModels: {} }) }, { model: 'm-main', think: 'low' });
});

test('작성 직후: 코드명 제목의 인물 문서는 본명으로 옮기고 옛 제목은 별칭으로 남기며, 바꾼 사실을 문서에 남긴다', async () => {
  const p = { ...page('빅토리아', '인물', '빅토리아다.', 1), infobox: [{ label: '호출명', value: '빅토리아 (Victoria)' }, { label: '본명', value: '빅토리아 애들레이드 스펜서' }] };
  const other = page('포츠머스', '지명', '[[빅토리아]]가 머문다.', 2);
  const w = world([p, other]); w.entities[K('빅토리아')].type = '인물'; w.aliases = {};
  const r = await c.autoRealNameTitle(w, K('빅토리아'));
  assert.ok(r, '옮겼다'); assert.equal(r.to, K('빅토리아 애들레이드 스펜서'));
  assert.ok(c.S.pages[r.to]); assert.equal(c.S.pages[r.to].title, '빅토리아 애들레이드 스펜서'); assert.equal(c.S.pages[r.to].renamedFrom.from, '빅토리아');
  assert.ok(!c.S.pages[K('빅토리아')]); assert.equal(w.aliases[K('빅토리아')], r.to, '옛 제목은 별칭');
  const plain = { ...page('한서진', '인물', '한서진이다.', 3), infobox: [{ label: '본명', value: '한서진' }] };
  const w2 = world([plain]); w2.entities[K('한서진')].type = '인물';
  assert.equal(await c.autoRealNameTitle(w2, K('한서진')), null, '코드명 제목이 아니면 바꾸지 않는다');
});

test('상위 사건: 하위 사건 문서는 자기를 품은 사건을 참고로 넘기지 않고, 상위 사건 문서는 하위 사건을 그대로 넘긴다', () => {
  const war = page('사막 전쟁', '사건', '1991년 [[모래 작전]]은 결정적 전환점이었다. 자세한 내용은 [[모래 작전]] 참고.', 1);
  const op = { ...page('모래 작전', '사건', '작전은 [[사막 전쟁]]의 공세였다. 방어선을 뚫었다.', 2), categories: ['사막 전쟁'] };
  const w = world([war, op]); w.entities[K('사막 전쟁')].type = '사건'; w.entities[K('모래 작전')].type = '사건';
  assert.deepEqual([...c.parentEventKeys(w, K('모래 작전'))], [K('사막 전쟁')]);
  assert.ok(!c.refEventKeys(w, K('모래 작전'), [K('사막 전쟁')]).includes(K('사막 전쟁')), '상위 사건은 참고로 넘길 사건이 아니다');
  assert.ok(c.refEventKeys(w, K('사막 전쟁'), [K('모래 작전')]).includes(K('모래 작전')), '상위 사건 문서에서는 하위 사건을 넘긴다');
  assert.deepEqual([...c.parentEventKeys(w, K('사막 전쟁'))], []);
  assert.match(c.readPrompt(w, K('모래 작전')), /이 사건을 품은 상위 사건: \[\[사막 전쟁\]\]/);
  // 서로 넘긴 상태여도 분류가 없는 쪽은 상위 사건으로 보지 않는다
  op.sections[0].body += ' 자세한 내용은 [[사막 전쟁]] 참고.';
  assert.deepEqual([...c.parentEventKeys(w, K('사막 전쟁'))], []);
});

test("'최초' 주장: 작성·설정 검사·세계 전체 점검이 '첫'도 다루고, 설정 검사는 연표의 더 이른 사례와 맞춰 본다", () => {
  const w = world([page('전투', '사건', '첫 대규모 지상 격투전 사례로 기록되었다.', 1)]); w.entities[K('전투')].type = '사건';
  assert.match(c.pagePrompt(w, K('전투')), /'최초', '처음', '첫', '유일'/);
  const cp = c.checkPrompt(w, K('전투'), '');
  assert.match(cp, /'최초', '처음', '첫', '유일' 주장: 연표와 연결된 문서 원문에 더 이른 같은 종류의 사례가 있으면 high/);
});

test('인물 인포박스의 본명: 제목이 본명이 아니면 넣고 개요에서 밝히며, 제목이 본명이면 원어 표기나 더 긴 이름일 때만 넣는다', () => {
  const w = world([page('카일', '인물', '카일은 병사다.', 1)]); w.entities[K('카일')].type = '인물';
  const pp = c.pagePrompt(w, K('카일'));
  assert.match(pp, /참고 문구 없이 사건 이름에 링크만 건다/); assert.match(pp, /본명이 아닌 이름이면 '본명' 줄을 넣고 개요 첫 문장에서 본명을 밝힌다/); assert.match(pp, /제목과 같은 글자만 되풀이하는 줄은 쓰지 않는다/); assert.match(pp, /본명이 감춰진 인물이면 본명 줄을 넣지 않는다/);
});

test('자동 합치기 이름 토막: 호출명 제목은 쪼개지 않고, 연대가 맞지 않는 사람은 합치지 않는다', () => {
  const ws = { ...page('워스파이트 2세', '인물', '2대다.', 1), infobox: [{ label: '본명', value: '에블린 캐번디시' }, { label: '출생', value: '1973년 10월 11일' }] };
  const beck = { ...page('조슬린 벡', '인물', '벡이다.', 2), infobox: [{ label: '출생', value: '1973년 1월 3일' }], categories: ['전략 소녀'] };
  const w = world([ws, beck]); w.entities[K('워스파이트 2세')].type = '인물'; w.entities[K('조슬린 벡')].type = '인물';
  w.entities[K('워스파이트')] = { ...c.newEntity('워스파이트', '인물', ''), facts: [{ t: '워스파이트는 1982년 포클랜드 전쟁에서 선단을 호위했다.', src: 'x' }] };
  assert.equal(c.nameMergeOk(w, K('워스파이트'), K('워스파이트 2세')), false, '호출명 제목은 쪼개지 않는다');
  w.entities[K('벡')] = { ...c.newEntity('벡', '인물', ''), facts: [{ t: '벡은 1990년 걸프전에 투입되었다.', src: 'x' }] };
  assert.equal(c.nameMergeOk(w, K('벡'), K('조슬린 벡')), true, '사람 이름의 성이고 연대가 맞으면 합친다');
  w.entities[K('벡')].facts = [{ t: '벡은 1962년 카리브해에서 싸웠다.', src: 'x' }];
  assert.equal(c.nameMergeOk(w, K('벡'), K('조슬린 벡')), false, '태어나기 전의 일이면 합치지 않는다');
});

let failed = 0;
(async () => { for (const [n, f] of tests) { try { await f(); console.log('통과', n); } catch (e) { failed++; console.log('실패', n, '\n', e.message); } }
if (failed) process.exit(1); })();
