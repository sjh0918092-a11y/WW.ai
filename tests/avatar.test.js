/* 대화 프사: Gemini가 찾은 얼굴 상자대로 자르기, 실패 시 위쪽 가운데, 이미지가 바뀌면 다시 자르기, 지우면 같이 지우기.
   유료 API 호출 없음(가짜 응답). */
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
    const r = await page.evaluate(async () => {
      // 400x800 파란 이미지의 (x 240~320, y 500~580)에 빨간 '얼굴'을 둔다
      const img = (color) => { const c = document.createElement('canvas'); c.width = 400; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#0000ff'; g.fillRect(0, 0, 400, 800); g.fillStyle = color; g.fillRect(240, 500, 80, 80); return c.toDataURL('image/png'); };
      const center = async src => { const i = await loadImageSrc(src), c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return [...g.getImageData(64, 64, 1, 1).data.slice(0, 3)]; };
      const w = { kind: 'world', id: 'wav' + Date.now().toString(36), title: '세계', era: '1년', entities: {}, timeline: [], rules: [], calendars: [], relations: [], relMigrated: true, mainKey: null, createdAt: Date.now() };
      const k = keyOf('한서윤'); w.entities[k] = newEntity('한서윤', '인물', '정의'); w.mainKey = k;
      await Store.saveWorld(w);
      await Store.savePage(w.id, { key: k, title: '한서윤', type: '인물', summary: '정의', categories: [], infobox: [], notices: [], sections: [{ heading: '개요', level: 1, body: '본문' }], portrait: img('#ff0000') });
      S.worlds.unshift(w); S.sample = {};
      const orig = gFetch; let mode = 'ok', calls = 0;
      gFetch = async (path, init) => { calls++; if (mode === 'fail') throw { code: 'network' }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"box_2d":[625,600,725,800]}' }] } }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 20, totalTokenCount: 320 } }), { status: 200 }); };
      const out = {};
      try {
        await openWorld(w.id);
        out.initial = avatarHtml(w, k, 'sm').includes('fallback');
        await ensureAvatar(w, k);
        const p = S.pages[k];
        out.by = p.avatar?.by; out.fresh = avatarFresh(p); out.redCenter = await center(p.avatar.src);
        out.again = calls; await ensureAvatar(w, k); out.noRecall = calls === out.again;
        out.saved = (await Store.getPage(w.id, k)).avatar?.by;
        // 이미지가 바뀌면(실패 응답) 위쪽 가운데로 다시 자른다
        mode = 'fail'; p.portrait = img('#00ff00');
        out.stale = !avatarFresh(p);
        await ensureAvatar(w, k);
        out.fallbackBy = S.pages[k].avatar?.by; out.fallbackFresh = avatarFresh(S.pages[k]);
        // Gemini를 쓰지 않으면 Gemini로 요청하지 않고 위쪽 가운데로 자른다
        const saved = { quick: GS.quick, main: GS.main, check: GS.check, taskModels: GS.taskModels };
        Object.assign(GS, { quick: 'claude-haiku-4-5', main: 'claude-sonnet-4-6', check: '', taskModels: {} });
        mode = 'ok'; const before = calls; S.pages[k].portrait = img('#ffff00');
        await ensureAvatar(w, k);
        out.noGemini = calls === before && S.pages[k].avatar?.by === 'center';
        Object.assign(GS, saved);
        // 이미지를 지우면 프사도 지운다
        delete S.pages[k].portrait; ensureAvatar(w, k);
        out.removed = !S.pages[k].avatar && avatarHtml(w, k).includes('initial');
      } finally { gFetch = orig; }
      return out;
    });
    assert.strictEqual(r.initial, true, '프사가 준비되기 전에는 원본을 보여 준다');
    assert.strictEqual(r.by, 'gemini'); assert.strictEqual(r.fresh, true);
    assert.ok(r.redCenter[0] > 200 && r.redCenter[2] < 60, '얼굴 상자가 프사 가운데에 온다: ' + r.redCenter);
    assert.strictEqual(r.noRecall, true, '같은 이미지로는 다시 부르지 않는다');
    assert.strictEqual(r.saved, 'gemini', '문서에 저장한다');
    assert.strictEqual(r.stale, true, '이미지가 바뀌면 프사가 낡은 것으로 본다');
    assert.strictEqual(r.fallbackBy, 'center'); assert.strictEqual(r.fallbackFresh, true);
    assert.strictEqual(r.noGemini, true, 'Gemini를 쓰지 않으면 요청하지 않는다');
    assert.strictEqual(r.removed, true);
    assert.deepStrictEqual(errors, []);
    console.log('avatar ok');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
