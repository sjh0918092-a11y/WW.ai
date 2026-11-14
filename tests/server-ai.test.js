/* 실제 브라우저 → 기존 Worker 인증 → 영구 큐 → 제공자 대체 응답. 유료 API 호출 없음. */
const assert = require("node:assert/strict"), { chromium } = require("playwright");
const { appServer } = require("./helpers/app");
const server = appServer();
let browser, context, n = 0, providerCalls = [], apiCalls = [], directCalls = [], entries = new Map();
let mode = "ok", release, loseSubmit = false, loseGet = false;
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const pass = message => console.log(`  ✓ ${++n}. ${message}`);
const until = async fn => { for (let i = 0; i < 300; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error("서버 상태 대기 시간 초과"); };

(async () => {
 const { default: worker } = await import("../relay/worker.js");
 const { AiJobs } = await import("../relay/jobs.js");
 const { JobStorage, fireAlarm } = await import("./helpers/jobs.mjs");
 const originalFetch = globalThis.fetch;
 await new Promise(r => server.listen(0, "127.0.0.1", r));
 const origin = `http://127.0.0.1:${server.address().port}`;
 const db = { prepare: () => {
   const stmt = { bind: token => ({ ...stmt, first: async () => token === "session-test" ? { uid: "tester" } : null }), all: async () => ({ results: [] }), first: async () => null, run: async () => ({ success: true }) }; return stmt;
 }, batch: async () => [] };
 const schedule = e => {
   if (e.timer || e.executing || e.obj.active || !(e.storage.data.get("jobs") || []).some(j => j.status === "queued")) return;
   e.timer = setTimeout(async () => { e.timer = null; e.executing = true; try { await fireAlarm(e.obj); } finally { e.executing = false; schedule(e); } }, 5);
 };
 const env = { DB: db, GEMINI_KEY: "server-gemini-key", PASSWORDS: "relay-pass", ALLOWED_ORIGINS: origin, AI_JOBS: {
   idFromName: name => name, get: name => {
     if (!entries.has(name)) { const storage = new JobStorage(); entries.set(name, { storage, obj: new AiJobs({ storage }, env) }); }
     const e = entries.get(name);
     return { fetch: async req => { const r = await e.obj.fetch(req); schedule(e); return r; } };
   },
 } };
 const textResult = body => {
   const prompt = body.contents?.[0]?.parts?.[0]?.text || "";
   if (prompt.includes("## 작성할 문서:")) return { title: "새 인물", type: "인물", summary: "새 문서의 정의", infobox: [], sections: [{ heading: "개요", level: 1, body: "서버에서 받은 새 문서 본문이다." }], facts: [], newEntities: [], timeline: [], relations: [] };
   return { issues: [] };
 };
 globalThis.fetch = async (url, options) => {
   const current = mode, call = { url, options, mode: current }; providerCalls.push(call);
   assert(!options.headers["X-WW-Pass"] && !options.headers["Authorization"]?.includes("session-test"));
   if (current === "hold") await new Promise((resolve, reject) => {
     release = resolve;
     options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
   });
   if (current === "error") return Response.json({ error: { message: "private-key must not be echoed" } }, { status: 500 });
   if (url.startsWith("https://api.openai.com/")) return Response.json({ data: [{ b64_json: png }] });
   const body = JSON.parse(options.body);
   if (current === "thinking" && body.generationConfig.thinkingConfig) return Response.json({ error: { message: "thinking level unsupported" } }, { status: 400 });
   if (body.generationConfig.responseModalities?.includes("IMAGE")) return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] }, finishReason: "STOP" }] });
   return Response.json({ candidates: [{ content: { parts: [{ text: "생각은 숨김", thought: true }, { text: JSON.stringify(textResult(body)) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5, thoughtsTokenCount: 3 } });
 };
 try {
   browser = await chromium.launch(); context = await browser.newContext();
   await context.addInitScript(() => {
     localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "relay", relay: "https://relay.test", pass: "relay-pass", main: "custom-main", mainThink: "low", check: "custom-check", checkThink: "high", quick: "custom-quick", openaiKey: "sk-private-openai", preCheck: false }));
     localStorage.setItem("wwiki:acct", JSON.stringify({ id: "tester", token: "session-test", since: 0 }));
     window.testHidden = false;
     Object.defineProperty(document, "hidden", { configurable: true, get: () => window.testHidden });
     Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.testHidden ? "hidden" : "visible" });
   });
   await context.route("https://fonts.googleapis.com/**", r => r.abort()); await context.route("https://fonts.gstatic.com/**", r => r.abort());
   await context.route("**/api/**", async route => {
     const req = route.request(), headers = await req.allHeaders(), body = req.postData();
     const call = { url: req.url(), method: req.method(), body: body ? JSON.parse(body) : undefined }; apiCalls.push(call);
     const response = await worker.fetch(new Request(req.url(), { method: req.method(), headers, ...(body ? { body } : {}) }), env);
     if (loseSubmit && req.method() === "POST" && req.url().endsWith("/jobs")) { loseSubmit = false; return route.abort(); }
     if (loseGet && req.method() === "GET" && /\/jobs\//.test(req.url())) { loseGet = false; return route.abort(); }
     try { await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }); } catch {}
   });
   await context.route("**/v1beta/**", async r => { directCalls.push(r.request().url()); await r.fulfill({ contentType: "text/event-stream", body: 'data: {"candidates":[{"content":{"parts":[{"text":"{\\"issues\\":[]}"}]},"finishReason":"STOP"}]}\n\n' }); });
   await context.route("https://api.openai.com/v1/images/**", async r => { directCalls.push(r.request().url()); await r.fulfill({ json: { data: [{ b64_json: png }] } }); });
   const page = await context.newPage(), errors = []; page.on("pageerror", e => errors.push(e.message));
   await page.goto(origin); await page.waitForFunction(() => S.ready);
   const json = tier => page.evaluate(tier => callJson("check", "원래 검사 입력", { modelTier: tier }), tier);
   let r = await json("check"); assert.deepEqual(r, { issues: [] });
   let call = providerCalls.at(-1), payload = JSON.parse(call.options.body);
   assert(call.url.endsWith("/custom-check:generateContent")); assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel, "high");
   assert.equal(call.options.headers["x-goog-api-key"], "server-gemini-key"); assert.equal(directCalls.length, 0);
   assert(await page.evaluate(() => LOG.at(-1).transport === "server" && LOG.at(-1).tok.i === 12));
   const receipts = await page.evaluate(() => AIJobs.receipts());
   assert(receipts[0].cached); assert(!JSON.stringify(receipts).includes("relay-pass"));
   pass("검사 모델·생각 깊이·사용량을 유지하고 서버 결과와 작업 번호를 브라우저에 보관한다");

   let before = providerCalls.length, beforePosts = apiCalls.filter(c => c.method === "POST" && c.url.endsWith("/jobs")).length;
   loseSubmit = true; await json("default");
   assert.equal(providerCalls.length, before + 1);
   assert.equal(apiCalls.filter(c => c.method === "POST" && c.url.endsWith("/jobs")).length, beforePosts + 1);
   loseGet = true; before = providerCalls.length; await json("quick"); assert.equal(providerCalls.length, before + 1);
   pass("접수 응답·상태 조회가 끊겨도 기존 작업 번호를 조회하며 AI를 중복 실행하지 않는다");

   mode = "hold"; release = null; before = providerCalls.length;
   await page.evaluate(() => { window.pending = callJson("check", "화면 잠금 검사", { modelTier: "check" }).then(r => { window.done = r; }); });
   await until(() => release);
   await page.evaluate(() => { window.testHidden = true; document.dispatchEvent(new Event("visibilitychange")); });
   const heldId = (await page.evaluate(() => AIJobs.receipts())).find(r => ["queued", "running", "submitting"].includes(r.status)).id;
   release(); await until(() => entries.get("account:tester").storage.data.get("jobs").find(j => j.id === heldId)?.status === "succeeded");
   assert.equal(providerCalls.length, before + 1);
   await page.evaluate(() => { window.testHidden = false; document.dispatchEvent(new Event("visibilitychange")); });
   await page.waitForFunction(() => window.done); mode = "ok";
   pass("화면을 숨긴 동안 서버가 검사를 끝내고 복귀한 탭이 원래 결과를 받는다");

   await page.evaluate(async png => {
     const p = { key: "person", title: "기존 인물", type: "인물", summary: "원래 정의", infobox: [], sections: [{ heading: "개요", level: 1, body: "기존 본문" }], links: [], portrait: "data:image/png;base64," + png, createdAt: 1 };
     const ent = (title, page) => ({ title, type: "인물", summary: "정의", facts: [], mentions: [], page, box: "" });
     const w = { kind: "world", id: "server-test", title: "서버 검증 세계", seed: "원래 세계관", era: "1989년", rules: [], timeline: [], relations: [], navboxes: {}, entities: { person: ent(p.title, true), new: ent("새 인물", false) }, mainKey: "person", createdAt: 1 };
     await Store.saveWorld(w); await Store.savePage(w.id, p); S.worlds = await Store.listWorlds(); await openWorld(w.id);
   }, png);
   await page.fill("#q", "새 인물"); await page.press("#q", "Enter");
   await page.waitForFunction(() => document.querySelector(".article")?.textContent.includes("서버에서 받은 새 문서"));
   assert(await page.evaluate(async () => !!(await Store.getPage("server-test", "new"))));
   pass("검색으로 시작한 실제 문서 작성이 서버 응답을 받아 기존 저장 과정까지 완료된다");

   await page.click('#side [data-act="gset"]'); await page.check("#gServerKeys"); await page.click('[data-act="gset-save"]');
   assert.equal(await page.evaluate(() => GS.serverKeysFor), "https://relay.test");
   await page.evaluate(() => openWorld("server-test", "person")); await page.waitForSelector(".article h2");
   await page.locator(".portrait-menu summary").click(); await page.click("[data-image-open]");
   await page.selectOption("#imageRatio", "16:9"); await page.selectOption("#imageQuality", "medium");
   mode = "hold"; release = null; before = providerCalls.length;
   await page.click('[data-act="image-generate"]'); await until(() => release);
   await page.evaluate(() => { window.testHidden = true; document.dispatchEvent(new Event("visibilitychange")); });
   release(); await until(() => entries.get("account:tester").storage.data.get("jobs").at(-1).status === "succeeded");
   await page.evaluate(() => { window.testHidden = false; document.dispatchEvent(new Event("visibilitychange")); });
   await page.waitForSelector(".image-gen .preview"); mode = "ok";
   assert.equal(providerCalls.length, before + 1); call = providerCalls.at(-1);
   assert(call.url.endsWith("/images/edits")); assert.equal(call.options.headers.Authorization, "Bearer sk-private-openai");
   assert.equal(call.options.body.get("quality"), "medium"); assert.equal(call.options.body.get("size"), "1536x864");
   assert.equal(directCalls.length, 0);
   pass("허용한 개인 OpenAI 키로 참고 이미지·비율·품질을 유지하며 복귀 뒤 미리보기를 받는다");

   await page.click('[data-act="image-discard"]'); mode = "hold"; release = null;
   await page.click('[data-act="image-generate"]'); await until(() => release);
   const imageId = entries.get("account:tester").storage.data.get("jobs").at(-1).id;
   await page.click('[data-act="image-close"]');
   await until(() => entries.get("account:tester").storage.data.get("jobs").find(j => j.id === imageId).status === "cancelled");
   assert(!entries.get("account:tester").storage.data.has("key:" + imageId));
   assert.equal(await page.locator(".portrait img").count(), 1); mode = "ok";
   pass("이미지 중단은 서버 작업을 취소하고 임시 키를 지우며 기존 이미지를 유지한다");

   mode = "hold"; release = null;
   await page.evaluate(() => { window.accountError = null; window.accountTask = gemini.json("계정 변경 검사").then(() => { window.accountError = "unexpected"; }, e => { window.accountError = e.code; }); });
   await until(() => release);
   await page.evaluate(() => { Sync.acct = { id: "other", token: "other-token" }; });
   release(); await page.waitForFunction(() => window.accountError);
   assert.equal(await page.evaluate(() => window.accountError), "job_account_changed");
   await page.evaluate(() => { Sync.acct = { id: "tester", token: "session-test", since: 0 }; }); mode = "ok";
   pass("기다리는 동안 계정이 바뀌면 이전 계정의 결과를 현재 화면에 전달하지 않는다");

   const noCacheBefore = apiCalls.length;
   await page.evaluate(async () => { const put = IDB.put; IDB.put = (key, value) => key.startsWith("job:") ? Promise.reject(new Error("full")) : put.call(IDB, key, value); try { await gemini.json("결과 캐시 실패"); } finally { IDB.put = put; } });
   const uncachedId = apiCalls.slice(noCacheBefore).find(c => c.method === "POST" && c.url.endsWith("/jobs")).body.id;
   assert(!entries.get("account:tester").storage.data.get("jobs").find(j => j.id === uncachedId).receivedAt);
   pass("로컬 결과 저장에 실패하면 수신 확인을 보내지 않아 서버 결과를 남긴다");

   mode = "error"; before = providerCalls.length;
   r = await page.evaluate(() => gemini.json("오류 검사").then(() => null, e => ({ code: e.code, serverJob: e.serverJob })));
   assert.equal(r.serverJob, true); assert.equal(providerCalls.length, before + 1); assert.equal(directCalls.length, 0);
   mode = "thinking"; before = providerCalls.length; await json("check");
   assert.equal(providerCalls.length, before + 2); assert.equal(JSON.parse(providerCalls.at(-1).options.body).generationConfig.thinkingConfig, undefined);
   mode = "ok";
   pass("서버 실패를 새 생성으로 재시도하지 않고, 미지원 thinking의 명확한 거절만 기본값으로 다시 보낸다");

   r = await page.evaluate(async () => { const save = LS.set; LS.set = (k, v) => k.startsWith(AIJobs.prefix) ? false : save(k, v); try { await gemini.json("저장 실패"); } catch (e) { return e.code; } finally { LS.set = save; } });
   assert.equal(r, "job_storage");
   pass("작업 번호를 저장할 수 없으면 서버 생성을 시작하지 않는다");

   await page.click('#side [data-act="gset"]'); await page.selectOption("#gMode", "key"); await page.fill("#gKey", "private-gemini-key"); await page.uncheck("#gServerKeys"); await page.click('[data-act="gset-save"]');
   before = providerCalls.length; await json("check"); assert.equal(providerCalls.length, before); assert.equal(directCalls.length, 1);
   await page.check("#gServerKeys"); await page.click('[data-act="gset-save"]'); await json("check");
   assert.equal(providerCalls.at(-1).options.headers["x-goog-api-key"], "private-gemini-key"); assert.equal(await page.inputValue("#gMode"), "key");
   await page.selectOption("#gMode", "relay"); await page.fill("#gRelay", "https://changed-relay.test"); await page.selectOption("#gMode", "key"); await page.click('[data-act="gset-save"]');
   assert.equal(await page.evaluate(() => GS.serverKeys), false); assert.equal(await page.evaluate(() => AIJobs.enabled("gemini")), false);
   pass("개인 키는 허용 전 직접 연결하고, 허용 뒤 같은 키를 쓰며 서버 주소 변경 시 허용을 해제한다");
   assert.deepEqual(errors, []);
   console.log(`\n모두 통과 (${n}개). 유료 API 호출 0회.`);
 } finally {
   globalThis.fetch = originalFetch;
   for (const e of entries.values()) { clearTimeout(e.timer); e.obj.active?.controller.abort(); }
   await browser?.close(); await new Promise(r => server.close(r));
 }
})().catch(e => { console.error(e); process.exitCode = 1; });
