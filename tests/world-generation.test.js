/* 세계관 분할 생성·형식 복구·실패 단계 재시도. 실제 유료 API 호출 없음. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');

(async () => {
  const server = appServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.route('https://fonts.gstatic.com/**', r => r.abort());
    await page.route('**/v1beta/**', () => { throw Error('External AI calls are forbidden'); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => S.ready);
    await page.evaluate(() => {
      GS.pass = 'fake'; GS.serverJobs = false; S.sample = gemini;
      checkTimelineAtCreate = async () => {};
      afterTimeline = () => {};
      openWorld = async id => { S.world = S.worlds.find(w => w.id === id); S.pages = {}; S.view = { name: 'canon' }; renderAll(); };
      window.ctl = {}; window.calls = [];
      window.resetCreation = (mode = 'basic') => {
        S.mode = mode; S.view = { name: 'home' }; S.seed = '작은 항구에서 이웃들이 축제를 준비하는 세계이다.';
        S.first = mode === 'story' ? '한서린' : '항구'; S.guideIn = '따뜻한 분위기를 유지한다.';
        S.regen = null; S.createDraft = null; S.createErr = null; S.storyN = 10;
        S.protoDesc = '고향에 돌아온 선원'; S.cast = [{ name: '윤가람', desc: '도서관 사서', rel: '친구' }];
        calls.length = 0; window.ctl = {}; renderAll();
      };
      gemini.stream = async (model, body, opts, prefix) => {
        const prompt = body.contents[0].parts.map(p => p.text).join('');
        const part = /## 단계별 세계관 생성: (\w+)/.exec(prompt)?.[1], repair = prompt.includes('## 응답 형식 복구');
        calls.push({ part, repair, prompt, prefix, kind: opts.taskKind, recovery: opts.recoveryTarget });
        const overview = { title: '항구 세계', mainTitle: S.first, era: '2030년', historical: false, rules: ['항구에서는 누구나 축제에 참여한다.'], tone: { label: '일상', guide: ['따뜻한 어휘를 쓴다.'] }, calendars: [], undatedCalendars: [] };
        const stage = { stage: { units: [{ name: '항구 도서관', kind: '조직', desc: '이웃이 모이는 곳', rel: '축제 준비를 돕는다' }], now: '항구 도서관에서 축제를 준비한다.', parties: [] }, title: '덮어쓰면 안 되는 이름', rules: ['덮어쓰면 안 되는 규칙'] };
        const answers = { overview, stage, timeline: { timeline: [{ year: '2029', month: 3, day: 14, event: '항구 도서관이 문을 열었다.' }] },
          storyPlan: { protagonist: { summary: '고향에 돌아온 선원', want: '친구와 축제 준비', wound: '' }, storyPromise: { focus: '이웃과 재회하는 이야기', central: { kind: 'relationship', subject: '친구와 다시 가까워지는 일' } }, spine: beatsFor(10).map((beat, i) => ({ n: i + 1, beat, intent: '이웃과의 관계를 이어간다.' })), secrets: [] },
          chapter1: { chapter1: { title: '귀향', era: '2030년', summary: '한서린이 귀향해 윤가람과 축제를 준비한다.', incident: '축제 준비를 부탁받는다.', nextChoices: ['돕는다', '이웃을 만난다', '배를 살핀다'] } } };
        if (repair && ctl.holdRepair) await new Promise(r => { window.releaseRepair = r; });
        if (part === ctl.networkFailure) throw { code: 'upstream_error', serverJob: true, message: '가짜 연결 중단' };
        let text = JSON.stringify(answers[part]), finish = 'STOP';
        if (part === ctl.truncate) {
          const full = JSON.stringify({ stage: { ...stage.stage, now: Array.from({ length: 20 }, (_, i) => `${i + 1}번째 이웃이 축제를 준비한다.`).join(' ') } });
          if (!prefix) { text = full.slice(0, 350); finish = 'MAX_TOKENS'; }
          else text = full.slice(318); // 겹친 32글자를 제거하고 이어 붙여야 한다.
        }
        if (part === ctl.badPart && (!repair || ctl.badRepair)) text = JSON.stringify(answers[part]).replace(/}$/, ',}');
        opts.onText?.({ text: (prefix || '') + text });
        return { text, finish, usage: { promptTokenCount: 100, candidatesTokenCount: 50 } };
      };
      resetCreation(); ctl.badPart = 'stage'; ctl.holdRepair = true; window.creatingTask = createWorld();
    });
    await page.waitForFunction(() => !!window.releaseRepair);
    assert.match(await page.locator('[role="status"]').innerText(), /2\/3.*형식 복구/);
    assert.match(await page.locator('[data-world-completed]').innerText(), /개요와 핵심 규칙/);
    await page.evaluate(async () => { await createWorld(); releaseRepair(); await creatingTask; });
    let result = await page.evaluate(() => ({ w: S.world, calls, draft: S.createDraft, err: S.createErr }));
    assert.equal(result.err, null);
    assert.equal(result.draft, null);
    assert.deepEqual(result.calls.map(c => [c.part, c.repair]), [['overview', false], ['stage', false], ['stage', true], ['timeline', false]]);
    assert.equal(result.w.title, '항구 세계'); assert.deepEqual(result.w.rules, ['항구에서는 누구나 축제에 참여한다.']);
    assert(result.calls[3].prompt.includes('항구 도서관'));
    assert(result.calls.every(c => c.kind === 'bible' && c.recovery.wid === ''));
    assert(!result.calls[0].prompt.includes('"title":"세계관 이름(2~20자)"'), '기존 전체 출력 스키마는 단계 요청에 포함하지 않는다');

    // 다시 만들기가 중간에 실패하면 기존 세계관과 문서를 보존한다.
    await page.evaluate(async () => {
      resetCreation(); const w = S.world;
      await Store.savePage(w.id, { key: w.mainKey, title: '기존 문서', sections: [] });
      S.regen = { wid: w.id, title: w.title, keep: false };
      ctl.badPart = 'stage'; ctl.badRepair = true; await createWorld();
    });
    result = await page.evaluate(async () => ({ done: S.createDraft.done, calls, wid: S.world.id, pages: await Store.listPages(S.world.id), costId: S.createDraft.costSession.id, rows: S.createDraft.costSession.rows.length }));
    assert.deepEqual(result.done, ['overview']); assert.equal(result.rows, 3);
    assert(Object.keys(result.pages).length === 1);
    assert.match(await page.locator('[role="alert"]').innerText(), /주요 무대와 현재 상황 단계/);
    assert(!await page.locator('[role="alert"]').innerText().then(t => t.includes('방향을 정해 작성')));
    const costId = result.costId, originalId = result.wid;
    await page.evaluate(() => { ctl.badPart = ''; });
    await page.click('[data-act="create-retry"]');
    await page.waitForFunction(() => !S.creating && !S.createErr);
    result = await page.evaluate(async () => ({ calls, w: S.world, pages: await Store.listPages(S.world.id), cost: DocumentCost.creation }));
    assert.equal(result.calls.filter(c => c.part === 'overview').length, 1, '완료된 개요를 다시 생성하지 않는다');
    assert.equal(result.w.id, originalId); assert.equal(Object.keys(result.pages).length, 0);
    assert.equal(result.cost.id, costId); assert.equal(result.cost.rows.length, 5); assert(result.cost.finished);

    // 원안이 바뀌면 이전 초안을 섞지 않고 개요부터 새로 시작한다.
    await page.evaluate(async () => { resetCreation(); ctl.networkFailure = 'timeline'; await createWorld(); });
    assert.deepEqual(await page.evaluate(() => S.createDraft.done), ['overview', 'stage']);
    await page.fill('#seedTa', '다른 섬의 주민들이 도서관 개관을 준비하는 새 원안이다.');
    await page.evaluate(async () => { ctl.networkFailure = ''; await createWorld(); });
    assert.equal(await page.evaluate(() => calls.filter(c => c.part === 'overview').length), 2);
    assert.equal(await page.evaluate(() => S.world.seed), '다른 섬의 주민들이 도서관 개관을 준비하는 새 원안이다.');

    // 출력 한도에서 잘린 현재 단계는 기존 이어 받기를 사용한다.
    await page.evaluate(async () => { resetCreation(); ctl.truncate = 'stage'; await createWorld(); });
    result = await page.evaluate(() => ({ calls, err: S.createErr, now: S.world.stage.now }));
    assert.equal(result.err, null); assert.equal(result.calls.filter(c => c.part === 'stage').length, 2);
    assert(result.calls.some(c => c.prefix)); assert(!result.calls.some(c => c.repair));
    assert.equal(result.now, Array.from({ length: 20 }, (_, i) => `${i + 1}번째 이웃이 축제를 준비한다.`).join(' '));

    // 스토리 모드도 사용자 입력과 전체 장 수를 유지해 모든 단계를 합친다.
    await page.evaluate(async () => { resetCreation('story'); await createWorld(); });
    result = await page.evaluate(() => ({ calls, w: S.world, err: S.createErr }));
    assert.equal(result.err, null);
    assert.deepEqual(result.calls.map(c => c.part), ['overview', 'storyPlan', 'chapter1', 'timeline']);
    assert(result.calls.every(c => c.kind === 'storyBible' && c.prompt.includes('윤가람') && c.prompt.includes('고향에 돌아온 선원')));
    assert.equal(result.w.story.total, 10); assert.equal(result.w.story.spine.length, 10);
    assert.equal(result.w.story.chapters[0].summary, '한서린이 귀향해 윤가람과 축제를 준비한다.');
    assert.equal(result.w.story.cast[0].name, '윤가람'); assert.equal(result.w.timeline.length, 1);
    assert.deepEqual(errors, []);
    console.log('✓ 분할 생성, 형식 복구, 중복 실행 방지, 기존 문서 보호, 실패 단계 재시도와 비용 합산, 입력 변경, 잘린 응답 이어 받기, 스토리 10장 보존');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
