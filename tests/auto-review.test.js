/* 자동 메모 처리: 모델 판정을 가짜 응답으로 제공하고 실제 반복·원문 적용·종료 상태를 검증한다. */
const assert = require('node:assert/strict'), vm = require('node:vm');
const { appSource } = require('./helpers/app');
const html = appSource(), source = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('"use strict";\n/* 시작 */'));
function setup() {
  const node = { addEventListener() {} };
  const c = { console, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance,
    setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { hidden: false, getElementById() { return null; }, querySelector() { return node; }, addEventListener() {} },
    window: node, navigator: {}, location: { hash: '', pathname: '/', search: '' }, history: {} };
  vm.createContext(c);
  vm.runInContext(source + '\nObject.assign(globalThis,{S,keyOf,newEntity,preCheck,detIssues,refreshNumeric,memoSourceStamp,parseIssues,mergeIssues}); Store.savePage=async()=>{};', c);
  const k = c.keyOf('항구 기록'), p = { key: k, title: '항구 기록', type: '지명', summary: '', infobox: [], categories: [], links: [], createdAt: 1,
    sections: [{ heading: '개요', level: 1, body: '항구는 2010년에 열렸다. 부두는 2011년에 확장되었다.' }] };
  const w = { id: 'auto', kind: 'world', title: '시험', seed: '가상', era: '2020년', mainKey: k, rules: [], timeline: [], events: [], relations: [], entities: { [k]: { ...c.newEntity(p.title, p.type, ''), page: true } } };
  c.S.world = w; c.S.pages = { [k]: p };
  const actualDetIssues = c.detIssues;
  c.detIssues = () => [];
  const g = { ctl: new AbortController() };
  const run = () => c.preCheck(w, k, c.S.pages[k], g, () => {});
  return { c, k, p, w, g, run, actualDetIssues };
}
const issue = (claim, extra = {}) => ({ claim, conflict: '기준 기록과 맞춘다.', severity: 'low', ...extra });
const tests = [], test = (name, fn) => tests.push([name, fn]);
test('참고·advisory 메모도 자동 수정하며 일부만 고쳤으면 나머지 번호를 다시 보낸다', async () => {
  const { c, k, run } = setup(); let calls = 0;
  c.runChecks = async () => [issue('2010년에 열렸다.', { advisory: true }), issue('2011년에 확장되었다.')];
  c.callJson = async (kind, prompt) => {
    assert.equal(kind, 'fix'); calls++;
    if (calls === 1) return { edits: [{ memo: 1, field: 'body', old: '2010년에 열렸다.', new: '2012년에 열렸다.' }] };
    assert.ok(prompt.includes('2012년에 열렸다.'));
    assert.ok(prompt.includes('1. 문서의 서술: 2011년에 확장되었다.'));
    assert.ok(!prompt.includes('문서의 서술: 2010년에 열렸다.'));
    return { edits: [{ memo: 1, field: 'body', old: '2011년에 확장되었다.', new: '2013년에 확장되었다.' }] };
  };
  const result = await run();
  assert.equal(calls, 2); assert.equal(result.fixed, 2); assert.equal(result.page.check.issues.length, 0);
  assert.equal(c.S.pages[k].check.incomplete, false);
});
test('오탐은 원문 변경 없이 닫고 이미 해결됐다는 응답도 처리한다', async () => {
  const { c, p, run } = setup(), before = JSON.stringify(p.sections);
  c.runChecks = async () => [issue('2010년에 열렸다.'), issue('2011년에 확장되었다.')];
  c.callJson = async () => ({ edits: [], dismissed: [{ memo: 1, reason: '원문의 대상과 근거의 대상이 다르다.' }], resolved: [2] });
  const result = await run();
  assert.equal(result.done, true); assert.equal(result.fixed, 0); assert.equal(result.page.check.issues.length, 0);
  assert.equal(JSON.stringify(result.page.sections), before);
  assert.equal(result.page.check.closedMemos.length, 2);
});
test('원문 불일치 수정안을 해결됐다는 응답으로 닫지 않고 재호출한다', async () => {
  const { c, run } = setup(); let calls = 0;
  c.runChecks = async () => [issue('2010년에 열렸다.')];
  c.callJson = async () => ++calls === 1
    ? { edits: [{ memo: 1, field: 'body', old: '원문에 없는 구절', new: '2012년' }], resolved: [1] }
    : { edits: [{ memo: 1, field: 'body', old: '2010년에 열렸다.', new: '2012년에 열렸다.' }] };
  const result = await run();
  assert.equal(calls, 2); assert.equal(result.fixed, 1); assert.equal(result.page.check.issues.length, 0);
});
test('모델이 구체적 이유를 붙인 구조적 해결 불가만 남긴다', async () => {
  const { c, run } = setup();
  c.runChecks = async () => [issue('2010년에 열렸다.'), issue('2011년에 확장되었다.')];
  c.callJson = async () => ({ edits: [{ memo: 1, field: 'body', old: '2010년에 열렸다.', new: '2012년에 열렸다.' }],
    blocked: [{ memo: 2, kind: 'structural', reason: '서로 양립할 수 없는 사용자 확정 설정 두 개를 현재 문서에서 바꿀 수 없다.' }] });
  const result = await run();
  assert.equal(result.done, true); assert.equal(result.page.check.issues.length, 1);
  assert.equal(result.page.check.issues[0].blocked, true);
  assert.ok(result.page.check.issues[0].conflict.includes('구조적 해결 불가:'));
});
test('판정 종류나 이유가 빠진 해결 불가 응답은 그대로 남기지 않고 다시 처리한다', async () => {
  const { c, run } = setup(); let calls = 0;
  c.runChecks = async () => [issue('2010년에 열렸다.')];
  c.callJson = async () => ++calls === 1 ? { edits: [], blocked: [{ memo: 1, reason: '어렵다.' }] }
    : { edits: [], dismissed: [{ memo: 1, reason: '다른 시점의 기록을 같은 시점으로 잘못 비교했다.' }] };
  assert.equal((await run()).page.check.issues.length, 0); assert.equal(calls, 2);
});
test('응답 오류는 미완료 초안으로 보존하고 재개하면 남은 메모를 처리한다', async () => {
  const { c, k, run } = setup();
  c.runChecks = async () => [issue('2010년에 열렸다.')];
  c.callJson = async () => { throw { code: 'api_524' }; };
  await assert.rejects(run, e => e.code === 'api_524');
  assert.equal(c.S.pages[k].check.incomplete, true);
  assert.equal(c.S.pages[k].check.pending.length, 1); assert.equal(c.S.pages[k].check.issues.length, 0);
  c.runChecks = async () => [];
  c.callJson = async () => ({ edits: [], resolved: [1] });
  const result = await run();
  assert.equal(result.done, true); assert.equal(result.page.check.incomplete, false);
  assert.equal(result.page.check.pending.length, 0); assert.equal(result.page.check.error, undefined);
});
test('빈 응답은 세 번 뒤 중단하고 진단·미완료 메모를 보존하며 재개할 수 있다', async () => {
  const { c, k, run } = setup(); let calls = 0;
  c.runChecks = async () => [issue('2010년에 열렸다.')];
  c.callJson = async () => { calls++; return { edits: [] }; };
  await assert.rejects(run, e => e.code === 'review_stalled');
  const check = c.S.pages[k].check;
  assert.equal(calls, 3); assert.equal(check.incomplete, true);
  assert.equal(check.issues.length, 0); assert.equal(check.pending.length, 1);
  assert.equal(check.reviewDiagnostics.stopReason, 'no_progress');
  assert.equal(check.reviewDiagnostics.rounds.length, 3);
  assert.equal(check.reviewDiagnostics.rounds[2].response, '{"edits":[]}');
  assert.deepEqual(Array.from(check.reviewDiagnostics.rounds[2].unprocessed), [1]);
  c.runChecks = async () => [];
  c.callJson = async () => ({ edits: [], resolved: [1] });
  const result = await run();
  assert.equal(result.done, true); assert.equal(result.page.check.pending.length, 0);
  assert.equal(result.page.check.errorCode, undefined);
});
test('원문 불일치를 반복하면 실패 이유와 모델 수정안을 남기고 중단한다', async () => {
  const { c, run } = setup();
  c.runChecks = async () => [issue('2010년에 열렸다.')];
  c.callJson = async () => ({ edits: [{ memo: 1, field: 'body', old: '없는 구절', new: '새 구절' }] });
  await assert.rejects(run, e => e.code === 'review_stalled');
  const d = c.S.pages[Object.keys(c.S.pages)[0]].check.reviewDiagnostics;
  assert(d.rounds[2].failures.some(x => x.includes('old')));
  assert(d.rounds[2].response.includes('없는 구절'));
});
for (const cycle of [true, false]) test(cycle ? '문서와 메모가 이전 상태를 반복하면 중단한다' : '문서만 계속 바뀌고 메모가 남으면 총 회수 제한으로 중단한다', async () => {
  const { c, k, run } = setup(); let calls = 0;
  c.runChecks = async () => [issue('2010년에 열렸다.')];
  c.callJson = async () => ({ edits: [] });
  c.applyAutoEdits = (w, key, page, batch) => {
    page.sections[0].body = cycle ? (calls++ % 2 ? '상태 A' : '상태 B') : '상태 ' + calls++;
    return { page, patched: true, edited: [], fresh: [], failures: [] };
  };
  await assert.rejects(run, e => e.code === 'review_stalled');
  const d = c.S.pages[k].check.reviewDiagnostics;
  assert.equal(d.stopReason, cycle ? 'repeated_state' : 'round_limit');
  assert.equal(calls, cycle ? 5 : 12);
  assert.equal(c.S.pages[k].check.pending.length, 1);
});
test('8개보다 많은 메모도 배치 사이에 빠뜨리지 않는다', async () => {
  const { c, run } = setup(); let calls = 0;
  c.runChecks = async () => c.mergeIssues(c.parseIssues({ issues: Array.from({ length: 12 }, (_, i) => issue('메모 ' + i)) }));
  c.callJson = async (kind, prompt) => {
    calls++; const n = [...prompt.matchAll(/^\d+\. 문서의 서술:/gm)].length;
    return { edits: [], resolved: Array.from({ length: n }, (_, i) => i + 1) };
  };
  const result = await run();
  assert.equal(calls, 2); assert.equal(result.page.check.closedMemos.length, 12);
  assert.equal(result.page.check.issues.length, 0);
});
test('수정 응답 대기 중 취소하면 원문을 바꾸지 않는다', async () => {
  const { c, p, g, run } = setup(), before = JSON.stringify(p.sections);
  c.runChecks = async () => [issue('2010년에 열렸다.')];
  c.callJson = async () => { g.ctl.abort(); return { edits: [{ memo: 1, field: 'body', old: '2010년', new: '2012년' }] }; };
  await assert.rejects(run, e => e.code === 'cancelled');
  assert.equal(JSON.stringify(p.sections), before);
});
test('오탐 판정한 코드 지적은 같은 원문에서 재생성하지 않고 원문이 바뀌면 다시 검사한다', async () => {
  const { c, k, run, actualDetIssues } = setup(), i = issue('2010년에 열렸다.', { by: 'num', issueKey: 'sample' });
  c.__issue = i; vm.runInContext('detIssuesInContext=()=>[__issue];', c);
  c.detIssues = actualDetIssues;
  c.runChecks = async () => [i];
  c.callJson = async () => ({ edits: [], dismissed: [{ memo: 1, reason: '코드가 비교 대상을 잘못 묶었다.' }] });
  const result = await run();
  // setup의 detIssues 대체를 해제한 실제 래퍼를 호출한다.
  const actual = vm.runInContext('withNameCheckContext(S.world,()=>detIssuesInContext(S.world,S.pages[Object.keys(S.pages)[0]].key))', c);
  assert.equal(actual.length, 1); assert.equal(result.page.check.closedMemos.length, 1);
  assert.equal(vm.runInContext('detIssues(S.world,Object.keys(S.pages)[0]).length', c), 0);
  c.S.pages[k].sections[0].body += ' 문서의 상태가 바뀌었다.';
  assert.equal(vm.runInContext('detIssues(S.world,Object.keys(S.pages)[0]).length', c), 1);
});
(async () => { let failed = 0; for (const [name, fn] of tests) { try { await fn(); console.log('통과', name); } catch (e) { failed++; console.error('실패', name, e); } } if (failed) process.exitCode = 1; })();
