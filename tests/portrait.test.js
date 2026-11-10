/* 프로필 이미지 e2e: AI 연결 없이 실제 파일 선택·변환·저장·백업을 검증한다.
 * 실행: node tests/portrait.test.js (Playwright 필요)
 */
const http = require("http"), fs = require("fs"), path = require("path"), assert = require("assert");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..");
const server = http.createServer((req, res) => {
  if (req.url !== "/") { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(fs.readFileSync(path.join(ROOT, "index.html")));
});
const entity = (title, type) => ({ title, type, summary: title, facts: [], mentions: [], page: true, box: "" });
const doc = (key, title, type) => ({ key, title, type, summary: title, categories: [], notices: [], infobox: [], sections: [{ heading: "개요", level: 1, body: "원래 본문이다." }], links: [], createdAt: 1 });
const backup = { app: "worldwiki", version: 1, worlds: [{ kind: "world", id: "portrait-world", title: "이미지 테스트 세계", seed: "원안", era: "1900년", rules: [], timeline: [], style: "encyc", entities: { person: entity("테스트 인물", "인물"), place: entity("테스트 항구", "지명") }, mainKey: "person", createdAt: 1, updatedAt: 1 }],
  pages: { "portrait-world": { person: doc("person", "테스트 인물", "인물"), place: doc("place", "테스트 항구", "지명") } } };
const stored = page => page.evaluate(() => new Promise((resolve, reject) => {
  const r = indexedDB.open("worldwiki-gemini", 1);
  r.onsuccess = () => { const db = r.result, t = db.transaction("kv"), q = t.objectStore("kv").get("p:portrait-world:person"); q.onsuccess = () => resolve(q.result); q.onerror = reject; t.oncomplete = () => db.close(); };
  r.onerror = reject;
}));
const pick = (page, buffer, name = "portrait.png", mimeType = "image/png") => page.locator("[data-portrait-file]").setInputFiles({ name, mimeType, buffer });
const image = page => page.locator(".infobox .portrait img");
const removeImage = async page => { await page.locator(".portrait-menu summary").click(); await page.click("[data-portrait-remove]"); };
const waitSaved = page => page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("프로필 이미지를 저장했습니다.") && !document.querySelector("[data-portrait]")?.disabled);
const open = async page => { await page.click('.wcard button.open:has-text("이미지 테스트 세계")'); await page.waitForSelector(".article h2"); };
const reopen = async page => {
  await page.reload(); await page.waitForSelector("#gMode, .wcard");
  if (await page.locator("#gMode").count()) await page.click('#side [data-act="home"]');
  await open(page);
};
const importBackup = async (page, data) => {
  await page.setInputFiles("#importFile", { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
  await page.click('#side [data-act="home"]');
  await page.waitForSelector(".wcard");
};
let n = 0; const pass = msg => console.log(`  ✓ ${++n}. ${msg}`);
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage(), errors = [], requests = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (/generativelanguage|\/v1beta\/models|\/api\//.test(r.url())) requests.push(r.url()); });
  await ctx.route("https://fonts.googleapis.com/**", r => r.abort());
  await ctx.route("https://fonts.gstatic.com/**", r => r.abort());
  try {
    await page.goto(url); await page.waitForSelector("#gMode");
    await importBackup(page, backup); await open(page);
    assert.strictEqual(await page.locator(".infobox .ih").innerText(), "테스트 인물");
    assert.strictEqual(await page.locator("[data-portrait]").count(), 1);
    assert.strictEqual(await page.locator(".infobox button, .infobox input").count(), 0);
    assert.strictEqual(await page.locator(".infobox .portrait").count(), 0);
    assert.strictEqual(await page.locator("[data-portrait]").isVisible(), false);
    await page.locator(".portrait-menu summary").click();
    assert(await page.locator("[data-portrait]").isVisible());
    await page.keyboard.press("Escape"); assert.strictEqual(await page.locator("[data-portrait]").isVisible(), false);
    await page.locator(".portrait-menu summary").press("Enter");
    assert(await page.locator("[data-portrait]").isVisible());
    await page.locator("h1.t").click(); assert.strictEqual(await page.locator("[data-portrait]").isVisible(), false);
    pass("인포박스에서 조작 버튼을 숨기고 문서 도구의 이미지 메뉴를 마우스·키보드로 열고 닫는다");
    const png = Buffer.from(await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 1800; c.height = 2400;
      const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 1800, 2400);
      g.addColorStop(0, "#517c9c"); g.addColorStop(1, "#cadcc2"); x.fillStyle = g; x.fillRect(0, 0, 1800, 2400);
      x.fillStyle = "#f3dfc8"; x.beginPath(); x.arc(900, 900, 450, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#283c50"; x.fillRect(450, 1420, 900, 980);
      return c.toDataURL("image/png").split(",")[1];
    }), "base64");
    await page.locator(".portrait-menu summary").click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("[data-portrait]")]);
    await chooser.setFiles({ name: "portrait.png", mimeType: "image/png", buffer: png }); await waitSaved(page);
    const src = await image(page).getAttribute("src"), saved = await stored(page);
    assert.strictEqual(saved.portrait, src); assert(!saved.editedAt);
    assert(src.length <= 240 * 1024 && src.startsWith("data:image/"));
    await page.waitForFunction(() => document.querySelector(".portrait img")?.naturalWidth > 0);
    assert.deepStrictEqual(await image(page).evaluate(i => [i.naturalWidth, i.naturalHeight]), [576, 768]);
    assert.strictEqual(await page.locator(".infobox > .ih + .portrait").count(), 1);
    assert.strictEqual(await page.locator(".infobox > .portrait + .ity").count(), 1);
    assert.strictEqual(await page.locator(".infobox button, .infobox input").count(), 0);
    assert.strictEqual(await page.locator("[data-portrait-remove]").isVisible(), false);
    assert.deepStrictEqual(requests, []);
    pass("AI 요청 없이 실제 이미지를 축소·저장하고 이름 바로 아래에 원래 비율로 배치한다");

    await reopen(page);
    assert.strictEqual(await image(page).getAttribute("src"), src);
    await page.click("[data-edit]"); await page.fill("#edBody", "= 개요 =\n직접 고친 본문이다.");
    await page.click("#edSave"); await page.waitForSelector(".article h2");
    assert.strictEqual(await image(page).getAttribute("src"), src);
    assert.strictEqual((await stored(page)).portrait, src);
    pass("새로고침과 일반 문서 편집 뒤에도 프로필 이미지가 유지된다");

    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const bounds = await image(page).boundingBox(); assert(bounds.width <= 390 && bounds.height <= 400);
    await page.locator("#toast").waitFor({ state: "hidden" });
    if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "portrait-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    pass("모바일에서도 가로 넘침 없이 이미지 전체를 표시한다");

    for (const [buf, name, mimeType, message] of [
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "bad.svg", "image/svg+xml", "이미지 파일을 선택"],
      [Buffer.alloc(10 * 1024 * 1024 + 1), "big.png", "image/png", "10MB 이하"],
      [Buffer.from("broken"), "broken.png", "image/png", "이미지를 읽지 못했습니다"],
    ]) {
      await pick(page, buf, name, mimeType);
      await page.waitForFunction(m => document.querySelector("#toast")?.textContent.includes(m) && !document.querySelector("[data-portrait]")?.disabled, message);
      assert.strictEqual(await image(page).getAttribute("src"), src);
      assert.strictEqual((await stored(page)).portrait, src);
    }
    pass("지원하지 않는 형식·10MB 초과·손상된 파일은 기존 이미지를 보존하며 거절한다");

    await page.evaluate(() => {
      window.savedTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
        if (mode === "readwrite") throw new DOMException("Test storage full", "QuotaExceededError");
        return window.savedTransaction.call(this, stores, mode, ...rest);
      };
    });
    await removeImage(page);
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("이미지를 저장하지 못했습니다"));
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.savedTransaction; });
    assert.strictEqual(await image(page).getAttribute("src"), src);
    assert.strictEqual((await stored(page)).portrait, src);
    pass("저장 공간 오류가 나면 이미지 삭제를 확정하지 않는다");

    const replacement = Buffer.from(await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = c.height = 40;
      const x = c.getContext("2d"); x.fillStyle = "#b75d40"; x.fillRect(0, 0, 40, 40);
      return c.toDataURL("image/png").split(",")[1];
    }), "base64");
    await pick(page, replacement); await waitSaved(page);
    const nextSrc = await image(page).getAttribute("src"); assert.notStrictEqual(nextSrc, src);
    await page.click('#side [data-act="gset"]');
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
    const stream = await dl.createReadStream(), chunks = []; for await (const c of stream) chunks.push(c);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    assert.strictEqual(exported.pages["portrait-world"].person.portrait, nextSrc);
    const other = await browser.newContext(), otherPage = await other.newPage();
    await other.route("https://fonts.googleapis.com/**", r => r.abort());
    await otherPage.goto(url); await otherPage.waitForSelector("#gMode");
    await importBackup(otherPage, exported); await open(otherPage);
    assert.strictEqual(await image(otherPage).getAttribute("src"), nextSrc); await other.close();
    pass("이미지를 교체하고 백업을 다른 브라우저에서 가져와도 그대로 복원된다");

    assert.deepStrictEqual(requests, []);
    // 다시 쓰기는 가짜 Gemini 응답으로 검증한다. 사용자 이미지는 요청 본문에 들어가면 안 된다.
    const prompts = [];
    await ctx.route("**/v1beta/models/**", async route => {
      const body = route.request().postData() || ""; prompts.push(body);
      const text = JSON.parse(body).contents?.[0]?.parts?.[0]?.text || "";
      const answer = text.includes("## 작성할 문서:") ? { title: "테스트 인물", type: "인물", summary: "새 정의", categories: [], notices: [], infobox: [{ label: "성별", value: "여성" }], sections: [{ heading: "개요", level: 1, body: "AI가 다시 쓴 본문이다." }], facts: [], timeline: [], relations: [], navboxes: [], newEntities: [] }
        : text.includes("분위기 지침을 만든다") ? { label: "테스트", guide: ["담백하게 쓴다"] } : { issues: [] };
      const sse = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] })}\n\n`;
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse });
    });
    await page.selectOption("#gMode", "key"); await page.fill("#gKey", "test-key"); await page.click('[data-act="gset-save"]');
    await page.click('#side [data-act="home"]'); await open(page);
    await page.locator("[data-rw]").first().click(); await page.click("[data-rw-yes]");
    await page.waitForFunction(() => document.querySelector(".article")?.textContent.includes("AI가 다시 쓴 본문이다."));
    assert.strictEqual(await image(page).getAttribute("src"), nextSrc);
    assert.strictEqual((await stored(page)).portrait, nextSrc);
    assert(prompts.length > 0 && prompts.every(p => !p.includes("data:image/")));
    const rewriteCalls = requests.length;
    pass("AI 다시 쓰기 뒤에도 이미지를 유지하고 AI 요청에 이미지 데이터를 넣지 않는다");

    await removeImage(page);
    await page.waitForFunction(() => !document.querySelector(".portrait img") && !document.querySelector("[data-portrait]")?.disabled);
    assert(!(await stored(page)).portrait);
    await reopen(page);
    assert.strictEqual(await image(page).count(), 0);
    await page.fill("#q", "테스트 항구"); await page.press("#q", "Enter"); await page.waitForSelector(".article h2");
    assert.strictEqual(await page.locator("[data-portrait]").count(), 0);
    assert.strictEqual(requests.length, rewriteCalls); assert.deepStrictEqual(errors, []);
    pass("삭제는 새로고침 뒤에도 유지되고 인물 외 문서에는 업로드 UI를 추가하지 않는다");
    console.log(`\n모두 통과 (${n}개). 이미지 작업 AI 요청 0회, 다시 쓰기 검증용 가짜 AI 응답 ${rewriteCalls}회.`);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
