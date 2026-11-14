/* 인물 성격 주사위: 가중치 분포, 항목 저장과 재사용, 굴리지 않는 경우, 프롬프트 지침, 값 없는 옛 항목. Gemini 응답은 모두 가로챈다(유료 호출 0회) */
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
  const town = key('항구 도시'), old = key('옛 선장');
  const ent = (title, type, page) => ({ title, type, summary: title + ' 요약', facts: [], mentions: [], page, box: '' });
  const pg = (k, title, type) => ({ key: k, title, type, summary: title + ' 요약', infobox: [], sections: [{ heading: '개요', level: 1, body: title + '은 항구 도시와 이어져 있다.' }], links: [], createdAt: 1 });
  const world = { kind: 'world', id: 'port', title: '항구 도시', seed: '바다와 무역의 세계관.', era: '1900년', guide: '', rules: ['바다는 거칠다'], userCanon: '', timeline: [], relations: [], navboxes: {}, aliases: {}, toneTried: true, angleOff: true,
    entities: { [town]: ent('항구 도시', '지명', true), [old]: ent('옛 선장', '인물', true) }, mainKey: town };
  const fixture = { app: 'worldwiki', version: 1, worlds: [world], pages: { port: { [town]: pg(town, '항구 도시', '지명'), [old]: pg(old, '옛 선장', '인물') } } };
  const page = await ctx.newPage(), calls = [], errors = []; let pageType = '인물';
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
  await ctx.route('**/v1beta/models/**', async r => {
    const prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text, kind = prompt.includes('## 작성할 문서:') ? 'page' : 'other'; calls.push({ kind, prompt });
    if (kind !== 'page') { try { await r.fulfill({ status: 404, json: { error: { message: 'model missing' } } }); } catch {} return; }
    const title = /## 작성할 문서: 「([^」]+)」/.exec(prompt)[1];
    const out = { title, type: pageType, summary: title + '의 정의', infobox: [], sections: [{ heading: '개요', level: 1, body: title + '은 [[항구 도시]]와 이어져 있다.' }], links: [], facts: [], newEntities: [], relations: [], timeline: [] };
    try { await r.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] }) + '\n\n' }); } catch {}
  });
  const pagePrompts = from => calls.slice(from).filter(c => c.kind === 'page').map(c => c.prompt);
  const write = async (title, type, { rewrite = false, persona } = {}) => {
    const k = key(title), at = calls.length;
    await page.evaluate(({ k, title, type, rewrite, persona }) => { if (!S.world.entities[k]) S.world.entities[k] = newEntity(title, type, ''); if (persona) S.world.entities[k].persona = persona; generatePage(k, rewrite, ''); }, { k, title, type, rewrite, persona });
    await page.waitForFunction(k => S.pages[k] && !S.gen, k); await page.evaluate(() => Store.q);
    const ps = pagePrompts(at); assert.equal(ps.length, 1); return { k, prompt: ps[0], saved: (await read(page, 'w:port')).entities[k] };
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles('#importFile', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
    await page.click('#side [data-act="home"]'); await page.locator('.wcard button.open').click(); await page.waitForSelector('.article h2');

    const d = await page.evaluate(() => {
      let s = 12345; const lcg = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const counts = [0, 0, 0, 0, 0], life = {}; const N = 20000;
      for (let i = 0; i < N; i++) { const p = rollPersona(lcg); for (const [id] of PERSONA_AXES) counts[p.axes[id] - 1]++; if (!Number.isInteger(p.axes.calm) || p.axes.calm < 1 || p.axes.calm > 5) throw new Error('calm ' + p.axes.calm); life[p.life] = (life[p.life] || 0) + 1; }
      const one = v => rollPersona(() => v);
      return { counts: counts.map(c => c / (N * PERSONA_AXES.length)), life: Object.fromEntries(Object.entries(life).map(([k, v]) => [k, v / N])),
        axes: PERSONA_AXES.map(a => a.slice(1).join('↔')), weights: PERSONA_WEIGHTS, lifeW: PERSONA_LIFE,
        edges: [0, 0.09, 0.11, 0.29, 0.31, 0.69, 0.71, 0.89, 0.91, 0.9999].map(v => one(v).axes.intro), lifeEdges: [0.29, 0.31, 0.69, 0.71].map(v => one(v).life) };
    });
    assert.deepStrictEqual(d.axes, ['내향↔외향', '비관↔낙천', '진지↔장난기', '원칙↔융통', '온화↔까칠', '근면↔느긋', '안정↔불안정']);
    assert.deepStrictEqual(d.weights, [0.1, 0.2, 0.4, 0.2, 0.1]); assert.deepStrictEqual(d.lifeW, [['편안함', 0.3], ['보통', 0.4], ['고단함', 0.3]]);
    assert.deepStrictEqual(d.edges, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]); assert.deepStrictEqual(d.lifeEdges, ['편안함', '보통', '보통', '고단함']);
    [0.1, 0.2, 0.4, 0.2, 0.1].forEach((w, i) => assert(Math.abs(d.counts[i] - w) < 0.01, `값 ${i + 1}: ${d.counts[i]}`));
    assert(Math.abs(d.life['편안함'] - 0.3) < 0.015 && Math.abs(d.life['보통'] - 0.4) < 0.015 && Math.abs(d.life['고단함'] - 0.3) < 0.015, JSON.stringify(d.life));
    pass('축 일곱 개(정서 안정성 포함)를 1~5로 굴리고 1·5는 10%, 2·4는 20%, 3은 40%, 처지는 편안함 30%·보통 40%·고단함 30%로 나온다');

    await page.evaluate(() => { window.__r = Math.random; Math.random = () => 0.95; });
    let g = await write('바다 상인', '인물');
    assert.deepStrictEqual(g.saved.persona, { axes: { intro: 5, mood: 5, play: 5, rule: 5, temper: 5, drive: 5, calm: 5 }, life: '고단함' });
    for (const t of ['## 성격 경향과 지금 처지 (인물 문서일 때만)', '성격 경향: 외향 쪽으로 강하게(5), 낙천 쪽으로 강하게(5), 장난기 쪽으로 강하게(5), 융통 쪽으로 강하게(5), 까칠 쪽으로 강하게(5), 느긋 쪽으로 강하게(5), 불안정 쪽으로 강하게(5)', '지금 처지: 고단함',
      '불안정 쪽은 불안, 우울, 감정 기복, 무너짐과 회복으로 드러날 수 있다. 안정 쪽은 큰일 앞에서도 흔들리지 않는 모습으로 드러난다. 이 축도 형용사로 옮기지 말고 일화로 보여 준다.',
      '이 값은 성격의 출발점이다. 인물이 맡은 역할, 살아온 경험, 주변 사람과의 관계에 맞게 자연스럽게 다듬는다', '값을 형용사로 옮겨 적지 않는다', '일화와 선택, 행동으로 보여 준다', '중간(3)인 축은 굳이 드러내지 않아도 된다',
      '고단함이 아니면 큰 후유증, 장애, 중병, 몰락 같은 불행을 기본 결말로 쓰지 않는다', '실존 인물이거나 실존 인물을 바탕으로 한 인물(대체역사에서 재해석한 인물 포함)이면 이 값을 쓰지 않고', '확정 사실과 다른 문서의 언급에 이미 성격이나 처지가 드러나 있으면 그쪽이 우선한다',
      '무작위로 정한 성격 경향이 주어지면 그 값을 출발점으로 삼고']) assert(g.prompt.includes(t), t);
    assert(!g.prompt.includes('미리 정한 후보에서 고르지 않고'));
    await page.evaluate(() => { Math.random = () => 0.05; });
    const first = g.saved.persona; g = await write('바다 상인', '인물', { rewrite: true });
    assert.deepStrictEqual(g.saved.persona, first); assert(g.prompt.includes('## 다시 쓰기')); assert(g.prompt.includes('성격 경향: 외향 쪽으로 강하게(5), 낙천 쪽으로 강하게(5)'));
    pass('새 인물 문서를 쓸 때 굴린 값을 항목에 저장하고 축 이름·값·지침을 프롬프트에 넣으며, 다시 쓸 때는 다시 굴리지 않고 같은 값을 쓴다');

    g = await write('등대지기', '인물', { persona: { axes: { intro: 3, mood: 2 }, life: '편안함' } });
    assert.deepStrictEqual(g.saved.persona, { axes: { intro: 3, mood: 2 }, life: '편안함' }); assert(g.prompt.includes('성격 경향: 내향·외향 중간(3), 비관 쪽으로 약하게(2)\n지금 처지: 편안함') && !g.prompt.includes('불안, 우울'));
    pass('이미 값이 있는 항목은 새로 굴리지 않고, calm이 없는 옛 값에 calm을 채우지 않는다');

    g = await write('세관 창고', '지명'); assert.equal(g.saved.persona, undefined); assert(!g.prompt.includes('## 성격 경향'));
    pageType = '지명'; g = await write('붉은 부두', ''); assert(g.prompt.includes('## 성격 경향과 지금 처지 (인물 문서일 때만)') && g.prompt.includes('인물이 아니면 이 항목은 무시한다'));
    assert.equal(g.saved.persona, undefined); assert.equal((await page.evaluate(k => S.world.entities[k].persona, g.k)), undefined); pageType = '인물';
    pass('인물이 아닌 유형이면 굴리지 않고, 유형이 없으면 "인물 문서일 때만" 조건으로 넘기며 인물이 아닌 문서로 정해지면 값을 버린다');

    await page.evaluate(k => openEntity(k), old); await page.waitForFunction(() => document.querySelector('h1.t')?.textContent === '옛 선장');
    assert.equal((await read(page, 'w:port')).entities[old].persona, undefined);
    g = await write('옛 선장', '인물', { rewrite: true }); assert.equal(g.saved.persona, undefined); assert(!g.prompt.includes('## 성격 경향'));
    const bad = await page.evaluate(() => [personaBlock(null), personaBlock({}), personaBlock({ axes: { intro: 9, mood: 'x' }, life: '모름' }), personaBlock({ axes: null })]);
    assert.deepStrictEqual(bad, ['', '', '', '']);
    const mix = await page.evaluate(() => personaBlock({ axes: { intro: 1, mood: 5, play: 2, rule: 4, temper: 3, drive: 4 }, life: '보통' }));
    assert(mix.includes('성격 경향: 내향 쪽으로 강하게(1), 낙천 쪽으로 강하게(5), 진지 쪽으로 약하게(2), 융통 쪽으로 약하게(4), 온화·까칠 중간(3), 느긋 쪽으로 약하게(4)\n지금 처지: 보통'));
    assert(!mix.includes('불안정') && !mix.includes('불안, 우울'));
    const calm = await page.evaluate(() => [1, 2, 3].map(v => personaBlock({ axes: { intro: 3, calm: v }, life: '보통' })));
    assert(calm[0].includes('성격 경향: 내향·외향 중간(3), 안정 쪽으로 강하게(1)') && calm[0].includes('안정 쪽은 큰일 앞에서도 흔들리지 않는 모습으로 드러난다'));
    assert(calm[1].includes('안정 쪽으로 약하게(2)') && calm[1].includes('불안, 우울, 감정 기복'));
    assert(calm[2].includes('안정·불안정 중간(3)') && !calm[2].includes('불안, 우울'));
    pass('값이 없는 기존 항목은 그대로 열리고 다시 써도 값을 만들지 않으며, 깨진 값과 calm이 없는 옛 값의 정서 축·지시는 프롬프트에서 빠진다');

    await page.evaluate(() => { Math.random = window.__r; });
    assert.deepStrictEqual(errors, []); console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
