/* 새로고침·탭 종료 뒤 서버 작업 복구와 원본 보호. 제공자 호출은 전부 대체한다. */
const assert = require("node:assert/strict"), fs = require("node:fs");
const { chromium } = require("playwright"), { appServer } = require("./helpers/app");
const server = appServer(), entries = new Map(), gates = new Map(), calls = [], api = [];
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let mode = "hold", offline = false, browser, context, page, n = 0;
const pass = message => console.log(`  ✓ ${++n}. ${message}`);
const until = async fn => { for (let i = 0; i < 400; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error("서버 대기 시간 초과"); };
(async () => {
 const { default: worker } = await import("../relay/worker.js"), { AiJobs } = await import("../relay/jobs.js"), { JobStorage, fireAlarm } = await import("./helpers/jobs.mjs");
 const original = globalThis.fetch;
 await new Promise(r => server.listen(0, "127.0.0.1", r));
 const origin = `http://127.0.0.1:${server.address().port}`;
 const db = { prepare: () => { const s = { bind: token => ({ ...s, first: async () => token === "token-a" ? { uid: "account-a" } : token === "token-b" ? { uid: "account-b" } : null }), first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) }; return s; }, batch: async () => [] };
 const schedule = e => {
   if (e.timer || e.executing || e.obj.active || !(e.storage.data.get("jobs") || []).some(j => j.status === "queued")) return;
   e.timer = setTimeout(async () => { e.timer = null; e.executing = true; try { await fireAlarm(e.obj); } finally { e.executing = false; schedule(e); } }, 5);
 };
 const env = { DB: db, GEMINI_KEY: "server-key", PASSWORDS: "relay-pass", ALLOWED_ORIGINS: origin, AI_JOBS: {
   idFromName: n => n, get: name => {
     if (!entries.has(name)) { const storage = new JobStorage(); entries.set(name, { storage, obj: new AiJobs({ storage }, env) }); }
     const e = entries.get(name); return { fetch: async req => { const response = await e.obj.fetch(req); schedule(e); return response; } };
   },
 } };
 const jobs = () => entries.get("account:account-a")?.storage.data.get("jobs") || [];
 globalThis.fetch = async (url, options) => {
   const r = jobs().find(j => j.status === "running"); assert(r); calls.push({ id: r.id, kind: r.meta?.kind, url });
   if (mode === "hold") await new Promise((resolve, reject) => { gates.set(r.id, resolve); options.signal.addEventListener("abort", () => { gates.delete(r.id); reject(new DOMException("abort", "AbortError")); }, { once: true }); });
   let out;
   if (r.type.endsWith(".image")) return Response.json(r.type.startsWith("openai.") ? { data: [{ b64_json: png }] } : { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] }, finishReason: "STOP" }] });
   if (r.meta.kind === "page") out = { title: r.meta.title, type: "인물", summary: "복구한 정의", sections: [{ heading: "개요", level: 1, body: "원래 AI 요청에서 완성된 복구 본문이다." }], infobox: [], facts: [], relations: [], timeline: [], newEntities: [] };
   else if (r.meta.kind === "prose") out = { title: "복구한 단편", body: "원래 요청에서 만든 단편 본문이다." };
   else out = { issues: [{ claim: r.meta.kind + " 지적", evidence: "문서에 적힌 근거", conflict: "다른 서술과 충돌", severity: "low" }] };
   return Response.json({ candidates: [{ content: { parts: [{ text: "비공개 사고", thought: true }, { text: JSON.stringify(out) }] }, finishReason: "STOP" }] });
 };
 const release = () => { mode = "ok"; for (const resolve of gates.values()) resolve(); gates.clear(); };
 try {
   browser = await chromium.launch(); context = await browser.newContext({ acceptDownloads: true });
   await context.addInitScript(() => {
     if (!localStorage.getItem("wwiki:gemini")) localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "relay", relay: "https://relay.test", pass: "relay-pass", main: "main-test", check: "check-test", preCheck: false, openaiKey: "sk-test-personal", serverKeys: true, serverKeysFor: "https://relay.test" }));
     if (!localStorage.getItem("wwiki:acct")) localStorage.setItem("wwiki:acct", JSON.stringify({ id: "account-a", token: "token-a", since: 0 }));
   });
   await context.route("https://fonts.googleapis.com/**", r => r.abort()); await context.route("https://fonts.gstatic.com/**", r => r.abort());
   await context.route("**/api/**", async route => {
     if (offline) return route.abort();
     const q = route.request(), body = q.postData(); api.push({ method: q.method(), url: q.url(), body: body && JSON.parse(body) });
     const response = await worker.fetch(new Request(q.url(), { method: q.method(), headers: await q.allHeaders(), ...(body ? { body } : {}) }), env);
     try { await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }); } catch {}
   });
   await context.route("**/v1beta/**", () => { throw new Error("복구 중 직접 AI 호출 금지"); });
   await context.route("https://api.openai.com/**", () => { throw new Error("복구 중 직접 이미지 호출 금지"); });
   const errors = [];
   const open = async () => { const p = await context.newPage(); p.on("pageerror", e => errors.push(e.message)); await p.goto(origin); await p.waitForFunction(() => S.ready); return p; };
   page = await open();
   await page.evaluate(async png => {
     const ent = (title, page) => ({ title, type: "인물", summary: "정의", facts: [], mentions: [], page, box: "" });
     const w = { kind: "world", id: "recovery-world", title: "복구 검증 세계", seed: "원래 세계관", era: "1989년", rules: [], timeline: [], relations: [], navboxes: {}, entities: { person: ent("기존 인물", true), new: ent("새 문서", false) }, mainKey: "person", tone: { label: "기록", guide: [] }, relMigrated: true, createdAt: 1 };
     const p = { key: "person", title: "기존 인물", type: "인물", summary: "원본 정의", categories: [], notices: [], infobox: [], sections: [{ heading: "개요", level: 1, body: "원래 문서 본문이다." }], links: [], portrait: "data:image/png;base64," + png, shortStories: [{ id: "s1", title: "기존 단편", body: "지켜야 할 단편", createdAt: 1 }], createdAt: 1 };
     await Store.saveWorld(w); await Store.savePage(w.id, p); S.worlds = await Store.listWorlds(); S.world = w; S.pages = await Store.listPages(w.id); S.view = { name: "article", key: "person" }; renderAll();
   }, png);
   const target = async (key = "person") => page.evaluate(async key => { S.world = await Store.getWorld("recovery-world"); S.pages = await Store.listPages(S.world.id); S.view = { name: "article", key }; renderAll(); }, key);
   const select = async id => { await page.evaluate(id => AIRecovery.open(id), id); await page.waitForSelector(".job-detail"); };
   const terminal = async id => until(() => jobs().find(j => j.id === id)?.status === "succeeded");
   const posts = () => api.filter(c => c.method === "POST" && c.url.endsWith("/jobs")).length;

   await page.evaluate(() => { generatePage("new"); }); await until(() => gates.size === 1);
   let id = jobs().at(-1).id, before = calls.length, count = posts();
   await page.reload(); await page.waitForSelector(".jobs"); assert.equal(await page.evaluate(() => S.gen), null);
   assert((await page.locator(".jobs").innerText()).includes("실행 중"));
   release(); await terminal(id); await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector("[data-job-apply]");
   assert((await page.locator(".job-detail").innerText()).includes("복구 본문")); assert(!(await page.locator(".job-detail").innerText()).includes("비공개 사고"));
   await page.click("[data-job-apply]"); await page.waitForSelector(".article");
   assert((await page.locator(".article").innerText()).includes("복구 본문")); assert.equal(calls.length, before); assert.equal(posts(), count);
   assert(await page.evaluate(async () => (await Store.getPage("recovery-world", "new")).recoveryJobs.length === 1));
   pass("작성 도중 새로고침하면 작업 화면을 복원하고 원래 결과를 추가 AI 호출 없이 저장한다");

   await target(); mode = "hold";
   await page.evaluate(() => { AIJobs.save({ id: "legacy-page-0001", type: "gemini.generate", owner: Sync.acct.id, base: Sync.base(), createdAt: Date.now() - 1000, status: "succeeded", meta: { kind: "page", title: "기존 인물", wid: S.world.id, key: "person" } }); generatePage("person", true, "다시 쓰기"); });
   await until(() => gates.size === 1); await page.evaluate(() => LS.del(AIJobs.prefix + "legacy-page-0001"));
   id = jobs().at(-1).id; await page.reload(); await page.waitForSelector(".jobs"); release(); await terminal(id);
   await page.evaluate(async () => { const p = await Store.getPage("recovery-world", "person"); p.sections[0].body = "사용자가 나중에 수정한 본문"; await Store.savePage("recovery-world", p); });
   await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector("[data-job-apply]"); await page.click("[data-job-apply]");
   await page.waitForFunction(() => AIRecovery.error.includes("수정·삭제"));
   assert.equal(await page.evaluate(async () => (await Store.getPage("recovery-world", "person")).sections[0].body), "사용자가 나중에 수정한 본문");
   const download = page.waitForEvent("download"); await page.click("[data-job-download]"); const d = await download;
   assert(fs.readFileSync(await d.path(), "utf8").includes("복구 본문"));
   await page.click("[data-job-dismiss]");
   pass("나중에 수정한 문서는 덮어쓰지 않고 복구 결과를 내려받을 수 있다");

   await target(); mode = "hold";
   const kept = await page.evaluate(async () => { const p = await Store.getPage("recovery-world", "person"); p.editedAt = 1; await Store.savePage("recovery-world", p); S.pages.person = p; generatePage("person", true); return { portrait: p.portrait, stories: p.shortStories }; });
   await until(() => gates.size === 1); id = jobs().at(-1).id; before = calls.length;
   await page.reload(); await page.waitForSelector(".jobs"); release(); await terminal(id);
   await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector("[data-job-apply]"); await page.click("[data-job-apply]"); await page.waitForSelector(".article");
   const rewritten = await page.evaluate(() => Store.getPage("recovery-world", "person"));
   assert.equal(rewritten.portrait, kept.portrait); assert.deepEqual(rewritten.shortStories, kept.stories);
   assert.equal(rewritten.editedAt, undefined); assert(rewritten.rewrittenAt); assert.equal(calls.length, before);
   pass("다시 쓰기 복구는 기존 이미지·단편을 보존하고 새 AI 본문에 직접 편집 표시를 잘못 남기지 않는다");

   await target(); mode = "hold"; await page.evaluate(() => { checkPage("person"); }); await until(() => gates.size === 1 && jobs().filter(j => j.meta?.kind === "read").length > 0);
   const checkJobs = jobs().filter(j => ["check", "read"].includes(j.meta?.kind));
   assert.equal(checkJobs.length, 2); assert.equal(checkJobs[0].meta.group, checkJobs[1].meta.group);
   before = calls.length; await page.reload(); await page.waitForSelector(".jobs"); release(); await terminal(checkJobs[1].id);
   await page.evaluate(async () => { const w = await Store.getWorld("recovery-world"); w.ageRules = { text: "", rules: [] }; await Store.saveWorld(w); });
   await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector("[data-job-apply]"); await page.click("[data-job-apply]"); await page.waitForSelector(".article");
   const issues = await page.evaluate(async () => (await Store.getPage("recovery-world", "person")).check.issues.map(i => i.claim));
   assert(issues.includes("check 지적") && issues.includes("read 지적")); assert.equal(calls.length, before + 1);
   pass("검사 중 새로고침해도 같은 묶음의 대조·읽기 결과를 합쳐 반영하며 검사 요청을 다시 보내지 않는다");

   await target(); mode = "hold";
   await page.evaluate(() => { callJson("check", "참고 문서 검사", { modelTier: "check", recoveryTarget: { wid: "recovery-world", key: "person" } }, { title: "기존 인물" }); });
   await until(() => gates.size === 1); id = jobs().at(-1).id;
   await page.reload(); await page.waitForSelector(".jobs"); release(); await terminal(id);
   await page.evaluate(async () => { const p = await Store.getPage("recovery-world", "new"); p.sections[0].body = "검사 뒤 다른 참고 문서가 수정되었다."; await Store.savePage("recovery-world", p); });
   await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector("[data-job-apply]"); await page.click("[data-job-apply]");
   await page.waitForFunction(() => AIRecovery.error.includes("참고 문서"));
   await page.click("[data-job-dismiss]");
   pass("나이 규칙 해석 캐시 갱신은 허용하고 실제 참고 문서 변경은 검사 결과 적용에서 차단한다");

   await target(); mode = "hold"; await page.evaluate(() => { openImageGen("person"); generateDocImage(); }); await until(() => gates.size === 1);
   id = jobs().at(-1).id; before = calls.length;
   await page.close(); page = await open(); await page.waitForSelector(".jobs"); release(); await terminal(id);
   await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector(".job-detail .preview");
   await page.click(".job-detail .preview"); await page.waitForSelector(".image-viewer[open]"); await page.click("[data-viewer-close]");
   offline = true; await page.reload(); await page.waitForSelector(".job-detail .preview");
   await page.click("[data-job-apply]"); await page.waitForSelector(".article .portrait img");
   assert.equal(calls.length, before);
   assert(await page.evaluate(async () => (await Store.getPage("recovery-world", "person")).shortStories[0].body === "지켜야 할 단편"));
   offline = false;
   pass("이미지 생성 탭을 닫아도 새 탭에서 미리보기를 받고, 캐시한 결과는 오프라인에서도 적용한다");

   await target(); mode = "hold";
   await page.evaluate(() => { openProse("person"); generateProse(); }); await until(() => gates.size === 1);
   id = jobs().at(-1).id; before = calls.length; await page.reload(); await page.waitForSelector(".jobs"); release(); await terminal(id);
   await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector("[data-job-apply]"); await page.click("[data-job-apply]"); await page.waitForSelector(".article");
   assert(await page.evaluate(async () => (await Store.getPage("recovery-world", "person")).shortStories.some(s => s.title === "복구한 단편")));
   assert.equal(calls.length, before);
   pass("단편 쓰기도 원래 결과를 복구해 기존 단편과 함께 보관한다");

   await target(); mode = "hold"; await page.evaluate(() => { openImageGen("person"); generateDocImage(); }); await until(() => gates.size === 1);
   id = jobs().at(-1).id; before = calls.length;
   await page.evaluate(id => { LS.del(AIJobs.prefix + id); }, id);
   await page.close(); page = await open();
   await page.click('#side [data-act="jobs"]'); await page.waitForSelector(`[data-job-preview="${id}"]`);
   release(); await terminal(id); await page.click(`[data-job-preview="${id}"]`); await page.waitForSelector(".job-detail .preview");
   assert.equal(await page.evaluate(id => AIJobs.receipts().find(r => r.id === id).meta.recoveryV, id), 1); assert.equal(calls.length, before);
   await page.click("[data-job-dismiss]");
   pass("로컬 접수 기록이 없어도 로그인한 서버의 대상 정보로 결과를 찾아 복구한다");

   await target(); mode = "hold"; await page.evaluate(() => { openImageGen("person"); generateDocImage(); }); await until(() => gates.size === 1);
   id = jobs().at(-1).id; await page.reload(); await page.waitForSelector(".jobs");
   await page.click("[data-job-cancel]"); await until(() => jobs().find(j => j.id === id).status === "cancelled");
   assert(!entries.get("account:account-a").storage.data.has("key:" + id));
   pass("재실행한 탭에서 대기·실행 중 작업을 중단하고 서버의 임시 키를 지운다");

   mode = "hold"; await target(); await page.evaluate(() => { openImageGen("person"); generateDocImage(); }); await until(() => gates.size === 1);
   id = jobs().at(-1).id; await page.reload(); await page.waitForSelector(".jobs"); release(); await terminal(id);
   await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector("[data-job-apply]");
   await page.evaluate(() => {
     const commit = Store.commitRecovery;
     Store.commitRecovery = async function(w, p, nw, np, valid) {
       Store.commitRecovery = commit;
       const latest = await Store.getPage(w.id, np.key); latest.sections[0].body = "저장 직전 다른 탭에서 고친 본문"; await Store.savePage(w.id, latest);
       return commit.call(this, w, p, nw, np, valid);
     };
   });
   await page.click("[data-job-apply]"); await page.waitForFunction(() => AIRecovery.error.includes("원본이나"));
   assert.equal(await page.evaluate(async () => (await Store.getPage("recovery-world", "person")).sections[0].body), "저장 직전 다른 탭에서 고친 본문");
   pass("검사 직후 다른 탭이 원본을 수정해도 실제 저장 트랜잭션에서 덮어쓰기를 막는다");
   await page.evaluate(async () => { await Store.deleteWorld("recovery-world"); });
   await page.click('[data-act="jobs-refresh"]'); await page.waitForSelector("[data-job-apply]"); await page.click("[data-job-apply]");
   await page.waitForFunction(() => AIRecovery.error.includes("세계관이 삭제"));
   assert.equal(await page.evaluate(() => Store.getWorld("recovery-world")), null);
   pass("원래 세계관이 삭제되면 복구 적용으로 되살리지 않는다");

   await page.evaluate(() => { Sync.acct = { id: "account-b", token: "token-b", since: 0 }; LS.set(AKEY, Sync.acct); AIRecovery.authChanged(); });
   await page.waitForFunction(() => AIRecovery.scope.includes("account-b"));
   assert.equal(await page.locator(".job-detail .preview").count(), 0);
   assert(!(await page.locator(".jobs").innerText()).includes("기존 인물"));
   pass("다른 계정으로 바꾸면 이전 계정의 작업 목록·미리보기를 즉시 숨긴다");
   await page.setViewportSize({ width: 390, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
   assert.deepEqual(errors, []); console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
 } finally {
   release(); globalThis.fetch = original;
   for (const e of entries.values()) { clearTimeout(e.timer); e.obj.active?.controller.abort(); }
   await browser?.close(); await new Promise(r => server.close(r));
 }
})().catch(e => { console.error(e); process.exitCode = 1; });
