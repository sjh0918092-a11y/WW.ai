/* 인물 외모: 평소에는 숨기고 이미지 생성 패널에서 펼쳐 고친다. 확정 사실 정리가 정하고 이미지·단편·삽화 프롬프트가 같은 값을 따른다. 실제 과금 없음 */
const assert = require("assert");
const { appServer } = require("./helpers/app");
const { chromium } = require("playwright");
const server = appServer();
const doc = (key, title, extra = {}) => ({ key, title, type: "인물", summary: `${title}의 문서다.`, categories: [], notices: [], infobox: [{ label: "성별", value: "남성" }], sections: [{ heading: "개요", level: 1, body: `${title}은 [[하비에르 로페스]]와 같은 부대에 있다.` }], links: [], createdAt: 1, ...extra });
const javier = doc("javier", "하비에르 로페스", { looks: { origin: "멕시코계 미국인", hairColor: "흑발", eyes: "갈색", build: "마른 편", marks: "왼쪽 눈썹의 흉터" } });
const mike = doc("mike", "마이클 존슨", { links: ["javier"] });
const fixture = { app: "worldwiki", version: 1, worlds: [{ kind: "world", id: "looks", title: "외모 세계", seed: "현대 미군", era: "2020년", rules: [], timeline: [], style: "encyc", mainKey: "javier", imageGuide: "사실적인 화풍", entities: Object.fromEntries([javier, mike].map(p => [p.key, { title: p.title, type: p.type, summary: p.summary, facts: [], mentions: [], page: true, box: "" }])), createdAt: 1, updatedAt: 1 }], pages: { looks: { javier, mike } } };
const read = (page, key) => page.evaluate(key => new Promise((resolve, reject) => {
  const r = indexedDB.open("worldwiki-gemini", 1); r.onsuccess = () => { const db = r.result, t = db.transaction("kv"), q = t.objectStore("kv").get(key); q.onsuccess = () => resolve(q.result); q.onerror = reject; t.oncomplete = () => db.close(); }; r.onerror = reject;
}), key);
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`, browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem("wwiki:gemini")) localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "relay", pass: "test-key", imageModel: "gemini-nano-banana-2.1", imageDefaultVersion: 1 })); });
  await ctx.route("https://fonts.googleapis.com/**", r => r.abort()); await ctx.route("https://fonts.gstatic.com/**", r => r.abort());
  await ctx.route("**/v1beta/models/**", r => r.abort());
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(url); await page.waitForSelector("#seedTa");
    await page.click('[data-act="gset"]');
    await page.setInputFiles("#importFile", { name: "fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
    await page.click('#side [data-act="home"]'); await page.click('.wcard button.open:has-text("외모 세계")'); await page.waitForSelector(".article h2");
    assert.ok(!(await page.textContent(".article")).includes("멕시코계"), "문서 화면에는 외모를 보이지 않는다");
    pass("평소 문서 화면에는 외모를 보이지 않는다");

    await page.locator(".portrait-menu summary").click(); await page.click("[data-image-open]"); await page.waitForSelector(".image-gen");
    assert.strictEqual(await page.$eval("[data-looks-box]", d => d.open), false);
    await page.click("[data-looks-box] summary");
    assert.strictEqual(await page.inputValue("#looks-origin"), "멕시코계 미국인");
    assert.ok(await page.$eval('[data-act="looks-save"]', b => b.disabled), "바꾸기 전에는 저장 버튼이 꺼져 있다");
    await page.fill("#looks-hairColor", "짙은 갈색");
    await page.evaluate(() => renderMain());   // 화면을 다시 그려도 펼침과 작성 중인 값이 남는다
    assert.strictEqual(await page.$eval("[data-looks-box]", d => d.open), true);
    assert.strictEqual(await page.inputValue("#looks-hairColor"), "짙은 갈색");
    pass("이미지 생성 패널 안에 접혀 있고, 펼쳐서 확인하고 고칠 수 있다");

    await page.click('[data-act="looks-save"]');
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("외모를 저장했습니다"));
    const saved = await read(page, "p:looks:javier");
    assert.strictEqual(saved.looks.hairColor, "짙은 갈색"); assert.strictEqual(saved.looks.origin, "멕시코계 미국인"); assert.ok(saved.looksEditedAt);
    pass("저장하면 문서에 남고 직접 수정한 외모로 표시된다");

    const prompts = await page.evaluate(() => {
      const w = S.world, temp = k => ({ key: k, title: S.pages[k].title, type: "인물", summary: "", infobox: [], sections: S.pages[k].sections, navboxes: [] });
      return { image: imagePrompt(w, S.pages.javier, { style: "실사", direction: "" }), syncEdited: factSyncPrompt(w, temp("javier"), [], { cats: true }),
        syncNew: factSyncPrompt(w, temp("mike"), ["javier"], { cats: true }), prose: prosePrompt(w, S.pages.mike, { direction: "", length: "short" }),
        clean: cleanLooks({ origin: " 아일랜드계 ", hairColor: "", bogus: "x", build: "[[링크|건장한 편]]" }) };
    });
    assert.ok(prompts.image.includes("## 고정 외모") && prompts.image.includes("짙은 갈색"));
    assert.ok(!prompts.syncEdited.includes('"looks"'), "직접 고친 외모는 정리 호출이 다시 정하지 않는다");
    assert.ok(prompts.syncNew.includes("알려진 실제 외모를 따른다"), "실존 인물은 실제 외모를 따른다");
    assert.ok(prompts.syncNew.includes('"looks"') && prompts.syncNew.includes("다른 인물 1명의 외모 분포") && prompts.syncNew.includes("왼쪽 눈썹의 흉터"));
    assert.ok(prompts.prose.includes("## 확정된 외모") && prompts.prose.includes("하비에르 로페스"), "단편은 관련 인물의 외모도 따른다");
    assert.deepStrictEqual(prompts.clean, { origin: "아일랜드계", build: "건장한 편" });
    pass("이미지·단편 프롬프트가 외모를 따르고, 정리 호출은 외모가 없는 인물에만 다른 인물의 분포와 함께 요청한다");
    assert.deepStrictEqual(errors, []);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
