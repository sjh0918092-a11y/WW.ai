/* 실제 과금 없이 이미지 API 요청·공통 지침·미리보기와 적용을 브라우저로 검증한다. */
const http = require("http"), fs = require("fs"), path = require("path"), assert = require("assert");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..");
const server = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(path.join(ROOT, "index.html"))); });
const doc = (key, title, type) => ({ key, title, type, summary: `${title}의 문서다.`, categories: [], notices: [], infobox: type === "인물" ? [{ label: "성별", value: "여성" }] : [], sections: [{ heading: "개요", level: 1, body: `${title}의 복장과 모습은 푸른색이다.` }], links: [], createdAt: 1 });
const person = doc("person", "테스트 인물", "인물"), place = doc("place", "테스트 항구", "지명");
const fixture = { app: "worldwiki", version: 1, worlds: [{ kind: "world", id: "images", title: "이미지 세계", seed: "바다가 있는 세계", era: "1900년", rules: [], timeline: [], style: "encyc", mainKey: "person", entities: Object.fromEntries([person, place].map(p => [p.key, { title: p.title, type: p.type, summary: p.summary, facts: [], mentions: [], page: true, box: "" }])), createdAt: 1, updatedAt: 1 }], pages: { images: { person, place } } };
const read = (page, key) => page.evaluate(key => new Promise((resolve, reject) => {
  const r = indexedDB.open("worldwiki-gemini", 1); r.onsuccess = () => { const db = r.result, t = db.transaction("kv"), q = t.objectStore("kv").get(key); q.onsuccess = () => resolve(q.result); q.onerror = reject; t.oncomplete = () => db.close(); }; r.onerror = reject;
}), key);
const openWorld = async p => { await p.click('#side [data-act="home"]'); await p.click('.wcard button.open:has-text("이미지 세계")'); await p.waitForSelector(".article h2"); };
const openGenerator = async p => { await p.locator(".portrait-menu summary").click(); await p.click("[data-image-open]"); await p.waitForSelector(".image-gen"); };
const generate = async p => { await p.click('[data-act="image-generate"]'); await p.waitForSelector(".image-gen .preview"); };
const apply = async p => { await p.click('[data-act="image-apply"]'); await p.waitForSelector(".image-gen", { state: "detached" }); };
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`, browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => { if (!localStorage.getItem("wwiki:gemini")) localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "key", key: "test-key" })); });
  await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); await ctx.route("https://fonts.gstatic.com/**", r => r.abort());
  const page = await ctx.newPage(), errors = [], requests = []; let textCalls = 0, mode = "ok", release = null;
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(url); await page.waitForSelector("#seedTa");
    const pixels = await page.evaluate(() => {
      const make = color => { const c = document.createElement("canvas"); c.width = 600; c.height = 800; const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, 600, 800); return c.toDataURL("image/png"); };
      return { old: make("#a86444"), generated: make("#325887") };
    });
    fixture.pages.images.person.portrait = pixels.old;
    const response = async route => {
      const request = route.request(), body = JSON.parse(request.postData() || "{}");
      requests.push({ url: request.url(), headers: await request.allHeaders(), body });
      if (mode === "delay") await new Promise(r => { release = r; });
      try {
        if (mode === "quota") return await route.fulfill({ status: 429, json: { error: { message: "rate limit" } } });
        if (mode === "no-image") return await route.fulfill({ json: { steps: [{ content: [{ type: "text", text: "No image" }] }] } });
        const data = pixels.generated.split(",")[1];
        return await route.fulfill({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data } }] } }] } });
      } catch { /* 취소한 요청 */ }
    };
    await ctx.route("**/v1beta/models/**", route => {
      if (route.request().url().endsWith(":generateContent")) return response(route);
      textCalls++; return route.abort();
    });
    await page.click('[data-act="gset"]');
    await page.setInputFiles("#importFile", { name: "fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
    await openWorld(page);
    await page.click('#side [data-act="canon"]');
    const guide = "공통 지침: 1990년대 셀 애니메이션, 청회색 팔레트, 세계관 고유 군복";
    await page.fill("#wImageGuide", guide); await page.click('[data-act="save-canon"]');
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("저장했습니다"));
    assert.strictEqual((await read(page, "w:images")).imageGuide, guide);
    assert.strictEqual((await read(page, "p:images:person")).portrait, pixels.old);
    assert.strictEqual(requests.length, 0);
    pass("공통 지침 저장만으로 기존 이미지나 문서가 바뀌거나 AI가 호출되지 않는다");

    await page.click('#side [data-k="person"]'); await openGenerator(page);
    await page.selectOption("#imageStyle", "수채화"); await page.selectOption("#imageRatio", "3:4");
    await page.fill("#imageDirection", "푸른 항구를 배경으로 웃는 상반신"); await generate(page);
    assert.strictEqual(requests.length, 1);
    const req = requests[0], prompt = req.body.contents[0].parts[0].text;
    assert(req.url.includes("gemini-nano-banana-2.1:generateContent"));
    assert.strictEqual(req.headers["x-goog-api-key"], "test-key");
    assert(prompt.includes(guide) && prompt.includes("테스트 인물") && prompt.includes("수채화") && prompt.includes("푸른 항구"));
    assert.strictEqual(req.body.generationConfig.imageConfig.aspectRatio, "3:4"); assert.strictEqual(req.body.generationConfig.imageConfig.imageSize, "1K");
    assert.strictEqual(req.body.contents[0].parts[1].inlineData.mimeType, "image/png"); assert.strictEqual(req.body.contents[0].parts[1].inlineData.data, pixels.old.split(",")[1]);
    assert.strictEqual((await read(page, "p:images:person")).portrait, pixels.old);
    await page.locator(".image-gen .preview").click(); await page.waitForSelector(".image-viewer[open]");
    await page.waitForFunction(() => document.querySelector(".viewer-image")?.naturalWidth > 0);
    assert.deepStrictEqual(await page.locator(".viewer-image").evaluate(i => [i.naturalWidth, i.naturalHeight]), [600, 800], "생성 원본도 768px로 줄이지 않고 보존한다");
    await page.click("[data-viewer-close]"); await page.waitForSelector(".image-viewer[open]", { state: "detached" });
    assert.strictEqual((await read(page, "p:images:person")).portrait, pixels.old);
    assert.strictEqual(textCalls, 0);
    pass("공통 지침·문서·화풍·구도·참조 이미지를 보내고 적용 전까지 결과를 미리보기로만 둔다");

    await page.click('[data-act="image-discard"]');
    assert.strictEqual(await page.locator(".image-gen .preview").count(), 0);
    assert.strictEqual((await read(page, "p:images:person")).portrait, pixels.old);
    await generate(page); const preview = await page.locator(".image-gen .preview").getAttribute("src");
    await apply(page); assert.strictEqual((await read(page, "p:images:person")).portrait, preview);
    assert(preview.length <= 1536 * 1024);
    await page.reload(); await page.waitForSelector(".wcard"); await openWorld(page);
    assert.strictEqual(await page.locator(".portrait img").getAttribute("src"), preview);
    pass("미리보기 버리기는 원본을 유지하고 적용한 결과만 저장해 새로고침 뒤에도 유지한다");

    await page.fill("#q", "테스트 항구"); await page.press("#q", "Enter"); await page.waitForSelector(".article h2");
    await openGenerator(page); await page.selectOption("#imageModel", "gemini-3.1-flash-lite-image"); await generate(page);
    const placeReq = requests[requests.length - 1];
    assert(placeReq.url.includes("gemini-3.1-flash-lite-image:generateContent"));
    assert(placeReq.body.contents[0].parts[0].text.includes(guide) && placeReq.body.contents[0].parts[0].text.includes("테스트 항구"));
    assert.strictEqual(placeReq.body.generationConfig.imageConfig.aspectRatio, "4:3");
    assert(!placeReq.body.generationConfig.responseMimeType);
    await apply(page); assert((await read(page, "p:images:place")).portrait);
    assert.strictEqual(await page.locator(".infobox .portrait img").count(), 1);
    pass("인물 외 문서도 같은 공통 지침을 참고해 이미지를 생성하고 인포박스에 배치한다");

    const beforeGuide = (await read(page, "p:images:person")).portrait, totalBeforeGuide = requests.length;
    await page.click('#side [data-act="canon"]'); await page.fill("#wImageGuide", "새 공통 지침: 흑백 목판화"); await page.click('[data-act="save-canon"]');
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("저장했습니다"));
    assert.strictEqual(requests.length, totalBeforeGuide);
    assert.strictEqual((await read(page, "p:images:person")).portrait, beforeGuide);
    await page.click('#side [data-k="person"]'); await openGenerator(page);
    await page.locator('[data-igf="useRef"]').uncheck(); await generate(page);
    const noRef = requests[requests.length - 1].body;
    assert(noRef.contents[0].parts[0].text.includes("새 공통 지침: 흑백 목판화")); assert.strictEqual(noRef.contents[0].parts.length, 1);
    await page.click('[data-act="image-close"]');
    pass("지침 변경은 다음 생성부터 반영되고 참조 이미지 전송도 선택할 수 있다");

    for (const failure of ["no-image", "quota"]) {
      mode = failure; await openGenerator(page); const at = requests.length;
      await page.click('[data-act="image-generate"]'); await page.waitForSelector(".image-gen [role=alert]");
      await page.waitForTimeout(250); assert.strictEqual(requests.length, at + 1, "실패를 자동 재시도하지 않는다");
      assert.strictEqual((await read(page, "p:images:person")).portrait, beforeGuide);
      await page.click('[data-act="image-close"]');
    }
    pass("이미지 미반환과 사용량 제한 시 기존 이미지를 유지하고 자동 재과금 요청을 보내지 않는다");

    mode = "delay"; await openGenerator(page); await page.click('[data-act="image-generate"]');
    for (let i = 0; !release && i < 100; i++) await page.waitForTimeout(20);
    assert(release); await page.click('[data-act="image-close"]'); mode = "ok"; release(); release = null;
    await page.waitForTimeout(200); assert.strictEqual(await page.locator(".image-gen").count(), 0);
    assert.strictEqual((await read(page, "p:images:person")).portrait, beforeGuide);
    pass("생성을 중단하면 늦게 도착한 결과를 적용하지 않는다");

    await openGenerator(page); await generate(page);
    await page.evaluate(() => {
      window.originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(stores, mode, ...rest) { if (mode === "readwrite") throw new DOMException("Test full", "QuotaExceededError"); return window.originalTransaction.call(this, stores, mode, ...rest); };
    });
    await page.click('[data-act="image-apply"]'); await page.waitForSelector(".image-gen [role=alert]");
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.originalTransaction; });
    assert.strictEqual((await read(page, "p:images:person")).portrait, beforeGuide);
    assert.strictEqual(await page.locator(".image-gen .preview").count(), 1);
    await page.click('[data-act="image-close"]');
    pass("저장 실패 시 원본과 미리보기를 보존한다");

    await openGenerator(page); await generate(page);
    await page.evaluate(() => new Promise(resolve => {
      const r = indexedDB.open("worldwiki-gemini", 1); r.onsuccess = () => { const db = r.result, t = db.transaction("kv", "readwrite"), st = t.objectStore("kv"), q = st.get("p:images:person"); q.onsuccess = () => { const p = q.result; p.sections[0].body = "다른 기기에서 수정된 본문"; st.put(p, "p:images:person"); }; t.oncomplete = () => { db.close(); resolve(); }; };
    }));
    await page.click('[data-act="image-apply"]'); await page.waitForSelector(".image-gen [role=alert]");
    assert((await page.locator(".image-gen [role=alert]").innerText()).includes("바뀌었습니다"));
    assert.strictEqual((await read(page, "p:images:person")).sections[0].body, "다른 기기에서 수정된 본문");
    await page.click('[data-act="image-close"]'); await page.reload(); await page.waitForSelector(".wcard"); await openWorld(page);
    pass("생성 도중 다른 기기에서 바뀐 문서를 이전 본문으로 덮어쓰지 않는다");

    await page.click('#side [data-act="gset"]');
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
    const stream = await dl.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk);
    const backup = JSON.parse(Buffer.concat(chunks).toString());
    assert.strictEqual(backup.worlds[0].imageGuide, "새 공통 지침: 흑백 목판화");
    assert(backup.pages.images.person.portrait && backup.pages.images.place.portrait);
    pass("세계관 이미지 지침과 문서 이미지가 기존 백업 형식에 함께 저장된다");

    const restored = await browser.newContext();
    await restored.addInitScript(() => localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "key", key: "test-key" })));
    await restored.route("https://fonts.googleapis.com/**", r => r.abort());
    const rp = await restored.newPage(); await rp.goto(url); await rp.waitForSelector("#seedTa");
    await rp.click('[data-act="gset"]');
    await rp.setInputFiles("#importFile", { name: "restore.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    await rp.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
    await openWorld(rp); await openGenerator(rp);
    assert.strictEqual((await read(rp, "w:images")).imageGuide, "새 공통 지침: 흑백 목판화");
    assert.strictEqual((await read(rp, "p:images:person")).portrait, backup.pages.images.person.portrait);
    assert((await rp.locator(".image-gen .guide").textContent()).includes("흑백 목판화"));
    await rp.click('[data-act="image-close"]');
    pass("백업을 다른 브라우저에서 복원해도 지침과 기존 이미지가 유지된다");
    const other = JSON.parse(JSON.stringify(backup));
    other.worlds[0].id = "other"; other.worlds[0].title = "다른 이미지 세계"; delete other.worlds[0].imageGuide;
    other.pages = { other: other.pages.images };
    await rp.click('#side [data-act="gset"]');
    await rp.setInputFiles("#importFile", { name: "other.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(other)) });
    await rp.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
    await rp.click('#side [data-act="home"]'); await rp.click('.wcard button.open:has-text("다른 이미지 세계")'); await rp.waitForSelector(".article h2");
    await openGenerator(rp);
    assert((await rp.locator(".image-gen .guide").textContent()).includes("지정된 이미지 지침이 없습니다"));
    await restored.close();
    pass("세계관 이미지 지침이 다른 세계관으로 섞이지 않는다");

    await page.selectOption("#gMode", "relay"); await page.fill("#gPass", "test-pass"); await page.click('[data-act="gset-save"]');
    await openWorld(page); await openGenerator(page); mode = "ok"; const relayStart = requests.length;
    await generate(page);
    const relayRequests = requests.slice(relayStart);
    assert.strictEqual(relayRequests.length, 1); assert(relayRequests[0].url.includes("gemini-nano-banana-2.1:generateContent"));
    assert.strictEqual(relayRequests[0].headers["x-ww-pass"], "test-pass"); assert(!relayRequests[0].headers["x-goog-api-key"]);
    assert.strictEqual(textCalls, 0); assert.deepStrictEqual(errors, []);
    pass("기존 중계 서버의 인증과 생성 경로로 같은 이미지 모델을 바로 사용한다");
    if (process.env.SHOT_DIR) { await page.setViewportSize({ width: 390, height: 844 }); await page.locator("#toast").waitFor({ state: "hidden" }); await page.screenshot({ path: path.join(process.env.SHOT_DIR, "image-generation-mobile.png"), fullPage: true }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    console.log(`\n모두 통과 (${n}개). 실제 유료 API 호출 0회.`);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
