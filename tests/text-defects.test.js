/* 텍스트 결함 결정론 검사와 직접 수정 전파. AI·외부 데이터는 쓰지 않는다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
const node = { addEventListener() {} }, local = new Map();
const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  document: { hidden: false, getElementById: () => null, querySelector: () => node, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
vm.createContext(c);
vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,textIssues,detIssues,editPropagation,isNumIssue});', c);
const page = (title, body, extra = {}) => ({ key: c.keyOf(title), title, type: '인물', summary: '', categories: [], infobox: [], sections: [{ heading: '생애', level: 1, body }], links: [], createdAt: 1, ...extra });
function world(list, extra = {}) {
  const pages = {}, w = { id: 't', kind: 'world', title: '시험 세계', era: '2017년', seed: '가상의 세계', rules: [], timeline: [], events: [], entities: {}, ...extra };
  for (const p of list) { pages[p.key] = p; w.entities[p.key] = { ...c.newEntity(p.title, p.type, p.summary), page: true }; }
  w.mainKey = list[0].key; c.S.pages = pages; c.S.world = w; return w;
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const issues = (w, title, text) => c.textIssues(w, c.keyOf(title)).filter(i => !text || i.conflict.includes(text));

test('세계관에 없는 문자 체계가 섞인 문장을 잡는다', () => {
  const w = world([page('들라크루아', '공영 방송사 فرانس 텔레비지옹이 생중계했다.')]);
  const r = issues(w, '들라크루아', '아랍 문자');
  assert.equal(r.length, 1); assert.equal(r[0].severity, 'high'); assert.match(r[0].claim, /텔레비지옹/); assert.ok(c.isNumIssue(r[0]));
});
test('괄호 안 원어 병기와 원안에 쓰인 문자는 허용한다', () => {
  assert.equal(issues(world([page('모스크바 시민', '그는 모스크바(Москва)에서 태어났다.')]), '모스크바 시민').length, 0);
  assert.equal(issues(world([page('도쿄 시민', '그는 さくら 거리에서 자랐다.')], { seed: '일본 배경. 거리 이름은 さくら처럼 가나로 쓴다.' }), '도쿄 시민').length, 0);
});
test('낱말 끝 음절이 겹쳐 찍힌 곳을 잡고 의성어는 두지 않는다', () => {
  const w = world([page('체르넨코', '거대한 몸통통통이 해저 펄을 때렸다. 포탄이 쿵쿵쿵 떨어졌다.')]);
  const r = issues(w, '체르넨코', '반복');
  assert.equal(r.length, 1); assert.match(r[0].claim, /몸통통통/);
});
test('다른 인물의 이름을 표시명으로 쓴 링크를 잡는다', () => {
  const w = world([page('헤인즈', '참모총장 [[아서 래드포드|존 P. 맥케이브]] 제독이 명령했다.')]);
  w.entities[c.keyOf('아서 래드포드')] = c.newEntity('아서 래드포드', '인물', '해군 제독');
  assert.equal(issues(w, '헤인즈', '겹치지 않는다').length, 1);
});
test('다른 항목의 제목을 표시명으로 쓴 링크를 잡는다', () => {
  const w = world([page('헤인즈', '[[아서 래드포드|존 맥케이브]]가 왔다.'), page('존 맥케이브', '해군 장교다.')]);
  w.entities[c.keyOf('아서 래드포드')] = c.newEntity('아서 래드포드', '인물', '해군 제독');
  assert.equal(issues(w, '헤인즈', '다른 항목').length, 1);
});
test('이명·성·호출부호 표시명은 지적하지 않는다', () => {
  const w = world([page('보고서', '[[조슬린 앤 케인|인디펜던스]]와 [[조슬린 앤 케인|케인 중위]], [[마가렛 헤인즈|리버티]]가 나섰다.'),
    page('마가렛 헤인즈', '해군 전략 소녀다.', { infobox: [{ label: '호출부호', value: '[[리버티]]' }] }), page('조슬린 앤 케인', '해군 전략 소녀다.')]);
  w.entities[c.keyOf('리버티')] = c.newEntity('리버티', '', '');
  assert.equal(JSON.stringify(issues(w, "보고서").map(i => i.conflict)), "[]");
});
test('텍스트 결함은 결정론 지적에 포함된다', () => {
  const w = world([page('체르넨코', '거대한 몸통통통이 해저 펄을 때렸다.', { infobox: [{ label: '성별', value: '여성' }] })]);
  assert.ok(c.detIssues(w, c.keyOf('체르넨코')).some(i => /텍스트 검사/.test(i.conflict)));
});
test('직접 수정으로 바뀐 이름이 같은 문맥의 다른 문서에 남으면 수정 요청을 만든다', () => {
  const before = page('카리브 위기', '1962년 [[카리브 전략소녀 위기]] 당시 미 해군은 [[네바다]]를 아바나 외항에 보냈다.', { type: '사건' });
  const after = { ...before, sections: [{ heading: '생애', level: 1, body: '1962년 [[카리브 전략소녀 위기]] 당시 미 해군은 [[리버티]]를 아바나 외항에 보냈다.' }] };
  const us = page('미국', '미국은 1962년 카리브 전략소녀 위기 때 네바다를 쿠바 앞바다에 파견했다. 네바다는 1954년 비키니 환초에서 발현했다.', { type: '국가' });
  const other = page('비키니 환초', '1954년 네바다가 이곳에서 발현했다.', { type: '지명' });
  const w = world([before, us, other]);
  for (const t of ['네바다', '리버티', '카리브 전략소녀 위기']) w.entities[c.keyOf(t)] ||= c.newEntity(t, '', '');
  const hits = c.editPropagation(w, before.key, before, after);
  assert.equal(hits.length, 1); assert.equal(hits[0].target, us.key); assert.match(hits[0].old, /카리브/); assert.match(hits[0].claim, /네바다.*리버티/);
});
test('값이 그대로면 전파하지 않는다', () => {
  const before = page('카리브 위기', '1962년 미 해군은 [[네바다]]를 보냈다.', { type: '사건' });
  const after = { ...before, sections: [{ heading: '생애', level: 1, body: '1962년 10월 미 해군은 [[네바다]]를 서둘러 보냈다.' }] };
  const w = world([before, page('미국', '1962년 네바다를 보냈다.', { type: '국가' })]);
  assert.equal(c.editPropagation(w, before.key, before, after).length, 0);
});
let failed = 0;
for (const [name, fn] of tests) { try { fn(); console.log('통과', name); } catch (e) { failed++; console.log('실패', name, '\n', e.message); } }
if (failed) process.exit(1);
