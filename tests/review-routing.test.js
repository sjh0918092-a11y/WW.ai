/* 리뷰 경로: 등급 규칙(결정론), 빨간 링크 항목 우선 전달, 진단 기록, 백업 진단 도구. AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,gradeIssues,detIssues,checkKeys,checkPrompt,noteCheck,commitFix,pagePrompt,ownerExcerptBlock,eventIssues,eventBlock,biblePrompt,readPrompt,fixBatchPrompt,taskThinkOptions,preCheck,registerPersonNames,sharedNames,kOf});', c);
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
  assert.match(pr, /참고 문구의 대상은 1의 사건뿐이다/); assert.match(pr, /개요만 한두 문장으로 쓰고/); assert.match(pr, /나쁜 예: '2003년 3월 20일/);
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
  const b = rp.slice(rp.indexOf('## 다른 사건의 재서술'), rp.indexOf('## 다른 사건의 재서술') + 900);
  assert.match(b, /\[\[바그다드 참호 돌파\]\]/); assert.match(b, /\[\[남중국해 대치\]\] \(아직 문서 없음\)/); assert.doesNotMatch(b, /\[\[전략 소녀\]\]/);
  assert.match(b, /문단마다 하나씩 severity high로 지적하되/); assert.match(b, /'재서술\(줄임\):'으로 시작해/); assert.match(b, /'재서술\(지움\):'으로 시작해/); assert.match(b, /같은 섹션 안에서 같은 사건의 요약이나 참고 문구가 되풀이된 곳/); assert.match(b, /인물 관계, 현재처럼 다른 목적의 섹션이/); assert.match(b, /참고 문구 앞이든 뒤든/);
  assert.doesNotMatch(c.readPrompt(w, K('전략 소녀')), /## 다른 사건의 재서술/);   // 다룬 사건이 없으면 넣지 않는다
  const fp = c.fixBatchPrompt(w, c.S.pages[K('레베카 헤이즈')], { summary: '', cats: '', infobox: '', body: '본문' }, [{ claim: '2003년', conflict: '근거: 참고로 넘길 사건: [[바그다드 참호 돌파]] · 재서술: 줄인다' }]);
  assert.match(fp, /'재서술\(지움\):' 메모는 지적된 문단이나 인용문 전체를 old로 잡아 new를 빈 문자열로 둔다/); assert.match(fp, /'재서술\(줄임\):' 메모는/); assert.match(fp, /이 대상의 일로 바꾸지 않는다/);
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

let failed = 0;
(async () => { for (const [n, f] of tests) { try { await f(); console.log('통과', n); } catch (e) { failed++; console.log('실패', n, '\n', e.message); } }
if (failed) process.exit(1); })();
