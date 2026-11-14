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
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,parseAgeRules,ageRuleIssues,numericIssues,sameKindEvents,sameKindBlock,pagePrompt,acceptTimeline,openWorld,Store});', c);
const person = (title, birth, body = '', extra = {}) => ({ title, type: '인물', summary: '전략 소녀', categories: ['전략 소녀'], infobox: birth ? [{ label: '출생', value: birth }] : [], sections: [{ heading: '생애', body }], links: [], createdAt: 1, ...extra });
const doc = (title, body, extra = {}) => person(title, '', body, { type: '사건', summary: '', categories: [], createdAt: 2, ...extra });
const rule = '전략 소녀는 만 14세~19세에만 발현한다.';
function world(pages, extra = {}) {
  c.S.pages = pages;
  const w = { id: 'test', kind: 'world', title: '시험 세계', era: '2018년', seed: '가상의 전략 소녀 세계', rules: [rule], timeline: [], events: [], entities: {}, mainKey: Object.keys(pages)[0], ...extra };
  for (const [k, p] of Object.entries(pages)) w.entities[k] = { ...c.newEntity(p.title, p.type, p.summary), page: true, ...(p.categories.length ? { cats: p.categories.map(name => ({ name, axis: '유형' })) } : {}) };
  w.ageRules = { text: rule, rules: c.parseAgeRules({ rules: [{ rule: 'R1', subjects: ['전략 소녀'], startMin: 14, startMax: 19, endAge: null, spanWords: ['발현', '거체화', '현역'] }] }, w) };
  c.S.world = w; return w;
}
let n = 0, failed = 0; const tests = [];
function test(name, fn) { tests.push([name, fn]); }
const age = (w, k, text) => c.ageRuleIssues(w, k).filter(x => !text || x.claim.includes(text));

