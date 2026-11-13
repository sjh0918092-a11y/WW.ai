/* 사건의 상세 서술 담당(detailIn)과 핵심 경과(beats): 다른 문서는 요약·참조하고, 경과의 주체·행위는 처음 기록을 따른다.
   Gemini 응답은 모두 가로챈다(유료 호출 0회) */
const assert = require('assert'), vm = require('vm');
const { appServer, appSource } = require('./helpers/app');
const { chromium } = require('playwright');
const html = appSource(), kc = {}; vm.createContext(kc); vm.runInContext(html.slice(html.indexOf('function cyrb53('), html.indexOf('const LINK_RE =')) + 'globalThis.makeKey=keyOf;', kc); const K = kc.makeKey;
const server = appServer();
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const browser = await chromium.launch(), ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem('wwiki:gemini')) localStorage.setItem('wwiki:gemini', JSON.stringify({ mode: 'key', key: 'test-key', main: 'test-main', quick: 'test-quick', preCheck: false })); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.abort()); await ctx.route('https://fonts.gstatic.com/**', r => r.abort());
  const ent = (title, type, page) => ({ title, type, summary: title + ' 요약', facts: [], mentions: [], page, box: '' });
  const pg = (title, type, at, extra = {}) => ({ key: K(title), title, type, summary: title + ' 요약', infobox: [], sections: [{ heading: '개요', level: 1, body: title + '의 기록. 1979년 6월 14일 기지 요격전에 나갔다.' }], links: [], createdAt: at, ...extra });
  const P = [pg('주인공', '인물', 1), pg('동료', '인물', 2), pg('후배', '인물', 3), pg('옛 기록', '문서', 4)];
  const entities = Object.fromEntries(P.map(p => [p.key, ent(p.title, p.type, true)]));
  entities[K('기지 요격전')] = ent('기지 요격전', '사건', false); entities[K('신참')] = ent('신참', '인물', false); entities[K('옛 전투')] = ent('옛 전투', '사건', false);
  // 옛 장부 항목: detail·detailIn·beats가 없다
  const legacy = { k: K('옛 전투'), name: '옛 전투', date: '1970년 1월 2일', place: '남쪽 들판', nums: [{ name: '병력', value: '30', unit: '명' }], parts: [K('신참'), K('옛 기록')], result: '이겼다', src: K('옛 기록'), createdAt: 4 };
  const world = { kind: 'world', id: 'ev', title: '사건 세계', seed: '기지를 지키는 사람들의 세계관.', era: '1980년', guide: '', rules: [], userCanon: '', timeline: [], relations: [], navboxes: {}, aliases: {}, toneTried: true, angleOff: true, events: [legacy], entities, mainKey: K('주인공'), createdAt: 1 };
  const fixture = { app: 'worldwiki', version: 1, worlds: [world], pages: { ev: Object.fromEntries(P.map(p => [p.key, p])) } };
  const page = await ctx.newPage(), calls = [], errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
  const EV = (detail, beats) => ({ name: '기지 요격전', kind: '요격전', date: '1979년 6월 14일', place: '북부 기지', nums: [{ name: '교전 시간', value: '40', unit: '분' }], participants: ['주인공', '동료', '신참'], result: '격퇴', detail, ...(beats ? { beats } : {}) });
  await ctx.route('**/v1beta/models/**', async r => {
    const prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text; calls.push(prompt);
    if (!prompt.includes('## 작성할 문서:')) { try { await r.fulfill({ status: 404, json: { error: { message: 'model missing' } } }); } catch {} return; }
    const out = { title: '신참', type: '인물', summary: '신참 조종사', infobox: [{ label: '성별', value: '남성' }], sections: [{ heading: '개요', level: 1, body: '신참은 [[기지 요격전]]에 나갔다. 자세한 내용은 [[동료]] 문서 참조.' }], facts: [], newEntities: [], relations: [], timeline: [],
      events: [EV(false, [{ actor: '육군 사령부', action: '요격 명령' }, { actor: '신참', action: '엄호' }, { actor: '의무 헬기', action: '진정제 투여' }])] };
    try { await r.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] }) + '\n\n' }); } catch {}
  });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles('#importFile', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
    await page.click('#side [data-act="home"]'); await page.locator('.wcard button.open').click(); await page.waitForFunction(() => document.querySelector('h1.t')?.textContent === '주인공');

    const old = await page.evaluate(k => { const w = S.world; return { block: eventBlock(w, k, []), read: readPrompt(w, keyOf('옛 기록')), check: checkPrompt(w, keyOf('옛 기록')), detail: eventDetailIn(w, keyOf('옛 전투')), beats: eventBeats(w, keyOf('옛 전투')) }; }, K('신참'));
    assert(old.block.includes('| 옛 전투 | 1970년 1월 2일 |') && !old.block.includes('### 핵심 경과') && !old.block.includes('### 자세한 서술을 맡은 문서'));
    assert.equal(old.detail, null); assert.equal(old.beats, null); assert(!old.read.includes('## 다른 문서가 먼저 기록한 사건의 핵심 경과') && typeof old.check === 'string' && !old.check.includes('핵심 경과(누가'));
    pass('detailIn과 beats가 없는 기존 장부 항목은 깨지지 않고 예전처럼 사건 표만 보인다');

    const st = await page.evaluate(([EV1, EV2, EV3]) => {
      const w = S.world;
      ingestEvents(w, keyOf('주인공'), [EV1]); ingestEvents(w, keyOf('동료'), [EV2]); ingestEvents(w, keyOf('후배'), [EV3]);
      const xs = w.events.filter(x => x.name === '기지 요격전');
      return { detailIn: [...new Set(xs.map(x => x.detailIn))], first: xs.find(x => x.src === keyOf('주인공')), base: eventBeats(w, keyOf('기지 요격전'))?.src };
    }, [EV(false, [{ actor: '동맹 북부군 사령부', action: '요격 명령' }, { actor: '주인공', action: '양팔을 등 뒤로 꺾어 결속' }, { actor: '주인공', action: '진정제 직접 투여' }]), EV(true, [{ actor: '육군 사령부', action: '출격 명령' }]), EV(true)]);
    assert.deepStrictEqual(st.detailIn, [K('동료')], 'detail: true인 첫 문서(주인공은 detail false)가 상세 서술을 맡는다');
    assert.equal(st.first.detail, undefined); assert.deepStrictEqual(st.first.beats.map(b => b.actor + '|' + b.action), ['동맹 북부군 사령부|요격 명령', '주인공|양팔을 등 뒤로 꺾어 결속', '주인공|진정제 직접 투여']);
    assert.equal(st.base, K('주인공'), '핵심 경과는 처음 기록한 문서가 기준');
    pass('detail: true인 첫 문서가 detailIn으로 정해지고(나중 문서는 바꾸지 못함), beats가 장부에 저장되며 처음 기록한 문서의 경과가 기준이다');

    await page.evaluate(k => openEntity(k), K('신참')); await page.waitForFunction(k => S.pages[k] && !S.gen, K('신참')); await page.evaluate(() => Store.q);
    const pp = calls.filter(c => c.includes('## 작성할 문서: 「신참」')).pop();
    for (const t of ['### 자세한 서술을 맡은 문서', '이 사건은 「동료」 문서에 자세히 서술되어 있다', '이 항목의 관점에서 2~3문장으로 요약하고', "'자세한 내용은 [[동료]] 문서 참조'를 붙인다", '장면을 다시 묘사하지 않는다', '상세 서술 문서에 없는 이 항목만의 관점',
      '### 핵심 경과', '「기지 요격전」 (「주인공」): 동맹 북부군 사령부 — 요격 명령 → 주인공 — 양팔을 등 뒤로 꺾어 결속 → 주인공 — 진정제 직접 투여', '이 경과의 주체와 행위는 바꾸지 않는다. 세부 묘사는 덧붙여도 된다', '"detail":"true 또는 false"', '"beats":[{"actor"', '한 문단 넘게 자세히 서술했으면 true'])
      assert(pp.includes(t), t);
    const mine = await page.evaluate(k => S.world.events.find(x => x.src === k), K('신참'));
    assert.deepStrictEqual([mine.detail, mine.detailIn, mine.beats.length], [undefined, K('동료'), 3]);
    pass('detailIn이 다른 문서인 사건을 다루면 요약·참조 링크 지시와 기준 핵심 경과가 프롬프트에 들어가고, 생성 응답의 beats·detail도 장부에 저장된다');

    const named = await page.evaluate(() => { const w = S.world, k = keyOf('기지 요격전'); S.pages[k] = { key: k, title: '기지 요격전', type: '사건', summary: '요격전', infobox: [], sections: [{ heading: '개요', level: 1, body: '요격전.' }], links: [], createdAt: 9 }; w.entities[k].page = true;
      const r = { d: eventDetailIn(w, k), block: eventBlock(w, keyOf('신참'), []), own: eventBlock(w, k, []) }; return r; });
    assert.equal(named.d, K('기지 요격전')); assert(named.block.includes('이 사건은 「기지 요격전」 문서에 자세히 서술되어 있다') && named.block.includes('[[기지 요격전]] 문서 참조'));
    assert(!named.own.includes('### 자세한 서술을 맡은 문서'), '사건 이름의 문서 자신에게는 요약 지시를 넣지 않는다');
    pass('사건 이름으로 된 문서가 있으면 그 문서가 상세 서술을 맡는다');

    const chk = await page.evaluate(() => { const w = S.world; return { read2: readPrompt(w, keyOf('동료')), read1: readPrompt(w, keyOf('주인공')), check2: checkPrompt(w, keyOf('동료')) }; });
    for (const t of ['## 다른 문서가 먼저 기록한 사건의 핵심 경과', '주체(누가)와 행위(무엇을)를 다르게 썼는지', '동맹 북부군 사령부 — 요격 명령', 'evidence에 아래 경과 줄을 옮긴다']) assert(chk.read2.includes(t), t);
    assert(!chk.read1.includes('## 다른 문서가 먼저 기록한 사건의 핵심 경과'), '처음 기록한 문서에는 자기 경과를 근거로 넣지 않는다');
    assert(chk.check2.includes('핵심 경과(누가 무엇을 했는가)') && chk.check2.includes('주인공 — 진정제 직접 투여'));
    pass('읽기 검사와 설정 대조 검사에 먼저 기록된 핵심 경과를 근거로 넘긴다(뜻 비교는 모델이 한다)');

    const ed = await page.evaluate(() => { const w = S.world; S.pages[keyOf('후배')].editedAt = 5; ingestEvents(w, keyOf('후배'), [{ name: '기지 요격전', date: '1979년 6월 14일', place: '북부 기지', detail: true, beats: [{ actor: '육군 사령부', action: '요격 명령' }] }]);
      delete S.pages[keyOf('기지 요격전')]; w.entities[keyOf('기지 요격전')].page = false;
      return { base: eventBeats(w, keyOf('기지 요격전'))?.src, d: eventDetailIn(w, keyOf('기지 요격전')), read: readPrompt(w, keyOf('후배')) }; });
    assert.equal(ed.base, K('후배')); assert.equal(ed.d, K('후배')); assert(!ed.read.includes('## 다른 문서가 먼저 기록한 사건의 핵심 경과'));
    pass('사용자가 직접 고친 문서의 경과와 상세 서술은 언제나 기준이다');

    assert.deepStrictEqual(errors, []);
    console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
