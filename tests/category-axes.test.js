/* 분류 축·분류 합치기·분류에서 계산하는 틀. Gemini 응답은 모두 가로챈다(유료 호출 0회) */
const assert = require('assert'), vm = require('vm');
const { appServer, appSource } = require('./helpers/app');
const { chromium } = require('playwright');
const html = appSource(), kc = {}; vm.createContext(kc); vm.runInContext(html.slice(html.indexOf('function cyrb53('), html.indexOf('const LINK_RE =')) + 'globalThis.makeKey=keyOf;', kc); const key = kc.makeKey;
const server = appServer();
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
const K = t => key(t);
const ax = (o) => Object.entries(o).flatMap(([axis, xs]) => xs.map(name => ({ name, axis })));
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const browser = await chromium.launch(), ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem('wwiki:gemini')) localStorage.setItem('wwiki:gemini', JSON.stringify({ mode: 'relay', pass: 'test-key', main: 'test-main', quick: 'test-quick', preCheck: false })); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.abort()); await ctx.route('https://fonts.gstatic.com/**', r => r.abort());
  const ent = (title, type, page, extra = {}) => ({ title, type, summary: title + ' 요약', facts: [], mentions: [], page, box: '', ...extra });
  const pg = (title, type, cats, axes, infobox = []) => ({ key: K(title), title, type, summary: title + ' 요약', categories: cats, ...(axes ? { catAxes: axes } : {}), infobox, sections: [{ heading: '개요', level: 1, body: title + '의 기록.' }], links: [], createdAt: 1 });
  const born = y => [{ label: '출생', value: `${y}년 3월 1일` }];
  const P = [
    pg('알파국', '국가', [], null), pg('대전쟁', '사건', [], null, [{ label: '기간', value: '1970년 ~ 1975년' }]),
    pg('가람', '인물', ['알파국', '군인', '대전쟁', '1950년 출생'], ax({ 소속: ['알파국'], 유형: ['군인'], 사건: ['대전쟁'], 기타: ['1950년 출생'] }), born(1950)),
    pg('나래', '인물', ['알파국', '군인', '대전쟁'], ax({ 소속: ['알파국'], 유형: ['군인'], 사건: ['대전쟁'] }), born(1940)),
    pg('다솜', '인물', ['알파국', '군인'], ax({ 소속: ['알파국'], 유형: ['군인'] })),
    pg('라온', '인물', ['알파국', '병사'], ax({ 소속: ['알파국'], 유형: ['병사'] }), born(1960)),
    pg('마루', '인물', ['베타국', '기사', '대전쟁'], ax({ 소속: ['베타국'], 유형: ['기사'], 사건: ['대전쟁'] }), born(1945)),
    pg('바다', '인물', ['베타국', '기사'], ax({ 소속: ['베타국'], 유형: ['기사'] }), born(1948)),
    pg('옛 기록', '문서', ['옛 분류', '기록물'], null),
  ];
  const entities = Object.fromEntries(P.map(p => [p.key, ent(p.title, p.type, true)]));
  entities[K('자두')] = ent('자두', '인물', false, { cats: ax({ 소속: ['알파국'], 유형: ['군인'] }) });   // 아직 쓰지 않은 항목
  entities[K('사랑')] = ent('사랑', '인물', false);
  entities[K('옛 장비')] = ent('옛 장비', '물건', false);
  const navboxes = {
    [K('옛 기록') + '-0']: { title: '알파국 군인 명단', rows: [{ label: '', items: ['[[가람]] — 1번', '[[나래]] — 2번', '[[다솜]] — 3번'] }], members: [K('가람'), K('나래'), K('다솜')], src: K('옛 기록'), srcTitle: '옛 기록' },
    [K('옛 기록') + '-1']: { title: '옛 장비 목록', rows: [{ label: '', items: ['[[옛 장비]]'] }], members: [K('옛 장비')], src: K('옛 기록'), srcTitle: '옛 기록' },
  };
  const navDefs = [{ id: 'user:a', title: '알파국 사람들', cats: ['알파국'], split: 'decade' }, { id: 'user:b', title: '군인 전체', cats: ['군인'], split: 'decade' }, { id: 'user:c', title: '1950년생', cats: ['1950년 출생'], split: 'decade' }];
  const world = { kind: 'world', id: 'axes', title: '축 세계', seed: '두 나라의 전쟁 세계관.', era: '1980년', guide: '', rules: [], userCanon: '', timeline: [], relations: [], navboxes, navDefs, aliases: {}, toneTried: true, angleOff: true, entities, mainKey: K('알파국'), createdAt: 1 };
  const fixture = { app: 'worldwiki', version: 1, worlds: [world], pages: { axes: Object.fromEntries(P.map(p => [p.key, p])) } };
  const page = await ctx.newPage(), calls = [], errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
  let pageOut = null, syncOut = null;
  await ctx.route('**/v1beta/models/**', async r => {
    const prompt = JSON.parse(r.request().postData()).contents[0].parts.map(p=>p.text).join("");
    const kind = prompt.includes('## 작성할 문서:') ? 'page' : prompt.startsWith('## 문서의 확정 사실 정리') ? 'sync' : 'other'; calls.push({ kind, prompt });
    const body = kind === 'page' ? pageOut(/## 작성할 문서: 「([^」]+)」/.exec(prompt)[1]) : kind === 'sync' ? syncOut : null;
    if (!body) { try { await r.fulfill({ status: 404, json: { error: { message: 'model missing' } } }); } catch {} return; }
    try { await r.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] }, finishReason: 'STOP' }] }) + '\n\n' }); } catch {}
  });
  const open = async title => { await page.evaluate(k => openEntity(k), K(title)); await page.waitForFunction(t => document.querySelector('h1.t')?.textContent === t, title); };
  const boxes = () => page.$$eval('.navbox', xs => xs.map(x => ({ title: x.querySelector('.nb-t').textContent, auto: x.classList.contains('nb-auto'), old: !!x.querySelector('.nb-old-tag'), open: x.open, items: [...x.querySelectorAll('.nb-row li')].map(li => (li.querySelector('a,b')?.textContent || '').trim()) })));
  const write = async (title, out, sync) => {
    pageOut = () => out; syncOut = sync; const at = calls.length;
    await page.evaluate(k => generatePage(k, false, ''), K(title));
    await page.waitForFunction(k => S.pages[k] && !S.gen && !S.bgSync, K(title)); await page.evaluate(() => Store.q);
    return calls.slice(at);
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles('#importFile', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
    await page.click('#side [data-act="home"]'); await page.locator('.wcard button.open').click(); await page.waitForSelector('h1.t');

    await open('옛 기록');
    assert.deepStrictEqual(await page.locator('.cats .cat[data-cat]').allInnerTexts(), ['옛 분류', '기록물']);
    let bs = await boxes(); assert.deepStrictEqual(bs.map(b => [b.title, b.old]), [['알파국 군인 명단', true], ['옛 장비 목록', true]]);
    pass('축 정보가 없는 분류와 예전 방식의 틀(w.navboxes)이 있는 세계관이 깨지지 않고 열리며, 예전 틀에는 "이전 방식의 틀" 표시가 붙는다');

    await open('가람');
    bs = await boxes();
    assert.deepStrictEqual(bs.map(b => b.title), ['알파국 사람들', '군인 전체', '알파국의 군인', '대전쟁', '1950년생']);
    assert(bs.every(b => b.auto), '같은 구성원을 다루는 자동 틀이 있으면 예전 틀은 숨긴다');
    pass('한 문서가 여러 틀(소속×유형 자동 틀, 사건 자동 틀, 직접 만든 틀)에 속하면 모두 보이고, 같은 구성원의 예전 틀은 숨긴다');
    assert.deepStrictEqual(bs.map(b => b.open), [true, true, true, true, false]);
    pass('틀이 4개를 넘으면 구성원이 적은 틀부터 접는다');
    assert.deepStrictEqual(bs.find(b => b.title === '알파국의 군인').items, ['나래', '가람', '다솜', '자두']);
    assert.deepStrictEqual(bs.find(b => b.title === '대전쟁').items, ['나래', '마루', '가람']);
    assert(await page.locator('.navbox.nb-auto a.wl.new', { hasText: '자두' }).count() > 0, '아직 쓰지 않은 항목은 빨간 링크');
    const art = await page.evaluate(() => { const a = document.querySelector('.article'), n = document.querySelector('.navbox'); return !!(a.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); });
    assert(art, '틀은 본문 아래쪽에 있다');
    pass('구성원은 연도순(인물은 출생, 연도를 모르면 맨 끝)이고, 링크로 받아 둔 소속·유형이 있는 미작성 항목도 빨간 링크로 들어간다');

    await open('알파국'); bs = await boxes(); assert.deepStrictEqual(bs.map(b => b.title).sort(), ['알파국 사람들', '알파국의 군인'].sort());
    await open('대전쟁'); bs = await boxes(); assert.deepStrictEqual(bs.map(b => b.title), ['대전쟁']);
    pass('주제 문서("알파국", "대전쟁")에도 기준 분류가 제목과 같은 틀이 보인다');

    const many = await page.evaluate(() => { const w = S.world; const before = JSON.stringify(S.pages); const d = { cats: ['x'] }; for (let i = 0; i < 13; i++) { const k = 'm' + i; w.entities[k] = newEntity('구성원' + i, '인물', ''); S.pages[k] = { key: k, title: '구성원' + i, type: '인물', categories: [], infobox: i < 12 ? [{ label: '출생', value: `${1950 + i * 3}년` }] : [], sections: [] }; } const rows = navRows(w, d, Array.from({ length: 13 }, (_, i) => 'm' + i)).map(r => [r.label, r.items.length]); for (let i = 0; i < 13; i++) { delete w.entities['m' + i]; delete S.pages['m' + i]; } return { rows, same: JSON.stringify(S.pages) === before }; });
    assert.deepStrictEqual(many.rows, [['1950년대', 4], ['1960년대', 3], ['1970년대', 3], ['1980년대', 2], ['연도 미상', 1]]);
    pass('구성원이 12개를 넘으면 연대별로 줄을 나누고, 연도를 모르는 항목은 맨 끝 줄에 둔다');

    const wide = await page.evaluate(() => ({ a: widenAffil(S.world, { 소속: ['알파국 육군'], 유형: ['기사'] }).소속, b: widenAffil(S.world, { 소속: ['베타국 기사단', '다른 곳'] }).소속, c: widenAffil(S.world, { 소속: ['알파국', '알파국 육군'] }).소속, d: widenAffil(S.world, { 소속: ['감마 상회'] }).소속, e: widenAffil(S.world, { 소속: ['알파국군'] }).소속,
      p1: widenAffil(S.world, { 소속: ['알파국 육군'] }, '인물', '누군가').소속, p2: widenAffil(S.world, { 소속: ['알파국', '알파국 육군'] }, '인물', '누군가').소속,
      n1: widenAffil(S.world, { 소속: ['북방 연합'] }, '국가', '감마국').소속, n2: widenAffil(S.world, {}, '국가', '감마국').소속,
      g: catGuide(S.world, null, 30, '인물'), gn: catGuide(S.world, null, 30, '국가'), ge: catGuide(S.world, null, 30, '사건') }));
    assert.deepStrictEqual([wide.a, wide.b, wide.c, wide.d, wide.e], [['알파국', '알파국 육군'], ['베타국', '베타국 기사단'], ['알파국', '알파국 육군'], ['감마 상회'], ['알파국군']]);
    assert.deepStrictEqual([wide.p1, wide.p2], [['알파국'], ['알파국']], '인물의 소속은 넓은 것 하나');
    assert.deepStrictEqual([wide.n1, wide.n2], [['감마국', '북방 연합'], ['감마국']], '국가 문서는 자기 제목이 첫째 소속');
    assert(wide.g.includes('이 문서의 유형은 인물이다') && wide.g.includes('속한 국가(또는 그에 맞먹는 세력) 하나만') && wide.g.includes('이 세계 고유의 종류') && !wide.g.includes('예: 군인') && wide.g.includes('가장 대표하는 것 1개만') && wide.g.includes('인물은 붙이지 않는다') && !wide.g.includes('출생 연도'));
    assert(wide.gn.includes('자기 제목은 앱이 붙인다') && wide.gn.includes('연합이나 상위 세력'));
    assert(wide.ge.includes('사건의 종류') && wide.ge.includes('관련된 존재나 신분은 유형으로 쓰지 않는다') && wide.ge.includes('상위 사건'));
    assert(wide.g.includes('직접 참여했거나 쓰인 사건') && wide.g.includes('사례나 배경으로 언급만 한 사건은 붙이지 않는다'));
    assert((await page.evaluate(() => catGuide(S.world, null, 30, '개념'))).includes('그 사건으로 생겨났을 때만'), '개념 문서는 사례로 든 사건을 분류로 붙이지 않는다');
    pass('소속이 "국가 + 조직" 이름으로만 오면 그 국가를 첫째 소속으로 보태고, 인물은 넓은 소속 하나만, 국가 문서는 자기 제목을 첫째 소속으로 둔다. 분류 지침은 문서 유형별로 축의 뜻을 바꾼다');

    // 분류 합치기: 병사 → 군인
    await page.click('#side [data-act="cats"]'); await page.waitForSelector('#cmFrom');
    assert(await page.locator('.catidx h2', { hasText: '소속' }).count() && await page.locator('.catidx h2', { hasText: '축 미정' }).count());
    await page.selectOption('#cmFrom', '병사'); await page.selectOption('#cmTo', '군인'); await page.click('[data-act="cat-merge"]');
    await page.waitForFunction(() => S.world.categoryAliases?.['병사'] === '군인');
    assert.equal(await page.evaluate(k => S.pages[k].categories.join(), K('라온')), '알파국,병사', '문서 데이터는 고치지 않는다');
    await open('라온');
    assert.deepStrictEqual(await page.locator('.cats .cat[data-cat]').allInnerTexts(), ['알파국', '군인']);
    bs = await boxes(); assert.deepStrictEqual(bs.find(b => b.title === '알파국의 군인').items, ['나래', '가람', '라온', '다솜', '자두']);
    const guide = await page.evaluate(k => catGuide(S.world, k), K('사랑'));
    assert(!guide.includes('병사'), '프롬프트의 기존 분류 목록에 옛 이름이 없다'); assert(/- 유형: [^\n]*군인\(4\)/.test(guide), guide);
    await page.evaluate(() => { S.view = { name: 'category', cat: '병사' }; renderMain(); });
    assert.equal(await page.locator('h1.t').innerText(), '분류: 군인');
    pass('분류 합치기 뒤에는 표시, 틀 계산, 프롬프트의 기존 분류 목록에서 옛 이름을 새 이름으로 읽고, 문서 데이터는 그대로 둔다');

    // 새 문서: 작성 호출은 분류를 받지 않고, 확정 사실 정리가 완성된 본문에서 분류와 링크 항목의 소속·유형을 붙인다
    await open('바다'); assert(!(await boxes()).some(b => b.title === '베타국의 기사'));
    const out = { title: '사랑', type: '인물', summary: '베타국의 기사', notices: [], infobox: [{ label: '출생', value: '1952년 5월 2일' }],
      sections: [{ heading: '개요', level: 1, body: '사랑은 [[아름]]과 함께 싸웠다.' }], timeline: [], newEntities: [{ title: '아름', type: '인물', summary: '베타국의 기사' }],
      navboxes: [{ title: '모델이 만든 틀', rows: [{ label: '', items: ['[[아름]]'] }] }] };
    const sync1 = { facts: [], relations: [], categories: { 소속: ['베타국 기사단'], 유형: ['기사'], 사건: [] }, linkedCats: [{ title: '아름', 소속: ['베타국'], 유형: ['기사'] }] };
    let cs = await write('사랑', out, sync1);
    assert.deepStrictEqual(cs.map(c => c.kind), ['page', 'sync']);
    const saved = await page.evaluate(([k, h]) => ({ cats: S.pages[k].categories, axes: S.pages[k].catAxes, stale: S.pages[k].stale, hint: S.world.entities[h]?.cats, own: Object.values(S.world.navboxes).filter(nb => nb.src === k).length }), [K('사랑'), K('아름')]);
    assert.deepStrictEqual(saved.cats, ['베타국', '기사'], '인물의 소속은 넓은 것 하나만 남는다');
    assert.deepStrictEqual(saved.axes, ax({ 소속: ['베타국'], 유형: ['기사'] }));
    assert.deepStrictEqual(saved.hint, ax({ 소속: ['베타국'], 유형: ['기사'] }));
    assert.equal(saved.stale, undefined);
    assert.equal(saved.own, 0, '모델이 navboxes를 보내도 새 틀을 만들지 않는다');
    pass('새 문서의 분류는 확정 사실 정리가 축별로 붙이고(이름 목록 + {name, axis}), 문서가 없는 링크 항목의 소속·유형도 같은 호출에서 받는다');
    const pp = cs[0].prompt, sp = cs[1].prompt;
    assert(!/navboxes/.test(pp), '프롬프트에 navboxes 출력 지시가 없다'); assert(!pp.includes('구성원 명단을 틀로 만든다'));
    assert(!pp.includes('"categories"') && !pp.includes('"facts"') && !pp.includes('"terms"') && !pp.includes('"affiliations"') && !pp.includes('"existence"') && !pp.includes('"relations"'), '작성 호출은 분류·사실·관계·용어·소속 이력·존속 기간을 받지 않는다');
    assert(pp.includes('"timeline"') && pp.includes('"events"'), '연표와 사건 장부는 작성 호출이 받는다');
    assert(sp.includes('"categories":{"소속"') && sp.includes('이 문서의 유형은 인물이다') && /- 소속: [^\n]*베타국\(2\)/.test(sp) && sp.includes('같은 뜻의 분류가 이미 둘 이상 있으면 문서 수가 많은 쪽 하나만 쓴다') && sp.includes('"linkedCats"') && sp.includes('문서가 없는 링크 항목: 아름'));
    assert(!sp.includes('"timeline"') && !sp.includes('"events"'), '고치지 않은 새 문서는 연표·사건 장부를 다시 뽑지 않는다');
    pass('문서 작성 프롬프트에는 분류 지침이 없고, 확정 사실 정리 프롬프트가 문서 유형별 분류 지침과 축별 기존 분류(문서 수 포함)를 보여 준다');
    await page.waitForFunction(t => document.querySelector('h1.t')?.textContent === t, '사랑');
    bs = await boxes(); const beta = bs.find(b => b.title === '베타국의 기사');
    assert(beta && beta.auto, '소속×유형이 3개가 되면 틀이 자동으로 생긴다');
    assert.deepStrictEqual(beta.items, ['마루', '바다', '사랑', '아름']);
    await open('바다'); assert((await boxes()).some(b => b.title === '베타국의 기사'));
    pass('소속 X와 유형 Y가 함께 붙은 문서가 3개가 되면 "X의 Y" 틀이 자동으로 정의되고, 새 문서와 링크로 생긴 항목이 바로 구성원에 나타난다');

    // 틀이 있는 항목을 쓸 때는 그 틀의 구성원 목록을 맥락에 넣는다
    const out2 = { title: '아름', type: '인물', summary: '베타국의 기사', notices: [], infobox: [], sections: [{ heading: '개요', level: 1, body: '아름은 기사였다.' }], timeline: [], newEntities: [] };
    cs = await write('아름', out2, { facts: [], categories: { 소속: ['베타국'], 유형: ['기사'] } });
    assert.deepStrictEqual(cs.map(c => c.kind), ['page', 'sync']);
    assert(cs[0].prompt.includes('## 이 항목이 속한 틀') && /### 틀: 베타국의 기사[^\n]*총 4개/.test(cs[0].prompt) && cs[0].prompt.includes('아름 ← 이 항목'));
    pass('문서 생성 맥락에 이 항목이 속한 틀의 구성원 목록(계산 결과)을 넣는다');

    // 국가 문서는 자기 제목을 첫째 소속으로 코드가 붙인다. 정리 호출이 실패하면 경고 띠와 [다시 정리]를 띄운다
    await page.evaluate(() => { S.world.entities[keyOf('감마국')] = newEntity('감마국', '국가', ''); });
    const out3 = { title: '감마국', type: '국가', summary: '북방의 나라', notices: [], infobox: [], sections: [{ heading: '개요', level: 1, body: '감마국은 북방에 있다.' }], timeline: [], newEntities: [] };
    cs = await write('감마국', out3, null);
    assert.deepStrictEqual(cs.map(c => c.kind).filter(x => x !== 'other'), ['page', 'sync']);
    assert.equal(await page.evaluate(k => S.pages[k].stale, K('감마국')), 'new');
    await open('감마국');
    assert((await page.locator('main .banner.warn').innerText()).includes('분류와 확정 사실을 정리하지 못했습니다'));
    syncOut = { facts: [], categories: { 소속: ['북방 연합'], 유형: ['공화국'] } };
    await page.click('[data-act="sync-new"]');
    await page.waitForFunction(k => !S.bgSync && !S.pages[k].stale, K('감마국'));
    assert.deepStrictEqual(await page.evaluate(k => S.pages[k].categories, K('감마국')), ['감마국', '북방 연합', '공화국']);
    assert.equal(await page.locator('main .banner.warn').count(), 0);
    pass('국가 문서는 자기 제목을 첫째 소속으로 두고, 정리 호출이 실패하면 경고 띠를 띄워 [다시 정리]로 분류와 사실을 다시 붙인다');

    // 분류 목록에서 틀 지우기·만들기
    await page.click('#side [data-act="cats"]'); await page.waitForSelector('#ndTitle');
    await page.click('[data-nav-del="auto:군인|알파국"]'); await page.waitForFunction(() => S.world.navDefsOff?.includes('auto:군인|알파국'));
    await page.fill('#ndTitle', '베타국 사람들'); await page.fill('#ndCats', '베타국'); await page.click('[data-act="nav-add"]');
    await page.waitForFunction(() => S.world.navDefs.some(d => d.title === '베타국 사람들'));
    await open('가람'); assert(!(await boxes()).some(b => b.title === '알파국의 군인'));
    await open('마루'); assert((await boxes()).some(b => b.title === '베타국 사람들'));
    pass('분류 목록 화면에서 틀을 직접 만들고 지울 수 있다');

    assert.deepStrictEqual(errors, []);
    console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
