/* 작성 대기열 보관: 새로고침해도 대기열이 남아 이어서 작성하고, 로그인하면 다른 기기와 대기열을 맞추되 한 기기만 처리한다 */
const assert = require("node:assert/strict"), vm = require("vm");
const { chromium } = require("playwright");
const { appServer, appSource } = require("./helpers/app");
const html = appSource(), c = {}; vm.createContext(c); vm.runInContext(html.slice(html.indexOf("function cyrb53("), html.indexOf("const LINK_RE =")) + "globalThis.makeKey=keyOf;", c); const key = c.makeKey;
const server = appServer();
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
const a = key("주인공"), titles = ["붉은 격납고", "푸른 함선", "검은 탑"], ks = titles.map(key);
const ent = (title, written) => ({ title, type: "장소", summary: title, facts: [], mentions: [], page: written });
const world = () => ({ kind: "world", id: "q", title: "대기열 세계", seed: "군인의 일상", era: "1989년", guide: "", rules: [], timeline: [], relations: [], events: [], glossary: [], navboxes: {}, aliases: {}, toneTried: true, relMigrated: true, angleOff: true, entities: { [a]: { ...ent("주인공", true), type: "인물" }, ...Object.fromEntries(ks.map((k, i) => [k, ent(titles[i], false)])) }, mainKey: a, createdAt: 1 });
const doc = { key: a, title: "주인공", type: "인물", summary: "주인공", categories: ["인물"], infobox: [], sections: [{ heading: "개요", level: 1, body: titles.map(t => `[[${t}]]`).join(", ") + "에 다닌다." }], links: ks, createdAt: 1 };
/* AI 호출을 손으로 끝낼 수 있게 바꾼다 */
const holdAI = page => page.evaluate(() => {
  window.__calls = [];
  window.callJson = (kind, prompt, opts, meta) => new Promise((res, rej) => {
    opts?.signal?.addEventListener("abort", () => rej({ code: "cancelled" }));
    window.__calls.push({ title: meta?.title, done: () => res({ title: meta.title, type: "장소", summary: meta.title + " 요약", categories: ["장소"], infobox: [], sections: [{ heading: "개요", level: 1, body: meta.title + "은 오래된 곳이다." }] }) });
  });
});
const titlesOf = page => page.evaluate(() => S.genQ.map(q => q.title));
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`, errors = [];
  const browser = await chromium.launch();
  const context = async (gemini, acct) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(([g, ac]) => { if (!localStorage.getItem("wwiki:gemini")) localStorage.setItem("wwiki:gemini", JSON.stringify(g)); if (ac && !localStorage.getItem("wwiki:acct")) localStorage.setItem("wwiki:acct", JSON.stringify(ac)); }, [gemini, acct]);
    await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); await ctx.route("https://fonts.gstatic.com/**", r => r.abort());
    await ctx.route("**/v1beta/**", () => {});   // 새로고침 뒤 이어서 쓰는 문서는 응답을 기다리는 상태로 둔다
    return ctx;
  };
  const open = async ctx => { const p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.stack || e.message)); await p.goto(url); await p.waitForFunction(() => S.ready); return p; };
  try {
    /* 1. 로그인하지 않은 기기: 새로고침 */
    const ctx = await context({ mode: "relay", pass: "test-key", preCheck: false });
    const page = await open(ctx);
    await page.evaluate(async ([w, d]) => { await Store.saveWorld(w); await Store.savePage(w.id, d); S.worlds = await Store.listWorlds(); await openWorld("q"); }, [world(), doc]);
    await page.waitForFunction(() => document.querySelector("h1.t")?.textContent === "주인공");
    await holdAI(page);
    await page.evaluate(k => openEntity(k), ks[0]); await page.waitForFunction(() => window.__calls.length === 1);
    for (const k of ks.slice(1)) await page.evaluate(k => openEntity(k), k);
    assert.deepEqual(await titlesOf(page), titles.slice(1));
    assert.deepEqual((await page.evaluate(() => LS.get("wwiki:genq:q"))).items.map(q => q.title), titles.slice(1));
    await page.reload(); await page.waitForFunction(() => S.ready && S.world?.id === "q");
    await page.waitForFunction(t => S.gen?.title === t, titles[1]);
    assert.deepEqual(await titlesOf(page), [titles[2]]);
    assert.deepEqual(await page.locator("#side .genq .gq-t").allInnerTexts(), titles.slice(1));
    pass("새로고침해도 대기열이 남고, 세계관을 다시 열면 기다리던 문서를 차례로 이어서 작성한다");
    await page.click(`#side .genq [data-unq="${ks[2]}"]`);
    assert.deepEqual((await page.evaluate(() => LS.get("wwiki:genq:q"))).items, []);
    await page.reload(); await page.waitForFunction(() => S.ready && S.world?.id === "q");
    assert.deepEqual(await titlesOf(page), []);
    pass("대기열에서 뺀 문서는 새로고침 뒤에도 돌아오지 않는다");
    await ctx.close();

    /* 2. 같은 계정의 두 기기 */
    const { default: worker } = await import("../relay/worker.js"), { D1 } = await import("./helpers/d1.mjs");
    const origin = url.replace(/\/$/, ""), env = { DB: new D1(), PASSWORDS: "relay-pass", ALLOWED_ORIGINS: origin };
    await worker.fetch(new Request(origin + "/api/sync", { headers: { Origin: origin } }), env);
    env.DB.sqlite.exec("INSERT INTO users VALUES('tester','s','h',1);INSERT INTO sessions VALUES('token','tester',1)");
    const relay = async ctx => ctx.route("**/api/**", async route => {
      const req = route.request(), body = req.postData();
      const res = await worker.fetch(new Request(req.url(), { method: req.method(), headers: await req.allHeaders(), ...(body ? { body } : {}) }), env);
      try { await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() }); } catch {}
    });
    const gem = { mode: "relay", relay: "https://relay.test", pass: "relay-pass", preCheck: false, serverJobs: false, documentPipeline: false }, acct = { id: "tester", token: "token", since: 0 };
    const ctxA = await context(gem, acct), ctxB = await context(gem, acct); await relay(ctxA); await relay(ctxB);
    const serverQueue = () => { const r = env.DB.sqlite.prepare("SELECT data FROM gen_queues WHERE uid='tester' AND wid='q'").get(); return r ? JSON.parse(r.data) : null; };
    const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 30)); } throw new Error("대기 시간 초과"); };
    const pa = await open(ctxA);
    await pa.evaluate(async ([w, d]) => { await Store.saveWorld(w); await Store.savePage(w.id, d); await Sync.flush(); S.worlds = await Store.listWorlds(); await openWorld("q"); }, [world(), doc]);
    await pa.waitForFunction(() => document.querySelector("h1.t")?.textContent === "주인공");
    await holdAI(pa);
    await pa.evaluate(k => openEntity(k), ks[0]); await pa.waitForFunction(() => window.__calls.length === 1);
    for (const k of ks.slice(1)) await pa.evaluate(k => openEntity(k), k);
    await until(() => serverQueue()?.items.length === 2);
    const pb = await open(ctxB); await holdAI(pb);
    await pb.evaluate(async () => { S.worlds = await Store.listWorlds(); await openWorld("q"); });
    await pb.waitForFunction(() => S.world?.id === "q" && S.genQ.length === 2);
    assert.deepEqual(await titlesOf(pb), titles.slice(1));
    await new Promise(r => setTimeout(r, 300));
    assert.equal(await pb.evaluate(() => window.__calls.length + (S.gen ? 1 : 0)), 0);
    assert((await pb.locator("#side .genq").innerText()).includes("다른 기기"));
    pass("다른 기기에서 열면 같은 대기열이 보이고, 처리 중인 기기가 있으면 같은 문서를 따로 작성하지 않는다");
    await pb.click(`#side .genq [data-unq="${ks[2]}"]`);
    await until(() => serverQueue()?.items.length === 1);
    await pa.evaluate(() => window.__calls[0].done());
    await pa.waitForFunction(t => S.gen?.title === t, titles[1]);
    assert.deepEqual(await titlesOf(pa), []);
    assert.equal(await pa.evaluate(() => window.__calls.length), 2);
    await until(() => serverQueue()?.items.length === 0);
    pass("다른 기기에서 대기열을 고치면 처리 중인 기기가 다음 문서를 고를 때 그 변경을 따른다");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
