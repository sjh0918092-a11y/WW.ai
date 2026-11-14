/* 인물 일화의 소재(motifs): 응답 저장, 다른 인물 특징 목록의 소재 표시와 빈도 집계, 소재 없는 옛 문서, 프롬프트 지침. Gemini 응답은 모두 가로챈다(유료 호출 0회) */
const assert = require('assert'), vm = require('vm');
const { appServer, appSource } = require('./helpers/app');
const { chromium } = require('playwright');
const html = appSource(), keyContext = {}; vm.createContext(keyContext); vm.runInContext(html.slice(html.indexOf('function cyrb53('), html.indexOf('const LINK_RE =')) + 'globalThis.makeKey=keyOf;', keyContext); const key = keyContext.makeKey;
const server = appServer();
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const browser = await chromium.launch(), ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem('wwiki:gemini')) localStorage.setItem('wwiki:gemini', JSON.stringify({ mode: 'key', key: 'test-key', main: 'test-main', quick: 'test-quick', preCheck: false })); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.abort()); await ctx.route('https://fonts.gstatic.com/**', r => r.abort());
  const town = key('항구 도시'), old = key('옛 선장'), clerk = key('옛 서기');
  const ent = (title, type, page) => ({ title, type, summary: title + ' 요약', facts: [], mentions: [], page, box: '' });
  const pg = (k, title, type, secs = []) => ({ key: k, title, type, summary: title + ' 요약', infobox: [], sections: [{ heading: '개요', level: 1, body: title + '은 항구 도시와 이어져 있다.' }, ...secs], links: [], createdAt: 1 });
  const world = { kind: 'world', id: 'port', title: '항구 도시', seed: '바다와 무역의 세계관. 모든 선원은 배급 럼을 받는다.', era: '1900년', guide: '', rules: ['선원은 하루 한 잔 배급 럼을 받는다'], userCanon: '', timeline: [], relations: [], navboxes: {}, aliases: {}, toneTried: true, angleOff: true,
    entities: { [town]: ent('항구 도시', '지명', true), [old]: ent('옛 선장', '인물', true), [clerk]: ent('옛 서기', '인물', true) }, mainKey: town };
  const fixture = { app: 'worldwiki', version: 1, worlds: [world], pages: { port: { [town]: pg(town, '항구 도시', '지명'), [old]: pg(old, '옛 선장', '인물'),
    [clerk]: pg(clerk, '옛 서기', '인물', [{ heading: '특징', level: 1, body: '' }, { heading: '장부 정리', level: 2, body: '장부를 매일 정리했다.' }]) } } };
  const page = await ctx.newPage(), calls = [], errors = []; let pageType = '인물', motifs;
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
  await ctx.route('**/v1beta/models/**', async r => {
    const prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text, kind = prompt.includes('## 작성할 문서:') ? 'page' : 'other'; calls.push({ kind, prompt });
    if (kind !== 'page') { try { await r.fulfill({ status: 404, json: { error: { message: 'model missing' } } }); } catch {} return; }
    const title = /## 작성할 문서: 「([^」]+)」/.exec(prompt)[1];
    const out = { title, type: pageType, summary: title + '의 정의', infobox: [], sections: [{ heading: '개요', level: 1, body: title + '은 [[항구 도시]]와 이어져 있다.' }, { heading: '특징', level: 1, body: '' }, { heading: title + '의 버릇', level: 2, body: '일화.' }],
      links: [], facts: [], newEntities: [], relations: [], timeline: [], ...(motifs !== undefined ? { motifs } : {}) };
    try { await r.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] }) + '\n\n' }); } catch {}
  });
  const write = async (title, type, m, { rewrite = false } = {}) => {
    const k = key(title), at = calls.length; motifs = m;
    await page.evaluate(({ k, title, type, rewrite }) => { if (!S.world.entities[k]) S.world.entities[k] = newEntity(title, type, ''); if (type === '인물') S.world.entities[k].persona = { axes: { rule: 5 }, life: '보통' }; generatePage(k, rewrite, ''); }, { k, title, type, rewrite });
    await page.waitForFunction(k => S.pages[k] && !S.gen, k); await page.evaluate(() => Store.q);
    const ps = calls.slice(at).filter(c => c.kind === 'page').map(c => c.prompt); assert.equal(ps.length, 1);
    return { k, prompt: ps[0], saved: await page.evaluate(k => Store.getPage('port', k), k) };
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles('#importFile', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('가져왔습니다'));
    await page.click('#side [data-act="home"]'); await page.locator('.wcard button.open').click(); await page.waitForSelector('.article h2');

    let g = await write('바다 상인', '인물', ['배급 럼', '[[규칙 위반]]', '배급 럼', ' ', 5, '음악', '가족']);
    assert.deepStrictEqual(g.saved.motifs, ['배급 럼', '규칙 위반', '음악']);
    for (const t of ['"motifs":["이 인물 문서에서 성격을 보여 준 일화의 중심 소재(짧은 명사)"]', 'motifs에는 이 항목이 인물이면 이 문서에서 성격을 보여 준 일화의 중심 소재 1~3개를 짧은 명사로 쓴다',
      '원안과 핵심 규칙에 나오는 장치(그 세계의 기본 보급품, 기본 장비, 기본 제도 등)를 성격 일화의 중심 소재로 삼지 않는 것을 기본으로 한다', '성격은 그 인물의 생활, 취향, 사람, 장소, 습관, 일하는 방식에서 찾는다',
      '성격 경향은 한 가지 방식으로만 드러내지 않는다', '원칙과 융통은 규칙 위반만이 아니라 일, 돈, 시간, 약속, 사람, 취향을 대하는 방식으로도 드러난다',
      'Show concretely where and how the character lives, what they do, and their relationships', 'Do not summarize with phrases such as "without lasting injuries", "remaining healthy", or "a peaceful, comfortable, or difficult daily life", or deny misfortunes that never occurred'])
      assert(g.prompt.includes(t), t);
    assert(g.prompt.includes('- 옛 서기: 장부 정리') && !g.prompt.includes('옛 서기: 장부 정리 (소재') && !g.prompt.includes('- 옛 선장:') && !g.prompt.includes('이미 많이 쓰인 소재'));
    pass('인물 문서 응답의 motifs를 다듬어(링크 표시·중복·빈 값 제거, 3개까지) 저장하고, 프롬프트에 motifs 요청과 핵심 규칙 장치·한 가지 방식·처지 직역 금지 지침을 넣는다');

    g = await write('등대지기', '인물', ['배급럼', '동물']);
    assert.deepStrictEqual(g.saved.motifs, ['배급럼', '동물']); assert(g.prompt.includes('- 바다 상인: 바다 상인의 버릇 (소재: 배급 럼, 규칙 위반, 음악)'));
    g = await write('세관원', '인물', ['장부']);
    const ti = g.prompt.slice(g.prompt.indexOf('## 다른 인물의 특징'), g.prompt.indexOf('## 인물 문서'));
    for (const t of ['- 등대지기: 등대지기의 버릇 (소재: 배급럼, 동물)', '- 바다 상인: 바다 상인의 버릇 (소재: 배급 럼, 규칙 위반, 음악)', '- 옛 서기: 장부 정리\n', '- 이미 많이 쓰인 소재: 배급 럼(2명)\n',
      '이미 많이 쓰인 소재로 이 인물의 성격을 보여 주지 않는다. 확정 사실이 그 소재를 요구할 때만 예외다.']) assert(ti.includes(t), t + '\n' + ti);
    assert(!/이미 많이 쓰인 소재:.*(규칙 위반|동물|음악)/.test(ti));
    pass('다른 인물 특징 목록에 소재를 함께 보여 주고, 인물 2명 이상이 쓴 소재(띄어쓰기 차이 포함)만 "이미 많이 쓰인 소재" 줄에 모은다');

    g = await write('바다 상인', '인물', undefined, { rewrite: true }); assert.deepStrictEqual(g.saved.motifs, ['배급 럼', '규칙 위반', '음악']);
    g = await write('바다 상인', '인물', ['밧줄'], { rewrite: true }); assert.deepStrictEqual(g.saved.motifs, ['밧줄']);
    pageType = '지명'; g = await write('세관 창고', '지명', ['배급 럼']); assert.equal(g.saved.motifs, undefined); assert(!g.prompt.includes('"motifs"')); pageType = '인물';
    pass('motifs 없이 돌아온 다시 쓰기는 이전 소재를 두고 새 소재가 오면 바꾸며, 인물이 아닌 문서에는 저장하지 않는다');

    const plain = await page.evaluate(({ old, clerk }) => { const keep = {}; for (const k of Object.keys(S.pages)) if (k !== old && k !== clerk && S.pages[k].type === '인물') { keep[k] = S.pages[k]; delete S.pages[k]; }
      const r = traitIndex(S.world, null); Object.assign(S.pages, keep); return r; }, { old, clerk });
    assert.equal(plain, '- 옛 서기: 장부 정리');
    const broken = await page.evaluate(k => { const p = S.pages[k], m = p.motifs; p.motifs = 'x'; const r = traitIndex(S.world, null); p.motifs = m; return r; }, key('등대지기'));
    assert(broken.includes('- 등대지기: 등대지기의 버릇\n') && broken.includes('이미 많이 쓰인 소재: 배급 럼(2명)') === false);
    pass('motifs가 없거나 깨진 기존 문서가 섞여도 traitIndex가 깨지지 않는다');

    assert.deepStrictEqual(errors, []); console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
