/* 여러 문서의 교정을 동시에 진행하고, 사이드바 '진행 중인 작업'에서 각각 검토·적용한다. Gemini 응답은 모두 가로챈다(유료 호출 0회) */
const assert = require("assert"), vm = require("vm");
const { appServer, appSource } = require("./helpers/app");
const { chromium } = require("playwright");
const html = appSource(), kc = {}; vm.createContext(kc); vm.runInContext(html.slice(html.indexOf("function cyrb53("), html.indexOf("const LINK_RE =")) + "globalThis.makeKey=keyOf;", kc); const key = kc.makeKey;
const server = appServer();
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r)); const browser = await chromium.launch(), ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem("wwiki:gemini")) localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "relay", pass: "test-key", main: "test-main", quick: "test-quick", preCheck: false })); });
  await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); await ctx.route("https://fonts.gstatic.com/**", r => r.abort());
  const A = key("북해 기지"), B = key("남해 기지");
  const doc = (k, title, year) => ({ key: k, title, type: "지명", summary: title + "의 기록", categories: [], infobox: [], links: [], createdAt: 1,
    sections: [{ heading: "개요", level: 1, body: `${title}는 ${year}년에 준공되었다.` }],
    check: { at: 2, issues: [{ claim: `${title}는 ${year}년에 준공되었다.`, conflict: "확정 연표는 2014년 준공이다.", severity: "high" }] } });
  const ent = t => ({ title: t, type: "지명", summary: t + "의 기록", facts: [], mentions: [], page: true, box: "" });
  const world = { kind: "world", id: "sea", title: "심해 세계", seed: "바다 세계.", era: "2016년", guide: "", rules: [], userCanon: "", toneTried: true, timeline: [], relations: [], navboxes: {}, aliases: {}, mainKey: A, createdAt: 1,
    entities: { [A]: ent("북해 기지"), [B]: ent("남해 기지") } };
  const fixture = { app: "worldwiki", version: 1, worlds: [world], pages: { sea: { [A]: doc(A, "북해 기지", 2010), [B]: doc(B, "남해 기지", 2011) } } };
  const held = [];
  await ctx.route("**/v1beta/models/**", async r => {
    const body = r.request().postData() || "";
    const reply = obj => r.fulfill({ contentType: "text/event-stream", body: "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] }) + "\n\n" }).catch(() => {});
    if (body.includes("편집자가 남긴 메모")) {   // 교정 요청은 풀어 줄 때까지 붙잡아 둔다
      const t = body.includes("「북해 기지」의 원문") ? "북해 기지" : "남해 기지", y = t === "북해 기지" ? 2010 : 2011;
      held.push(() => reply({ edits: [{ memo: 1, field: "body", old: `${y}년에 준공`, new: "2014년에 준공" }], note: "연도를 맞췄다." }));
      return;
    }
    reply({ facts: [], timeline: [], relations: [], events: [], newEntities: [] });
  });
  const page = await ctx.newPage(), errors = []; page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles("#importFile", { name: "f.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
    await page.click('#side [data-act="home"]'); await page.locator('[data-world="sea"]').click(); await page.waitForSelector(".memo");

    await page.click('[data-fix="0"]');
    await page.waitForFunction(k => S.fixJobs.get(k)?.phase === "busy", A);
    assert.equal(await page.evaluate(() => S.view.name), "article");
    assert(await page.locator(".sheet .memo-line", { hasText: "교정안을 만드는 중" }).count());
    await page.evaluate(k => { S.view = { name: "article", key: k }; renderAll(); }, B); await page.waitForSelector(".memo");
    assert.equal(await page.locator('[data-fix="0"]').isDisabled(), false, "다른 문서의 교정 중에도 이 문서의 고치기를 누를 수 있다");
    await page.click('[data-fix="0"]');
    await page.waitForFunction(k => S.fixJobs.get(k)?.phase === "busy", B);
    const work = page.locator("#side .work");
    assert.equal(await work.locator("h4").innerText(), "진행 중인 작업 · 2");
    assert.equal(await work.locator(".gq-st", { hasText: "교정 중" }).count(), 2);
    pass("두 문서의 교정이 동시에 진행되고 사이드바 '진행 중인 작업'에 함께 보인다");

    while (held.length < 2) await page.waitForTimeout(20);
    held.splice(0).forEach(f => f());
    await page.waitForFunction(([a, b]) => S.fixJobs.get(a)?.phase === "review" && S.fixJobs.get(b)?.phase === "review", [A, B]);
    assert.equal(await work.locator(".gq-st", { hasText: "검토 대기" }).count(), 2);
    pass("끝난 교정은 각각 '검토 대기'로 남는다");

    await work.locator(`[data-fixopen="${A}"]`).click(); await page.waitForSelector('[data-act="fixv-apply"]');
    await page.click('[data-act="fixv-apply"]'); await page.waitForFunction(k => S.view.name === "article" && S.view.key === k && !S.fixJobs.has(k), A);
    assert((await page.evaluate(k => S.pages[k].sections[0].body, A)).includes("2014년"));
    assert.equal(await page.evaluate(k => S.fixJobs.get(k)?.phase, B), "review", "한 문서를 적용해도 다른 문서의 교정안은 남는다");
    await page.locator(`#side [data-fixopen="${B}"]`).click(); await page.waitForSelector('[data-act="fixv-apply"]');
    await page.click('[data-act="fixv-apply"]'); await page.waitForFunction(k => !S.fixJobs.has(k) && S.pages[k].sections[0].body.includes("2014년"), B);
    await page.waitForFunction(() => !document.querySelector("#side .work .gq-st") || !document.querySelector("#side .work").textContent.includes("교정"));
    pass("사이드바에서 각 교정안을 열어 따로 적용하고, 적용한 교정은 목록에서 빠진다");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
