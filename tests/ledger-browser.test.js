/* 장부 기반 일관성의 화면과 생성 흐름: 용어 정의 보기·고치기·확정·고르기, 사건 장부 표, 생성 응답의 events/terms/timeline 받기.
   옛 세계관(새 필드 없음)도 그대로 열린다. Gemini 응답은 모두 가로챈다(유료 호출 0회) */
const assert = require("assert"), vm = require("vm");
const { appServer, appSource } = require("./helpers/app");
const { chromium } = require("playwright");
const html = appSource(), kc = {}; vm.createContext(kc); vm.runInContext(html.slice(html.indexOf("function cyrb53("), html.indexOf("const LINK_RE =")) + "globalThis.makeKey=keyOf;", kc); const key = kc.makeKey;
const server = appServer();
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
const read = (p, k) => p.evaluate(k => new Promise(resolve => { const r = indexedDB.open("worldwiki-gemini", 1); r.onsuccess = () => { const d = r.result, t = d.transaction("kv"), q = t.objectStore("kv").get(k); q.onsuccess = () => resolve(q.result); t.oncomplete = () => d.close(); }; }), k);
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r)); const browser = await chromium.launch(), ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem("wwiki:gemini")) localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "key", key: "test-key", main: "test-main", quick: "test-quick", preCheck: false })); });
  await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); await ctx.route("https://fonts.gstatic.com/**", r => r.abort());
  const duel = key("해저 결투"), hero = key("한서진"), rival = key("카이 마루"), stub = key("북해 기지");
  const ent = (title, page, type = "인물") => ({ title, type, summary: title + " 요약", facts: [], mentions: [], page, box: "" });
  const pg = (k, title, type, createdAt, body) => ({ key: k, title, type, summary: title + " 요약", categories: [], infobox: [], sections: [{ heading: "개요", level: 1, body }], links: [], createdAt });
  const world = { kind: "world", id: "sea", title: "심해 세계", seed: "거대 병기가 바다에서 싸우는 세계.", era: "2016년", guide: "", rules: ["병기는 한 해역에 최대 두 기까지 배치한다"], userCanon: "", toneTried: true,
    timeline: [{ year: "2015", event: "한서진이 해저 결투에서 이겼다", src: duel }], relations: [], navboxes: {}, aliases: {}, mainKey: duel, createdAt: 1,
    entities: { [duel]: ent("해저 결투", true, "사건"), [hero]: ent("한서진", true), [rival]: ent("카이 마루", false), [stub]: { ...ent("북해 기지", false, "지명"), mentions: [{ from: duel, text: "한서진과 카이 마루가 180해리 떨어진 북해 기지 앞바다에서 맞붙었다." }] } },
    events: [{ k: duel, name: "해저 결투", date: "2015년 11월 4일", place: "북해", nums: [{ name: "거리", value: "180", unit: "해리" }, { name: "수심", value: "70", unit: "m" }], parts: [hero, rival], result: "한서진의 승리", src: duel, createdAt: 1 }],
    glossary: [{ term: "Type-05", definition: "대대로 물려받는 칭호", src: duel, confirmed: false, at: 1, alts: [{ definition: "소녀 한 명의 개인 이름", src: hero, at: 2 }] }, { term: "잠항 병기", definition: "물속을 다니는 생체병기", src: hero, confirmed: false, at: 3 }] };
  const old = { kind: "world", id: "old", title: "옛 세계", seed: "옛 원안", era: "1990년", guide: "", rules: [], userCanon: "", toneTried: true, timeline: [], relations: [], navboxes: {}, aliases: {}, mainKey: key("옛 문서"), createdAt: 1, entities: { [key("옛 문서")]: ent("옛 문서", true, "지명") } };
  const fixture = { app: "worldwiki", version: 1, worlds: [world, old], pages: {
    sea: { [duel]: pg(duel, "해저 결투", "사건", 1, "[[한서진]]과 [[카이 마루]]가 180해리 떨어진 [[북해 기지]] 앞바다에서 맞붙었다."), [hero]: pg(hero, "한서진", "인물", 2, "[[한서진]]은 [[해저 결투]]의 승자다.") },
    old: { [key("옛 문서")]: pg(key("옛 문서"), "옛 문서", "지명", 1, "옛 문서의 본문이다.") } } };
  const page = await ctx.newPage(), prompts = [], errors = [];
  page.on("pageerror", e => { errors.push(e.message); console.error("Browser:", e.message); });
  const reply = { title: "북해 기지", type: "지명", summary: "북해의 해저 기지", categories: ["기지"], notices: [], infobox: [{ label: "위치", value: "북해" }],
    sections: [{ heading: "개요", level: 1, body: "[[북해 기지]]는 [[한서진]]이 출격한 기지다. 2015년 11월 4일 이곳 앞바다 40해리에서 [[해저 결투]]가 벌어졌다." }],
    facts: [], relations: [], navboxes: [], newEntities: [],
    timeline: [{ year: "2016", about: "한서진", event: "만 32세로 기지 인근에 거주 중임이 확인됨" }, { year: "2016", event: "근황이 확인됨" }, { year: "2014", about: "북해 기지", event: "북해 기지가 준공되었다" }, { year: "2013", about: "카이 마루", event: "카이 마루가 진수되었다" }, { year: "2012", about: "한서진", event: "한서진이 입대했다" }],
    events: [{ name: "해저 결투", date: "2015년 11월 4일", place: "북해", nums: [{ name: "거리", value: "40", unit: "해리" }], participants: ["한서진", "카이 마루"], result: "한서진의 승리" }, { name: "막연한 사건", place: "어딘가" }],
    terms: [{ term: "Type-05", definition: "전 세계 일련번호" }, { term: "잠항 경보", definition: "잠항 병기가 접근할 때 내리는 경보 단계" }] };
  await ctx.route("**/v1beta/models/**", async r => {
    const prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text;
    if (!prompt.includes("## 작성할 문서:")) { try { await r.fulfill({ status: 404, json: { error: { message: "model missing" } } }); } catch {} return; }
    prompts.push(prompt);
    try { await r.fulfill({ contentType: "text/event-stream", body: "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: "STOP" }] }) + "\n\n" }); } catch {}
  });
  const port = server.address().port;
  try {
    await page.goto(`http://127.0.0.1:${port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles("#importFile", { name: "f.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));

    /* 옛 세계관: 새 필드가 없어도 문서와 설정 노트가 열린다 */
    await page.click('#side [data-act="home"]'); await page.locator('[data-world="old"]').click(); await page.waitForSelector(".article h2");
    await page.click('#side [data-act="canon"]'); await page.waitForSelector("#glossary");
    assert.equal(await page.locator("#eventLedger").count(), 0); assert(await page.locator("#glossary ~ p.note").first().isVisible());
    await page.click('[data-act="save-canon"]'); await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("저장했습니다"));
    const oldSaved = await read(page, "w:old"); assert.deepEqual(oldSaved.glossary || [], []); assert.equal(oldSaved.events, undefined);
    pass("새 필드가 없는 옛 세계관도 문서와 설정 노트가 열리고 저장된다");

    /* 용어 정의와 사건 장부 화면 */
    await page.click('#side [data-act="home"]'); await page.locator('[data-world="sea"]').click(); await page.waitForSelector(".article h2");
    await page.click('#side [data-act="canon"]'); await page.waitForSelector("#glossary");
    assert.equal(await page.locator("[data-gl-ask]").count(), 1);
    assert((await page.locator("[data-gl-ask]").textContent()).includes("「Type-05」의 뜻이 문서마다 다릅니다. 어느 쪽으로 할까요?"));
    assert.equal(await page.locator("#eventLedger tr").count(), 1); assert((await page.locator("#eventLedger").textContent()).includes("거리 180해리"));
    pass("설정 노트에 용어 정의, 엇갈린 정의의 질문, 사건 장부가 보인다");

    await page.click('[data-term-pick="0"][data-alt="0"]'); await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("확정했습니다"));
    assert.equal(await page.locator("[data-gl-ask]").count(), 0); assert.equal(await page.inputValue('[data-gl-def="0"]'), "소녀 한 명의 개인 이름"); assert(await page.isChecked('[data-gl-ok="0"]'));
    let saved = await read(page, "w:sea"); assert.equal(saved.glossary[0].definition, "소녀 한 명의 개인 이름"); assert.equal(saved.glossary[0].confirmed, true); assert.equal(saved.glossary[0].alts, undefined);
    pass("'어느 쪽으로 할까요'에서 고른 정의가 확정되어 저장된다");

    await page.fill('[data-gl-def="1"]', "물속을 다니는 비인가 생체병기"); await page.check('[data-gl-ok="1"]');
    await page.fill("#glNewTerm", "제식 번호"); await page.fill("#glNewDef", "나라마다 따로 매긴다.");
    await page.click('[data-act="save-canon"]'); await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("저장했습니다"));
    saved = await read(page, "w:sea");
    assert.deepEqual(saved.glossary.map(g => [g.term, g.definition, g.src === "user", g.confirmed]), [["Type-05", "소녀 한 명의 개인 이름", false, true], ["잠항 병기", "물속을 다니는 비인가 생체병기", true, true], ["제식 번호", "나라마다 따로 매긴다.", true, true]]);
    pass("설정 노트에서 정의를 고치고 확정하고 새 용어를 더할 수 있다");

    /* 생성: 프롬프트에 장부가 들어가고, 응답의 events·terms·timeline을 검사해 받는다 */
    await page.evaluate(k => openEntity(k), stub);
    await page.waitForFunction(k => !S.gen && S.pages[k], stub);
    const pr = prompts[prompts.length - 1];
    assert(pr.includes("## 용어 정의 (이 세계의 용어는 이 뜻으로만 쓴다)")); assert(pr.includes("- Type-05: 소녀 한 명의 개인 이름 [사용자 확정]"));
    assert(pr.includes("## 사건 장부 (이 문서가 다룰 수 있는 사건의 확정 기록)")); assert(pr.includes("| 해저 결투 | 2015년 11월 4일 | 북해 | 거리 180해리; 수심 70m |"));
    assert(pr.includes('"events":[{') && pr.includes('"terms":[{'));
    await page.waitForFunction(() => S.world.events.length === 2);
    saved = await page.evaluate(() => JSON.parse(JSON.stringify(S.world)));
    const mine = saved.events.find(x => x.src !== saved.mainKey); assert.equal(mine.k, saved.mainKey); assert.equal(mine.nums[0].value, "40");
    assert.equal(saved.glossary.length, 4, "확정된 Type-05는 후보를 받지 않고, 새 용어만 더한다"); assert.equal(saved.glossary[0].alts, undefined); assert.equal(saved.glossary[3].term, "잠항 경보");
    assert.deepEqual(saved.timeline.filter(t => t.src === stub).map(t => t.event), ["카이 마루가 진수되었다", "북해 기지가 준공되었다"], "주어 없는 항목은 빼고 두 개까지");
    const issues = await page.evaluate(k => eventIssues(S.world, k), stub);
    assert.equal(issues.length, 1); assert(issues[0].claim.includes("40해리")); assert(issues[0].conflict.includes("180해리"));
    pass("문서 작성 프롬프트에 용어 정의와 사건 장부가 들어가고, 응답의 장부 값이 검사를 거쳐 기록된다");

    assert.deepEqual(errors, []);
    console.log(`\n모두 통과 (${n}개). 유료 AI 호출 0회.`);
  } catch (e) { console.error("실패:", e); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
