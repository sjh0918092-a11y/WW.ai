/* 세계관 만들기의 분위기 조절(축·피하고 싶은 것): 화면 입력, 생성 프롬프트의 긍정형 서술, 저장과 다시 만들기 복원.
   문서 프롬프트에는 보내지 않는다. 유료 API 호출 없음. */
const assert = require('assert');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
const server = appServer();
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.route('https://fonts.gstatic.com/**', r => r.abort());
    await page.route('**/v1beta/**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector('#importFile', { state: 'attached' });

    // 프롬프트: 고르지 않으면 블록이 없고, 고르면 긍정형 서술만 들어간다
    const pr = await page.evaluate(() => {
      const prefs = { axes: { light: 2, focus: 5, scale: 9 }, avoid: ['war', 'tragic', 'nope'], avoidText: '동물이 다치는 장면' };
      return { none: biblePrompt('원안', '', '', false), empty: biblePrompt('원안', '', '', false, {}, { axes: {}, avoid: [], avoidText: '  ' }),
        set: biblePrompt('원안', '', '', false, {}, prefs), story: biblePrompt('원안', '', '', true, { total: 5 }, prefs),
        part: biblePartPrompt('원안', '', '', false, {}, bibleParts(false)[0], {}, prefs), norm: normPrefs(prefs),
        light2: WORLD_AXES[0].say[1], focus5: WORLD_AXES[3].say[4], war: WORLD_AVOID.find(x => x.id === 'war').say };
    });
    assert(!pr.none.includes('사용자가 고른 방향') && !pr.empty.includes('사용자가 고른 방향'));
    for (const t of [pr.set, pr.story, pr.part]) {
      assert(t.includes('사용자가 고른 방향') && t.includes(pr.light2) && t.includes(pr.focus5) && t.includes(pr.war) && t.includes('동물이 다치는 장면'));
      assert(!t.includes('전쟁 중심') && !t.includes('비극적 결말') && !t.includes('디스토피아'), '칩 이름은 모델에 보내지 않는다');
      assert(t.includes('긍정형'));
    }
    assert.deepStrictEqual(pr.norm, { axes: { light: 2, focus: 5 }, avoid: ['tragic', 'war'], avoidText: '동물이 다치는 장면' });

    // 화면: 단계를 고르고, 같은 단계를 다시 누르면 자동으로 돌아간다
    await page.evaluate(() => { S.view = { name: 'home' }; S.mode = 'basic'; renderMain(); });
    await page.click('#prefsBox summary');
    await page.click('[data-pref-ax="light"][data-pref-lv="4"]');
    assert.strictEqual(await page.getAttribute('[data-pref-ax="light"][data-pref-lv="4"]', 'aria-pressed'), 'true');
    assert.strictEqual(await page.getAttribute('[data-pref-ax="light"][data-pref-lv="0"]', 'aria-pressed'), 'false');
    await page.click('[data-pref-ax="scale"][data-pref-lv="1"]');
    await page.click('[data-pref-ax="scale"][data-pref-lv="1"]');
    assert.strictEqual(await page.getAttribute('[data-pref-ax="scale"][data-pref-lv="0"]', 'aria-pressed'), 'true');
    await page.click('[data-pref-avoid="death"]');
    assert.strictEqual(await page.getAttribute('[data-pref-avoid="death"]', 'aria-pressed'), 'true');
    await page.fill('#avoidIn', '학교 폭력');
    assert(await page.evaluate(() => document.getElementById('prefsBox').open), '고른 뒤에도 펼친 상태를 유지한다');

    // 생성: 세계관 생성 프롬프트에만 들어가고, 세계에 저장되며, 문서 프롬프트에는 없다. 다시 만들기에서 복원한다
    const made = await page.evaluate(async () => {
      const original = { callJson, openWorld, afterTimeline, sample: S.sample }, seen = [];
      try {
        S.sample = {}; afterTimeline = () => {}; openWorld = async id => { S.world = S.worlds.find(w => w.id === id); S.pages = {}; };
        callJson = async (kind, text) => { seen.push({ kind, text }); return { title: '시험 세계', tagline: '한 줄', era: '2026년', historical: false, mainTitle: '첫 항목', rules: ['규칙'], tone: { label: '잔잔함', guide: ['따뜻하게 쓴다'] }, calendars: [], undatedCalendars: [], stage: { units: [], now: '', parties: [] }, timeline: [] }; };
        S.seed = '작은 우주선의 원안'; S.first = ''; S.regen = null;
        await createWorld();
        if (S.createErr) throw new Error(S.createErr);
        const w = S.world, saved = structuredClone(w.prefs), page = pagePrompt(w, w.mainKey);
        const cleared = S.prefs;
        openRegen();
        return { seen, saved, page, cleared, restored: structuredClone(S.prefs), tone: tonePrompt(w, '') };
      } finally { Object.assign(globalThis, { callJson: original.callJson, openWorld: original.openWorld, afterTimeline: original.afterTimeline }); S.sample = original.sample; }
    });
    const bible = made.seen.filter(x => x.kind === 'bible');
    assert(bible.length && bible.every(x => x.text.includes('사용자가 고른 방향') && x.text.includes('학교 폭력')));
    assert.deepStrictEqual(made.saved, { axes: { light: 4 }, avoid: ['death'], avoidText: '학교 폭력' });
    assert(!made.page.includes('사용자가 고른 방향') && !made.page.includes('학교 폭력'), '문서 프롬프트에는 보내지 않는다');
    assert(made.tone.includes('사용자가 고른 방향'), '분위기 지침을 다시 만들 때도 반영한다');
    assert.strictEqual(made.cleared, null);
    assert.deepStrictEqual(made.restored, made.saved);
    assert.deepStrictEqual(errors, []);
    console.log('world-prefs ok');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
