const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
(async () => {
  const server = appServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', r => r.abort()); await page.route('https://fonts.gstatic.com/**', r => r.abort());
    await page.route('**/v1beta/**', () => { throw Error('실제 AI 호출 금지'); });
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => S.ready);
    const keys = await page.evaluate(async () => {
      const a = keyOf('옛 항구'), b = keyOf('경비대'), c = keyOf('이미 있는 문서');
      const pg = (key, title, body) => ({ key, title, type: '지명', summary: title + ' 정의', infobox: [], categories: [], notices: [], sections: [{ heading: '개요', level: 1, body }], links: [], createdAt: 1 });
      const w = { kind: 'world', id: 'rename', title: '항구 세계', seed: '항구 도시', era: '1989년', rules: [], entities: { [a]: newEntity('옛 항구', '지명', '항구'), [b]: newEntity('경비대', '조직', '경비'), [c]: newEntity('이미 있는 문서', '지명', '기존') }, mainKey: a, aliases: {}, timeline: [{ year: '1980', event: '항구 설립', src: a, k: a }], relations: [{ id: 1, a, b, rel: '소속', src: a }], events: [{ k: a, name: '옛 항구', date: '1980년', place: '항구', nums: [], parts: [a, b], src: a }], navboxes: { port: { title: '항구 목록', src: a, members: [a, b], rows: [{ label: '', items: ['[[옛 항구]]'] }] } }, angleOff: true, relMigrated: true, toneTried: true };
      S.world = w; S.worlds = [w]; S.pages = { [a]: pg(a, '옛 항구', '옛 항구의 본문.'), [b]: pg(b, '경비대', '[[옛 항구]]와 [[옛 항구|항구]]를 지킨다.'), [c]: pg(c, '이미 있는 문서', '기존 본문.') }; S.pages[b].links = [a];
      S.pages[a].shortStories = [{ id: 'keep', title: '항구 단편', body: '보존할 이야기' }];
      for (const k of Object.keys(S.pages)) w.entities[k].page = true;
      w.entities[b].facts.push({ t: '항구 기록', src: a });
      S.sample = null; S.recent = [a, b]; S.view = { name: 'article', key: a };
      for (const p of Object.values(S.pages)) await Store.savePage(w.id, p); await Store.saveWorld(w); renderAll(); return { a, b, c };
    });
    const edit = async () => { await page.locator('[data-edit]').first().click(); await page.waitForSelector('#edTitle'); };
    await edit(); assert.equal(await page.inputValue('#edTitle'), '옛 항구');
    await page.fill('#edTitle', '새 항구'); await page.click('[data-act="ed-cancel"]');
    assert.equal(await page.evaluate(() => S.pages[S.world.mainKey].title), '옛 항구');
    await edit();
    for (const title of ['', '이미 있는 문서', '[[잘못된 제목]]']) {
      await page.fill('#edTitle', title); await page.click('#edSave'); await page.waitForFunction(() => !document.querySelector('#edErr').hidden);
      assert.equal(await page.evaluate(() => S.pages[S.world.mainKey].title), '옛 항구');
    }
    await page.fill('#edTitle', '새 항구'); await page.fill('#edBody', '= 개요 =\n함께 수정한 본문.');
    await page.evaluate(() => { window.originalSavePage = Store.savePage; Store.savePage = async () => { throw Error('저장 실패 테스트'); }; });
    await page.click('#edSave'); await page.waitForFunction(() => document.querySelector('#edErr').textContent.includes('초안은 유지'));
    assert.equal(await page.inputValue('#edTitle'), '새 항구'); assert((await page.inputValue('#edBody')).includes('함께 수정한 본문'));
    assert.equal(await page.evaluate(() => S.world.entities[S.world.mainKey].title), '옛 항구');
    await page.evaluate(() => { Store.savePage = window.originalSavePage; });
    await page.click('#edSave'); await page.waitForFunction(() => !S.edit && S.pages[S.view.key]?.title === '새 항구');
    const result = await page.evaluate(async ({ a, b }) => {
      const w = S.world, nk = keyOf('새 항구'), stored = await Store.getWorld(w.id);
      return { nk, main: w.mainKey, old: w.entities[a], alias: w.aliases[a], resolved: kOf(w, '옛 항구'), page: await Store.getPage(w.id, nk), deleted: await Store.getPage(w.id, a), linked: await Store.getPage(w.id, b), timeline: stored.timeline, relations: stored.relations, events: stored.events, navboxes: stored.navboxes, facts: stored.entities[b].facts, recent: S.recent };
    }, keys);
    assert.equal(result.main, result.nk); assert.equal(result.old, undefined); assert.equal(result.alias, result.nk); assert.equal(result.resolved, result.nk); assert.equal(result.deleted, null);
    assert.equal(result.page.sections[0].body, '함께 수정한 본문.'); assert.equal(result.page.shortStories[0].id, 'keep');
    assert(result.linked.sections[0].body.includes('[[새 항구|옛 항구]]')); assert(result.linked.sections[0].body.includes('[[새 항구|항구]]')); assert.deepEqual(result.linked.links, [result.nk]);
    assert.equal(result.timeline[0].src, result.nk); assert.equal(result.timeline[0].k, result.nk); assert.equal(result.relations[0].a, result.nk); assert.equal(result.relations[0].src, result.nk); assert.equal(result.events[0].src, result.nk); assert.equal(result.events[0].parts[0], result.nk); assert.equal(result.facts[0].src, result.nk); assert.equal(Object.values(result.navboxes)[0].src, result.nk); assert(!result.recent.includes(keys.a));
    await page.reload(); await page.waitForFunction(() => S.world?.id === 'rename' && !S.edit && S.pages[S.world.mainKey]?.title === '새 항구');
    await page.evaluate(() => goSearch('옛 항구')); await page.waitForFunction(() => S.view.key === keyOf('새 항구'));
    // 주인공·등장인물·장별 탐험 및 연속성 기록도 옮긴다.
    await page.evaluate(() => {
      const w = S.world, key = w.mainKey; w.mode = 'story'; w.story = { chapter: 1, total: 3, status: 'active', protagonistKey: key, protagonist: {}, cast: [{ key, name: '새 항구' }], chapters: [{ n: 1, title: '시작', summary: '시작', auto: [key], affected: [{ key }], wove: [{ key }], explore: { opened: { [key]: 1 }, created: [key], edited: [], searched: [] } }], continuity: { version: 2, threads: [{ id: 'thread', status: 'active', origin: { source: 'page:' + key, title: '새 항구', quote: '함께 수정한 본문.' } }], choices: [] } }; w.rules = ['기존 규칙']; S.sample = {}; callJson = async (kind, prompt) => { if (kind !== 'analyze') throw Error('Unexpected AI call'); return { facts: [{ about: '마지막 항구', fact: '검사로 추출한 항구 사실' }], timeline: [], relations: [], conflicts: [{ ref: 'R1', old: '기존 규칙', claim: '새 본문', suggest: '바꾼 규칙' }] }; }; openEditor(key);
    });
    await page.fill('#edTitle', '임시 항구'); await page.click('#edSave'); await page.waitForSelector('.cfpanel');
    await page.fill('#edTitle', '마지막 항구'); await page.fill('#edBody', '= 개요 =\n[[마지막 항구]]의 새 본문.'); await page.click('[data-act="cf-apply"]'); await page.waitForFunction(() => document.querySelector('#edErr').textContent.includes('초안이 바뀌었습니다'));
    await page.click('#edSave'); await page.waitForSelector('.cfpanel'); await page.click('[data-act="cf-apply"]'); await page.waitForFunction(() => !S.edit);
    const story = await page.evaluate(() => ({ key: keyOf('마지막 항구'), w: S.world, pages: S.pages }));
    assert.equal(story.w.story.protagonistKey, story.key); assert.equal(story.w.story.cast[0].key, story.key); assert.equal(story.w.story.cast[0].name, '마지막 항구'); assert.equal(story.w.story.chapters[0].affected[0].key, story.key); assert.equal(story.w.story.continuity.threads[0].origin.source, 'page:' + story.key);
    assert.equal(story.w.rules[0], '바꾼 규칙'); assert(story.w.entities[story.key].facts.some(f => f.t === '검사로 추출한 항구 사실' && f.src === story.key));
    assert.equal(story.w.aliases[keys.a], story.key); assert.deepEqual(errors, []);
    console.log('✓ 제목 입력·취소·중복 검증·저장 실패 복구·본문 동시 저장·기존 링크·설정 출처·스토리 참조·새로고침 검증. 유료 API 호출 0회.');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
