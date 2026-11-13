/* 인물 이름 규칙: 모든 생성 경로의 이름 지침, 인포박스 이름의 별칭 등록, 빨간 링크 넘기기, 드래그 링크, 제목을 본명으로 바꾸기.
   Gemini 응답은 모두 가로챈다(유료 호출 0회) */
const assert = require('assert'), vm = require('vm');
const { appServer, appSource } = require('./helpers/app');
const { chromium } = require('playwright');
const html = appSource(), kc = {}; vm.createContext(kc); vm.runInContext(html.slice(html.indexOf('function cyrb53('), html.indexOf('const LINK_RE =')) + 'globalThis.makeKey=keyOf;', kc); const K = kc.makeKey;
const server = appServer();
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
/* 새 항목 제목이나 [[링크]]를 만들 수 있는 프롬프트 목록.
   새 생성 경로(프롬프트)를 만들면 반드시 이 목록에 넣고, 그 프롬프트에 linkNameRule()을 붙인다 */
const NAME_PROMPTS = {
  '문서 작성 pagePrompt': `pagePrompt(w, K('기지'))`,
  '랜덤 서핑 discoveryPrompt': `discoveryPrompt(w, '코드명 인디펜던스인 조종사', [], null)`,
  'AI 고치기 fixPrompt': `fixPrompt(w, S.pages[K('기지')], pageToSource(w, S.pages[K('기지')]), { claim: 'x', conflict: 'y' })`,
  '일괄 고치기·세계 점검 반영 fixBatchPrompt': `fixBatchPrompt(w, S.pages[K('기지')], pageToSource(w, S.pages[K('기지')]), [{ claim: 'x', conflict: 'y' }])`,
  '세계관 만들기 biblePrompt(기본)': `biblePrompt('원안 문장입니다. 충분히 길다.', '', '', false)`,
  '세계관 만들기 biblePrompt(첫 문서 지정)': `biblePrompt('원안 문장입니다. 충분히 길다.', '첫 문서', '', false)`,
  '스토리 세계관 biblePrompt(story)': `biblePrompt('원안 문장입니다. 충분히 길다.', '', '', true, { total: 5 })`,
  '스토리 장 계획 chapterPlanPrompt': `chapterPlanPrompt(sw, 2, null)`,
  '스토리 장 섹션 chapterBlockPrompt': `chapterBlockPrompt(sw, sw.mainKey, [1])`,
  '문단 다시 쓰기 sectionRewritePrompt': `sectionRewritePrompt(w, S.pages[K('기지')], K('기지'), S.pages[K('기지')].sections[0], '= 개요 =\\n초안', '')`,
};
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const browser = await chromium.launch(), ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem('wwiki:gemini')) localStorage.setItem('wwiki:gemini', JSON.stringify({ mode: 'key', key: 'test-key', main: 'test-main', quick: 'test-quick', preCheck: false })); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.abort()); await ctx.route('https://fonts.gstatic.com/**', r => r.abort());
  const ent = (title, type, page) => ({ title, type, summary: title + ' 요약', facts: [], mentions: [], page, box: '' });
  const pg = (title, type, body, infobox = []) => ({ key: K(title), title, type, summary: title + ' 요약', infobox, sections: [{ heading: '개요', level: 1, body }], links: [], createdAt: 1 });
  const code = "Type-18 '인디펜던스'";
  const P = [pg('기지', '지명', '[[조슬린 앤 케인]]이 이 기지에 배치되었다. 사람들은 그를 인디펜던스라 불렀고, 바다매도 함께였다.'), pg('류도윤', '인물', '류도윤은 정비사다.'), pg('한서진', '인물', '한서진은 조종사다.', [{ label: '별칭', value: '바다매' }])];
  const entities = Object.fromEntries(P.map(p => [p.key, ent(p.title, p.type, true)]));
  entities[K('조슬린 앤 케인')] = { ...ent('조슬린 앤 케인', '인물', false), mentions: [{ from: K('기지'), text: '조슬린 앤 케인이 이 기지에 배치되었다.' }] };
  entities[K(code)] = ent(code, '인물', false);
  P[0].links = [K('조슬린 앤 케인')];
  const world = { kind: 'world', id: 'names', title: '이름 세계', seed: '조종사들의 세계관.', era: '1990년', guide: '', rules: [], userCanon: '', timeline: [], relations: [], navboxes: {}, aliases: {}, toneTried: true, angleOff: true, entities, mainKey: K('기지'), createdAt: 1 };
  const fixture = { app: 'worldwiki', version: 1, worlds: [world], pages: { names: Object.fromEntries(P.map(p => [p.key, p])) } };
  const page = await ctx.newPage(), calls = [], errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
  await ctx.route('**/v1beta/models/**', async r => {
    const prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text; calls.push(prompt);
    if (!prompt.includes('## 작성할 문서:')) { try { await r.fulfill({ status: 404, json: { error: { message: 'model missing' } } }); } catch {} return; }
    const out = { title: code, type: '인물', summary: '코드명 인디펜던스로 불리는 조종사', infobox: [{ label: '본명', value: '조슬린 앤 케인' }, { label: '코드명', value: "'인디펜던스'" }, { label: '가명', value: '류도윤' }, { label: '성별', value: '여성' }],
      sections: [{ heading: '개요', level: 1, body: '인디펜던스는 [[기지]]의 조종사다.' }], facts: [], newEntities: [], relations: [], timeline: [] };
    try { await r.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] }) + '\n\n' }); } catch {}
  });
  const title = t => page.waitForFunction(t => document.querySelector('h1.t')?.textContent === t, t);
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles('#importFile', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
    await page.click('#side [data-act="home"]'); await page.locator('.wcard button.open').click(); await title('기지');

    const missing = await page.evaluate(list => {
      const K = keyOf, w = S.world, rule = linkNameRule(), out = [];
      const sw = { kind: 'world', id: 'sw', title: '스토리', seed: '원안', era: '1990년', guide: '', rules: [], userCanon: '', timeline: [], relations: [], entities: { [K('주인공')]: newEntity('주인공', '인물', '') }, mainKey: K('주인공'), createdAt: 1 };
      setupStory(sw, { chapter1: { title: '발단', summary: '1장 줄거리.', incident: '사건', nextChoices: ['가', '나'] }, protagonist: { summary: '주인공' }, spine: [] }, { total: 5 });
      const keepW = S.world, keepP = S.pages;
      for (const [name, expr] of Object.entries(list)) {
        let text = '';
        try {
          if (expr.includes('sw')) { S.world = sw; S.pages = { [sw.mainKey]: { key: sw.mainKey, title: '주인공', type: '인물', summary: '주인공', infobox: [], sections: [{ heading: '개요', level: 1, body: '주인공의 기록.' }], links: [] } }; }
          text = eval(expr);
        } catch (e) { text = 'ERROR ' + e.message; } finally { S.world = keepW; S.pages = keepP; }
        if (!String(text).includes(rule)) out.push(name + ': ' + String(text).slice(0, 120));
      }
      return out;
    }, NAME_PROMPTS);
    assert.deepStrictEqual(missing, []);
    pass(`새 제목이나 링크를 만들 수 있는 프롬프트 ${Object.keys(NAME_PROMPTS).length}개 모두에 같은 이름 지침(linkNameRule)이 들어간다`);
    const counted = await page.evaluate(() => linkNameRule());
    for (const t of ["수로만 세고 넘어가지 않는다", "'○○ 2기가 출격했다'", "하나하나 이름을 밝히고 [[링크]]한다", "'○○ 2기([[이름A]], [[이름B]])가 출격했다'", "큰 무리(병사 수백 명, 군중)뿐"]) assert(counted.includes(t), t);
    pass('사건에서 행동한 개체를 수로만 세지 말고 몇 안 되면 하나하나 이름과 링크를 붙이라는 지침이 이름 지침에 들어 있다');
    const disc = await page.evaluate(() => discoveryPrompt(S.world, '', [], null));
    assert(disc.includes('대상이 인물이면 title은 본명 풀 네임으로 쓴다') && disc.includes('summary와 aliases에 쓴다'));
    pass('랜덤 서핑은 인물이면 title을 본명 풀 네임으로, 코드명은 summary에 쓰게 한다');

    await page.evaluate(k => openEntity(k), K(code)); await page.waitForFunction(k => S.pages[k] && !S.gen, K(code)); await page.evaluate(() => Store.q);
    await title(code);
    const st = await page.evaluate(([k, j, ind, ryu]) => ({ ind: S.world.aliases[ind], jo: S.world.aliases[j], joEnt: !!S.world.entities[j], kOf: kOf(S.world, '인디펜던스'), ryuPage: !!S.pages[ryu] && S.world.entities[ryu].title, twins: S.world.nameTwins, baseBody: S.pages[keyOf('기지')].sections[0].body, baseLinks: S.pages[keyOf('기지')].links, mentions: S.world.entities[k].mentions.map(m => m.from) }), [K(code), K('조슬린 앤 케인'), K('인디펜던스'), K('류도윤')]);
    assert.equal(st.ind, K(code)); assert.equal(st.kOf, K(code));
    pass('인물 문서의 인포박스 이름(코드명)이 별칭으로 등록되고, 그 이름으로 링크하면 이 문서로 이어진다');
    assert.equal(st.joEnt, false); assert.equal(st.jo, K(code));
    assert(st.baseBody.includes(`[[${code}|조슬린 앤 케인]]`), st.baseBody); assert(st.baseLinks.includes(K(code))); assert(st.mentions.includes(K('기지')));
    await page.evaluate(k => openEntity(k), K('조슬린 앤 케인')); await title(code);
    pass('본명으로 된 빨간 링크 항목은 이 문서의 별칭으로 넘어가고, 그 본명 링크와 언급이 이 문서로 이어진다');
    assert.equal(st.ryuPage, '류도윤'); assert.deepStrictEqual(st.twins.map(t => [t.a, t.b, t.name]), [[K(code), K('류도윤'), '류도윤']]);
    assert.notEqual(await page.evaluate(() => S.world.aliases[keyOf('류도윤')]), K(code));
    await page.click('#side [data-act="canon"]'); await page.waitForSelector('.twins');
    assert((await page.locator('.twins li').innerText()).includes('류도윤'));
    pass('이미 문서가 있는 같은 이름의 항목은 건드리지 않고, 설정 노트에 "같은 인물일 수 있는 두 문서"로 띄운다');

    await page.evaluate(k => openEntity(k), K('기지')); await title('기지');
    const before = await page.evaluate(() => Object.keys(S.world.entities).length);
    await page.evaluate(k => linkSelection({ k, where: ['sections', 0, 'body'], n: 0, text: '인디펜던스' }), K('기지'));
    await page.evaluate(k => linkSelection({ k, where: ['sections', 0, 'body'], n: 0, text: '바다매' }), K('기지'));
    const dr = await page.evaluate(() => ({ n: Object.keys(S.world.entities).length, body: S.pages[keyOf('기지')].sections[0].body, ind: !!S.world.entities[keyOf('인디펜던스')], bm: !!S.world.entities[keyOf('바다매')] }));
    assert.equal(dr.n, before); assert(!dr.ind && !dr.bm);
    assert(dr.body.includes(`[[${code}|인디펜던스]]`) && dr.body.includes('[[한서진|바다매]]'), dr.body);
    pass('드래그로 고른 말이 기존 인물의 별칭이나 인포박스 이름이면 새 항목을 만들지 않고 그 인물 문서로 링크한다');

    await page.evaluate(k => openEntity(k), K(code)); await title(code);
    assert.equal(await page.locator('[data-realname]').count(), 1);
    assert.equal(await page.evaluate(k => realNameFor(S.world, k), K('한서진')), '', '코드명 제목이 아닌 문서에는 버튼이 없다');
    await page.click('[data-realname]'); await title('조슬린 앤 케인');
    const rn = await page.evaluate(([oldK, newK]) => ({ alias: S.world.aliases[oldK], page: !!S.pages[newK], old: !!S.pages[oldK], canon: canonTitle(S.world, "Type-18 '인디펜던스'"), ind: kOf(S.world, '인디펜던스'), base: S.pages[keyOf('기지')].sections[0].body }), [K(code), K('조슬린 앤 케인')]);
    assert.equal(rn.alias, K('조슬린 앤 케인')); assert(rn.page && !rn.old); assert.equal(rn.canon, '조슬린 앤 케인'); assert.equal(rn.ind, K('조슬린 앤 케인'));
    assert(rn.base.includes('[[조슬린 앤 케인|인디펜던스]]'), rn.base);
    await page.evaluate(k => openEntity(k), K(code)); await title('조슬린 앤 케인');
    await page.evaluate(k => openEntity(k), K('기지')); await title('기지');
    await page.locator('.article a.wl', { hasText: '인디펜던스' }).first().click(); await title('조슬린 앤 케인');
    pass('[제목을 본명으로 바꾸기] 뒤에는 옛 제목이 별칭으로 남아, 옛 제목 링크가 새 제목 문서로 이어진다');

    assert.equal(calls.filter(c => c.includes('## 작성할 문서:')).length, 1);
    assert.deepStrictEqual(errors, []);
    console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
