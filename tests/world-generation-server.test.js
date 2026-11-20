/* 브라우저 → 실제 Worker 접수·큐·결과 수신 경로. 외부 AI 응답만 가짜로 제공한다. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
const { serverRelay } = require('./helpers/server-relay');

(async () => {
  const server = appServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  let closeRelay;
  try {
    const context = await browser.newContext(), page = await context.newPage();
    const errors = [], submissions = [], providerCalls = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {
      if (r.method() === 'POST' && r.url().endsWith('/api/jobs')) submissions.push(JSON.parse(r.postData()));
    });
    await context.route('https://fonts.googleapis.com/**', r => r.abort());
    await context.route('https://fonts.gstatic.com/**', r => r.abort());
    await context.route('**/v1beta/**', () => { throw Error('Browser must use server jobs'); });
    closeRelay = await serverRelay(context, async route => {
      assert(route.request().url().startsWith('https://generativelanguage.googleapis.com/'));
      const body = JSON.parse(route.request().postData());
      const prompt = body.contents[0].parts.map(p => p.text).join('');
      const part = /## 단계별 세계관 생성: (\w+)/.exec(prompt)?.[1];
      providerCalls.push(part);
      const answers = {
        overview: { title: '항구 세계', tagline: '이웃의 이야기', mainTitle: '한서린', era: '2030년', historical: false, rules: ['항구에서는 누구나 축제에 참여한다.'], calendars: [], undatedCalendars: [], tone: { label: '일상', guide: ['따뜻한 어휘를 쓴다.'] } },
        stage: { stage: { units: [{ name: '항구 도서관', kind: '조직', desc: '이웃이 모이는 곳', rel: '축제 준비를 돕는다' }], now: '항구 도서관에서 축제를 준비한다.', parties: [] } },
        timeline: { timeline: [{ year: '2029', month: 3, day: 14, event: '항구 도서관이 문을 열었다.' }] },
        storyPlan: { protagonist: { summary: '고향에 돌아온 선원', want: '축제 준비', wound: '' }, storyPromise: { focus: '이웃과의 재회', central: { kind: 'relationship', subject: '친구와 다시 가까워지는 일' } }, spine: ['발단', '전개', '위기', '절정', '결말'].map((beat, i) => ({ n: i + 1, beat, intent: '이웃과의 관계를 이어간다.' })), secrets: [] },
        chapter1: { chapter1: { title: '귀향', era: '2030년', summary: '한서린이 귀향해 이웃과 축제를 준비한다.', incident: '축제 준비를 부탁받는다.', nextChoices: ['돕는다', '이웃을 만난다', '배를 살핀다'] } },
      };
      assert(answers[part], `Unexpected AI call: ${part}`);
      await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(answers[part]) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => S.ready);
    await page.evaluate(() => {
      GS.pass = 'test-pass'; GS.relay = 'https://relay.test'; GS.serverJobs = true;
      Sync.acct = { id: 'tester', token: 'session-test' }; Sync.mark = () => {};
      checkTimelineAtCreate = async () => {}; afterTimeline = () => {};
      openWorld = async id => { S.world = S.worlds.find(w => w.id === id); S.pages = {}; S.view = { name: 'canon' }; renderAll(); };
      S.mode = 'basic'; S.view = { name: 'home' }; S.seed = '작은 항구에서 이웃들이 축제를 준비하는 세계이다.'; S.first = '항구';
      // 이전 변경의 메타데이터를 그대로 보내 보고, 실제 서버의 거절을 재현한다.
      S.sample = { json: (prompt, opts) => gemini.json(prompt, { ...opts, jobMeta: { ...opts.jobMeta, worldPart: 'overview' } }) };
    });
    await page.evaluate(() => createWorld());
    const rejection = await page.locator('[role="alert"]').innerText();
    assert.match(rejection, /개요와 핵심 규칙 단계/);
    assert.match(rejection, /작업 복구 정보를 확인해 주세요/);
    assert.match(rejection, /job_api/); assert.match(rejection, /HTTP 400/);
    assert.equal(providerCalls.length, 0, '접수 거절된 요청은 AI를 실행하지 않는다');
    assert.equal(submissions.length, 1, '확정된 거절을 자동으로 반복하지 않는다');
    assert.deepEqual(await page.evaluate(() => S.createDraft.done), []);
    const rejectedId = submissions[0].id;
    assert.equal(await page.evaluate(id => AIJobs.receipts().find(r => r.id === id).status, rejectedId), 'rejected');

    // 새 서버 필드를 추가하지 않은 상태로 같은 단계부터 다시 시작한다.
    await page.evaluate(() => { S.sample = gemini; });
    await page.click('[data-act="create-retry"]');
    await page.waitForFunction(() => !S.creating);
    assert.equal(await page.evaluate(() => S.createErr), null);
    assert.deepEqual(providerCalls, ['overview', 'stage', 'timeline']);
    let result = await page.evaluate(async () => ({ w: S.world, stored: await Store.getWorld(S.world.id), draft: S.createDraft }));
    assert.equal(result.w.title, '항구 세계'); assert.equal(result.stored.stage.units[0].name, '항구 도서관');
    assert.equal(result.stored.timeline.length, 1); assert.equal(result.draft, null);

    await page.evaluate(async () => {
      S.mode = 'story'; S.storyN = 5; S.view = { name: 'home' }; S.seed = '항구로 돌아온 선원이 이웃과 함께 축제를 준비하는 이야기이다.'; S.first = '한서린';
      await createWorld();
    });
    assert.equal(await page.evaluate(() => S.createErr), null);
    assert.deepEqual(providerCalls.slice(3), ['overview', 'storyPlan', 'chapter1', 'timeline']);
    result = await page.evaluate(() => S.world);
    assert.equal(result.story.chapters[0].title, '귀향'); assert.equal(result.story.total, 5);
    assert.equal(submissions.length, 8, '거절 1회 뒤 기본 3단계와 스토리 4단계를 접수한다');
    for (const request of submissions.slice(1)) {
      assert.deepEqual(Object.keys(request.meta).sort(), ['key', 'kind', 'title', 'wid']);
      assert(!Object.hasOwn(request.meta, 'worldPart'), '단계 정보는 서버 메타데이터에 넣지 않는다');
    }
    assert.deepEqual(errors, []);
    console.log('✓ 실제 서버 접수에서 기존 HTTP 400 재현, 거절 사유·코드 표시, 재시도, 기본·스토리 전체 단계 성공; 유료 API 호출 없음');
  } finally {
    closeRelay?.(); await browser.close(); await new Promise(r => server.close(r));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
