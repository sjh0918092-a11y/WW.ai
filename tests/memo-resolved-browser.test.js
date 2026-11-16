/* 편집자 메모 고치기: 이미 원문에 반영된 메모는 실패 경고 대신 닫는다. Gemini 응답은 모두 가로챈다(유료 호출 0회) */
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
  const base = key("북해 기지");
  const issue = (claim, conflict) => ({ claim, conflict, severity: "high" });
  const page0 = { key: base, title: "북해 기지", type: "지명", summary: "북해의 해저 기지", categories: [], infobox: [], links: [], createdAt: 1,
    sections: [{ heading: "개요", level: 1, body: "북해 기지는 2014년에 준공되었다. 기지는 두 기의 병기를 둔다." }],
    check: { at: 2, issues: [issue("북해 기지는 2010년에 준공되었다.", "확정 연표는 2014년 준공이다."), issue("기지는 두 기의 병기를 둔다.", "확정 설정과 다르다."), issue("북해 기지는 2014년에 준공되었다.", "다른 이유로 지적했다.")] } };
  const world = { kind: "world", id: "sea", title: "심해 세계", seed: "바다 세계.", era: "2016년", guide: "", rules: [], userCanon: "", toneTried: true, timeline: [], relations: [], navboxes: {}, aliases: {}, mainKey: base, createdAt: 1,
    entities: { [base]: { title: "북해 기지", type: "지명", summary: "북해의 해저 기지", facts: [], mentions: [], page: true, box: "" } } };
  const fixture = { app: "worldwiki", version: 1, worlds: [world], pages: { sea: { [base]: page0 } } };
  let answer = {};
  await ctx.route("**/v1beta/models/**", async r => {
    try { await r.fulfill({ contentType: "text/event-stream", body: "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] }) + "\n\n" }); } catch {}
  });
  const page = await ctx.newPage(), errors = []; page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.click('#side [data-act="gset"]');
    await page.setInputFiles("#importFile", { name: "f.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("가져왔습니다"));
    await page.click('#side [data-act="home"]'); await page.locator('[data-world="sea"]').click(); await page.waitForSelector(".memo");
    const issues = () => page.evaluate(k => (S.pages[k].check?.issues || []).map(i => i.conflict), base);

    // 원문에서 사라진 서술: AI가 수정안을 내지 않아도 메모를 닫는다
    answer = { edits: [], note: "" };
    await page.click('[data-fix="0"]');
    await page.waitForFunction(k => S.pages[k].check.issues.length === 2 && !S.fixing, base);
    await page.waitForFunction(() => S.fixv?.phase === "pick" && S.fixv.err.includes("메모 1개를 닫았습니다"));
    await page.click('[data-act="fixv-back"]'); await page.waitForSelector("[data-fix]");
    assert.deepEqual(await issues(), ["확정 설정과 다르다.", "다른 이유로 지적했다."]);
    pass("메모의 고치기: 원문에 없는 서술의 메모는 경고 대신 닫고 저장한다");

    // 한꺼번에 교정: AI가 resolved로 답한 메모만 닫고, 아무 답이 없는 메모는 경고와 함께 남긴다
    answer = { edits: [], resolved: [1], note: "" };
    await page.click('[data-act="fixv-open"]'); await page.waitForFunction(() => S.view.name === "fix");
    await page.click('[data-act="fixv-run"]');
    await page.waitForFunction(() => S.fixv?.phase === "pick" && S.fixv.err);
    assert.deepEqual(await issues(), ["다른 이유로 지적했다."]);
    assert((await page.evaluate(() => S.fixv.err)).includes("메모 1개를 닫았습니다"));
    assert.equal(await page.evaluate(() => S.fixv.items.length), 1);
    pass("교정 화면에서 AI가 해결됐다고 답한 메모만 닫는다");

    answer = { edits: [], note: "" };
    await page.click('[data-act="fixv-run"]');
    await page.waitForFunction(() => S.fixv?.phase === "pick" && S.fixv.err.includes("고칠 곳을 원문에서 찾지 못했습니다"));
    assert.deepEqual(await issues(), ["다른 이유로 지적했다."]);
    pass("원문에 그대로 있는 서술은 해결 신호 없이 닫지 않는다");
    assert.deepEqual(errors, []);
    console.log(`\n모두 통과 (${n}개). 유료 AI 호출 0회.`);
  } catch (e) { console.error("실패:", e); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