test('정확한 생일·연표 날짜로 비키니 쇼크 당시 만 13세와 발현 하한 위반을 찾는다', () => {
  const p = person('엘리너 레이놀즈', '1940년 5월 27일', '3월 1일 오전 6시 45분, … 14세의 레이놀즈는 기폭 장치가 작동함과 동시에 격벽을 뚫고 해상으로 솟구쳤다.');
  p.infobox[0].label = '출생일';
  const w = world({ p }, { timeline: [{ year: '1954', month: 3, day: 1, event: '엘리너 레이놀즈가 비키니 환초에서 60.2미터로 거체화하며 비키니 쇼크를 일으키다.', src: 'seed' }] });
  const issues = age(w, 'p'); assert(issues.some(x => /13세/.test(x.conflict))); assert(issues.some(x => /14~19|14세/.test(x.conflict)));
});
test('본문의 명시된 만 13세 발현은 연도 차가 14여도 하한 위반이다', () => {
  const w = world({ p: person('폴리나 자하로바', '2001년 10월 18일', '만 13세이던 2015년 초 급격한 골격 팽창과 중력 간섭장이 동시 관측되면서 … 징발되었다.') });
  assert(age(w, 'p').some(x => /나이 규칙/.test(x.conflict)));
});
test('다른 주어가 먼저 나와도 나이와 명시적 주어가 붙어 있으면 12월 26일의 만 18세를 대조한다', () => {
  const w = world({ p: person('류드밀라 파블리첸코', '1973년 9월 21일'), q: doc('연방 붕괴', '1991년 연방 붕괴가 가시화되자 … 12월 26일, 소련군 소장 발레리 소콜로프가 … 명령했으나, 17세였던 파블리첸코는 … 명령을 거부했다.') });
  assert(age(w, 'q', '17세').some(x => /18세/.test(x.conflict)));
  assert(age(w, 'p').some(x => x.target === 'q' && x.severity === 'low'));
});
test('다른 문서의 당시 나이는 같은 문단의 유일한 연도로 범위를 계산한다', () => {
  const w = world({ p: person('엘리자베스 해밀턴', '1965년 9월 17일'), q: doc('포클랜드 전쟁', '1982년 발발한 포클랜드 전쟁 … 당시 15세이던 제2세대 전략 소녀 엘리자베스 해밀턴') });
  assert(age(w, 'q').some(x => /16~17세/.test(x.conflict)));
});
test('만 20세가 되던 1987년은 출생 1965년과 맞지 않는다', () => {
  const w = world({ p: person('엘리자베스 해밀턴', '1965년 9월 17일'), q: doc('퇴역 기록', '엘리자베스 해밀턴은 만 20세가 되던 1987년 정상 체격으로 복귀하며 명예 전역했고') });
  assert(age(w, 'q').some(x => /21~22세/.test(x.conflict)));
});
test('생일을 지나거나 지나지 않았을 수 있는 봄·가을과 정확한 작전일의 올바른 나이는 통과한다', () => {
  for (const body of ['만 14세가 되던 1960년 봄', '만 16세이던 1962년 아나디르 작전 당시']) {
    const w = world({ p: person('안나 페트로바', '1946년 3월 13일', body) }, { events: [{ k: 'op', name: '아나디르 작전', date: '1962년 10월 24일', parts: ['p'], src: 'p' }] });
    assert.equal(age(w, 'p').length, 0);
  }
  const w = world({ p: person('안나 페트로바', '1946년 3월 13일', '만 15세이던 1962년 아나디르 작전 당시') }, { events: [{ k: 'op', name: '아나디르 작전', date: '1962년 10월 24일', parts: ['p'], src: 'p' }] });
  assert(age(w, 'p').some(x => /만 16세/.test(x.conflict)), '본문이 이름으로 가리킨 작전의 확정 날짜는 나이 계산에 쓴다');
  assert.equal(age(world({ p: person('폴리나 자하로바', '2001년 10월 24일', '2018년 가을 현재 만 16세') }), 'p').length, 0);
});
test('당시의 날짜가 여러 개이거나 다른 문단뿐이면 지적하지 않는다', () => {
  for (const body of ['1982년 전쟁과 1990년 전역 기록. 당시 15세이던 엘리자베스 해밀턴', '1982년 전쟁 기록.\n\n당시 15세이던 엘리자베스 해밀턴']) {
    assert.equal(age(world({ p: person('엘리자베스 해밀턴', '1965년 9월 17일'), q: doc('전쟁 기록', body) }), 'q').length, 0);
  }
});
test('사건 장부의 참가만으로 발현일을 귀속하지 않고 주체·행위가 확정된 기록만 쓴다', () => {
  const make = beats => world({ p: person('엘리너 레이놀즈', '1940년 5월 27일') }, { events: [{ k: 'shock', name: '비키니 쇼크', date: '1954년 3월 1일', parts: ['p'], src: 'p', beats }] });
  assert.equal(age(make([]), 'p').length, 0);
  assert(age(make([{ actor: '엘리너 레이놀즈', action: '60.2미터로 거체화하며 비키니 쇼크를 일으키다.' }]), 'p').length > 0);
});
test('정확한 생일·발현일의 하한과 상한, 생일 당일을 판정한다', () => {
  for (const [date, bad] of [['1954년 5월 26일', true], ['1954년 5월 27일', false], ['1960년 5월 26일', false], ['1960년 5월 27일', true]]) {
    const w = world({ p: person('엘리너 레이놀즈', '1940년 5월 27일', `엘리너 레이놀즈는 ${date} 거체화했다.`) });
    assert.equal(age(w, 'p').length > 0, bad, date);
  }
});
test('연도만 있는 발현·현역 시작은 가능한 만 나이 범위가 규칙과 겹치면 통과한다', () => {
  const p = person('엘리너 레이놀즈', '1940년 5월 27일', '', { infobox: [{ label: '출생', value: '1940년 5월 27일' }, { label: '현역 기간', value: '1960년 ~ 현재' }] });
  assert.equal(age(world({ p }), 'p').length, 0, '1960년에는 19세일 수도 있다');
});
test('월·일이 확정된 인포박스의 발현일도 생일 전후로 계산한다', () => {
  const p = person('엘리너 레이놀즈', '1940년 5월 27일'); p.infobox.push({ label: '발현일', value: '1954년 3월 1일' });
  assert(age(world({ p }), 'p').some(x => /13세/.test(x.conflict)));
});
test('나이 귀속이 다른 인물·가족·부정문·가정문이면 통과한다', () => {
  for (const body of ['1982년 당시 해밀턴의 모친은 15세였다.', '해밀턴은 1982년 만 15세가 아니었다.', '해밀턴이 1982년 15세였다면', '1982년 당시 다른 소녀는 15세였다.']) {
    assert.equal(age(world({ p: person('엘리자베스 해밀턴', '1965년 9월 17일'), q: doc('기록', body) }), 'q').length, 0, body);
  }
  for (const body of ['1982년 당시 동료는 만 15세였다.', '해밀턴은 1982년 15세의 동료를 도왔다.', '동료는 1982년 거체화했다.']) assert.equal(age(world({ p: person('엘리자베스 해밀턴', '1965년 9월 17일', body) }), 'p').length, 0, body);
});
test('인포박스에 없어도 명시적 주어의 퇴역 연도 1985년과 1987년을 대조한다', () => {
  const w = world({ p: person('엘리자베스 해밀턴', '1965년 9월 17일', '해밀턴은 만 20세 생일을 맞이하며 … 1985년 가을 명예 전역을 마쳤다.'), q: doc('퇴역 기록', '엘리자베스 해밀턴은 만 20세가 되던 1987년 정상 체격으로 복귀하며 명예 전역했고') });
  assert(c.numericIssues(w, 'q').some(x => /전역|퇴역/.test(x.conflict) && /1985/.test(x.conflict)));
  assert(c.numericIssues(w, 'p').some(x => x.target === 'q'));
});
test('전역 연도도 직접 수정한 문서를 우선하며 여러 연도·다른 주체·부정은 보류한다', () => {
  const p = person('엘리자베스 해밀턴', '', '해밀턴은 1985년 명예 전역했다.');
  const w = world({ p, q: doc('기록', '해밀턴은 1987년 명예 전역했다.', { editedAt: 3 }) });
  assert(c.numericIssues(w, 'p').some(x => x.severity === 'low' && !x.target));
  for (const body of ['해밀턴의 모친은 1987년 전역했다.', '해밀턴은 1987년 전역하지 않았다.', '해밀턴은 1985년 또는 1987년 전역했다.', '해밀턴이 이끈 부대는 1987년 퇴역했다.']) {
    assert.equal(c.numericIssues(world({ p, q: doc('기록', body) }), 'q').length, 0, body);
  }
});
test('전성기 전고 61.8m와 같은 단위인 명시적 주어의 신장 60.4미터만 대조한다', () => {
  const p = person('에린 설리번', '', '신장 61.8미터의 거체와 1,620mG/s에 달하는 고출력 중력 간섭 계수', { infobox: [{ label: '전성기 전고', value: '61.8m' }] });
  const q = doc('해상 작전', '신장 60.4미터의 설리번은 1,920mG/s의 간섭장을 전개하며');
  const w = world({ p, q, r: doc('포격', '설리번의 1,350mG/s 중력 간섭장에 전탄 굴절되었다.') });
  assert(c.numericIssues(w, 'q').some(x => /61\.8/.test(x.conflict) && /60\.4/.test(x.claim)));
  assert.equal(c.numericIssues(w, 'r').length, 0);
  for (const body of ['신장 60.4미터의 에린 설리번은 간섭장을 전개했다.', '에린 설리번은 신장 60.4미터였다.']) {
    assert(c.numericIssues(world({ p, q: doc('기록', body) }), 'q').length > 0, body);
  }
});
test('인포박스에 없는 영양액·계수, 다른 단위·수식어·다른 주체·신장 아닌 수치는 통과한다', () => {
  const p = person('폴리나 자하로바', '', '영양액을 매일 35톤씩 공급받으며', { infobox: [{ label: '전성기 전고', value: '61.8m' }] });
  for (const body of ['폴리나 자하로바는 매일 공급되는 42톤의 영양액을 소화하며', '폴리나 자하로바의 1,350mG/s 중력 간섭장에 전탄 굴절되었다.', '신장 6040cm의 폴리나 자하로바는 출격했다.', '신장 약 60.4미터의 폴리나 자하로바는 출격했다.', '폴리나 자하로바는 신장 60.4미터의 상대와 싸웠다.', '폴리나 자하로바는 전고 60.4미터의 기체를 조종했다.', '신장 60.4미터의 폴리나 자하로바가 아닌 다른 인물이었다.']) {
    assert.equal(c.numericIssues(world({ p, q: doc('기록', body) }), 'q').length, 0, body);
  }
});
test('작전 30건 중 같은 유형·분류 인물의 사건 4건을 새 문서 프롬프트에 우선 넣는다', () => {
  const w = world({ p: person('새 전략 소녀', '') }); w.entities.p.page = false;
  for (let i = 0; i < 30; i++) {
    const src = 's' + i, same = i >= 26, title = same ? '동료 ' + i : '함대 ' + i;
    c.S.pages[src] = same ? person(title, '', '', { createdAt: 100 + i }) : doc(title, '', { type: '조직', createdAt: 1 });
    w.entities[src] = c.newEntity(title, c.S.pages[src].type, '');
    w.events.push({ k: 'event' + i, name: '국적 불명 선박 저지 ' + i, kind: '작전', date: '1980년', place: '영해', parts: [src], result: '중력장으로 눌러 좌초 후 나포', src, createdAt: i });
  }
  const prompt = c.pagePrompt(w, 'p');
  for (let i = 26; i < 30; i++) assert(prompt.includes('국적 불명 선박 저지 ' + i), '같은 분류 사건 ' + i);
  assert(c.sameKindEvents(w, 'p').slice(0, 4).every(e => +e.src.slice(1) >= 26));
  assert(w.events.every(e => e.kind === '작전'));
  for (let i = 0; i < 60; i++) w.events.push({ ...w.events[0], k: 'other' + i, name: '다른 사건 ' + i, kind: '사고' });
  assert(c.sameKindEvents(w, 'p', [], '작전').every(e => +e.src.slice(1) < 26), '정확히 1/3이면 기존 순위를 유지한다');
});
const first = '비키니 쇼크로 전략 소녀 형질이 인류 역사상 최초로 관측되다.';
const second = '엘리너 레이놀즈가 비키니 환초에서 60.2미터로 거체화하며 비키니 쇼크를 일으키다.';
const third = '비키니 환초에서 발생한 비키니 쇼크의 여파로 일본 정부가 특수신체관리부를 설치하고 … 조사를 개시하다.';
function bikini() {
  const w = world({ p: person('엘리너 레이놀즈', ''), j: doc('일본 정부', '', { type: '국가' }), e: doc('비키니 쇼크', '') });
  w.events = [{ k: 'e', name: '비키니 쇼크', date: '1954년 3월 1일', parts: ['p'], src: 'p' }]; return w;
}
const item = (event, about, extra = {}) => ({ year: '1954', month: 3, day: 1, event, about, ...extra });
test('같은 날짜·장부 사건의 발생은 주어가 달라도 연표에 한 건만 받는다', () => {
  const w = bikini(); assert(c.acceptTimeline(w, item(first, '비키니 쇼크'), 'seed'));
  assert.equal(c.acceptTimeline(w, item(second, '엘리너 레이놀즈'), 'p'), false);
  assert(c.acceptTimeline(w, item(third, '일본 정부'), 'j')); assert.equal(w.timeline.length, 2);
});
test('날짜 불명·다른 날짜·다른 사건·후속 행위·불확실한 서술은 중복으로 지우지 않는다', () => {
  for (const t of [item(second, '엘리너 레이놀즈', { day: 2 }), item(second, '엘리너 레이놀즈', { month: undefined }), item('엘리너 레이놀즈가 비키니 쇼크를 계기로 군에 입대하다.', '엘리너 레이놀즈'), item('엘리너 레이놀즈가 비키니 쇼크를 조사하다.', '엘리너 레이놀즈'), item('엘리너 레이놀즈가 비키니 쇼크의 피해를 관측하다.', '엘리너 레이놀즈')]) {
    const w = bikini(); c.acceptTimeline(w, item(first, '비키니 쇼크'), 'seed'); assert(c.acceptTimeline(w, t, 'p'), t.event);
  }
});
test('기존 중복은 세계를 열 때 한 번 정리하고 원안·직접 수정한 출처를 우선 보존한다', async () => {
  for (const preferred of ['seed', 'edited']) {
    const w = bikini(); c.S.pages.e.editedAt = preferred === 'edited' ? 10 : undefined;
    w.timeline = [item(second, '엘리너 레이놀즈', { src: 'p' }), item(first, '비키니 쇼크', { src: preferred === 'seed' ? 'seed' : 'e' }), item(third, '일본 정부', { src: 'j' })];
    const pages = c.S.pages; let saves = 0;
    c.Store.listPages = async () => pages; c.Store.saveWorld = async () => { saves++; };
    c.S.worlds = [w]; c.S.sample = null;
    vm.runInContext('renderAll=()=>{};openEntity=()=>{};afterTimeline=()=>{};autoMerge=async()=>0;cleanChapterTitles=async()=>0;cleanAiSupersede=async()=>0;fixOldAngles=()=>false;dedupeRelations=()=>false;sortTimeline=()=>false;', c);
    await c.openWorld(w.id); assert.equal(w.timeline.length, 2); assert(w.timeline.some(t => t.event === first)); assert.equal(saves, 1);
    await c.openWorld(w.id); assert.equal(w.timeline.length, 2); assert.equal(saves, 1);
  }
});
(async () => {
  for (const [name, fn] of tests) try { await fn(); console.log(`  ✓ ${++n}. ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack}`); }
  console.log(`\n${n}/${n + failed} 통과 · AI 호출 0회`); process.exitCode = failed ? 1 : 0;
})();
