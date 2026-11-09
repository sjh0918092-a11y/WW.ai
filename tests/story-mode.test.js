/* 스토리 모드 e2e 테스트 (Gemini 실서버 없이)
 * 실행: node tests/story-mode.test.js
 * 필요: Playwright (require("playwright")). index.html을 로컬 서버로 띄우고, Gemini 요청을 가로채 고정 JSON을 SSE로 돌려준다.
 * 프롬프트에 든 표지 문구로 호출 종류를 가린다.
 */
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); fs.createReadStream(f).pipe(res);
});

/* ---------- 가짜 Gemini ---------- */
const calls = [];           // { kind, prompt }
const ctl = { planDelay: 0, planBad: false, planN: 1, checkIssues: null, checkDelay: 0, fixEdits: null, analyzeConflicts: null, readIssues: null, readFail: false, emptyChoices: false, pageOverride: {} };
const count = k => calls.filter(c => c.kind === k).length;
function kindOf(p) {
  if (p.includes("## 이야기 뼈대")) return "storyBible";
  if (p.includes("## 장 계획 작성")) return "chapterPlan";
  if (p.includes("## 장 섹션 작성")) return "chapterBlock";
  if (p.includes("## 다음 행동 후보 만들기")) return "choices";
  if (p.includes("## 문서 읽기 검사")) return "read";
  if (p.includes("검사하라")) return "check";
  if (p.includes("편집자가 남긴 메모")) return "fix";
  if (p.includes("사용자가 직접 수정한 최종본")) return "analyze";
  if (p.includes("분위기 지침을 만든다")) return "tone";
  if (p.includes("편집장")) return "bible";
  if (p.includes("## 작성할 문서:")) return "page";
  return "other";
}
const TONE = { label: "테스트 사극", guide: ["한자어를 섞는다", "건조하게 쓴다", "칭호를 남발하지 않는다", "고유명사는 조선풍", "인용은 짧게", "전투를 정면으로"] };
const BASE = { tagline: "테스트 세계", historical: false, rules: ["규칙 하나", "규칙 둘", "규칙 셋", "규칙 넷", "규칙 다섯"], timeline: [{ year: "1580", event: "녹둔도 개척" }, { year: "1585", event: "북관 철령 완공" }], tone: TONE };
function pageJson(title) {
  const links = title === "한서린" ? "[[북관 철령]]과 [[이일]], [[한양]]" : title === "대문 항목" ? "[[북관 철령]]" : title === "마커스 벡" ? "[[대문 항목]]" : title === "칼 슈미트" ? "[[벡]]" : "[[한서린]]";
  return { title, type: title === "한서린" || title === "이일" || /벡|슈미트/.test(title) ? "인물" : "지명", summary: `${title}은 테스트 항목이다.`, categories: ["테스트"], notices: [], infobox: [{ label: "상태", value: "생존" }, ...(title === "한서린" || title === "이일" || /벡|슈미트/.test(title) ? [{ label: "성별", value: "여성" }] : [])],
    sections: [{ heading: "개요", level: 1, body: `${title}은 ${links}와 얽힌 항목이다.` }, ...(title === "이일" ? [{ heading: "특징", level: 1, body: "" }, { heading: "아날로그 무전기 집착", level: 2, body: "이일은 낡은 무전기만 쓴다." }] : []), { heading: "역사", level: 1, body: `${title}의 역사는 1586년에 시작되었다.` }],
    facts: [], relations: [], navboxes: [], newEntities: [], timeline: [] };
}
function planJson(p) {
  const n = +(/다음 장\((\d)장\)/.exec(p) || [])[1];
  const last = n === 5;
  const affected = n === 2 ? [{ title: "북관 철령", change: "북관 철령이 여진 해적단에게 포위되었다.", kind: "update" }, { title: "이일 (인물)", change: "이일이 파직되었다.", kind: "update" }, { title: "원균 함대", change: "원균 함대가 새로 출전했다.", kind: "new" }]
    : n === 3 ? [{ title: "이일", change: "이일이 백의종군했다.", kind: "update" }] : [{ title: "한양", change: "한양에 소식이 전해졌다.", kind: "update" }];
  return { title: `제${n}장: ${n}번째 사건`, era: `${1586 + n}년`, summary: `${n}장 줄거리. 한서린이 움직였다.`, timeline: [{ year: String(1586 + n), event: `${n}장 사건` }],
    protagonistBlock: { heading: `${n}장 사건명`, sections: [{ heading: "출전", level: 1, body: `한서린은 [[이일(인물)]]과 함께 출전했다. (${n}장)` }, { heading: "귀환", level: 1, body: "한서린은 돌아왔다." }], infoboxPatch: [{ label: "상태", value: `${n}장 상태` }], summaryPatch: "" },
    affected, newEntities: [{ title: "원균 함대", type: "조직", summary: "새 함대" }, ...(n === 2 ? [{ title: "새 이웃", type: "인물", summary: "옆집 사람" }] : [])], wove: [{ title: "이일", how: "이일이 출전의 계기가 되었다." }, { title: "여진 해적단(조직)", how: "해적단이 철령을 포위했다." }],
    facts: [{ about: "이일", fact: `이일은 ${n}장에 움직였다.` }], relations: [], spineRevise: n === 2 ? [{ n: 4, intent: "수정된 절정" }] : [],
    nextChoices: last ? [] : ctl.emptyChoices ? [{}, { score: 3 }] : n === 2 ? [{ action: "진격한다", reason: "적이 약하다" }, { text: "후퇴한다" }, "협상한다"] : ["진격한다", "후퇴한다", "협상한다"], ending: last ? { epilogue: "한서린은 고향으로 돌아갔다." } : null };
}
function blockJson(p) {
  const chs = (/## 덧붙일 장 \(([\d, ]+)장\)/.exec(p) || [, ""])[1].split(",").map(x => +x.trim()).filter(Boolean);
  return { blocks: chs.map(n => ({ ch: n, heading: `${n}장에 겪은 일`, sections: [{ heading: "경과", level: 1, body: `${n}장에서 이 항목에 일이 생겼다.` }] })), infoboxPatch: [{ label: "상태", value: "변화함" }], summaryPatch: "", facts: [], relations: [], timeline: [], newEntities: [] };
}
function answer(kind, p) {
  if (kind === "storyBible") return { ...BASE, title: "녹둔도 연대기", era: "1586년", mainTitle: "한서린", protagonist: { summary: "녹둔도의 젊은 무관", want: "고향을 지키는 것", wound: "아버지를 잃음" },
    secrets: [{ truth: "한서린은 녹둔도 습격 때 성문을 연 장본인이다", cover: "습격의 유일한 생존자로 알려져 있다", reveal: 3 }],
    spine: ["발단", "전개", "위기", "절정", "결말"].map((beat, i) => ({ n: i + 1, beat, intent: `${beat} 의도` })), chapter1: { title: "녹둔도의 밤", era: "1586년", summary: "1장 줄거리.", incident: "녹둔도 습격", nextChoices: ["추격한다", "보고한다", "숨는다"] } };
  if (kind === "bible") return { ...BASE, title: "기본 세계", era: "1600년", mainTitle: "대문 항목" };
  if (kind === "page") { const t = (/## 작성할 문서: 「([^」]+)」/.exec(p) || [])[1]; return { ...pageJson(t), ...(ctl.pageOverride[t] || {}) }; }
  if (kind === "chapterPlan") return ctl.planBad ? { title: "불완전" } : planJson(p);
  if (kind === "chapterBlock") return blockJson(p);
  if (kind === "check") return { issues: ctl.checkIssues || [] };
  if (kind === "read") return { issues: ctl.readIssues || [] };
  if (kind === "choices") return { nextChoices: ["새 후보 하나", "새 후보 둘", "새 후보 셋"] };
  if (kind === "fix") return { edits: ctl.fixEdits || [], note: "어긋난 연도를 고쳤다." };
  if (kind === "analyze") return { facts: [], timeline: [], newEntities: [], relations: [], conflicts: ctl.analyzeConflicts || [] };
  if (kind === "tone") return TONE;
  return { ok: true };
}
async function route(r) {
  const body = JSON.parse(r.request().postData() || "{}");
  const prompt = body.contents?.[0]?.parts?.[0]?.text || "";
  const kind = kindOf(prompt), model = decodeURIComponent((/models\/([^:]+):/.exec(r.request().url()) || [])[1] || "");
  calls.push({ kind, prompt, model, think: body.generationConfig?.thinkingConfig?.thinkingLevel || "" });
  if (kind === "chapterPlan" && ctl.planDelay) await new Promise(res => setTimeout(res, ctl.planDelay));
  if ((kind === "check" || kind === "read") && ctl.checkDelay) await new Promise(res => setTimeout(res, ctl.checkDelay));
  if (kind === "read" && ctl.readFail) { try { await r.fulfill({ status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: { code: 400, message: "test failure" } }) }); } catch {} return; }
  const text = JSON.stringify(answer(kind, prompt));
  const sse = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } })}\n\n`;
  try { await r.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" }, body: sse }); } catch {}
}

/* ---------- 도우미 ---------- */
async function newPage(browser) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => { if (!localStorage.getItem("wwiki:gemini")) localStorage.setItem("wwiki:gemini", JSON.stringify({ mode: "key", key: "test-key" })); });
  await ctx.route("**/v1beta/models/**", route);
  const page = await ctx.newPage();
  page.on("pageerror", e => { console.error("페이지 오류:", e); process.exitCode = 1; });
  return { ctx, page };
}
const idbAll = page => page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open("worldwiki-gemini", 1);
  r.onsuccess = () => { const st = r.result.transaction("kv").objectStore("kv"); const k = st.getAllKeys(), v = st.getAll(); v.onsuccess = () => res(k.result.map((x, i) => [x, v.result[i]])); v.onerror = rej; };
  r.onerror = rej;
}));
const worldOf = async (page, title) => (await idbAll(page)).map(x => x[1]).find(v => v && v.kind === "world" && v.title === title);
const pageOf = async (page, w, title) => (await idbAll(page)).map(x => x[1]).find(v => v && v.title === title && v.key && !v.kind && v.sections && (v.key in w.entities));
const settle = page => page.waitForTimeout(700);
async function waitArticle(page, title) {
  await page.waitForFunction(t => { const h = document.querySelector("h1.t"); return h && h.textContent.trim().startsWith(t) && document.querySelector(".article h2"); }, title, { timeout: 15000 });
  await settle(page);
}
const clickLink = async (page, title) => { await page.locator(`a.wl[data-t="${title}"]`).first().click(); };
const sideText = page => page.locator("#side").innerText();
const SHOT = process.env.SHOT_DIR;   // 지정하면 주요 화면을 캡처한다
const shot = async (page, name) => { if (SHOT) await page.screenshot({ path: path.join(SHOT, name + ".png"), fullPage: true }); };
let step = 0; const ok = m => console.log(`  ✓ ${++step}. ${m}`);

(async () => {
  await new Promise(r => server.listen(0, r));
  const URL_ = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await newPage(browser);
    await page.goto(URL_);
    await page.waitForSelector("#seedTa");

    /* 0. 원안 주사위: 기본 모드는 비틀기, 스토리 모드는 한 줄 줄거리 */
    await page.click('[data-stab="dice"]');
    assert.deepStrictEqual(await page.locator(".die-l").allInnerTexts(), ["시대", "장르", "비틀기"]);
    assert((await page.inputValue("#seedTa")).includes("비틀기: "));
    await page.click('[data-lock="era"]'); const era0 = await page.inputValue('[data-die="era"]');
    await page.click('[data-mode="story"]');
    assert.deepStrictEqual(await page.locator(".die-l").allInnerTexts(), ["시대", "장르", "줄거리"], "스토리 모드 주사위는 줄거리");
    const ss = await page.inputValue("#seedTa");
    assert(ss.includes("줄거리: ") && !ss.includes("비틀기") && ss.includes("이 한 줄에서 출발해"), "원안도 줄거리 기준으로 바뀐다");
    await page.click('[data-act="roll"]'); assert.strictEqual(await page.inputValue('[data-die="era"]'), era0, "고정한 칸은 그대로");
    await page.fill('[data-die="plot"]', "말단 서기가 왕의 가짜 유언장을 손에 넣는다");
    assert.strictEqual(await page.getAttribute('[data-lock="plot"]', "aria-pressed"), "true", "직접 고친 칸은 자동으로 고정");
    assert((await page.inputValue("#seedTa")).includes("줄거리: 말단 서기가 왕의 가짜 유언장을 손에 넣는다"), "고쳐 쓰는 대로 원안이 바뀐다");
    await page.click('[data-act="roll"]');
    assert.strictEqual(await page.inputValue('[data-die="plot"]'), "말단 서기가 왕의 가짜 유언장을 손에 넣는다", "다시 굴려도 고친 칸은 그대로");
    await page.click('[data-mode="basic"]'); assert((await page.inputValue("#seedTa")).includes("비틀기: "));
    await page.click('[data-stab="own"]');
    ok("원안 주사위: 스토리 모드에서는 비틀기 대신 한 줄 줄거리를 굴리고, 칸을 직접 고쳐 쓰면 고정되어 원안에 반영된다");

    /* 1. 기본 모드 회귀 */
    await page.fill("#seedTa", "기본 모드 테스트 원안입니다. 아무 일도 없는 세계.");
    await page.click('[data-act="create"]');
    await waitArticle(page, "대문 항목");
    assert(!(await sideText(page)).includes("이야기"), "기본 모드 사이드바에 이야기 섹션이 없어야 한다");
    assert.strictEqual(await page.locator(".chb").count(), 0);
    let bw = await worldOf(page, "기본 세계");
    assert(bw && !bw.mode && !bw.story, "기본 모드 world에는 story 필드가 없어야 한다");
    await page.reload(); await page.waitForSelector(".wcard");
    await page.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(page, "대문 항목");
    const bp = calls.filter(c => c.kind === "page").pop().prompt;
    assert(!bp.includes("열린 질문") && bp.includes("해석이 엇갈린다, 평가가 갈린다, 논쟁을 낳고 있다는 식의 섹션"), "문서 프롬프트가 해석·논쟁 섹션을 막는다");
    assert(calls.filter(c => c.kind === "check").pop().prompt.includes("문체, 어투, 표현 방식은 지적하지 않는다"));
    { const ck = calls.filter(c => c.kind === "check").pop();
      assert.strictEqual(ck.model, "gemini-3.8-flash", "설정 검사는 (검사 모델을 비워 두면) 기본 모델로");
      assert.strictEqual(ck.think, "medium", "설정 검사의 생각 깊이 기본값은 medium");
      assert(ck.prompt.includes("글자 그대로 evidence에 옮길 수 있다") && ck.prompt.includes('"evidence"'), "근거 인용을 요구한다");
      assert.strictEqual(calls.filter(c => c.kind === "tone").every(c => c.model === "gemini-3.5-flash-lite"), true); }
    await page.click('#side [data-act="gset"]');
    await page.fill("#gCheck", "gemini-test-pro"); await page.selectOption("#gCheckT", "high"); await page.click('[data-act="gset-save"]');
    await page.click('#side [data-act="home"]'); await page.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(page, "대문 항목");
    ctl.checkIssues = [{ claim: "근거 있는 지적", evidence: "확정된 규칙 문장", conflict: "동시에 참일 수 없다", severity: "high" }, { claim: "근거 없는 지적", severity: "high" }];
    await page.click('[data-check]'); await page.waitForSelector("details.memo", { timeout: 15000 }); ctl.checkIssues = null;
    { const ck = calls.filter(c => c.kind === "check").pop(); assert.strictEqual(ck.model, "gemini-test-pro"); assert.strictEqual(ck.think, "high", "설정에서 고른 검사 모델과 생각 깊이를 쓴다"); }
    const memo = await page.locator("details.memo").innerText();
    assert(memo.includes("근거 있는 지적") && memo.includes("근거: 확정된 규칙 문장") && !memo.includes("근거 없는 지적"), "근거를 대지 못한 지적은 버린다");
    await page.click('#side [data-act="gset"]'); await page.fill("#gCheck", ""); await page.selectOption("#gCheckT", "medium"); await page.click('[data-act="gset-save"]');
    await page.click('#side [data-act="home"]');
    assert(bp.includes("기준 시점에 1학년(신입생)인 인물은 그 전 해들에는 아직 입학 전"), "문서 프롬프트에 학년·연도 역산 규칙");
    assert(bp.includes("인물의 속마음, 생각, 느낌은 위키 작성자가 알 수 있는 방식으로만 쓴다"), "속마음은 증언·기록·행동으로 (기본 모드도)");
    assert(bp.includes("새 인물은 이 항목의 이야기에 꼭 필요할 때만 많아야 1명") && !bp.includes("인물을 2명 이상") && !bp.includes("사랑한 사람과 그 결말"), "문서마다 새 인물을 강요하지 않고, 연인·가족을 지어내지 않는다");
    assert(bp.includes("## 절제 (아래 모든 규칙에 먼저 적용한다)") && bp.includes("개요의 첫 문장은 이 항목이 무엇인지 밝히는 정의") && bp.includes("핵심 숫자 3~5개만") && bp.includes("한자어 압축 명사구") && bp.includes("상투적 감각 표현") && bp.includes("예고편 대사처럼") && !bp.includes("수치의 대비"), "과장·숫자·클리셰를 누르는 절제 규칙");
    assert(bp.includes("전칭·극단 표현은 정말 예외가 없을 때만") && bp.includes("최대치 결말로 맺지 않는다") && bp.includes("좋은 예(그 자리의 말)") && bp.includes("숫자를 줄인다고 구체성까지 줄이지 않는다"), "전칭 표현, 결말, 인용 예시, 구체성 규칙");
    assert(calls.filter(c => c.kind === "read").pop().prompt.includes("연도·나이·학년·기수·재직 기간이 서로 맞지 않는 곳(예: 기준 시점에 1학년인"), "설정 검사가 문서 안의 연도 모순도 잡는다");
    ok("기본 모드 세계관 생성, 문서 작성, 새로고침 후 복원이 그대로 된다");

    /* 2. 스토리 모드 생성 */
    await page.click('[data-act="home"]'); await page.waitForSelector("#seedTa");
    await page.click('[data-mode="story"]');
    assert((await page.locator('label[for="firstIn"]').innerText()).includes("주인공"));
    await page.fill("#seedTa", "녹둔도를 지키는 무관들의 이야기. 여진 해적과 싸운다.");
    await page.fill("#firstIn", "한서린");
    await page.fill("#protoDesc", "활은 잘 쏘지만 겁이 많은 막내 무관");
    await page.click('[data-act="cast-add"]'); await page.fill('[data-cast="0"][data-cf="name"]', "윤가람");
    await page.fill('[data-cast="0"][data-cf="rel"]', "소꿉친구이자 맞수"); await page.fill('[data-cast="0"][data-cf="desc"]', "북관 출신 궁수");
    await page.click('[data-act="cast-add"]'); await page.fill('[data-cast="1"][data-cf="name"]', "지울 사람"); await page.click('[data-cast-del="1"]');
    assert.strictEqual(await page.locator('[data-cf="name"]').count(), 1, "등장인물 빼기");
    await shot(page, "1-home-story");
    await page.click('[data-act="create"]');
    await waitArticle(page, "한서린");
    assert((await page.locator(".article .notice").innerText()).includes("진행 중인 사건"), "주인공 문서에 진행 중 안내 틀");
    assert((await sideText(page)).includes("녹둔도의 밤"));
    const pagePrompt = calls.filter(c => c.kind === "page").pop().prompt;
    assert(pagePrompt.includes("'1장', '2장', '장', '이야기', '주인공' 같은 이야기 바깥의 구분은 본문에 쓰지 않는다"), "스토리 문서에 장 표기를 쓰지 말라는 규칙");
    assert(pagePrompt.includes("이야기 진행 상황") && pagePrompt.includes("녹둔도 습격") && !pagePrompt.includes("결말 의도"), "주인공 문서 프롬프트: 발단 사건 포함, 뼈대 미포함");
    const sb = calls.find(c => c.kind === "storyBible").prompt;
    assert(sb.includes("활은 잘 쏘지만 겁이 많은 막내 무관") && sb.includes("- 윤가람 — 특징: 북관 출신 궁수 — 주인공과의 관계: 소꿉친구이자 맞수") && !sb.includes("지울 사람"), "주인공 특징과 등장인물이 세계관 생성에 들어간다");
    assert(pagePrompt.includes("사용자가 정한 주인공의 특징(반드시 지킨다): 활은 잘 쏘지만") && pagePrompt.includes("사용자가 정한 등장인물(윤가람)"));
    { const w0 = await worldOf(page, "녹둔도 연대기"), gk = Object.keys(w0.entities).find(k => w0.entities[k].title === "윤가람");
      assert(gk && w0.entities[gk].type === "인물" && w0.entities[gk].facts.some(f => f.src === "user" && f.t === "북관 출신 궁수"), "등장인물이 사용자 확정 사실과 함께 항목으로 생긴다");
      assert(w0.relations.some(r => r.src === "user" && r.rel === "소꿉친구이자 맞수" && [r.a, r.b].includes(gk)), "주인공과의 관계가 확정 관계로 들어간다");
      assert(w0.story.cast[0].key === gk && w0.story.protagonist.desc); }
    assert.strictEqual(await page.inputValue("#protoDesc").catch(() => ""), "", "만든 뒤 입력란은 비운다");
    { const sel = await page.evaluate(() => { const a = document.querySelector('.article a.wl.new'); const p = a.closest("p"); const r = document.createRange(); r.selectNodeContents(p); const g = getSelection(); g.removeAllRanges(); g.addRange(r); const t = g.toString(); g.removeAllRanges(); return { t, red: a.textContent }; });
      assert(sel.t.includes(sel.red), "드래그로 긁으면 빨간 링크 글자도 함께 선택된다");
      const lp = await page.evaluate(() => { const a = document.querySelector('.article a.wl.new'); const o = { bubbles: true, pointerType: "touch", clientX: 1, clientY: 1 };
        a.dispatchEvent(new PointerEvent("pointerdown", o)); const during = getComputedStyle(a).userSelect; document.dispatchEvent(new PointerEvent("pointercancel", o)); return { during, after: getComputedStyle(a).userSelect }; });
      assert.strictEqual(lp.during, "none", "길게 누르는 동안에는 선택을 막는다"); assert.notStrictEqual(lp.after, "none", "손을 떼면 다시 선택된다"); }
    ok("스토리 모드: 첫 문서가 주인공 문서이고 1장 발단 사건과 진행 중 안내 틀이 나온다. 주인공 특징과 등장인물이 확정 설정으로 들어간다");

    /* 3. 탐험 기록 */
    await clickLink(page, "북관 철령"); await waitArticle(page, "북관 철령");      // 새로 작성
    await page.click('#side [data-k]:has-text("주인공 문서")'); await waitArticle(page, "한서린");   // 주인공 문서는 세지 않음
    await clickLink(page, "이일"); await waitArticle(page, "이일");                // 새로 작성
    await clickLink(page, "한서린"); await waitArticle(page, "한서린");
    await clickLink(page, "북관 철령"); await waitArticle(page, "북관 철령");      // 열람
    await page.fill("#q", "여진 해적단"); await page.press("#q", "Enter"); await waitArticle(page, "여진 해적단");   // 검색으로 만듦
    await page.click('#side [data-k]:has-text("주인공 문서")'); await waitArticle(page, "한서린");
    await clickLink(page, "이일"); await waitArticle(page, "이일");
    await page.click('[data-edit]'); await page.waitForSelector("#edBody");
    await page.fill("#edBody", (await page.inputValue("#edBody")) + "\n\n= 덧붙임 =\n사용자가 덧붙인 문단이다.");
    await page.click("#edSave"); await waitArticle(page, "이일");
    assert((await sideText(page)).includes("이번 장 탐험 3곳"), "탐험 3곳: " + await sideText(page));
    { const pp = calls.filter(c => c.kind === "page" && c.prompt.includes("## 작성할 문서: 「여진 해적단」")).pop().prompt;
      assert(pp.includes("인물이 맡은 역할, 살아온 경험, 주변 사람과의 관계에서 자연스럽게 드러나게 한다") && !pp.includes("## 이 인물의 기본 기질"), "고정 기질 없이 역할·경험·관계에서 성격을 정한다");
      const protagonistPrompt = calls.filter(c => c.kind === "page" && c.prompt.includes("## 작성할 문서: 「한서린」")).shift().prompt;
      assert(protagonistPrompt.includes("사용자가 정한 특징과 이미 확정된 설정을 우선한다") && protagonistPrompt.includes("활은 잘 쏘지만 겁이 많은 막내 무관"), "주인공의 지정 특징을 우선한다");
      assert(pp.includes("서로 다른 인물의 성격이나 성향이 겹쳐도 된다") && pp.includes("특징은 기벽이나 집착이 아니어도 된다") && pp.includes("차별화하려고 억지 기벽이나 집착을 붙이지 않는다"), "성격 중복을 허용하고 억지 기벽을 막는다");
      assert(pp.includes("## 다른 인물의 특징 (표현 반복 참고)") && pp.includes("- 이일: 아날로그 무전기 집착") && pp.includes("같은 문구와 일화를 기계적으로 되풀이하거나") && !pp.includes("겹치지 않는") && !pp.includes("같은 소재나 같은 버릇을 쓰지 않고"), "기존 특징은 표현 반복 참고로만 넘긴다"); }
    await page.waitForTimeout(1300);
    await page.reload(); await page.waitForSelector(".wcard");
    await page.click('.wcard button.open:has-text("녹둔도 연대기")'); await waitArticle(page, "한서린");
    assert((await sideText(page)).includes("이번 장 탐험 3곳"), "새로고침 후에도 탐험 기록 유지");
    let sw = await worldOf(page, "녹둔도 연대기");
    const x1 = sw.story.chapters[0].explore, kOf = t => Object.keys(sw.entities).find(k => sw.entities[k].title === t);
    assert(x1.created.includes(kOf("북관 철령")) && x1.searched.includes(kOf("여진 해적단")) && x1.edited.includes(kOf("이일")) && x1.opened[kOf("북관 철령")] >= 1);
    assert(!x1.created.includes(sw.story.protagonistKey) && !x1.opened[sw.story.protagonistKey], "주인공 문서는 기록하지 않는다");
    ok("문서를 열고, 만들고, 검색하고, 고치면 이번 장 탐험이 늘고 새로고침 후에도 유지된다");

    /* 4. 장 전환 */
    const before = await pageOf(page, sw, "한서린");
    await page.click('[data-act="story-next"]'); await page.waitForSelector('input[name="advPick"]');
    assert(await page.locator('[data-act="story-go"]').isDisabled(), "선택 전에는 진행 버튼이 꺼져 있다");
    await page.check('input[name="advPick"][value="0"]'); await shot(page, "2-advance");
    await page.click('[data-act="story-go"]');
    await page.waitForSelector(".stcard", { timeout: 15000 }); await settle(page);
    await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "3-chapter-card");
    await page.setViewportSize({ width: 390, height: 844 }); await shot(page, "4-mobile-card"); await page.setViewportSize({ width: 1280, height: 720 });
    const planPrompt = calls.filter(c => c.kind === "chapterPlan").pop().prompt;
    { const pp1 = calls.filter(c => c.kind === "page" && c.prompt.includes("## 작성할 문서: 「한서린」")).shift().prompt;
      assert(pp1.includes("## 아직 드러나지 않은 진실 (쓰지 말 것)") && pp1.includes("진실(쓰지 않는다): 한서린은 녹둔도 습격 때 성문을 연 장본인이다") && pp1.includes("이 시점에 알려진 것(이것만 쓴다): 습격의 유일한 생존자"), "1장 문서에는 진실을 쓰지 말라고 하고 겉모습만 쓰게 한다");
      const ck1 = calls.filter(c => c.kind === "check" && c.prompt.includes("# 한서린")).shift().prompt;
      assert(ck1.includes("문서가 위 '진실'을 사실로 단정하거나"), "설정 검사가 진실을 흘린 서술을 잡는다");
      assert(planPrompt.includes("## 숨겨진 진실 (독자에게 공개하지 않는다)") && planPrompt.includes("2장에서 드러나야 하는 진실: (없음)"), "2장 계획은 진실을 드러내지 않는다"); }
    assert(planPrompt.includes("「이일」") && planPrompt.includes("「여진 해적단」") && planPrompt.includes("「북관 철령」") && planPrompt.includes("추격한다"), "장 계획 프롬프트에 탐험과 선택이 들어간다");
    assert(planPrompt.includes("발단 의도") && planPrompt.includes("결말 의도"), "장 계획 프롬프트에는 뼈대 전체가 들어간다");
    assert(planPrompt.includes("## 사용자가 정한 등장인물") && planPrompt.includes("윤가람") && planPrompt.includes("사용자가 정한 특징 (최우선 제약): 활은"), "장 계획에도 주인공 특징과 등장인물이 들어간다");
    assert((await page.locator(".chb").allInnerTexts()).includes("2장"));
    const wove = await page.locator(".stcard").innerText();
    assert(!wove.includes("2장 줄거리") && !wove.includes("이일이 파직되었다"), "새 장 줄거리와 변화 내용은 카드에 보이지 않는다(스포일러)");
    assert(wove.includes("지난 이야기") && wove.includes("1장 줄거리."), "카드에는 지난 장 줄거리가 보인다");
    assert(wove.includes("이일") && wove.includes("여진 해적단"), "반영된 탐험 2곳 이상");
    sw = await worldOf(page, "녹둔도 연대기");
    const after = await pageOf(page, sw, "한서린");
    assert.strictEqual(sw.story.chapter, 2); assert.strictEqual(sw.era, "1588년");
    assert.deepStrictEqual(after.sections.filter(s => !s.ch), before.sections, "기존 본문은 한 글자도 바뀌지 않는다");
    assert(after.sections.some(s => s.ch === 2) && after.infobox.find(r => r.label === "상태").value === "2장 상태");
    assert(sw.entities[kOf("원균 함대")] && sw.entities[kOf("이일")].facts.some(f => f.src === "ch2"), "affected 변화가 사실로 미리 들어간다");
    assert(sw.story.spine[3].revised && sw.story.spine[3].orig === "절정 의도");
    assert.strictEqual(sw.story.chapters[1].title, "2번째 사건", "장 제목에서 '제2장:'을 뗀다");
    assert(after.sections.some(s => s.ch === 2 && s.heading === "사건명"), "장 섹션 제목에서 '2장'을 뗀다");
    assert(!Object.values(sw.entities).some(o => /\((인물|조직)\)$/.test(o.title)), "모델이 '이일(인물)'처럼 써도 중복 항목을 만들지 않는다");
    assert(after.sections.some(s => s.body.includes("[[이일]]")) && await page.locator('.article a.wl[data-t="이일"]:not(.new)').count() > 0, "유형이 붙은 링크는 원래 문서로 이어진다");
    assert(sw.story.chapters[1].affected.some(a => a.key === kOf("이일")) && sw.story.chapters[1].wove.some(a => a.key === kOf("여진 해적단")));
    assert(planPrompt.includes("새 항목: 이번 장에서 처음 등장하는 항목을 2~4개 만든다") && planPrompt.includes("새 인물은 이번 장 사건에 꼭 필요할 때만 1명까지") && !planPrompt.includes("새 인물을 1명 이상"), "새 항목은 만들되 새 인물은 필요할 때만");
    assert(planPrompt.includes("- 절제: 규칙은 방향이지 최대치가 아니다") && planPrompt.includes("과장 수식어("), "장 계획에도 절제 규칙");
    assert(planPrompt.includes("다른 인물의 특징 (표현 반복 참고):\n  - 이일: 아날로그 무전기 집착"), "장 계획에도 기존 인물 특징을 표현 반복 참고로 넘긴다");
    assert(planPrompt.includes("summary)에 이번 사건에서 맡은 역할과 처지를 담는다") && planPrompt.includes("서로 다른 인물의 성격이나 성향이 겹쳐도 된다"), "장 계획도 역할과 처지로 인물을 소개하고 성격 중복을 허용한다");
    assert(!planPrompt.includes("새 인물의 기질은 다음 후보에서 고른다:") && planPrompt.includes("인물이 맡은 역할, 살아온 경험, 주변 사람과의 관계에서 자연스럽게 드러나게 한다") && planPrompt.includes("차별화하려고 억지 기벽이나 집착을 붙이지 않는다"), "장 계획도 고정 기질 없이 성격을 드러내고 억지 기벽을 막는다");
    assert(wove.includes("이번 장에 새로 등장") && /이번 장에 새로 등장\s*원균 함대/.test(wove), "안내 카드에 새로 등장한 항목");
    assert(sw.story.chapters[1].fresh.includes(kOf("원균 함대")));
    assert((await sideText(page)).includes("새로 등장 2곳 · 안 읽음 2"), "사이드바에 새로 등장한 항목");
    ok("다음 장으로 → 선택 → 주인공 문서에 2장 블록이 붙고, 기존 본문은 그대로이며, 탐험이 반영된다");

    await page.locator('#side button[data-k]', { hasText: "원균 함대" }).click(); await waitArticle(page, "원균 함대");
    assert((await sideText(page)).includes("새로 등장 2곳 · 안 읽음 1") && (await sideText(page)).includes("이번 장 탐험 1곳"), "새 항목을 읽으면 탐험으로 센다");
    await page.click('#side [data-k]:has-text("주인공 문서")'); await waitArticle(page, "한서린");
    ok("장마다 새로 등장한 항목이 사이드바에 보이고, 읽으면 이번 장 탐험으로 센다");

    /* 5. 지연 갱신 */
    let nb = count("chapterBlock");
    ctl.checkIssues = [{ claim: "2장에서 이 항목에 일이 생겼다.", evidence: "규칙 하나", conflict: "x", severity: "high" }];
    ctl.fixEdits = [{ memo: 1, field: "body", old: "2장에서 이 항목에 일이 생겼다.", new: "2장에서 이 항목에 변화가 생겼다." }];
    const nf5 = count("fix"); ctl.checkDelay = 1200;
    await page.locator('.stcard a.wl[data-t="북관 철령"]').click();
    await page.waitForFunction(() => /반영한 장 섹션을 설정과 맞춰 보는 중/.test(document.querySelector("#main")?.textContent || ""), null, { timeout: 15000 });
    { const t = await page.locator(".article").innerText();
      assert(!t.includes("2장에서 이 항목에") && !(await page.locator(".chb").allInnerTexts()).includes("2장"), "검사와 고치기가 끝나기 전에는 새 장 섹션을 보여 주지 않는다(이전 버전)");
      assert((await page.locator("#main").innerText()).includes("지금은 이전 버전입니다"), "이전 버전이라고 알린다"); }
    await page.waitForFunction(() => [...document.querySelectorAll(".chb")].some(e => e.textContent === "2장"), null, { timeout: 15000 }); await settle(page);
    ctl.checkIssues = null; ctl.fixEdits = null; ctl.checkDelay = 0;
    assert.strictEqual(count("chapterBlock"), nb + 1, "affected 문서를 열면 장 섹션을 한 번 생성");
    assert.strictEqual(count("fix"), nf5 + 1, "장 섹션을 붙인 뒤 보여 주기 전에 검사하고 고친다");
    assert((await page.locator(".article").innerText()).includes("2장에서 이 항목에 변화가 생겼다."), "고친 장 섹션으로 보여 준다");
    nb = count("chapterBlock");
    await page.fill("#q", "여진 해적단"); await page.press("#q", "Enter"); await waitArticle(page, "여진 해적단");
    await settle(page);
    assert.strictEqual(count("chapterBlock"), nb, "affected가 아닌 문서는 AI 호출 없이 열린다");
    ok("affected 문서는 열 때 장 섹션이 생기고, 아닌 문서는 호출 없이 열린다");

    /* 6. 롤백: 중단과 실패 */
    await page.click('[data-act="story-next"]'); await page.waitForSelector('input[name="advPick"]');
    assert.deepStrictEqual((await page.locator(".fx-pick span").allInnerTexts()).slice(0, 3), ["진격한다", "후퇴한다", "협상한다"], "선택지가 묶음으로 와도 글로 보인다");
    await page.click('[data-act="story-back"]');
    const snap = JSON.stringify(await worldOf(page, "녹둔도 연대기")), psnap = JSON.stringify(await pageOf(page, sw, "한서린"));
    ctl.planDelay = 4000;
    await page.click('[data-act="story-next"]'); await page.click('[data-act="story-skip"]');
    await page.waitForSelector('[data-act="story-stop"]'); await page.click('[data-act="story-stop"]');
    await page.waitForSelector('input[name="advPick"]'); ctl.planDelay = 0;
    await page.waitForTimeout(300);
    ctl.planBad = true;
    await page.click('[data-act="story-skip"]');
    await page.waitForSelector(".banner.warn"); ctl.planBad = false;
    const w2 = await worldOf(page, "녹둔도 연대기");
    delete w2.updatedAt; const s2 = JSON.parse(snap); delete s2.updatedAt;
    assert.deepStrictEqual(w2, s2, "중단·실패 후 world 그대로");
    assert.strictEqual(JSON.stringify(await pageOf(page, sw, "한서린")), psnap, "주인공 문서 그대로");
    assert((await sideText(page)).includes("2장"));
    ok("장 전환 중 중단하거나 실패하면 world와 주인공 문서가 전환 전 그대로다");

    /* 7. 두 장을 건너뛴 문서: 한 번의 호출로 두 블록 */
    await page.click('[data-act="story-skip"]'); await page.waitForSelector(".stcard", { timeout: 15000 }); await settle(page);   // 3장 (이일 affected)
    nb = count("chapterBlock");
    await page.fill("#q", "이일"); await page.press("#q", "Enter");
    await page.waitForFunction(() => [...document.querySelectorAll(".chb")].some(e => e.textContent === "3장"), null, { timeout: 15000 }); await settle(page);
    assert.strictEqual(count("chapterBlock"), nb + 1, "한 번만 호출");
    assert(calls.filter(c => c.kind === "chapterBlock").pop().prompt.includes("## 덧붙일 장 (2, 3장)"));
    const chs = await page.locator(".article h2 .chb").allInnerTexts();
    assert(chs.includes("2장") && chs.includes("3장"), "2장, 3장 블록 모두 생성");
    { const p3 = calls.filter(c => c.kind === "chapterPlan" && c.prompt.includes("다음 장(3장)")).pop().prompt;
      assert(p3.includes("3장에서 드러나야 하는 진실: 한서린은 녹둔도 습격 때 성문을 연 장본인이다"), "드러날 장의 계획에서 진실을 밝히게 한다");
      const w9 = await worldOf(page, "녹둔도 연대기");
      assert(w9.story.secrets[0].revealed === true && w9.story.secrets[0].revealedAt === 3, "드러난 진실은 확정으로 표시");
      const bk9 = calls.filter(c => c.kind === "chapterBlock").pop().prompt;
      assert(bk9.includes("## 이미 드러난 진실 (확정된 사실)") && !bk9.includes("## 아직 드러나지 않은 진실"), "드러난 뒤에는 확정 사실로 넘긴다"); }
    ok("두 장을 건너뛰고 연 문서는 한 번의 호출로 두 장의 블록이 생성된다. 숨겨진 진실은 정한 장에서 드러난 뒤 확정 설정이 된다");

    /* 8. 편집기: 장 섹션 표시 유지 */
    await page.click('[data-edit]'); await page.waitForSelector("#edBody");
    assert((await page.inputValue("#edBody")).includes("= [2장] 2장에 겪은 일 ="));
    await page.click('[data-act="ed-save"]'); await waitArticle(page, "이일");
    assert((await page.locator(".article h2 .chb").allInnerTexts()).includes("3장"), "편집 저장 후에도 장 섹션 유지");
    ok("편집기에서 장 섹션이 [n장] 표시로 보이고, 저장 후에도 장 섹션으로 남는다");

    /* 9. 결말 */
    for (const n of [4, 5]) {
      await page.click('[data-act="story-next"]'); await page.click('[data-act="story-skip"]');
      await page.waitForSelector(".stcard", { timeout: 15000 }); await settle(page);
    }
    assert.strictEqual((await page.locator("h1.t").innerText()).trim(), "한서린", "마지막 장도 주인공 문서부터 보여 준다");
    { const plans = calls.filter(c => c.kind === "chapterPlan").map(c => c.prompt), byN = n => plans.filter(x => x.includes(`다음 장(${n}장)`)).pop();
      assert(byN(3).includes("처음 등장하는 항목을 2~4개 만든다") && byN(3).includes("직전 장에 새 인물이 나왔으므로 이번 장에는 새 인물을 만들지 않는다"), "새 인물은 간간이: 직전 장에 나왔으면 이번 장은 쉰다");
      assert(byN(4).includes("이번 장은 절정이다. 새 인물은 만들지 않는다") && !byN(4).includes("2~4개 만든다"), "절정에는 새 인물을 만들지 않는다");
      assert(byN(5).includes("이번 장은 결말이다. 새 인물이나 새 항목을 만들지 않는다"), "결말에는 새 항목을 만들지 않는다"); }
    assert((await page.locator(".article h2 .chb").allInnerTexts()).includes("5장"));
    assert.strictEqual(await page.locator('.stcard [data-act="epilogue"]').count(), 1, "안내 카드 위에 '에필로그로' 버튼");
    await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "6-final-chapter");
    await page.click('.stcard [data-act="epilogue"]');
    await page.waitForFunction(() => document.querySelector("h1.t")?.textContent === "에필로그", null, { timeout: 15000 });
    assert((await page.locator("#main").innerText()).includes("한서린은 고향으로 돌아갔다."));
    assert((await page.locator("#main").textContent()).includes("숨겨진 진실") && (await page.locator("#main").textContent()).includes("3장에서 드러남"), "에필로그에서 숨겨진 진실을 공개");
    await page.locator("details.memo summary").first().click(); await shot(page, "5-epilogue");
    assert((await sideText(page)).includes("에필로그 보기") && !(await sideText(page)).includes("다음 장으로"));
    await page.click('#side [data-k]:has-text("주인공 문서")'); await waitArticle(page, "한서린");
    assert.strictEqual(await page.locator(".article .notice").count(), 0, "결말 후 진행 중 안내가 사라진다");
    await page.fill("#q", "녹둔도 객사"); await page.press("#q", "Enter"); await waitArticle(page, "녹둔도 객사");
    assert(calls.filter(c => c.kind === "page").pop().prompt.includes("이야기는 5장에서 끝났다"), "결말 이후 시점으로 쓴다");
    sw = await worldOf(page, "녹둔도 연대기");
    assert.strictEqual(sw.story.status, "ended"); assert.strictEqual(sw.story.chapters.length, 5);
    ok("5장 완료 후 주인공 문서의 5장 섹션이 먼저 뜨고 '에필로그로'를 눌러야 에필로그가 뜨며, 새 문서는 결말 이후 시점으로 쓰이며 진행 중 안내가 사라진다");

    /* 10. 백업 내보내기 → 다른 브라우저에서 가져오기 */
    await page.click('[data-act="gset"]');
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
    const file = path.join(os.tmpdir(), "ww-story-backup.json"); await dl.saveAs(file);
    const other = await newPage(browser);
    await other.page.goto(URL_); await other.page.waitForSelector("#seedTa");
    await other.page.click('[data-act="gset"]');
    await other.page.setInputFiles("#importFile", file);
    await other.page.waitForSelector('[data-act="home"]'); await other.page.click('#side [data-act="home"]');
    await other.page.click('.wcard button.open:has-text("녹둔도 연대기")'); await waitArticle(other.page, "한서린");
    assert((await sideText(other.page)).includes("완결") && (await other.page.locator(".article h2 .chb").allInnerTexts()).includes("5장"));
    const ow = await worldOf(other.page, "녹둔도 연대기");
    assert.deepStrictEqual(ow.story, sw.story, "스토리 진행 상태가 그대로 복원된다");
    ok("백업을 다른 브라우저에서 가져오면 장, 탐험 기록, 블록이 그대로 복원된다");
    await other.ctx.close();

    /* 10-1. 이미 생긴 "이름(유형)" 중복 항목은 세계관을 열 때 원래 항목에 합친다 */
    const bk = JSON.parse(fs.readFileSync(file, "utf8"));
    const bwld = bk.worlds.find(x => x.title === "녹둔도 연대기"), bps = bk.pages[bwld.id];
    const keyByTitle = t => Object.keys(bwld.entities).find(k => bwld.entities[k].title === t);
    const pk2 = keyByTitle("북관 철령"), hk = keyByTitle("한양");
    const dupA = "edupA", dupB = "edupB";   // 키 값 자체는 아무래도 된다(제목으로 판별)
    bwld.entities[dupA] = { ...JSON.parse(JSON.stringify(bwld.entities[pk2])), title: "북관 철령(지명)", facts: [{ t: "중복 사실", src: bwld.story.protagonistKey }], mentions: [] };
    bps[dupA] = { ...JSON.parse(JSON.stringify(bps[pk2])), key: dupA, title: "북관 철령(지명)" };
    bwld.entities[dupB] = { title: "한양(지명)", type: "지명", summary: "수도", facts: [], mentions: [], page: true, box: "" };
    bps[dupB] = { ...JSON.parse(JSON.stringify(bps[pk2])), key: dupB, title: "한양(지명)", summary: "한양 문서" };
    bps[bwld.story.protagonistKey].sections[0].body += " [[북관 철령(지명)]]와 [[한양(지명)]]도 있다.";
    bwld.story.chapters[0].title = "제1장: 녹둔도의 밤";
    bps[bwld.story.protagonistKey].sections.find(x => x.ch === 2).heading = "2장 — 옛 제목";
    assert(!bps[hk], "테스트 전제: 한양은 아직 문서가 없다");
    fs.writeFileSync(file, JSON.stringify(bk));
    const third = await newPage(browser);
    await third.page.goto(URL_); await third.page.waitForSelector("#seedTa");
    await third.page.click('[data-act="gset"]'); await third.page.setInputFiles("#importFile", file);
    await third.page.waitForTimeout(500); await third.page.click('#side [data-act="home"]');
    await third.page.click('.wcard button.open:has-text("녹둔도 연대기")'); await waitArticle(third.page, "한서린");
    const tw = await worldOf(third.page, "녹둔도 연대기"), all = (await idbAll(third.page)).map(x => x[0]);
    assert(!Object.values(tw.entities).some(o => /\(지명\)$/.test(o.title)), "중복 항목이 사라진다");
    assert(!all.some(k => k.endsWith(":" + dupA) || k.endsWith(":" + dupB)), "중복 문서가 저장소에서 지워진다");
    assert(all.some(k => k.endsWith(":" + hk)) && tw.entities[hk].page, "원래 항목에 문서가 없으면 중복 문서를 그쪽으로 옮긴다");
    assert(tw.entities[pk2].facts.some(f => f.t === "중복 사실"), "중복 항목의 확정 사실은 원래 항목으로 옮긴다");
    const body = (await pageOf(third.page, tw, "한서린")).sections[0].body;
    assert(body.includes("[[북관 철령]]") && body.includes("[[한양]]") && !body.includes("(지명)]]"), "본문 링크를 원래 이름으로 고친다");
    assert.strictEqual(await third.page.locator('.article a.wl.new[data-t="한양"]').count(), 0, "옮긴 문서는 파란 링크로 보인다");
    assert.strictEqual(tw.story.chapters[0].title, "녹둔도의 밤", "저장된 장 제목의 장 번호도 정리한다");
    assert((await pageOf(third.page, tw, "한서린")).sections.some(x => x.ch === 2 && x.heading === "옛 제목"), "저장된 장 섹션 제목도 정리한다");
    ok("이미 생긴 '이름(유형)' 중복 항목과 문서는 세계관을 열 때 원래 항목에 합쳐진다");
    await third.ctx.close();

    /* 11. 기본 모드 세계관은 끝까지 그대로 */
    bw = await worldOf(page, "기본 세계");
    assert(bw && !bw.story);
    ok("기본 모드 세계관에는 스토리 필드가 생기지 않는다");

    /* 13. 성만 쓴 이름("벡")과 전체 이름("마커스 벡") */
    await page.click('[data-act="home"]'); await page.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(page, "대문 항목");
    await page.fill("#q", "마커스 벡"); await page.press("#q", "Enter"); await waitArticle(page, "마커스 벡");
    await page.fill("#q", "칼 슈미트"); await page.press("#q", "Enter"); await waitArticle(page, "칼 슈미트");
    bw = await worldOf(page, "기본 세계");
    assert(!Object.values(bw.entities).some(o => o.title === "벡"), "새 링크 [[벡]]은 새 항목을 만들지 않는다");
    assert.strictEqual(await page.locator('.article a.wl[data-t="마커스 벡"]:not(.new)').innerText(), "벡", "[[벡]]은 '벡'으로 보이고 마커스 벡 문서로 이어진다");
    ok("새로 건 [[벡]] 링크는 이미 있는 「마커스 벡」 문서로 이어진다");
    await page.click('[data-act="gset"]');
    const [dl2] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
    const file2 = path.join(os.tmpdir(), "ww-name-backup.json"); await dl2.saveAs(file2);
    const bk2 = JSON.parse(fs.readFileSync(file2, "utf8")), bw2 = bk2.worlds.find(x => x.title === "기본 세계"), bp2 = bk2.pages[bw2.id];
    const kt = t => Object.keys(bw2.entities).find(k => bw2.entities[k].title === t);
    const mk = kt("마커스 벡"), ck = kt("칼 슈미트");
    bw2.entities.ebeck = { title: "벡", type: "인물", summary: "벡", facts: [{ t: "벡은 함장이다.", src: ck }], mentions: [], page: true, box: "" };
    bp2.ebeck = { ...JSON.parse(JSON.stringify(bp2[mk])), key: "ebeck", title: "벡" };
    bw2.entities.emarcus = { title: "마커스", type: "", summary: "", facts: [], mentions: [{ from: ck, text: "마커스가 나타났다." }], page: false, box: "" };
    bp2[ck].sections[0].body += " [[마커스]]와 [[벡]]이 함께 있었다.";
    fs.writeFileSync(file2, JSON.stringify(bk2));
    const fourth = await newPage(browser), q = fourth.page;
    await q.goto(URL_); await q.waitForSelector("#seedTa");
    await q.click('[data-act="gset"]'); await q.setInputFiles("#importFile", file2);
    await q.waitForTimeout(500); await q.click('#side [data-act="home"]');
    await q.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(q, "대문 항목");
    let fw = await worldOf(q, "기본 세계");
    assert(!Object.values(fw.entities).some(o => o.title === "마커스") && fw.entities[mk].mentions.some(m => m.text === "마커스가 나타났다."), "문서 없는 '마커스'는 자동으로 「마커스 벡」에 합친다");
    assert(fw.entities.ebeck, "둘 다 문서가 있으면 자동으로 합치지 않는다");
    await q.fill("#q", "벡"); await q.press("#q", "Enter"); await waitArticle(q, "벡");
    assert((await q.locator("#main").innerText()).includes("「마커스 벡」과(와) 같은 대상인가요?"));
    await q.click('[data-mgdo]'); await waitArticle(q, "마커스 벡");
    fw = await worldOf(q, "기본 세계"); const keys = (await idbAll(q)).map(x => x[0]);
    assert(!fw.entities.ebeck && fw.aliases.ebeck === mk && !keys.some(k => k.endsWith(":ebeck")), "합치면 「벡」 문서가 지워지고 넘겨주기가 남는다");
    assert(fw.entities[mk].facts.some(f => f.t === "벡은 함장이다."), "다른 문서가 확정한 사실은 옮겨진다");
    await q.fill("#q", "벡"); await q.press("#q", "Enter"); await waitArticle(q, "마커스 벡");
    const cb = (await pageOf(q, fw, "칼 슈미트")).sections[0].body;
    assert(cb.includes("[[마커스 벡|마커스]]") && cb.includes("[[마커스 벡|벡]]"), "본문 링크가 「마커스 벡」으로 바뀌고 보이는 이름은 그대로");
    ok("성이나 이름만 쓴 항목: 문서가 없으면 자동으로, 둘 다 문서가 있으면 안내를 눌러 합치고, 이후 「벡」은 「마커스 벡」으로 넘어간다");
    await q.fill("#q", "칼 슈미트"); await q.press("#q", "Enter"); await waitArticle(q, "칼 슈미트");
    await q.click('[data-mg]'); await q.fill("#mgTo", "북관 철령"); await q.click('[data-mg-yes]'); await waitArticle(q, "북관 철령");
    fw = await worldOf(q, "기본 세계");
    assert(!Object.values(fw.entities).some(o => o.title === "칼 슈미트") && fw.entities[kt("북관 철령")].page, "직접 고른 문서로 합칠 수 있다");
    assert(await q.locator('[data-mg]').count() === 1 && await q.locator('#side [data-k]').first().count() === 1);
    await q.click('#side [data-k]:has-text("대문")'); await waitArticle(q, "대문 항목");
    assert.strictEqual(await q.locator('[data-mg]').count(), 0, "대문 문서에는 합치기 버튼이 없다");
    ok("합치기 버튼으로 별명 같은 다른 이름의 문서를 직접 고른 문서에 합칠 수 있다");
    await fourth.ctx.close();

    /* 16. 세계관 다시 만들기 */
    await page.click('#side [data-act="home"]').catch(() => {}); await page.click('[data-act="home"]').catch(() => {});
    await page.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(page, "대문 항목");
    const oldBasic = await worldOf(page, "기본 세계"), nBible = count("bible");
    await page.click('#side [data-act="canon"]'); await page.click('[data-act="regen-open"]');
    assert.strictEqual(await page.inputValue("#seedTa"), "기본 모드 테스트 원안입니다. 아무 일도 없는 세계.", "처음 원안이 채워진다");
    assert((await page.locator('[data-act="create"]').innerText()).includes("지우고 다시 만들기"));
    await page.click('[data-act="create"]'); await waitArticle(page, "대문 항목");
    const newBasic = await worldOf(page, "기본 세계"), keys16 = (await idbAll(page)).map(x => x[0]).filter(k => k.startsWith("p:" + oldBasic.id + ":"));
    assert.strictEqual(newBasic.id, oldBasic.id, "같은 세계관 자리에 다시 만든다");
    assert.strictEqual(count("bible"), nBible + 1);
    assert(!Object.values(newBasic.entities).some(o => o.title === "마커스 벡") && keys16.length === 1, "기존 문서는 모두 지워지고 첫 문서만 남는다");
    assert.strictEqual((await page.locator(".wcard").count().catch(() => 0)), 0);
    ok("세계관 다시 만들기: 처음 원안으로 연표와 설정을 새로 만들고 기존 문서를 지운다");
    await page.click('[data-act="home"]'); await page.click('.wcard button.open:has-text("녹둔도 연대기")'); await waitArticle(page, "한서린");
    await page.click('#side [data-act="canon"]'); await page.click('[data-act="regen-open"]');
    assert.strictEqual(await page.inputValue("#firstIn"), "한서린");
    assert.strictEqual(await page.inputValue("#protoDesc"), "활은 잘 쏘지만 겁이 많은 막내 무관");
    assert.strictEqual(await page.inputValue('[data-cast="0"][data-cf="name"]'), "윤가람");
    assert.strictEqual(await page.inputValue('[data-cast="0"][data-cf="rel"]'), "소꿉친구이자 맞수");
    assert.strictEqual(await page.getAttribute('[data-chn="5"]', "aria-pressed"), "true", "다시 만들 때 원래 장 수가 골라져 있다");
    await page.click('[data-chn="7"]');
    await page.check("#regenKeep");
    const nWorlds = (await idbAll(page)).filter(x => x[1]?.kind === "world").length;
    await page.click('[data-act="create"]'); await waitArticle(page, "한서린");
    const ws16 = (await idbAll(page)).map(x => x[1]).filter(v => v?.kind === "world");
    assert.strictEqual(ws16.length, nWorlds + 1, "'기존 세계관도 남겨 두기'면 새 세계관이 따로 생긴다");
    assert.strictEqual(ws16.filter(v => v.title === "녹둔도 연대기").length, 2);
    assert(ws16.some(v => v.title === "녹둔도 연대기" && v.story.status === "ended"), "기존 이야기는 그대로 남는다");
    ok("스토리 세계관 다시 만들기: 주인공, 특징, 등장인물이 채워지고, 남겨 두기를 고르면 기존 세계관이 그대로 남는다");

    /* 18. 장 수 고르기 (7장) */
    const sb7 = calls.filter(c => c.kind === "storyBible").pop().prompt;
    assert(sb7.includes("7장짜리 이야기") && sb7.includes("7장 결말") && sb7.includes("2장 전개 1/2") && sb7.includes('"n":7,"beat":"결말"'), "세계관 생성에 7장 뼈대를 요청한다");
    const w7 = (await idbAll(page)).map(x => x[1]).find(v => v?.kind === "world" && v.title === "녹둔도 연대기" && v.story.status === "active");
    assert.strictEqual(w7.story.total, 7); assert.strictEqual(w7.story.spine.length, 7);
    assert.deepStrictEqual(w7.story.spine.map(x => x.beat), ["발단", "전개 1/2", "전개 2/2", "위기 1/2", "위기 2/2", "절정", "결말"]);
    assert((await sideText(page)).includes("/ 7장"));
    ctl.emptyChoices = true;
    await page.click('[data-act="story-next"]'); await page.click('[data-act="story-skip"]'); await page.waitForSelector(".stcard", { timeout: 15000 }); await settle(page);
    ctl.emptyChoices = false;
    await page.click('[data-act="story-next"]'); await page.waitForSelector('[data-act="choices-regen"]');
    assert.strictEqual(await page.locator('input[name="advPick"]').count(), 1, "쓸 수 있는 선택지가 없으면 직접 정하기만 남는다");
    await page.click('[data-act="choices-regen"]'); await page.waitForFunction(() => document.querySelectorAll('input[name="advPick"]').length === 4, null, { timeout: 15000 });
    assert.deepStrictEqual((await page.locator(".fx-pick span").allInnerTexts()).slice(0, 3), ["새 후보 하나", "새 후보 둘", "새 후보 셋"], "선택지 다시 만들기");
    await page.click('[data-act="story-back"]');
    const p7 = calls.filter(c => c.kind === "chapterPlan").pop().prompt;
    assert(p7.includes("전체 7장 중 2장") && p7.includes("이번 장에서 결말을 내거나 갈등을 미리 정리하지 않는다") && !p7.includes('"epilogue"'), "2장 계획은 결말을 내지 않는다");
    w7.story = (await idbAll(page)).map(x => x[1]).find(v => v?.id === w7.id).story;
    assert.strictEqual(w7.story.status, "active"); assert.strictEqual(w7.story.chapter, 2);
    ok("장 수를 7장으로 고르면 7단계 뼈대가 생기고, 중간 장은 결말을 내지 않는다");
    /* 21. 작성 직후 검사와 자동 고치기 */
    await page.click('[data-act="home"]'); await page.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(page, "대문 항목");
    ctl.checkIssues = [{ claim: "검사 대상의 역사는 1586년에 시작되었다.", evidence: "규칙 하나", conflict: "연도가 맞지 않는다", severity: "high" }, { claim: "참고만 할 지적", evidence: "규칙 둘", conflict: "가벼운 차이", severity: "low" }];
    ctl.fixEdits = [{ memo: 1, field: "body", old: "1586년에 시작되었다", new: "1599년에 시작되었다" }];
    ctl.checkDelay = 1200;
    let n0 = calls.length;
    await page.fill("#q", "검사 대상"); await page.press("#q", "Enter");
    await page.waitForFunction(() => document.querySelector("#genCount")?.textContent.includes("설정과 맞춰 보는 중"), null, { timeout: 15000 });
    assert.strictEqual((await page.locator('[data-act="stop"]').innerText()).trim(), "검사 건너뛰고 보기");
    await waitArticle(page, "검사 대상"); ctl.checkIssues = null; ctl.fixEdits = null; ctl.checkDelay = 0;
    await page.waitForTimeout(800);
    const seq = calls.slice(n0).map(c => c.kind);
    assert.strictEqual(seq[0], "page"); assert.deepStrictEqual(seq.slice(1, 3).sort(), ["check", "read"], "설정 대조와 문서 읽기를 동시에: " + seq.join(","));
    assert.deepStrictEqual(seq.slice(3, 5), ["fix", "analyze"], "작성 → 검사 → 고치기 → (뒤에서) 사실 정리: " + seq.join(","));
    const body21 = await page.locator(".article").innerText();
    assert(body21.includes("1599년에 시작되었다") && !body21.includes("1586년에 시작되었다"), "고친 본문으로 보여 준다");
    const memo21 = await page.locator("#main").textContent();
    assert(memo21.includes("자동으로 고쳤습니다") && memo21.includes("참고만 할 지적") && !memo21.includes("검사 대상의 역사는 1586년"), "고친 지적은 빠지고 참고 지적은 남는다");
    ok("문서를 띄우기 전에 설정 검사를 돌리고, 어긋난 곳을 고친 본문으로 보여 준다");
    ctl.checkIssues = [{ claim: "아무 지적", evidence: "근거", conflict: "x", severity: "high" }]; ctl.checkDelay = 2500;
    n0 = calls.length;
    await page.fill("#q", "건너뛸 문서"); await page.press("#q", "Enter");
    await page.waitForFunction(() => document.querySelector("#genCount")?.textContent.includes("설정과 맞춰 보는 중"), null, { timeout: 15000 });
    await page.click('[data-act="stop"]'); await waitArticle(page, "건너뛸 문서"); ctl.checkDelay = 0;
    await page.waitForTimeout(1500); ctl.checkIssues = null;
    assert(!calls.slice(n0).some(c => c.kind === "fix"), "건너뛰면 고치지 않는다");
    assert(calls.slice(n0).filter(c => c.kind === "check").length >= 2, "건너뛰면 검사는 뒤에서 다시 돈다");
    ok("'검사 건너뛰고 보기'를 누르면 바로 문서를 보여 주고, 검사는 뒤에서 돈다");

    /* 23. 다른 문서의 직접 수정과 어긋난 서술을 AI로 고치기 */
    await page.fill("#q", "한서린"); await page.press("#q", "Enter"); await waitArticle(page, "한서린");
    await page.click('[data-edit]'); await page.waitForSelector("#edBody");
    await page.fill("#edBody", (await page.inputValue("#edBody")) + "\n\n= 덧붙임 =\n한서린은 검사 대상과 무관하다.");
    ctl.analyzeConflicts = [{ ref: "M1", claim: "한서린은 검사 대상과 무관하다.", old: "검사 대상은 한서린와 얽힌 항목이다." }];
    await page.click("#edSave"); await waitArticle(page, "한서린"); ctl.analyzeConflicts = null;
    await page.fill("#q", "검사 대상"); await page.press("#q", "Enter"); await waitArticle(page, "검사 대상");
    assert((await page.locator("#main").innerText()).includes("직접 수정되어, 이 문서의 서술 1곳이 설정과 맞지 않습니다"), "충돌 표시가 붙는다");
    ctl.fixEdits = [{ memo: 1, field: "body", old: "얽힌 항목이다", new: "한때 얽혔으나 지금은 무관한 항목이다" }];
    const nfix = count("fix");
    await page.click("[data-cfix]");
    await page.waitForSelector('[data-act="fixv-apply"]', { timeout: 15000 }); ctl.fixEdits = null;
    assert.strictEqual(count("fix"), nfix + 1);
    assert(calls.filter(c => c.kind === "fix").pop().prompt.includes("사용자가 직접 수정해 이렇게 확정했다: 한서린은 검사 대상과 무관하다."), "직접 수정한 내용을 기준으로 고치게 한다");
    await page.click('[data-act="fixv-apply"]'); await waitArticle(page, "검사 대상");
    const t23 = await page.locator("#main").innerText();
    assert(t23.includes("지금은 무관한 항목이다") && !t23.includes("설정과 맞지 않습니다"), "고치면 본문이 바뀌고 충돌 표시가 사라진다");
    ok("다른 문서의 직접 수정과 어긋난 서술을 'AI로 고치기'로 고치면 충돌 표시가 사라진다");

    /* 24. 설정 대조와 문서 읽기를 따로, 동시에 돌리고 합친다 */
    ctl.readIssues = [{ claim: "### 분류: 테스트", evidence: "검사 분류의 역사는 1586년에 시작되었다.", conflict: "분류가 본문과 맞지 않는다", severity: "high" }];
    ctl.checkIssues = [{ claim: "분류: 테스트", evidence: "규칙 하나", conflict: "설정과도 어긋난다", severity: "low" }];
    ctl.fixEdits = [{ memo: 1, field: "cats", old: "테스트", new: "고친 분류" }];
    await page.fill("#q", "검사 분류"); await page.press("#q", "Enter"); await waitArticle(page, "검사 분류");
    ctl.checkIssues = null; ctl.readIssues = null; ctl.fixEdits = null;
    { const rd = calls.filter(c => c.kind === "read" && c.prompt.includes("# 검사 분류")).shift().prompt, ck = calls.filter(c => c.kind === "check" && c.prompt.includes("# 검사 분류")).shift().prompt;
      assert(rd.includes("분류: 테스트") && rd.includes("한 줄 정의: 검사 분류은 테스트 항목이다."), "검사에 분류와 한 줄 정의가 들어간다");
      assert(rd.includes("## 반드시 맞춰 볼 것") && rd.includes("분류는 항목 하나하나를 인포박스와 본문에 맞춰 본다") && rd.includes("대조 과정은 출력하지 않고"), "문서 읽기에 앱이 찾은 대조 대상 목록이 들어간다");
      assert(rd.includes("앞에서 정한 능력, 한계, 제약과 뒤의 실제 행적이 맞지 않는 곳") && rd.includes("같은 사건을 섹션마다 다르게 쓴 곳"), "능력 설정 대 실전 기록 같은 문서 안의 모순을 본다");
      assert(!rd.includes("## 핵심 규칙") && !rd.includes("## 관련 항목의 확정 설정"), "문서 읽기에는 설정 자료를 넣지 않는다");
      assert(ck.includes("## 핵심 규칙") && ck.includes("문서 안의 앞뒤 모순은 다른 검사가 따로 보므로") && !ck.includes("## 반드시 맞춰 볼 것"), "설정 대조는 설정과의 충돌만 본다");
      assert(calls.filter(c => c.kind === "fix").pop().prompt.includes("[cats] (분류, | 로 구분)\n테스트"), "고치기에 분류가 들어간다");
      assert.strictEqual((calls.filter(c => c.kind === "fix").pop().prompt.match(/문서의 서술: 분류: 테스트/g) || []).length, 1, "두 검사가 같은 문장을 지적하면 하나로 합친다"); }
    assert.strictEqual((await page.locator(".cats span").allInnerTexts()).join(","), "고친 분류", "분류도 자동으로 고친다");
    ctl.readFail = true; ctl.checkIssues = [{ claim: "역사는 1586년에", evidence: "규칙 하나", conflict: "x", severity: "low" }];
    await page.click('[data-check]'); await page.waitForSelector("details.memo", { timeout: 20000 });
    ctl.readFail = false; ctl.checkIssues = null;
    assert((await page.locator("details.memo").textContent()).includes("역사는 1586년에"), "한 검사가 실패해도 다른 검사 결과는 보여 준다");
    ok("설정 대조와 문서 읽기 검사를 동시에 돌려 합치고(같은 지적은 하나로), 하나가 실패해도 다른 결과를 쓰며, 분류까지 고친다");

    /* 25. AI 수정은 다른 문서를 대체하지 않는다: 어긋나면 그 문서의 메모로 */
    await page.fill("#q", "한서린"); await page.press("#q", "Enter"); await waitArticle(page, "한서린");
    ctl.checkIssues = [{ claim: "한서린은 검사 대상과 무관하다.", evidence: "규칙 하나", conflict: "x", severity: "high" }];
    await page.click('[data-check]'); await page.waitForSelector("[data-fixk]", { timeout: 20000 }); ctl.checkIssues = null;
    ctl.fixEdits = [{ memo: 1, field: "body", old: "한서린은 검사 대상과 무관하다.", new: "한서린은 검사 대상과 거리를 둔다." }];
    await page.locator("[data-fixk]").first().click(); await page.waitForSelector('[data-act="fixv-apply"]', { timeout: 20000 }); ctl.fixEdits = null;
    ctl.analyzeConflicts = [{ ref: "M2", claim: "한서린은 검사 대상과 거리를 둔다.", old: "검사 대상은 한서린와 얽힌 다른 항목이다." }];
    const na25 = count("analyze");
    await page.click('[data-act="fixv-apply"]'); await waitArticle(page, "한서린");
    for (let i = 0; i < 100 && count("analyze") === na25; i++) await page.waitForTimeout(100);
    await page.waitForFunction(() => !document.querySelector("#main").textContent.includes("맞춰 보는 중"), null, { timeout: 20000 }); ctl.analyzeConflicts = null;
    assert((await page.locator("#main").textContent()).includes("「검사 대상」"), "어긋난 다른 문서는 이 문서의 메모로 남는다");
    await page.fill("#q", "검사 대상"); await page.press("#q", "Enter"); await waitArticle(page, "검사 대상");
    assert(!(await page.locator("#main").innerText()).includes("설정과 맞지 않습니다"), "AI 수정 때문에 다른 문서에 경고가 붙지 않는다");
    { const bw25 = await worldOf(page, "기본 세계"), hk = Object.keys(bw25.entities).find(k => bw25.entities[k].title === "한서린");
      assert(!bw25.entities[hk].mentions.some(m => m.sup), "AI 수정이 다른 문서의 서술을 대체하지 않는다"); }
    ok("AI가 고친 문서가 다른 문서와 어긋나면, 다른 문서에 경고를 붙이지 않고 고친 문서의 메모로 남긴다");

    /* 26. 예전 버전이 AI 수정으로 붙인 경고는 세계관을 열 때 지운다 */
    await page.click('#side [data-act="gset"]');
    const [dl26] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
    const f26 = path.join(os.tmpdir(), "ww-badge-backup.json"); await dl26.saveAs(f26);
    const b26 = JSON.parse(fs.readFileSync(f26, "utf8")), w26 = b26.worlds.find(x => x.title === "기본 세계"), p26 = b26.pages[w26.id];
    const k26 = t => Object.keys(w26.entities).find(k => w26.entities[k].title === t), aiK = k26("검사 분류"), userK = k26("한서린"), tgt = k26("검사 대상");
    assert(!p26[aiK].editedAt && p26[userK].editedAt, "테스트 전제");
    p26[tgt].conflicts = [{ by: aiK, byTitle: "검사 분류", old: "AI가 붙인 옛 경고", claim: "x" }, { by: userK, byTitle: "한서린", old: "사용자 수정 경고", claim: "y" }];
    w26.entities[userK].mentions.forEach(m => { m.sup = { by: aiK }; });
    fs.writeFileSync(f26, JSON.stringify(b26));
    const fifth = await newPage(browser), q5 = fifth.page;
    await q5.goto(URL_); await q5.waitForSelector("#seedTa");
    await q5.click('[data-act="gset"]'); await q5.setInputFiles("#importFile", f26); await q5.waitForTimeout(500); await q5.click('#side [data-act="home"]');
    await q5.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(q5, "대문 항목");
    const pw = await pageOf(q5, await worldOf(q5, "기본 세계"), "검사 대상"), ww = await worldOf(q5, "기본 세계");
    assert.deepStrictEqual(pw.conflicts.map(c => c.old), ["사용자 수정 경고"], "AI 문서가 붙인 경고만 지우고 사용자 수정 경고는 남긴다");
    assert(!ww.entities[userK].mentions.some(m => m.sup), "AI 문서가 세운 대체 표시도 지운다");
    await fifth.ctx.close();
    ok("예전 버전에서 AI 수정이 다른 문서에 붙인 경고와 대체 표시는 세계관을 열 때 지운다");

    /* 27. 숫자 대조: 연도와 사망 나이를 문서끼리 기계적으로 비교 */
    ctl.pageOverride["갑 인물"] = { type: "인물", infobox: [{ label: "출생", value: "1890년" }, { label: "사망", value: "1934년" }] };
    ctl.pageOverride["을 문서"] = { sections: [{ heading: "개요", level: 1, body: "[[갑 인물]]은 1931년 사망했다." }, { heading: "뒷이야기", level: 1, body: "[[갑 인물]]의 모친은 1920년 숨졌다." }] };
    await page.fill("#q", "갑 인물"); await page.press("#q", "Enter"); await waitArticle(page, "갑 인물");
    ctl.fixEdits = [{ memo: 1, field: "body", old: "1931년 사망했다", new: "1934년 사망했다" }];
    const n27 = calls.length;
    await page.fill("#q", "을 문서"); await page.press("#q", "Enter"); await waitArticle(page, "을 문서"); ctl.fixEdits = null;
    { const fx = calls.slice(n27).find(c => c.kind === "fix");
      const memo27 = fx.prompt.split("## 원문")[0].split("## 메모")[1] || "";
      assert(memo27.includes("숫자 대조: 「갑 인물」의 사망 연도가 1931년으로 적혀 있지만") && !memo27.includes("1920"), "다른 항목의 연도를 다르게 적으면 띄우기 전에 고친다(가족 이야기는 비교하지 않음)"); }
    assert((await page.locator(".article").innerText()).includes("1934년 사망했다"));
    await page.fill("#q", "갑 인물"); await page.press("#q", "Enter"); await waitArticle(page, "갑 인물");
    ctl.pageOverride["병 사건"] = { type: "사건", sections: [{ heading: "개요", level: 1, body: "[[정 인물]]은 1931년 사망했다." }] };
    ctl.pageOverride["정 인물"] = { type: "인물", infobox: [{ label: "출생", value: "1890년" }, { label: "사망", value: "1934년" }] };
    await page.fill("#q", "병 사건"); await page.press("#q", "Enter"); await waitArticle(page, "병 사건");
    ctl.fixEdits = [{ memo: 1, field: "infobox", old: "사망: 1934년", new: "사망: 1931년" }];
    const n27b = calls.length;
    await clickLink(page, "정 인물"); await waitArticle(page, "정 인물"); ctl.fixEdits = null;
    { const fx = calls.slice(n27b).find(c => c.kind === "fix"), memo = (fx?.prompt.split("## 원문")[0] || "");
      assert(memo.includes("먼저 쓴 「병 사건」 문서가 이 항목의 사망 연도를 1931년으로 확정했는데 이 문서 인포박스는 1934년이다"), "먼저 쓴 문서가 기준이 되어 나중에 쓴 인물 문서를 고친다"); }
    assert((await page.locator(".infobox").innerText()).includes("1931년"));
    ctl.pageOverride = {};
    ok("숫자 대조: 다른 항목의 사망 연도를 인포박스와 다르게 적으면 잡아서 띄우기 전에 고친다. 먼저 쓴 문서가 기준이다");

    /* 28. 인물 관계 중복: 같은 관계는 한 번만, 카드는 상대 인물당 한 장 */
    ctl.pageOverride["무 인물"] = { type: "인물", sections: [{ heading: "개요", level: 1, body: "무 인물은 [[기 인물]]의 스승이다." }], relations: [{ a: "무 인물", b: "기 인물", rel: "스승과 제자", story: "어릴 때 검술을 가르쳤다." }] };
    ctl.pageOverride["기 인물"] = { type: "인물", sections: [{ heading: "개요", level: 1, body: "기 인물은 [[무 인물]]에게 배웠다." }], relations: [{ a: "기 인물", b: "무 인물", rel: "스승과 제자" }, { a: "무 인물", b: "기 인물", rel: "스승과 제자", story: "" }, { a: "기 인물", b: "무 인물", rel: "맞수", story: "나중에 맞수가 되었다." }] };
    await page.fill("#q", "무 인물"); await page.press("#q", "Enter"); await waitArticle(page, "무 인물");
    await clickLink(page, "기 인물"); await waitArticle(page, "기 인물");
    ctl.pageOverride = {};
    { const cards = page.locator(".rels li"); assert.strictEqual(await cards.count(), 1, "상대 인물당 카드 한 장");
      const t = await cards.first().innerText(); assert(t.includes("스승과 제자") && t.includes("→") && t.includes("맞수") && t.includes("나중에 맞수가 되었다."), "관계 변화를 한 카드에 순서대로");
      const w28 = await worldOf(page, "기본 세계"), mk = Object.keys(w28.entities).find(k => w28.entities[k].title === "무 인물");
      assert.strictEqual(w28.relations.filter(x => x.a === mk || x.b === mk).length, 2, "같은 관계는 출처가 달라도 한 번만 저장");
      assert.strictEqual(w28.relations.find(x => x.rel === "스승과 제자").story, "어릴 때 검술을 가르쳤다."); }
    await page.click('#side [data-act="gset"]');
    const [dl28] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
    const f28 = path.join(os.tmpdir(), "ww-rel-backup.json"); await dl28.saveAs(f28);
    const b28 = JSON.parse(fs.readFileSync(f28, "utf8")), w28b = b28.worlds.find(x => x.title === "기본 세계");
    const r0 = w28b.relations.find(x => x.rel === "스승과 제자"), n28 = w28b.relations.length;
    w28b.relations.push({ ...r0, src: "e_other1", story: "" }, { ...r0, a: r0.b, b: r0.a, src: "e_other2", story: "" });
    fs.writeFileSync(f28, JSON.stringify(b28));
    const sixth = await newPage(browser), q6 = sixth.page;
    await q6.goto(URL_); await q6.waitForSelector("#seedTa"); await q6.click('[data-act="gset"]'); await q6.setInputFiles("#importFile", f28);
    await q6.waitForTimeout(500); await q6.click('#side [data-act="home"]'); await q6.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(q6, "대문 항목");
    assert.strictEqual((await worldOf(q6, "기본 세계")).relations.length, n28, "이미 쌓인 중복 관계는 세계관을 열 때 합친다");
    await sixth.ctx.close();
    ok("인물 관계: 같은 관계는 출처가 달라도 한 번만 남기고, 상대 인물당 카드 한 장에 관계 변화를 보여 주며, 쌓인 중복은 정리한다");

    /* 29. 인용 대조: 같은 사람이 같은 날 한 말이 문서마다 다르면 */
    ctl.pageOverride["랑에 재판"] = { type: "사건", sections: [{ heading: "판결", level: 1, body: "[[요하네스 랑에]] 판사가 판결했다.\n\n> 소급 적용은 무효이므로 피고인 전원에게 무죄를 선고한다.\n> — 요하네스 랑에, 1953년 6월 19일 리히텐베르크 법원" }] };
    ctl.pageOverride["요하네스 랑에"] = { type: "인물", sections: [{ heading: "판결", level: 1, body: "그는 무죄를 선고했다.\n\n> 관인 날짜를 보시오. 18일이오. 전원 석방이오.\n> — 요하네스 랑에, 1953년 6월 19일 지방법원 제3형사법정" }] };
    await page.fill("#q", "랑에 재판"); await page.press("#q", "Enter"); await waitArticle(page, "랑에 재판");
    ctl.fixEdits = [{ memo: 1, field: "body", old: "> 관인 날짜를 보시오. 18일이오. 전원 석방이오.", new: "> 소급 적용은 무효이므로 피고인 전원에게 무죄를 선고한다." }];
    const n29 = calls.length;
    await clickLink(page, "요하네스 랑에"); await waitArticle(page, "요하네스 랑에"); ctl.fixEdits = null; ctl.pageOverride = {};
    { const pp = calls.slice(n29).find(c => c.kind === "page").prompt;
      assert(pp.includes("## 이미 기록된 발언") && pp.includes('요하네스 랑에, 1953년 6월 19일 리히텐베르크 법원: "소급 적용은 무효이므로'), "문서를 쓸 때 이미 기록된 같은 사람의 발언을 넘겨 준다");
      const memo = (calls.slice(n29).find(c => c.kind === "fix")?.prompt.split("## 원문")[0]) || "";
      assert(memo.includes("인용 대조: 같은 사람이 같은 날 한 말이 문서마다 다르다"), "같은 날 다른 말은 잡아서 고친다"); }
    assert((await page.locator(".article").innerText()).includes("소급 적용은 무효이므로"), "먼저 기록된 인용으로 맞춘다");
    { const bp29 = calls.filter(c => c.kind === "page").pop().prompt; assert(bp29.includes("직접 인용은 없는 것이 기본이다") && bp29.includes("인용이 없는 문서도 좋은 문서다"), "인용은 없는 것이 기본"); }
    ok("인용 대조: 같은 사람이 같은 날 한 말은 이미 기록된 것을 넘겨 주고, 다르게 쓰면 잡아서 맞춘다. 인용은 없는 것이 기본");

    /* 30. 장 전환 직후 주인공 문서도 보여 주기 전에 검사하고 고친다 */
    await page.click('#side [data-act="home"]').catch(() => {}); await page.click('[data-act="home"]').catch(() => {});
    await page.locator('.wcard').filter({ hasText: "스토리 2/7장" }).locator("button.open").click(); await waitArticle(page, "한서린");
    ctl.checkIssues = [{ claim: "한서린은 돌아왔다.", evidence: "규칙 하나", conflict: "x", severity: "high" }];
    ctl.fixEdits = [{ memo: 1, field: "body", old: "한서린은 돌아왔다.", new: "한서린은 성으로 돌아왔다." }];
    ctl.checkDelay = 1500;
    const nf30 = count("fix");
    await page.click('[data-act="story-next"]'); await page.click('[data-act="story-skip"]');
    await page.waitForFunction(() => /주인공 문서를 설정과 맞춰 보는 중/.test(document.querySelector("#stCount")?.textContent || ""), null, { timeout: 15000 });
    assert.strictEqual((await page.locator('[data-act="story-stop"]').innerText()).trim(), "검사 건너뛰고 보기");
    assert.strictEqual((await page.locator("h1.t").innerText()).trim(), "3장으로", "검사 단계에서도 제목은 진행 중인 장");
    assert((await page.locator("#main").innerText()).includes("3장은 반영되었습니다"), "검사 단계에 맞는 안내");
    await page.fill("#q", "한서린"); await page.press("#q", "Enter"); await waitArticle(page, "한서린");   // 검사 중에 주인공 문서를 직접 열어 본다
    assert(!(await page.locator(".article").innerText()).includes("(3장)") && (await page.locator("#main").innerText()).includes("지금은 이전 버전입니다"), "검사 중 주인공 문서를 열면 이전 버전을 보여 준다");
    await page.click("[data-edit]"); assert.strictEqual(await page.locator("#edSummary").count(), 0, "검사 중에는 편집을 열지 않는다");
    await page.waitForSelector(".stcard", { timeout: 20000 }); await settle(page); ctl.checkIssues = null; ctl.fixEdits = null; ctl.checkDelay = 0;
    assert.strictEqual(count("fix"), nf30 + 1, "장 전환 뒤 주인공 문서를 보여 주기 전에 고친다");
    assert((await page.locator(".article").innerText()).includes("한서린은 성으로 돌아왔다."), "고친 주인공 문서로 보여 준다");
    ok("장 전환 직후 주인공 문서와, 장 섹션을 붙인 문서는 보여 주기 전에 설정 검사를 돌리고 어긋난 곳을 고친다");

    /* 31. 먼저 쓴 문서를 검사할 때 나중에 쓴 문서의 설정은 기준이 아니다 */
    await page.click('[data-act="home"]').catch(() => {}); await page.click('#side [data-act="home"]').catch(() => {});
    await page.click('.wcard button.open:has-text("기본 세계")'); await waitArticle(page, "대문 항목");
    ctl.pageOverride["경 인물"] = { type: "인물", sections: [{ heading: "개요", level: 1, body: "경 인물은 [[신 인물]]의 아들이다." }] };
    ctl.pageOverride["신 인물"] = { type: "인물", infobox: [{ label: "직업", value: "판사" }], sections: [{ heading: "개요", level: 1, body: "신 인물은 [[경 인물]]의 아버지다." }], facts: [{ about: "경 인물", fact: "경 인물은 하급 관리 가문에서 태어났다." }] };
    await page.fill("#q", "경 인물"); await page.press("#q", "Enter"); await waitArticle(page, "경 인물");
    await clickLink(page, "신 인물"); await waitArticle(page, "신 인물"); ctl.pageOverride = {};
    await page.fill("#q", "경 인물"); await page.press("#q", "Enter"); await waitArticle(page, "경 인물");
    const n31 = calls.length; await page.click("[data-check]"); await until31();
    async function until31() { for (let i = 0; i < 100 && !calls.slice(n31).some(c => c.kind === "check"); i++) await page.waitForTimeout(100); }
    { const ck = calls.slice(n31).find(c => c.kind === "check").prompt;
      assert(!ck.includes("하급 관리 가문에서 태어났다") && !ck.includes("직업: 판사"), "나중에 쓴 문서가 정한 사실과 그 문서의 인포박스는 먼저 쓴 문서의 검사 기준에서 뺀다"); }
    { const ck2 = calls.filter(c => c.kind === "check" && c.prompt.includes("# 신 인물")).pop().prompt;
      assert(ck2.includes("경 인물"), "나중에 쓴 문서의 검사에는 먼저 쓴 문서가 기준으로 들어간다"); }
    ok("먼저 쓴 문서를 검사할 때 나중에 쓴 문서의 설정은 기준에서 뺀다(어긋남은 나중 문서 쪽에서 잡는다)");

    /* 32. 인물 인포박스의 성별 */
    assert(calls.filter(c => c.kind === "page").pop().prompt.includes("인물이면 '성별' 줄을 반드시 넣는다"), "인물 인포박스에 성별을 요구한다");
    ctl.pageOverride["성별 없는 인물"] = { type: "인물", infobox: [{ label: "직업", value: "제빵사" }], sections: [{ heading: "개요", level: 1, body: "그녀는 빵을 굽는다." }] };
    ctl.fixEdits = [{ memo: 1, field: "infobox", old: "직업: 제빵사", new: "성별: 여성\n직업: 제빵사" }];
    const n32 = calls.length;
    await page.fill("#q", "성별 없는 인물"); await page.press("#q", "Enter"); await waitArticle(page, "성별 없는 인물"); ctl.fixEdits = null; ctl.pageOverride = {};
    assert((calls.slice(n32).find(c => c.kind === "fix")?.prompt || "").includes("인포박스에 '성별' 줄이 없다"), "성별이 빠지면 띄우기 전에 채우게 한다");
    assert((await page.locator(".infobox").innerText()).includes("여성"));
    ok("인물 인포박스에 성별을 넣게 하고, 빠지면 띄우기 전에 채운다");

    /* 33. 본문 평문을 골라 빨간 링크 만들기 */
    ctl.pageOverride["선택 문서"] = { infobox: [{ label: "직업", value: "등대지기 겸 어부" }], sections: [{ heading: "개요", level: 1, body: "**바다 마을**의 빵집[*바다 마을 기록]과 바다 마을의 [[한서린]] 그리고 바다 마을." }] };
    await page.fill("#q", "선택 문서"); await page.press("#q", "Enter"); await waitArticle(page, "선택 문서"); ctl.pageOverride = {};
    const selectNth = (text, nth) => page.evaluate(([text, nth]) => {   // nth번째 평문 조각에서 text를 고른다
      const nodes = [], tw = document.createTreeWalker(document.querySelector(".article .secb[data-bi]"), NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) if (!n.parentElement.closest("a, sup") && n.data.includes(text)) nodes.push(n);
      const n = nodes[nth], i = n.data.lastIndexOf(text), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }, [text, nth]);
    await selectNth("바다 마을", 2);   // 굵게, "과 … 의", "그리고 …" 가운데 세 번째
    await page.waitForSelector("#selPop", { state: "visible", timeout: 5000 });
    assert.strictEqual((await page.locator("#selPop").innerText()).trim(), "빨간 링크 만들기");
    await page.click("#selPop"); await settle(page);
    { const w33 = await worldOf(page, "기본 세계"), p33 = await pageOf(page, w33, "선택 문서");
      assert.strictEqual(p33.sections[0].body, "**바다 마을**의 빵집[*바다 마을 기록]과 바다 마을의 [[한서린]] 그리고 [[바다 마을]].", "고른 자리(각주·링크 밖에서 두 번째로 나온 곳)만 감싼다");
      assert(Object.values(w33.entities).some(e => e.title === "바다 마을" && !e.page && e.mentions.some(m => m.text.includes("그리고 바다 마을"))), "빨간 링크 항목과 언급이 생긴다"); }
    assert.strictEqual(await page.locator('.article a.wl.new[data-t="바다 마을"]').count(), 1, "빨간 링크로 보인다");
    await page.click(".toast button"); await settle(page);   // 되돌리기
    { const w33 = await worldOf(page, "기본 세계"), p33 = await pageOf(page, w33, "선택 문서");
      assert(!p33.sections[0].body.includes("[[바다 마을]]") && !Object.values(w33.entities).some(e => e.title === "바다 마을"), "되돌리면 원문과 새 항목이 원래대로"); }
    await page.evaluate(() => { const a = document.querySelector('.article .secb a.wl'), r = document.createRange(); r.selectNodeContents(a); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await page.waitForTimeout(400); assert(!(await page.locator("#selPop").isVisible()), "링크 안의 글에는 버튼이 뜨지 않는다");
    await selectNth("바다 마을", 0);   // 굵게 쓴 글도 고를 수 있고, 링크가 굵게 안에 들어가도 제대로 보인다
    await page.waitForSelector("#selPop", { state: "visible", timeout: 5000 }); await page.click("#selPop"); await settle(page);
    { const w33 = await worldOf(page, "기본 세계"), p33 = await pageOf(page, w33, "선택 문서");
      assert(p33.sections[0].body.startsWith("**[[바다 마을]]**의 빵집"), "굵게 안의 글을 감싼다: " + p33.sections[0].body); }
    assert.strictEqual(await page.locator('.article strong a.wl.new[data-t="바다 마을"]').count(), 1, "굵게 안의 링크로 보인다");
    assert(!(await page.locator(".article").innerText()).includes("**"), "서식 기호가 드러나지 않는다");
    await page.evaluate(() => {   // 인포박스 값에서도 고를 수 있다
      const td = [...document.querySelectorAll(".infobox td")].find(x => x.textContent.includes("등대지기")), n = [...td.childNodes].find(x => x.nodeType === 3 && x.data.includes("등대지기"));
      const i = n.data.indexOf("등대지기"), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 4); getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await page.waitForSelector("#selPop", { state: "visible", timeout: 5000 }); await page.click("#selPop"); await settle(page);
    { const w33 = await worldOf(page, "기본 세계"), p33 = await pageOf(page, w33, "선택 문서");
      assert.strictEqual(p33.infobox.find(r => r.label === "직업").value, "[[등대지기]] 겸 어부", "인포박스 값의 고른 자리를 감싼다"); }
    assert.strictEqual(await page.locator('.infobox a.wl.new[data-t="등대지기"]').count(), 1, "인포박스에 빨간 링크로 보인다");
    const np33 = count("page"); await page.locator('.article a.wl.new[data-t="바다 마을"]').click(); await waitArticle(page, "바다 마을");
    assert.strictEqual(count("page"), np33 + 1, "만든 빨간 링크를 누르면 문서를 작성한다");
    ok("본문 평문을 골라 빨간 링크로 만들고(굵게·각주·링크 밖에서 고른 그 자리만), 되돌릴 수 있으며, 누르면 문서를 작성한다");

    await ctx.close();
    console.log(`\n모두 통과 (${step}개). Gemini 호출 ${calls.length}회: ` + Object.entries(calls.reduce((a, c) => (a[c.kind] = (a[c.kind] || 0) + 1, a), {})).map(([k, v]) => `${k} ${v}`).join(", "));
  } catch (e) {
    console.error("\n실패:", e); process.exitCode = 1;
  } finally { await browser.close(); server.close(); }
})();
