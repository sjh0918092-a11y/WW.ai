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
const ctl = { planDelay: 0, planBad: false, planN: 1 };
const count = k => calls.filter(c => c.kind === k).length;
function kindOf(p) {
  if (p.includes("## 이야기 뼈대")) return "storyBible";
  if (p.includes("## 장 계획 작성")) return "chapterPlan";
  if (p.includes("## 장 섹션 작성")) return "chapterBlock";
  if (p.includes("검사하라")) return "check";
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
  return { title, type: title === "한서린" || title === "이일" || /벡|슈미트/.test(title) ? "인물" : "지명", summary: `${title}은 테스트 항목이다.`, categories: ["테스트"], notices: [], infobox: [{ label: "상태", value: "생존" }],
    sections: [{ heading: "개요", level: 1, body: `${title}은 ${links}와 얽힌 항목이다.` }, { heading: "역사", level: 1, body: `${title}의 역사는 1586년에 시작되었다.` }],
    facts: [], relations: [], navboxes: [], newEntities: [], timeline: [] };
}
function planJson(p) {
  const n = +(/다음 장\((\d)장\)/.exec(p) || [])[1];
  const last = n === 5;
  const affected = n === 2 ? [{ title: "북관 철령", change: "북관 철령이 여진 해적단에게 포위되었다.", kind: "update" }, { title: "이일 (인물)", change: "이일이 파직되었다.", kind: "update" }, { title: "원균 함대", change: "원균 함대가 새로 출전했다.", kind: "new" }]
    : n === 3 ? [{ title: "이일", change: "이일이 백의종군했다.", kind: "update" }] : [{ title: "한양", change: "한양에 소식이 전해졌다.", kind: "update" }];
  return { title: `제${n}장: ${n}번째 사건`, era: `${1586 + n}년`, summary: `${n}장 줄거리. 한서린이 움직였다.`, timeline: [{ year: String(1586 + n), event: `${n}장 사건` }],
    protagonistBlock: { heading: `${n}장 사건명`, sections: [{ heading: "출전", level: 1, body: `한서린은 [[이일(인물)]]과 함께 출전했다. (${n}장)` }, { heading: "귀환", level: 1, body: "한서린은 돌아왔다." }], infoboxPatch: [{ label: "상태", value: `${n}장 상태` }], summaryPatch: "" },
    affected, newEntities: [{ title: "원균 함대", type: "조직", summary: "새 함대" }], wove: [{ title: "이일", how: "이일이 출전의 계기가 되었다." }, { title: "여진 해적단(조직)", how: "해적단이 철령을 포위했다." }],
    facts: [{ about: "이일", fact: `이일은 ${n}장에 움직였다.` }], relations: [], spineRevise: n === 2 ? [{ n: 4, intent: "수정된 절정" }] : [],
    nextChoices: last ? [] : ["진격한다", "후퇴한다", "협상한다"], ending: last ? { epilogue: "한서린은 고향으로 돌아갔다." } : null };
}
function blockJson(p) {
  const chs = (/## 덧붙일 장 \(([\d, ]+)장\)/.exec(p) || [, ""])[1].split(",").map(x => +x.trim()).filter(Boolean);
  return { blocks: chs.map(n => ({ ch: n, heading: `${n}장에 겪은 일`, sections: [{ heading: "경과", level: 1, body: `${n}장에서 이 항목에 일이 생겼다.` }] })), infoboxPatch: [{ label: "상태", value: "변화함" }], summaryPatch: "", facts: [], relations: [], timeline: [], newEntities: [] };
}
function answer(kind, p) {
  if (kind === "storyBible") return { ...BASE, title: "녹둔도 연대기", era: "1586년", mainTitle: "한서린", protagonist: { summary: "녹둔도의 젊은 무관", want: "고향을 지키는 것", wound: "아버지를 잃음" },
    spine: ["발단", "전개", "위기", "절정", "결말"].map((beat, i) => ({ n: i + 1, beat, intent: `${beat} 의도` })), chapter1: { title: "녹둔도의 밤", era: "1586년", summary: "1장 줄거리.", incident: "녹둔도 습격", nextChoices: ["추격한다", "보고한다", "숨는다"] } };
  if (kind === "bible") return { ...BASE, title: "기본 세계", era: "1600년", mainTitle: "대문 항목" };
  if (kind === "page") return pageJson((/## 작성할 문서: 「([^」]+)」/.exec(p) || [])[1]);
  if (kind === "chapterPlan") return ctl.planBad ? { title: "불완전" } : planJson(p);
  if (kind === "chapterBlock") return blockJson(p);
  if (kind === "check") return { issues: [] };
  if (kind === "analyze") return { facts: [], timeline: [], newEntities: [], relations: [], conflicts: [] };
  if (kind === "tone") return TONE;
  return { ok: true };
}
async function route(r) {
  const body = JSON.parse(r.request().postData() || "{}");
  const prompt = body.contents?.[0]?.parts?.[0]?.text || "";
  const kind = kindOf(prompt); calls.push({ kind, prompt });
  if (kind === "chapterPlan" && ctl.planDelay) await new Promise(res => setTimeout(res, ctl.planDelay));
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
    assert(pagePrompt.includes("이야기 진행 상황") && pagePrompt.includes("녹둔도 습격") && !pagePrompt.includes("결말 의도"), "주인공 문서 프롬프트: 발단 사건 포함, 뼈대 미포함");
    const sb = calls.find(c => c.kind === "storyBible").prompt;
    assert(sb.includes("활은 잘 쏘지만 겁이 많은 막내 무관") && sb.includes("- 윤가람 — 특징: 북관 출신 궁수 — 주인공과의 관계: 소꿉친구이자 맞수") && !sb.includes("지울 사람"), "주인공 특징과 등장인물이 세계관 생성에 들어간다");
    assert(pagePrompt.includes("사용자가 정한 주인공의 특징(반드시 지킨다): 활은 잘 쏘지만") && pagePrompt.includes("사용자가 정한 등장인물(윤가람)"));
    { const w0 = await worldOf(page, "녹둔도 연대기"), gk = Object.keys(w0.entities).find(k => w0.entities[k].title === "윤가람");
      assert(gk && w0.entities[gk].type === "인물" && w0.entities[gk].facts.some(f => f.src === "user" && f.t === "북관 출신 궁수"), "등장인물이 사용자 확정 사실과 함께 항목으로 생긴다");
      assert(w0.relations.some(r => r.src === "user" && r.rel === "소꿉친구이자 맞수" && [r.a, r.b].includes(gk)), "주인공과의 관계가 확정 관계로 들어간다");
      assert(w0.story.cast[0].key === gk && w0.story.protagonist.desc); }
    assert.strictEqual(await page.inputValue("#protoDesc").catch(() => ""), "", "만든 뒤 입력란은 비운다");
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
    ok("다음 장으로 → 선택 → 주인공 문서에 2장 블록이 붙고, 기존 본문은 그대로이며, 탐험이 반영된다");

    /* 5. 지연 갱신 */
    let nb = count("chapterBlock");
    await page.locator('.stcard a.wl[data-t="북관 철령"]').click();
    await page.waitForFunction(() => [...document.querySelectorAll(".chb")].some(e => e.textContent === "2장"), null, { timeout: 15000 }); await settle(page);
    assert.strictEqual(count("chapterBlock"), nb + 1, "affected 문서를 열면 장 섹션을 한 번 생성");
    nb = count("chapterBlock");
    await page.fill("#q", "여진 해적단"); await page.press("#q", "Enter"); await waitArticle(page, "여진 해적단");
    await settle(page);
    assert.strictEqual(count("chapterBlock"), nb, "affected가 아닌 문서는 AI 호출 없이 열린다");
    ok("affected 문서는 열 때 장 섹션이 생기고, 아닌 문서는 호출 없이 열린다");

    /* 6. 롤백: 중단과 실패 */
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
    ok("두 장을 건너뛰고 연 문서는 한 번의 호출로 두 장의 블록이 생성된다");

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
    assert((await page.locator(".article h2 .chb").allInnerTexts()).includes("5장"));
    assert.strictEqual(await page.locator('.stcard [data-act="epilogue"]').count(), 1, "안내 카드 위에 '에필로그로' 버튼");
    await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "6-final-chapter");
    await page.click('.stcard [data-act="epilogue"]');
    await page.waitForFunction(() => document.querySelector("h1.t")?.textContent === "에필로그", null, { timeout: 15000 });
    assert((await page.locator("#main").innerText()).includes("한서린은 고향으로 돌아갔다."));
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
    await ctx.close();
    console.log(`\n모두 통과 (${step}개). Gemini 호출 ${calls.length}회: ` + Object.entries(calls.reduce((a, c) => (a[c.kind] = (a[c.kind] || 0) + 1, a), {})).map(([k, v]) => `${k} ${v}`).join(", "));
  } catch (e) {
    console.error("\n실패:", e); process.exitCode = 1;
  } finally { await browser.close(); server.close(); }
})();
