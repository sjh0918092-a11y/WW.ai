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
    assert.equal(await page.evaluate(() => S.view.name), "article", "메모의 고치기는 문서 화면에 머문 채 뒤에서 진행한다");
    await page.waitForFunction(k => S.pages[k].check.issues.length === 2, base);
    await page.waitForFunction(k => S.fixJobs.get(k)?.phase === "pick" && S.fixJobs.get(k).err.includes("메모 1개를 닫았습니다"), base);
    await page.click(`#side [data-fixdrop="${base}"]`); await page.waitForFunction(k => !S.fixJobs.has(k), base); await page.waitForSelector("[data-fix]");
    assert.deepEqual(await issues(), ["확정 설정과 다르다.", "다른 이유로 지적했다."]);
    pass("메모의 고치기: 원문에 없는 서술의 메모는 경고 대신 닫고 저장한다");

    // 한꺼번에 교정: AI가 resolved로 답한 메모만 닫고, 아무 답이 없는 메모는 경고와 함께 남긴다
    answer = { edits: [], resolved: [1], note: "" };
    await page.click('[data-act="fixv-open"]'); await page.waitForFunction(() => S.view.name === "fix");
    await page.click('[data-act="fixv-run"]');
    await page.waitForFunction(() => curFix()?.phase === "pick" && curFix().err);
    assert.deepEqual(await issues(), ["다른 이유로 지적했다."]);
    assert((await page.evaluate(() => curFix().err)).includes("메모 1개를 닫았습니다"));
    assert.equal(await page.evaluate(() => curFix().items.length), 1);
    pass("교정 화면에서 AI가 해결됐다고 답한 메모만 닫는다");

    answer = { edits: [], note: "" };
    await page.click('[data-act="fixv-run"]');
    await page.waitForFunction(() => curFix()?.phase === "pick" && curFix().err.includes("고칠 곳을 원문에서 찾지 못했습니다"));
    assert.deepEqual(await issues(), ["다른 이유로 지적했다."]);
    pass("원문에 그대로 있는 서술은 해결 신호 없이 닫지 않는다");

    answer = { edits: [], dismissed: [{ memo: 1, reason: "같은 대상을 비교한 지적이 아니다." }] };
    const unchanged = await page.evaluate(k => JSON.stringify(S.pages[k].sections), base);
    await page.click('[data-act="fixv-run"]');
    await page.waitForFunction(k => !S.pages[k].check.issues.length, base);
    assert.equal(await page.evaluate(k => JSON.stringify(S.pages[k].sections), base), unchanged);
    pass("수정 모델이 오탐으로 판정하면 문장을 바꾸지 않고 메모만 닫는다");

    const stopped = await page.evaluate(async ({ world, page0, base }) => {
      S.world = world; S.pages = { [base]: structuredClone(page0) }; S.view = { name: "article", key: base };
      const original = callJson;
      callJson = async kind => kind === 'check' ? { issues: [{ claim: '기지는 두 기의 병기를 둔다.', evidence: '검사 근거', conflict: '검사 메모', severity: 'high' }] } : kind === 'read' ? { issues: [] } : { edits: [], note: '<script>진단</script>' };
      try { await preCheck(world, base, S.pages[base], { ctl: new AbortController() }, () => {}); }
      catch (e) { if (e.code !== 'review_stalled') throw e; }
      finally { callJson = original; }
      renderMain();
      return S.pages[base].check.reviewDiagnostics.stopReason;
    }, { world, page0, base });
    assert.equal(stopped, 'no_progress');
    assert(await page.locator('.review-diag').count());
    await page.locator('.review-diag summary').click();
    assert((await page.locator('.review-diag pre').textContent()).includes('<script>진단</script>'));
    assert(await page.locator('[data-check]').count());
    pass('반복 중단 후 재시도 버튼과 이스케이프된 자동 수정 진단을 표시한다');

    const auto = await page.evaluate(async ({ world, page0, base }) => {
      S.world = world; S.pages = { [base]: page0 }; S.view = { name: "article", key: base };
      const original = callJson, kinds = [];
      callJson = async kind => {
        kinds.push(kind);
        if (kind === "check") return { issues: [{ claim: "북해 기지는", evidence: "확정 연표는 2015년이다.", conflict: "준공 연도를 고쳐야 한다.", severity: "high" }] };
        if (kind === "read") return { issues: [] };
        if (kind === "fix") return { edits: [{ memo: 1, field: "body", old: "2014년에 준공되었다", new: "2015년에 준공되었다" }] };
        throw Error("예상하지 않은 호출: " + kind);
      };
      try {
        const result = await preCheck(world, base, page0, { ctl: new AbortController() }, () => {});
        renderMain();
        return { fixed: result.fixed, issues: S.pages[base].check.issues, body: S.pages[base].sections[0].body, kinds };
      } finally { callJson = original; }
    }, { world, page0, base });
    assert.equal(auto.fixed, 1); assert.deepEqual(auto.issues, []); assert(auto.body.includes("2015년에 준공되었다"));
    assert.deepEqual(auto.kinds.sort(), ["check", "fix", "read"]);
    assert((await page.locator("#main").textContent()).includes("자동으로 고쳤습니다"));
    assert(!(await page.locator("#main").textContent()).includes("준공 연도를 고쳐야 한다."));
    pass("작성 직후 자동 수정은 메모의 주어가 본문에 남아도 메모를 닫아 보여 주며 AI 재검사를 하지 않는다");

    await page.evaluate(async base => {
      window.beforeReviewRetry = callJson;
      window.failReviewRetry = true;
      callJson = async kind => {
        if (kind === 'check') return { issues: [{ claim: '북해 기지', evidence: '다른 문서의 기록', conflict: '원문과 대조한다.', severity: 'low' }] };
        if (kind === 'read') return { issues: [] };
        if (window.failReviewRetry) throw { code: 'api_524' };
        return { edits: [], dismissed: [{ memo: 1, reason: '다른 기지의 기록을 잘못 비교했다.' }] };
      };
      try { await preCheck(S.world, base, S.pages[base], { ctl: new AbortController() }, () => {}); }
      catch (e) { if (e.code !== 'api_524') throw e; }
      window.failReviewRetry = false;
      renderMain();
    }, base);
    assert((await page.locator('#main').innerText()).includes('자동 검토를 완료하지 못했습니다'));
    assert.equal(await page.locator('details.memo:not(.doc-cost):not(.review-diag)').count(), 0, '미완료 메모를 완료 문서의 메모로 노출하지 않는다');
    await page.locator('.banner.warn [data-check]').click();
    await page.waitForFunction(k => S.pages[k].check.incomplete === false && !S.checking, base);
    assert(!(await page.locator('#main').innerText()).includes('자동 검토를 완료하지 못했습니다'));
    assert.equal(await page.locator('details.memo:not(.doc-cost):not(.review-diag)').count(), 0);
    await page.evaluate(() => { callJson = window.beforeReviewRetry; });
    pass("자동 수정 오류는 재시도 가능한 미완료 상태로 보이고 재개 후 오탐 메모를 정리한다");
    assert.deepEqual(errors, []);
    console.log(`\n모두 통과 (${n}개). 유료 AI 호출 0회.`);
  } catch (e) { console.error("실패:", e); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
