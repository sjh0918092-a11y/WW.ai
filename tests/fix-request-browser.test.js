/* 직접 수정으로 충돌 표시가 붙은 문서와 편집자 메모가 남은 문서를 사이드바 '수정 요청'과 원본 문서에 띄운다 */
const assert = require("assert");
const { appServer } = require("./helpers/app");
const { chromium } = require("playwright");
const server = appServer();
const doc = (key, title, extra = {}) => ({ key, title, type: "인물", summary: title + "의 기록", infobox: [], sections: [{ heading: "개요", level: 1, body: title + " 본문." }], links: [], createdAt: 1, ...extra });
const src = doc("src", "원본 인물", { editedAt: 2 }), target = doc("target", "고칠 인물", { conflicts: [{ by: "src", byTitle: "원본 인물", old: "옛 서술", claim: "새 서술" }] }), ref = doc("ref", "참고 인물", { check: { at: 1, issues: [{ severity: "low", claim: "참고 메모" }] } }), other = doc("other", "무관한 인물", { check: { at: 1, issues: [{ severity: "high", claim: "남이 고칠 메모", target: "src" }] } }),
  memo = doc("memo", "메모 인물", { check: { at: 1, issues: [{ severity: "high", claim: "메모 인물 본문.", conflict: "설정과 다름" }] } });
const w = { kind: "world", id: "fixreq", title: "요청 세계", seed: "원안", era: "1900년", rules: [], timeline: [], style: "encyc", entities: Object.fromEntries([src, target, other, memo, ref].map(p => [p.key, { title: p.title, type: p.type, summary: p.summary, facts: [], mentions: [], page: true, box: "" }])), mainKey: "src", createdAt: 1, updatedAt: 1 };
const fixture = { app: "worldwiki", version: 1, worlds: [w], pages: { fixreq: { src, target, other, memo, ref } } };
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch(), page = await browser.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.click('#side [data-act="gset"]');
    await page.setInputFiles("#importFile", { name: "fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
    await page.click('#side [data-act="home"]'); await page.click(".wcard button.open"); await page.waitForSelector(".article h2");
    const side = page.locator("#side .fixreq");
    assert.equal(await side.locator("h4").innerText(), "수정 요청 · 3");
    assert((await side.innerText()).includes("고칠 인물"));
    assert((await side.locator('[data-k="memo"]').innerText()).includes("1곳"));
    assert((await side.locator('[data-k="ref"]').innerText()).includes("1곳"));
    assert(!(await side.innerText()).includes("무관한 인물"));
    pass("충돌 표시가 붙은 문서와 편집자 메모(다듬을 곳·참고)가 남은 문서가 사이드바 '수정 요청'에 곳 수와 함께 보이고, 다른 문서가 고칠 메모만 있으면 빠진다");
    const line = page.locator(".sheet .memo-line", { hasText: "수정 요청을 보낸 문서" });
    assert((await line.innerText()).includes("고칠 인물"));
    await side.locator('[data-k="target"]').click(); await page.waitForFunction(() => S.view.key === "target");
    assert(await page.locator(".banner.warn", { hasText: "원본 인물" }).count());
    assert.equal(await page.locator(".sheet .memo-line", { hasText: "수정 요청을 보낸 문서" }).count(), 0);
    pass("원본 문서에 요청을 보낸 문서가 링크로 보이고, 사이드바에서 눌러 해당 문서의 경고로 간다");
    await page.click('[data-dismiss="target"][data-field="conflicts"]');
    await page.waitForFunction(() => !document.querySelector('#side .fixreq [data-k="target"]'));
    pass("표시를 지우면 수정 요청 목록에서 빠진다");
    await side.locator('[data-k="memo"]').click(); await page.waitForFunction(() => S.view.key === "memo");
    assert(await page.locator("details.memo").count());
    while (await page.locator(".memo-del").count()) { const n0 = await page.locator(".memo-del").count(); await page.locator(".memo-del").first().click(); await page.waitForFunction(n => document.querySelectorAll(".memo-del").length < n, n0); }   // 열 때 붙는 규칙 검사 메모까지 모두 지운다
    await page.waitForFunction(() => !document.querySelector('#side .fixreq [data-k="memo"]'));
    assert.equal(await side.locator("h4").innerText(), "수정 요청 · 1");
    pass("사이드바에서 편집자 메모가 있는 문서로 가고, 메모를 지우면 목록에서 빠진다");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
