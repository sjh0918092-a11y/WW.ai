/* 각도 목록 자동 생성: 작성된 문서가 10개가 되면 문서 생성 뒤 백그라운드로 한 번 만든다. Gemini 응답은 모두 가로챈다(유료 호출 0회) */
const assert = require('assert'), vm = require('vm');
const { appServer, appSource } = require('./helpers/app');
const { chromium } = require('playwright');
const html = appSource(), keyContext = {}; vm.createContext(keyContext); vm.runInContext(html.slice(html.indexOf('function cyrb53('), html.indexOf('const LINK_RE =')) + 'globalThis.makeKey=keyOf;', keyContext); const key = keyContext.makeKey;
const server = appServer();
const read = (p, k) => p.evaluate(k => new Promise(resolve => { const r = indexedDB.open('worldwiki-gemini', 1); r.onsuccess = () => { const d = r.result, t = d.transaction('kv'), q = t.objectStore('kv').get(k); q.onsuccess = () => resolve(q.result); t.oncomplete = () => d.close(); }; }), k);
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const browser = await chromium.launch(), ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem('wwiki:gemini')) localStorage.setItem('wwiki:gemini', JSON.stringify({ mode: 'key', key: 'test-key', main: 'test-main', quick: 'test-quick', preCheck: false })); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.abort()); await ctx.route('https://fonts.gstatic.com/**', r => r.abort());
  const titles = Array.from({ length: 8 }, (_, i) => '기존 문서 ' + (i + 1)), hero = key(titles[0]);
  const ent = title => ({ title, type: '지명', summary: title + ' 요약', facts: [], mentions: [], page: true, box: '' });
  const pg = title => ({ key: key(title), title, type: '지명', summary: title + ' 요약', infobox: [], sections: [{ heading: '개요', level: 1, body: title + '은 항구에 있다.' }], links: [], createdAt: 1 });
  const world = { kind: 'world', id: 'port', title: '항구', seed: '바다와 무역의 세계관.', era: '1900년', guide: '', rules: ['선원은 배급 럼을 받는다'], userCanon: '', timeline: [], relations: [], navboxes: {}, aliases: {}, toneTried: true, tone: { label: '해양', guide: ['차분한 기록'] },
    entities: Object.fromEntries(titles.map(t => [key(t), ent(t)])), mainKey: hero, createdAt: 1 };
  const fixture = { app: 'worldwiki', version: 1, worlds: [world], pages: { port: Object.fromEntries(titles.map(t => [key(t), pg(t)])) } };
  const C = id => ({ id, axis: '일상화', label: '각도 ' + id, area: id + ' 영역', consequence: id + '가 오래 이어져 생긴 결과', surprise: '의외', contrast: '기존 결론과 다르다', scene: id + ' 장면', safe: '규칙과 문체를 지킨다' });
  const anglesReply = { dominant: '기존 문서들은 무역을 영광으로 본다', candidates: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(C), picked: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], classify: [] };
  const page = await ctx.newPage(), calls = [], errors = []; let angleMode = 'fail', release = null;
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
  await ctx.route('**/v1beta/models/**', async r => {
    const prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text;
    const kind = prompt.includes('## 각도 목록 만들기') ? (prompt.includes('## 할 일 3: 6개 고르기') ? 'refill' : 'angles') : prompt.includes('## 작성할 문서:') ? 'page' : 'other'; calls.push(kind);
    const fail = async () => { try { await r.fulfill({ status: 404, json: { error: { message: 'model missing' } } }); } catch {} };
    let out;
    if (kind === 'angles') { if (angleMode === 'hold') await new Promise(res => release = res); if (angleMode === 'fail') return fail(); out = anglesReply; }
    else if (kind === 'page') { const title = /## 작성할 문서: 「([^」]+)」/.exec(prompt)[1]; out = { title, type: '지명', summary: title + '의 정의', infobox: [], sections: [{ heading: '개요', level: 1, body: title + '은 항구에 있다.' }], links: [], facts: [], newEntities: [], relations: [], timeline: [], categories: [] }; }
    else return fail();
    try { await r.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] }) + '\n\n' }); } catch {}
  });
  const angleCalls = () => calls.filter(x => x === 'angles').length;
  const write = async title => {
    const k = key(title);
    await page.evaluate(({ k, title }) => { Math.random = () => 0.99; if (!S.world.entities[k]) S.world.entities[k] = newEntity(title, '지명', ''); generatePage(k, false, ''); }, { k, title });
    await page.waitForFunction(k => !S.gen && S.pages[k], k); await page.evaluate(() => Store.q);
    assert((await read(page, 'p:port:' + k)), title + ' 문서가 저장되어야 한다');
  };
  const settle = () => page.waitForFunction(() => !anglesBuilding.size);
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles('#importFile', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
    await page.click('#side [data-act="home"]'); await page.locator('.wcard button.open').click(); await page.waitForSelector('.article h2');

    await page.click('#side [data-act="canon"]'); await page.waitForSelector('#angles');
    assert((await page.locator('#anglesNone').innerText()).includes('문서가 10개 쌓이면 자동으로 만들어집니다'));
    assert.equal((await page.locator('[data-act="angles-regen"]').innerText()).trim(), '지금 만들기');
    assert.equal(await page.evaluate(() => ANGLE_AUTO_PAGES), 10);
    pass('각도 목록이 없으면 설정 노트에 "문서가 10개 쌓이면 자동으로 만들어집니다"와 [지금 만들기]를 보여 준다');

    await write('새 문서 9'); await settle();
    assert.equal(angleCalls(), 0); assert.equal((await read(page, 'w:port')).angles, undefined);
    pass('작성된 문서가 10개 미만이면 문서 생성 뒤 각도 목록을 만들지 않는다');

    await write('새 문서 10'); await settle();
    assert.equal(angleCalls(), 1, '10개가 되면 한 번 부른다');
    assert.equal((await read(page, 'w:port')).angles, undefined); assert.equal(await page.evaluate(() => S.genErr), null);
    assert.equal(await page.evaluate(() => S.view.name === 'article' && document.querySelector('h1.t')?.textContent), '새 문서 10');
    pass('문서가 10개가 되면 문서 생성 뒤 각도 목록을 한 번 만들고, 실패해도 문서 생성·저장·화면은 그대로다');

    await page.evaluate(() => { S.world.angleOff = true; }); await write('새 문서 11'); await settle();
    assert.equal(angleCalls(), 1); await page.evaluate(() => { S.world.angleOff = false; });
    pass('각도를 끈 세계관(angleOff)에서는 부르지 않는다');

    angleMode = 'hold'; await write('새 문서 12');
    await page.waitForFunction(() => anglesBuilding.size === 1); for (let i = 0; i < 100 && !release; i++) await new Promise(r => setTimeout(r, 10));
    assert(release, '실패 뒤 다음 문서 생성에서 다시 시도한다'); assert.equal(angleCalls(), 2);
    assert.equal(await page.evaluate(() => !S.gen && !!S.pages[S.view.key]), true, '목록을 만드는 동안 문서 생성은 이미 끝나 있다');
    await page.evaluate(() => { maybeAutoAngles(S.world); maybeAutoAngles(S.world); ensureAngles(S.world, null, { auto: true }); });
    await write('새 문서 13'); await new Promise(r => setTimeout(r, 200));
    assert.equal(angleCalls(), 2, '같은 세계관에서 동시에 두 번 돌지 않는다');
    await page.click('#side [data-act="canon"]'); await page.waitForSelector('#angles');
    assert.equal((await page.locator('[data-act="angles-regen"]').innerText()).trim(), '만드는 중…'); assert(await page.locator('[data-act="angles-regen"]').isDisabled());
    angleMode = 'ok'; release(); await settle();
    await page.waitForSelector('.angles li'); assert.equal(await page.locator('.angles li').count(), 6);
    const w = await read(page, 'w:port'); assert.equal(w.angles.length, 6); assert.equal(w.angleDominant, '기존 문서들은 무역을 영광으로 본다');
    pass('실패하면 다음 문서 생성 뒤 다시 시도하고, 만드는 중에는 다시 불러도 겹쳐 돌지 않으며, 끝나면 목록을 저장하고 설정 노트에 보여 준다');

    await write('새 문서 14'); await settle(); assert.equal(angleCalls(), 2);
    pass('이미 목록이 있으면 부르지 않는다');

    const picked = await page.evaluate(() => { Math.random = () => 0; return pickAngle(S.world, null)?.id; });
    assert(picked, '자동으로 만든 목록에서 각도를 고를 수 있다');
    assert(calls.every(x => x !== 'other'), calls.join(',')); assert.deepStrictEqual(errors, []);
    console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
