/* 작성 대기열: 문서를 쓰는 동안 누른 빨간 링크는 대기열에 들어가고, 앞 문서가 끝나면 차례로 작성된다. 대기·작성 중 문서를 취소할 수 있다 */
const assert = require("assert"), vm = require("vm");
const { appServer, appSource } = require("./helpers/app");
const { chromium } = require("playwright");
const html = appSource(), c = {}; vm.createContext(c); vm.runInContext(html.slice(html.indexOf("function cyrb53("), html.indexOf("const LINK_RE =")) + "globalThis.makeKey=keyOf;", c); const key = c.makeKey;
const server = appServer();
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch(), ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem("wwiki:gemini")) localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "relay", pass: "test-key", preCheck: false })); });
  await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); await ctx.route("https://fonts.gstatic.com/**", r => r.abort()); await ctx.route("**/v1beta/**", r => r.abort());
  const page = await ctx.newPage(), errors = []; page.on("pageerror", e => errors.push(e.message));
  const a = key("주인공"), titles = ["붉은 격납고", "푸른 함선", "검은 탑", "흰 등대"], ks = titles.map(key);
  const ent = (title, written) => ({ title, type: "장소", summary: title, facts: [], mentions: [], page: written });
  const w = { kind: "world", id: "q", title: "대기열 세계", seed: "군인의 일상", era: "1989년", guide: "", rules: [], timeline: [], relations: [], events: [], glossary: [], navboxes: {}, aliases: {}, toneTried: true, entities: { [a]: { ...ent("주인공", true), type: "인물" }, ...Object.fromEntries(ks.map((k, i) => [k, ent(titles[i], false)])) }, mainKey: a, createdAt: 1 };
  const doc = { key: a, title: "주인공", type: "인물", summary: "주인공", categories: ["인물"], infobox: [], sections: [{ heading: "개요", level: 1, body: titles.map(t => `[[${t}]]`).join(", ") + "에 다닌다." }], links: ks, createdAt: 1 };
  const fixture = { app: "worldwiki", version: 1, worlds: [w], pages: { q: { [a]: doc } } };
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    await page.goto(url); await page.click('#side [data-act="gset"]');
    await page.setInputFiles("#importFile", { name: "f.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
    await page.click('#side [data-act="home"]'); await page.locator('[data-world="q"]').click(); await page.waitForFunction(() => document.querySelector("h1.t")?.textContent === "주인공");
    // AI 호출을 손으로 끝낼 수 있게 바꾼다
    await page.evaluate(() => {
      window.__calls = []; 
      window.callJson = (kind, prompt, opts, meta) => meta?.title === "없는 이름" ? Promise.resolve({ notFound: true }) : meta?.title === "다른 이름" ? Promise.resolve({ redirect: "붉은 격납고" }) : new Promise((res, rej) => {
        opts?.signal?.addEventListener("abort", () => rej({ code: "cancelled" }));
        window.__calls.push({ title: meta?.title, done: () => res({ title: meta.title, type: "장소", summary: meta.title + " 요약", categories: ["장소", "대기열 세계 장소"], infobox: [{ label: "소속", value: "대기열 세계" }], sections: [{ heading: "개요", level: 1, body: meta.title + "은 오래된 곳이다." }] }) });
      });
    });
    const red = async t => { await page.locator("main a.wl.new", { hasText: t }).click(); await page.waitForFunction(t => document.querySelector("h1.t")?.textContent === t, t); };
    const home = () => page.evaluate(k => openEntity(k), a);
    await red(titles[0]); await page.waitForFunction(() => window.__calls.length === 1);
    await home(); await red(titles[1]); await home(); await red(titles[2]); await home(); await red(titles[3]);
    assert.strictEqual(await page.evaluate(() => window.__calls.length), 1);
    assert.deepStrictEqual(await page.evaluate(() => S.genQ.map(q => q.title)), titles.slice(1));
    assert.deepStrictEqual(await page.locator("#side .genq .gq-t").allInnerTexts(), titles);
    assert.strictEqual(await page.locator("#side .genq .gq-st").first().innerText(), "작성 중");
    assert((await page.locator("main .banner").innerText()).includes("대기열 3번째"));
    pass("작성 중에 누른 빨간 링크는 대기열에 차례로 들어가고, 옆 패널에 작성 중·대기 문서가 보인다");
    await page.click(`#side .genq [data-unq="${ks[2]}"]`);
    assert.deepStrictEqual(await page.evaluate(() => S.genQ.map(q => q.title)), [titles[1], titles[3]]);
    await page.click(`main [data-unq="${ks[3]}"]`);
    assert.deepStrictEqual(await page.evaluate(() => S.genQ.map(q => q.title)), [titles[1]]);
    assert.strictEqual(await page.locator("main [data-gen]").count(), 1);
    pass("옆 패널과 문서 화면에서 대기 중인 문서를 취소할 수 있다");
    await page.evaluate(() => window.__calls[0].done());
    await page.waitForFunction(() => window.__calls.length === 2 && S.gen?.title === "푸른 함선");
    assert(await page.evaluate(k => !!S.pages[k], ks[0]));
    assert.strictEqual(await page.evaluate(() => S.view.key), ks[3]);
    pass("앞 문서가 끝나면 다음 대기 문서를 자동으로 작성하고, 보던 화면은 바꾸지 않는다");
    await page.click('#side .genq [data-act="stop"]');
    await page.waitForFunction(() => !S.gen);
    assert(await page.evaluate(k => !S.pages[k], ks[1]));
    assert.strictEqual(await page.locator("#side .genq").count(), 0);
    assert.strictEqual(await page.evaluate(() => window.__calls.length), 2);
    pass("작성 중인 문서도 대기열에서 취소할 수 있고, 대기열이 비면 패널이 사라진다");
    await home(); await red(titles[2]); await page.waitForFunction(() => window.__calls.length === 3);
    await page.evaluate(() => { goSearch("없는 이름"); goSearch("다른 이름"); });
    await home(); await red(titles[3]);
    assert.deepStrictEqual(await page.evaluate(() => S.genQ.map(q => q.title)), ["없는 이름", "다른 이름", titles[3]]);
    await page.evaluate(() => window.__calls[2].done());
    await page.waitForFunction(() => S.gen?.title === "흰 등대", null, { timeout: 5000 });
    assert.deepStrictEqual(await page.evaluate(() => S.genQ.length), 0);
    pass("검색창으로 만든 항목이 대기열 중간에서 '문서 없음'이나 다른 이름으로 끝나도 다음 대기 문서를 이어서 작성한다");
    await page.evaluate(() => window.__calls[3].done()); await page.waitForFunction(k => !!S.pages[k], ks[3]);
    assert.deepStrictEqual(await page.locator("#side .genr .gq-t").allInnerTexts(), [titles[3], titles[2], titles[0], "주인공"]);
    await page.locator("#side .genr .gq-t", { hasText: titles[2] }).click(); await page.waitForFunction(() => document.querySelector("h1.t")?.textContent === "검은 탑");
    pass("최근 생성 칸에 새로 만든 문서가 최근 순으로 보이고, 누르면 그 문서를 연다");
    assert.deepStrictEqual(errors, []);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
