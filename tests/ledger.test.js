/* 장부 기반 일관성: 연표 받기, 사실·언급 보존, 사건 장부, 용어 정의, 세계 전체 점검. AI 호출 0회 */
const vm = require("vm"), assert = require("assert");
const { appSource } = require("./helpers/app");
const html = appSource();
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert(i >= 0 && j > i, "구간을 찾지 못함: " + a); return html.slice(i, j); };
const c = { S: { pages: {}, world: null }, console };
c.kOf = (w, t) => { t = c.norm(t); return Object.keys(w.entities).find(k => w.entities[k].title === t) || c.keyOf(t); };
vm.createContext(c);
vm.runInContext([
  cut("function cyrb53(", "const isBroken"), cut("const stripMarks =", "const withTimeout"),
  cut("const FACT_CAP =", "/* 링크가 걸린 문장부터"),
  cut("const yearNum =", "/* 사실과 언급의 상태"), "const live = x => !x.sup;",
  cut("let focusMemo = null;", "function entityBrief"), "const yearHits = () => [];",
  cut("const TIMELINE_PROMPT_N =", "function canonBlock"),
  cut("const refOK =", "/* 검사할 문서(focus)"), "const chOf = () => 0;",
  cut("const sentencesOf =", "/* 인포박스에서"), cut("function pageTexts(p)", "/* 이름이 목적어"),
  cut("const namesOf =", "function checkBrief"),
  require("fs").readFileSync(require("path").join(__dirname, "..", "js", "ledger.js"), "utf8").replace('"use strict";', ""),
  "Object.assign(globalThis,{WC_LIMIT,WC_ITEMS_MAX,promptTimeline,TIMELINE_PROMPT_N,worldCheckPrompt,parseWorldCheck,worldCheckAction,ingestTerms,purgeTerms,pickTerm,glossaryBlock,findTerm,normEvent,ingestEvents,eventIssues,eventCandidates,eventBlock,eventCheckBlock,addFact,addMention,compactFacts,promptFacts,promptMentions,FACT_CAP,MENTION_CAP,addTimeline,acceptTimeline,acceptPageTimeline,timelineSubject,keyOf,norm,stripMarks});"
].join("\n"), c);
let n = 0; const tests = []; const test = (name, fn) => tests.push([name, fn]);
const ent = title => ({ title, type: "", summary: "", facts: [], mentions: [], page: false, box: "" });
const world = (...titles) => { const w = { entities: {}, timeline: [] }; for (const t of titles) w.entities[c.keyOf(t)] = ent(t); return w; };

test("모든 앱 스크립트가 문법 오류 없이 읽힌다", () => {
  const fs = require("fs"), path = require("path"), dir = path.join(__dirname, "..", "js");
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) new vm.Script(fs.readFileSync(path.join(dir, f), "utf8"), { filename: f });
});

/* ---------- 1단계: 연표 ---------- */
test("주어가 되는 고유명사가 없는 연표 항목은 받지 않는다", () => {
  const w = world("한서진", "북해 함대");
  assert.equal(c.acceptTimeline(w, { year: "2016", event: "만 32세로 해안 도시에 거주 중임이 확인됨" }, "p1"), false);
  assert.equal(c.acceptTimeline(w, { year: "2016", about: "누군가", event: "만 32세로 거주 중임이 확인됨" }, "p1"), false, "about이 문장에 없으면 주어가 아니다");
  assert.equal(w.timeline.length, 0);
});
test("about이 밝힌 주어가 문장에 있으면 받고 주어 키를 남긴다", () => {
  const w = world("한서진", "북해 함대");
  assert.equal(c.acceptTimeline(w, { year: "2012", about: "북해 함대", event: "북해 함대가 해협 봉쇄를 시작했다" }, "p1"), true);
  assert.equal(w.timeline[0].k, c.keyOf("북해 함대"));
});
test("about이 없어도 문장에 처음 나오는 기존 항목 이름을 주어로 본다", () => {
  const w = world("한서진", "북해 함대");
  assert.equal(c.acceptTimeline(w, { year: "2013", event: "[[한서진]]이 [[북해 함대]] 사령관에 취임했다" }, "p1"), true);
  assert.equal(w.timeline[0].k, c.keyOf("한서진"));
});
test("기존 항목이 아닌 새 이름도 about과 문장이 맞으면 받는다", () => {
  const w = world("한서진");
  assert.equal(c.acceptTimeline(w, { year: "1999", about: "청람 조약", event: "청람 조약이 체결되었다" }, "p1"), true);
  assert.equal(w.timeline[0].about, "청람 조약");
});
test("이미 있는 항목과 연도와 대상이 같으면 넣지 않는다 (옛 항목은 주어 기록이 없어도)", () => {
  const w = world("한서진", "북해 함대");
  w.timeline.push({ year: "2015", event: "한서진이 남부 전선에 배치되었다", src: "old" });
  assert.equal(c.acceptTimeline(w, { year: "2015", about: "한서진", event: "한서진이 요양소에 입소했다" }, "p2"), false);
  assert.equal(c.acceptTimeline(w, { year: "2015년", about: "북해 함대", event: "북해 함대가 재편되었다" }, "p2"), true, "같은 해라도 대상이 다르면 받는다");
  assert.equal(c.acceptTimeline(w, { year: "2016", about: "한서진", event: "한서진이 퇴역했다" }, "p2"), true, "같은 대상이라도 해가 다르면 받는다");
  assert.equal(c.acceptTimeline(w, { year: "2016", about: "한서진", event: "한서진이 퇴역했다" }, "p3"), false, "같은 사건을 두 번 넣지 않는다");
});
test("대체된 연표 항목은 중복 판정에 쓰지 않는다", () => {
  const w = world("한서진");
  w.timeline.push({ year: "2015", event: "한서진이 남부 전선에 배치되었다", src: "old", k: c.keyOf("한서진"), sup: { by: "x" } });
  assert.equal(c.acceptTimeline(w, { year: "2015", about: "한서진", event: "한서진이 북부 전선에 배치되었다" }, "p2"), true);
});
test("문서 하나는 연표에 두 개까지만 넣는다", () => {
  const w = world("가람", "나래", "다솜");
  const got = c.acceptPageTimeline(w, [{ year: "1", about: "가람", event: "가람 창설" }, { year: "2", about: "나래", event: "나래 붕괴" }, { year: "3", about: "다솜", event: "다솜 발견" }], "p1");
  assert.equal(got, 2); assert.equal(w.timeline.length, 2);
  assert.equal(c.acceptPageTimeline(w, null, "p1"), 0);
});
test("문서 작성 프롬프트는 연표를 0~2개, 세계에 영향을 준 사건만 요구한다", () => {
  assert(!html.includes("1~3개 넣는다. 시간과 무관해 보이는 항목이라도"));
  assert(html.includes("만 0~2개 넣는다"));
  assert(html.includes("현재 상태, 근황, 거주, 요양"));
  assert(html.includes('"about":"사건의 주체가 되는 항목 제목"'));
  assert(html.includes("acceptPageTimeline(w, out.timeline, key)"));
});
test("설정 노트 초안 지침은 수량 한도의 경계를 분명히 쓰게 한다", () => {
  assert(html.includes("수량 한도는 '최대 N', 'N 이하'"));
});

test("연표도 저장할 때는 48개를 넘어도 지우지 않는다", () => {
  const w = world("한서진");
  for (let i = 0; i < 5; i++) c.addTimeline(w, { year: String(1000 + i), event: "원안 사건 " + i }, "seed");
  for (let i = 0; i < 120; i++) c.addTimeline(w, { year: String(1100 + i), event: "사건 " + i }, "doc" + i);
  assert.equal(w.timeline.length, 125); assert.equal(w.timeline[5].event, "사건 0");
});
test("연표를 프롬프트에 넣을 때 고른다: 원안·직접 수정한 문서는 언제나, 나머지는 관련된 것부터, 연도 순서대로", () => {
  const w = world("한서진", "카이 마루");
  for (let i = 0; i < 3; i++) c.addTimeline(w, { year: String(1000 + i), event: "원안 사건 " + i }, "seed");
  for (let i = 0; i < 100; i++) c.addTimeline(w, { year: String(1100 + i), event: (i === 2 ? "카이 마루가 진수되었다 " : "사건 ") + i }, "doc" + i);
  c.addTimeline(w, { year: "1050", event: "대체된 사건" }, "docX"); w.timeline.find(t => t.event === "대체된 사건").sup = { by: "y" };
  c.S.pages = { doc5: { title: "직접 고친 문서", editedAt: 1 } };
  let got = c.promptTimeline(w, null);
  assert.equal(got.length, 3 + 1 + c.TIMELINE_PROMPT_N);
  assert(got.some(t => t.event === "원안 사건 0") && got.some(t => t.src === "doc5")); assert(!got.some(t => t.sup));
  assert.deepEqual(got.map(t => +t.year), got.map(t => +t.year).slice().sort((a, b) => a - b), "연도 순서 그대로");
  assert(!got.some(t => t.event === "카이 마루가 진수되었다 2"), "초점이 없으면 최근 것부터");
  got = c.promptTimeline(w, "카이 마루의 문서");
  assert(got.some(t => t.event === "카이 마루가 진수되었다 2"), "초점에 나온 항목의 사건은 오래되어도 넣는다");
  c.S.pages = {};
});
test("연표 상한 삭제가 없어지고 문서 작성·설정 대조가 고른 연표를 쓴다", () => {
  assert(!html.includes("w.timeline.length > 48"));
  assert(html.includes("const tl = promptTimeline(w, focus)"));
  assert(html.includes("${canonBlock(w, [e.title, e.summary"));
  assert(html.includes("ok(t.src)) }, focus)}"));
});

/* ---------- 2단계: 사실·언급 보존 ---------- */
test("다른 문서 47개가 링크한 뒤에도 언급을 지우지 않는다", () => {
  const e = ent("한서진");
  for (let i = 0; i < 47; i++) c.addMention(e, "doc" + i, `doc${i}에서 한서진을 언급한 문장`);
  assert.equal(e.mentions.length, 47); assert.equal(e.mentions[0].from, "doc0");
});
test("사실도 24개를 넘어도 지우지 않는다", () => {
  const e = ent("한서진");
  for (let i = 0; i < 60; i++) c.addFact(e, `사실 ${i}`, "doc" + (i % 7));
  assert.equal(e.facts.length, 60); assert.equal(e.facts[0].t, "사실 0");
});
test("저장 상한을 넘으면 같은 문서에서 온 오래된 기록을 한 줄로 합친다 (내용은 남는다)", () => {
  const e = ent("한서진");
  c.addFact(e, "사용자 사실", "user"); c.addFact(e, "사용자 사실 둘", "user");
  for (let i = 0; i < c.FACT_CAP + 10; i++) c.addFact(e, `사실 ${i}`, "doc" + (i % 20));
  assert(e.facts.length <= c.FACT_CAP);
  const all = e.facts.map(f => f.t).join(" / ");
  for (let i = 0; i < c.FACT_CAP + 10; i++) assert(all.includes(`사실 ${i}`), "합쳐도 내용은 그대로 " + i);
  assert.equal(e.facts.filter(f => f.src === "user").length, 2, "사용자 사실은 합치지 않는다");
  assert(e.facts.some(f => f.merged >= 2));
  assert(e.facts.every(f => f.src === "user" || !f.t.includes("사실 0 /") || f.src === "doc0"), "합친 줄은 한 출처에서만 온다");
});
test("합칠 짝이 없으면 상한을 넘어도 지우지 않는다", () => {
  const e = ent("한서진");
  for (let i = 0; i < c.MENTION_CAP + 5; i++) c.addMention(e, "doc" + i, "언급 " + i);
  assert.equal(e.mentions.length, c.MENTION_CAP + 5);
});
test("프롬프트에는 pickRelevant가 고른 것만, 사용자 사실은 언제나 넣는다", () => {
  const w = world("한서진"), e = w.entities[c.keyOf("한서진")];
  c.addFact(e, "사용자 사실", "user");
  for (let i = 0; i < 100; i++) c.addFact(e, `사실 ${i}`, "doc" + i);
  const got = c.promptFacts(w, c.keyOf("한서진"), e.facts, null);
  assert.equal(got.length, 41); assert(got.some(f => f.src === "user")); assert.equal(got[got.length - 1].t, "사실 99");
  for (let i = 0; i < 80; i++) c.addMention(e, "m" + i, "언급 " + i);
  assert.equal(c.promptMentions(w, c.keyOf("한서진"), e.mentions, null).length, 30);
});
test("항목을 합칠 때도 사실을 잘라 내지 않는다", () => {
  assert(!html.includes("b.facts.splice(0, b.facts.length - 24)"));
  assert(!/mentions\.length > 6\) e\.mentions\.shift/.test(html));
});

/* ---------- 3단계: 사건 장부 ---------- */
const doc = (title, createdAt, body = "", extra = {}) => ({ title, type: "사건", summary: "", infobox: [], sections: [{ heading: "개요", level: 1, body }], links: [], createdAt, ...extra });
const duelWorld = () => {
  const w = world("해저 결투", "한서진", "카이 마루", "북해 함대", "남부 해전");
  const K = t => c.keyOf(t);
  c.S.pages = { [K("해저 결투")]: doc("해저 결투", 1, "두 병기는 180해리 떨어진 해역, 수심 70m에서 맞붙었다."), [K("한서진")]: doc("한서진", 2, "한서진은 40해리 앞바다의 수심 120m 해저에서 카이 마루와 싸웠다."), [K("남부 해전")]: doc("남부 해전", 3, "") };
  const duel = (dist, depth, extra = {}) => ({ name: "해저 결투", date: "2015년 11월 4일", place: "북해", nums: [{ name: "거리", value: dist, unit: "해리" }, { name: "수심", value: depth, unit: "m" }], participants: ["한서진", "카이 마루"], result: "한서진의 승리", ...extra });
  c.ingestEvents(w, K("해저 결투"), [duel("180", "70")]);
  c.ingestEvents(w, K("한서진"), [duel("40", "120")]);
  return { w, K, duel };
};
test("구체적이지 않은 사건(날짜가 없거나 장소·수치가 없는)은 장부에 넣지 않는다", () => {
  const w = world("한서진");
  assert.equal(c.normEvent(w, { name: "어떤 전투", place: "북해" }), null);
  assert.equal(c.normEvent(w, { name: "어떤 전투", date: "2015년" }), null);
  assert(c.normEvent(w, { name: "어떤 전투", date: "2015년", nums: [{ name: "병력", value: "300", unit: "명" }] }));
  assert.equal(c.ingestEvents(w, "p", "잘못된 값"), 0);
});
test("같은 문서의 기록은 다시 받을 때 바꿔 끼운다", () => {
  const { w, K, duel } = duelWorld();
  c.ingestEvents(w, K("한서진"), [duel("180", "70")]);
  assert.equal(w.events.length, 2); assert.equal(w.events.filter(x => x.src === K("한서진"))[0].nums[0].value, "180");
});
test("같은 사건, 같은 이름·단위의 수치가 먼저 기록된 값과 다르면 이슈로 만든다", () => {
  const { w, K } = duelWorld();
  const is = c.eventIssues(w, K("한서진"));
  assert.equal(is.length, 2); assert(is.every(i => i.severity === "high"));
  assert(is[0].conflict.includes("· 사건 장부:")); assert(is[0].conflict.includes("180해리"));
  assert(is[0].claim.includes("40해리"), "문서에서 그 값이 나온 문장을 claim으로 쓴다");
  assert.equal(c.eventIssues(w, K("해저 결투")).length, 0, "먼저 쓴 문서는 기준이다");
});
test("값이 같거나, 수치 이름이나 단위가 다르면 지적하지 않는다", () => {
  const { w, K, duel } = duelWorld();
  c.ingestEvents(w, K("한서진"), [{ ...duel("180", "70"), nums: [{ name: "거리", value: "180.0", unit: "해리" }, { name: "수심", value: "120", unit: "피트" }, { name: "교전 거리", value: "40", unit: "해리" }] }]);
  assert.equal(c.eventIssues(w, K("한서진")).length, 0);
});
test("사용자가 직접 고친 문서의 기록은 언제나 기준이다", () => {
  const { w, K } = duelWorld();
  c.S.pages[K("한서진")].editedAt = 9;
  assert.equal(c.eventIssues(w, K("한서진")).length, 0, "직접 고친 문서는 지적받지 않는다");
  const is = c.eventIssues(w, K("해저 결투"));
  assert.equal(is.length, 2, "먼저 쓴 문서라도 직접 고친 문서와 다르면 맞춘다"); assert(is[0].conflict.includes("사용자가 직접 고친"));
});
test("문서를 쓸 때 다룰 사건이 장부에 있으면 그 사건의 기록을 전부 표로 넣는다", () => {
  const { w, K } = duelWorld();
  const b = c.eventBlock(w, K("카이 마루"), []);
  assert(b.includes("## 사건 장부")); assert(b.includes("| 해저 결투 | 2015년 11월 4일 |")); assert.equal((b.match(/\| 해저 결투 \|/g) || []).length, 2);
  assert(b.includes("「해저 결투」 (기준)"));
  assert.equal(c.eventBlock(w, K("북해 함대"), []), "", "관계없는 항목에는 넣지 않는다");
  assert(c.eventBlock(w, K("북해 함대"), [K("해저 결투")]).includes("해저 결투"), "관련 항목의 사건은 넣는다");
});
test("키가 다르면 날짜와 참가자가 겹치는 후보만 검사 프롬프트에 함께 보낸다", () => {
  const { w, K } = duelWorld();
  c.ingestEvents(w, K("남부 해전"), [{ name: "11월 4일 교전", date: "11월 4일", place: "북해", nums: [{ name: "거리", value: "90", unit: "해리" }], participants: ["카이 마루"] }, { name: "다른 교전", date: "1999년 1월 1일", place: "남해", participants: ["카이 마루"] }]);
  const cand = c.eventCandidates(w, K("남부 해전"));
  assert.equal(cand.length, 2, "같은 날짜·같은 참가자의 기록 두 개(해저 결투 문서, 한서진 문서)");
  const blk = c.eventCheckBlock(w, K("남부 해전"), () => true);
  assert(blk.includes("## 같은 사건일 수 있는 기록")); assert(blk.includes("「11월 4일 교전」")); assert(!blk.includes("다른 교전"));
  assert.equal(c.eventIssues(w, K("남부 해전")).length, 0, "키가 다르면 코드가 지적하지 않는다");
});
test("사건 장부가 생성·검사·수정 흐름에 연결되어 있다", () => {
  assert(html.includes('["사건 장부", (w, k) => [...eventIssues(w, k), ...timelineIssues(w, k)]]'));
  assert(html.includes("나이 규칙|사건 장부"));
  assert((html.match(/\$\{EVENTS_JSON\}/g) || []).length >= 3, "문서 작성, 확정 사실 정리, 수정본 분석");
  assert(html.includes("ingestEvents(w, key, out.events)")); assert(html.includes("${eventBlock(w, key, rel)}")); assert(html.includes("${eventCheckBlock(w, key, ok)}"));
  assert(html.includes("if (w.events) w.events = w.events.filter(x => x.src !== key);"), "문서를 지우거나 다시 쓰면 그 문서의 기록을 걷어 낸다");
});

/* ---------- 4단계: 용어 정의 ---------- */
test("문서가 처음 정한 용어를 기록하고, 같은 정의는 다시 넣지 않는다", () => {
  const w = world("가");
  assert.equal(c.ingestTerms(w, "p1", [{ term: "Type-05", definition: "나라마다 따로 매기는 제식 번호로, 대대로 물려받는 칭호다." }, { term: "", definition: "x" }, "잘못"]), 1);
  assert.equal(w.glossary.length, 1); assert.equal(w.glossary[0].confirmed, false); assert.equal(w.glossary[0].src, "p1");
  c.ingestTerms(w, "p2", [{ term: "type-05", definition: "나라마다 따로 매기는 제식 번호로, 대대로 물려받는 칭호다" }]);
  assert.equal(w.glossary.length, 1); assert(!w.glossary[0].alts, "표기만 다른 같은 정의는 후보가 아니다");
  assert.equal(c.ingestTerms(w, "p3", undefined), 0, "옛 응답처럼 terms가 없어도 된다");
});
test("정의가 엇갈리는 후보는 자동으로 고르지 않고 후보로 둔다", () => {
  const w = world("가");
  c.ingestTerms(w, "p1", [{ term: "Type-05", definition: "대대로 물려받는 칭호" }]);
  c.ingestTerms(w, "p2", [{ term: "Type-05", definition: "소녀 한 명의 개인 이름" }]);
  c.ingestTerms(w, "p3", [{ term: "Type-05", definition: "전 세계 일련번호" }]);
  const g = w.glossary[0];
  assert.equal(g.definition, "대대로 물려받는 칭호", "먼저 정한 정의를 바꾸지 않는다");
  assert.deepEqual(g.alts.map(a => a.src), ["p2", "p3"]);
  assert(c.glossaryBlock(w).includes("- Type-05: 대대로 물려받는 칭호"));
});
test("사용자가 고르면 확정되고 후보가 사라진다. 확정된 용어는 새 후보를 받지 않는다", () => {
  const w = world("가");
  c.ingestTerms(w, "p1", [{ term: "Type-05", definition: "대대로 물려받는 칭호" }]);
  c.ingestTerms(w, "p2", [{ term: "Type-05", definition: "소녀 한 명의 개인 이름" }]);
  assert.equal(c.pickTerm(w, 0, 0), true);
  assert.equal(w.glossary[0].definition, "소녀 한 명의 개인 이름"); assert.equal(w.glossary[0].confirmed, true); assert(!w.glossary[0].alts);
  c.ingestTerms(w, "p3", [{ term: "Type-05", definition: "전 세계 일련번호" }]);
  assert(!w.glossary[0].alts);
  assert(c.glossaryBlock(w).includes("[사용자 확정]"));
  assert.equal(c.pickTerm(w, 5, -1), false);
});
test("문서를 지우거나 다시 쓰면 그 문서의 후보와 미확정 용어를 걷어 낸다", () => {
  const w = world("가");
  c.ingestTerms(w, "p1", [{ term: "A", definition: "가" }, { term: "B", definition: "나" }]);
  c.ingestTerms(w, "p2", [{ term: "A", definition: "다" }]);
  c.ingestTerms(w, "user", [{ term: "C", definition: "라" }]);
  c.purgeTerms(w, "p1");
  assert.deepEqual(w.glossary.map(g => [g.term, g.definition, g.src]), [["A", "다", "p2"], ["C", "라", "user"]], "후보가 있으면 후보가 정의가 된다");
  w.glossary[0].confirmed = true; c.purgeTerms(w, "p2"); assert.equal(w.glossary.length, 2, "확정된 용어는 남는다");
});
test("검사할 문서에는 그 문서에 나온 용어만 넣는다", () => {
  const w = world("가");
  c.ingestTerms(w, "p1", [{ term: "Type-05", definition: "칭호" }, { term: "북해 협정", definition: "조약" }]);
  const b = c.glossaryBlock(w, "Type-05가 출격했다"); assert(b.includes("Type-05")); assert(!b.includes("북해 협정"));
  assert.equal(c.glossaryBlock(w, "아무것도"), "");
  assert.equal(c.glossaryBlock({ entities: {} }), "", "옛 세계관에는 glossary가 없다");
});
test("용어 정의가 모든 문서 프롬프트와 문서 읽기 검사에 들어간다", () => {
  assert(html.includes('${(w.glossary || []).length ? "\\n\\n" + glossaryBlock(w) : ""}'), "canonBlock에 넣는다");
  assert(html.includes("이 세계의 용어를 아래 '용어 정의'와 다른 뜻으로 쓴 곳"));
  assert(html.includes("const g = glossaryBlock(w, docForCheck(p))"));
  assert(html.includes(",${TERMS_JSON}}")); assert(html.includes("ingestTerms(w, key, out.terms)"));
  assert(html.includes("if (w.glossary) purgeTerms(w, key);"));
  assert(html.includes("data-term-pick=") && html.includes("어느 쪽으로 할까요?"));
});

/* ---------- 5단계: 세계 전체 점검 ---------- */
test("점검 프롬프트는 문서 제목·정의, 최초 주장, 사건 장부, 용어 정의, 연표를 압축해 한 번에 보낸다", () => {
  const { w, K } = duelWorld();
  c.S.pages[K("한서진")].summary = "북해의 병기 조종사";
  c.S.pages[K("남부 해전")].sections[0].body = "이 전투는 냉병기 없이 맨손으로 이긴 최초의 실전이었다. 평범한 문장이다.";
  w.timeline.push({ year: "1990", event: "카이 마루가 맨손으로 적 병기를 쓰러뜨렸다", src: "seed" });
  c.ingestTerms(w, K("한서진"), [{ term: "Type-05", definition: "칭호" }]);
  w.rules = ["병기는 최대 두 기"]; w.userCanon = "- 북해는 중립 해역이다";
  w.worldCheck = { at: 1, items: [{ id: "a", title: "이미 둔 것", status: "kept", docs: [] }] };
  const pr = c.worldCheckPrompt(w);
  for (const s of ["- 한서진 (사건): 북해의 병기 조종사", "「남부 해전」: 이 전투는 냉병기 없이 맨손으로 이긴 최초의 실전이었다.", "| 해저 결투 | 2015년 11월 4일 |", "- Type-05: 칭호", "- 1990: 카이 마루가 맨손으로", "- 병기는 최대 두 기", "- 북해는 중립 해역이다", "## 사용자가 그대로 두기로 한 것", "- 이미 둔 것", '"kind":"repeat, first, unaware 중 하나"'])
    assert(pr.includes(s), "프롬프트에 없음: " + s);
  assert(!pr.includes("평범한 문장이다"), "최초·처음·유일이 없는 문장은 넣지 않는다");
  assert(pr.indexOf("- 해저 결투 (") < pr.indexOf("- 한서진 ("), "쓴 순서대로");
});
test("점검 결과는 있는 문서만 남기고 제안(open)으로 둔다", () => {
  const { w, K } = duelWorld();
  const got = c.parseWorldCheck(w, { findings: [{ kind: "repeat", title: "잠항 병기 반복 침투", docs: ["해저 결투", "없는 문서", "한서진"], detail: "세 나라 앞바다에 같은 병기가 나타났다.", link: "모든 침투는 한 조직의 작전이다.", fix: "서로 언급하게 한다." }, { kind: "이상한", title: "x", docs: [], detail: "y", link: "z" }, { title: "근거 없음", docs: [], detail: "d" }, null] });
  assert.equal(got.length, 2);
  assert.deepEqual(got[0].docs, [K("해저 결투"), K("한서진")]); assert.equal(got[0].status, "open"); assert.equal(got[1].kind, "repeat");
  assert.deepEqual(c.parseWorldCheck(w, {}), []);
});
/* 화면과 흐름에 필요한 것만 가짜로 둔다. AI 호출은 callJson과 wcFixDoc을 가로챈다 */
vm.runInContext([cut("const esc =", "function cyrb53("), cut("const fmtDate =", "/* ---------- 원안 주사위"), "function linkHtml(t) { return `<a>${esc(t)}</a>`; }",
  cut("/* 세계 전체 점검: 버튼을 눌렀을 때만", "/* 용어 정의: 보고"), "Object.assign(globalThis,{worldCheckHtml,wcToggleExtra,runWorldCheck,worldCheckBatch,worldCheckRetryPrompt});"].join("\n"), c);
const wcEnv = (w, calls = []) => {
  const fixed = [], toasts = [];
  Object.assign(c, { renderMain() {}, renderAll() {}, toast: t => toasts.push(t), document: { getElementById: () => null }, Store: { saveWorld: async () => {}, savePage: async () => {} }, errMsg: e => String(e), ERR: { no_sample: "연결 없음" },
    callJson: async (kind, prompt, opts) => {   // 관련 문서 판단과 연결 설정 다듬기는 c.wcJudge, c.wcRefine로, 나머지는 차례대로
      const r = prompt.startsWith("## 관련 문서 판단") ? (c.wcJudge ?? { judgments: [] }) : prompt.startsWith("## 연결 설정 다듬기") ? (c.wcRefine ?? new Error("다듬기 없음")) : calls.shift();
      if (typeof r === "function") return r(prompt, opts); if (r instanceof Error) throw r; return r; },
    wcFixDoc: async (ww, k) => { fixed.push(k); return c.wcFixResult?.[k] || "done"; } });
  c.S.world = w; c.S.sample = true; c.S.view = { name: "canon" }; c.S.wcBusy = null; c.S.wcRun = null; c.S.wcAlts = null; c.S.wcEdit = null; c.wcFixResult = null; c.wcJudge = undefined; c.wcRefine = undefined;
  return { fixed, toasts };
};
const finding = (o = {}) => ({ kind: "repeat", severity: "high", title: "잠항 병기 반복 침투", docs: ["해저 결투"], keywords: [], detail: "여러 해역에 같은 병기가 나타났다.", link: "모든 침투는 한 조직의 작전이다.", undecided: [], alts: [], fix: "서로 언급하게 한다.", ...o });
test("점검 프롬프트에 문서별 확정 사실을 넣고, link는 결정된 문장으로, alts·keywords·severity를 함께 받는다", () => {
  const { w, K } = duelWorld();
  w.entities[K("해저 결투")].facts = [{ t: "두 병기는 북해 기지에서 출격했다", src: K("해저 결투") }, { t: "대체된 사실", src: K("한서진"), sup: { by: "x" } }];
  w.entities[K("한서진")].facts = [{ t: "한서진은 북해 함대 소속이다", src: "user" }];
  const pr = c.worldCheckPrompt(w);
  for (const s of ["## 문서별 확정 사실", "「해저 결투」\n  - 두 병기는 북해 기지에서 출격했다", "  - 한서진은 북해 함대 소속이다 [사용자 확정]", "'A 또는 B'", "충돌하면 안 된다", '"severity":"high 또는 low"', '"keywords":["핵심어"]', '"undecided":[]', '"alts":["'])
    assert(pr.includes(s), "프롬프트에 없음: " + s);
  assert(!pr.includes("대체된 사실"));
  const [x] = c.parseWorldCheck(w, { findings: [finding({ severity: "low", keywords: ["잠항", "잠항", "", "x", "넷째", "다섯째"], alts: ["모든 침투는 한 조직의 작전이다.", "각국 해군의 실험이 새어 나왔다.", "", "셋째", "넷째"] })] });
  assert.equal(x.severity, "low"); assert.deepEqual(x.keywords, ["잠항", "넷째"], "중복·한 글자는 빼고 셋까지 받아 두 글자 이상만");
  assert.deepEqual(x.alts, ["각국 해군의 실험이 새어 나왔다.", "셋째"], "link와 같은 안은 빼고 둘까지");
  assert.equal(c.parseWorldCheck(w, { findings: [finding({ severity: "?" })] })[0].severity, "high");
});
test("핵심어로 걸린 문서는 앞뒤 문장과 함께 판단을 받아, yes만 관련 문서에 넣고 unsure는 체크를 끈 추가 후보로, no는 버린다", async () => {
  const { w, K } = duelWorld(); const asked = [];
  c.S.pages[K("남부 해전")].sections[0].body = "2015년 3월 남부 해역에 경보가 울렸다. 가상 적성 잠항체가 남부 기지 앞에 나타났다. 함대가 출격해 추적했다.";
  c.S.pages[K("한서진")].sections[0].body = "1972년의 일이다. 한서진의 할아버지가 잠항체 사고를 겪었다. 오래된 일이다.";
  c.S.pages[K("북해 함대")] = doc("북해 함대", 4, "북해 함대도 잠항체를 보았다고 한다.");
  wcEnv(w, [{ findings: [finding({ docs: ["해저 결투"], keywords: ["잠항체"] })] }]);
  c.wcJudge = (p, opts) => { asked.push([p, opts.modelTier]); return { judgments: [{ id: "1-1", verdict: "no" }, { id: "1-2", verdict: "yes" }, { id: "1-3", verdict: "unsure" }] }; };
  await c.runWorldCheck();
  assert.equal(asked.length, 1, "한 번에 묻는다"); assert.equal(asked[0][1], "quick");
  const p = asked[0][0];
  assert(p.includes("- 1-2 「남부 해전」\n  > 2015년 3월 남부 해역에 경보가 울렸다. 가상 적성 잠항체가 남부 기지 앞에 나타났다. 함대가 출격해 추적했다."), "핵심어 문장과 앞뒤 문장을 함께 보낸다");
  assert(p.includes("「한서진」") && p.includes("1972년의 일이다.") && p.includes("yes, no, unsure"));
  const [x] = w.worldCheck.items;
  assert.deepEqual(x.docs, [K("해저 결투"), K("남부 해전")], "yes만 관련 문서에");
  assert.deepEqual(x.extra.map(e => [e.k, e.on]), [[K("북해 함대"), false]], "unsure는 체크가 꺼진 추가 후보로, no는 버린다");
  const html = c.worldCheckHtml(w);
  assert(html.includes("추가 후보 1개") && new RegExp(`data-wc-extra="${x.id}" data-wc-doc="${K("북해 함대")}"  >`).test(html), "체크가 꺼진 채 보인다");
  assert(!html.includes(`data-wc-doc="${K("한서진")}"`), "no로 버린 문서는 어디에도 없다");
  w.worldCheck = null; wcEnv(w, [{ findings: [finding({ docs: ["해저 결투"], keywords: ["잠항체"] })] }]); c.wcJudge = new Error("끊김");
  await c.runWorldCheck();
  assert.deepEqual(w.worldCheck.items[0].docs, [K("해저 결투")]); assert.equal(w.worldCheck.items[0].extra.length, 3, "판단을 받지 못하면 모두 체크를 끈 추가 후보로 둔다");
});
test("체크를 끈 추가 후보는 일괄 고치기에서 빠지고, 체크하면 함께 고친다", async () => {
  const { w, K } = duelWorld();
  c.S.pages[K("남부 해전")].sections[0].body = "잠항체가 나타났다.";
  c.S.pages[K("북해 함대")] = doc("북해 함대", 4, "잠항체를 보았다.");
  const env = wcEnv(w, [{ findings: [finding({ docs: ["해저 결투"], keywords: ["잠항체"] }), finding({ title: "둘째", docs: ["한서진"], keywords: ["잠항체"] })] }]);
  c.wcJudge = { judgments: [{ id: "1-1", verdict: "unsure" }, { id: "1-2", verdict: "unsure" }, { id: "2-1", verdict: "unsure" }, { id: "2-2", verdict: "unsure" }] };
  await c.runWorldCheck();
  const [x, y] = w.worldCheck.items;
  await c.worldCheckAction(x.id, "link");
  assert.deepEqual(env.fixed, [K("해저 결투")], "체크하지 않은 추가 후보는 고치지 않는다");
  await c.wcToggleExtra(y.id, K("북해 함대"), true);
  assert.equal(y.extra.find(e => e.k === K("북해 함대")).on, true);
  env.fixed.length = 0;
  await c.worldCheckAction(y.id, "link");
  assert.deepEqual(env.fixed, [K("한서진"), K("북해 함대")], "체크한 추가 후보는 함께 고친다");
});
test("두 번째 호출은 관련 문서의 본문 서술을 보내 link와 alts를 다시 받고, 실패하면 1차 결과를 그대로 쓴다", async () => {
  const { w, K } = duelWorld(); const asked = [];
  c.S.pages[K("해저 결투")].sections[0].body = "2015년 11월이었다. 잠항체는 서해 기지에서 출격했다. 그 뒤 북해로 향했다.";
  c.S.pages[K("한서진")].sections[0].body = "한서진이 쫓은 잠항체는 남부 함대 소속이었다.";
  wcEnv(w, [{ findings: [finding({ docs: ["해저 결투", "한서진"], keywords: ["잠항체"], link: "국제 암시장 무장 조직의 작전이다.", alts: ["1차 대안"] })] }]);
  c.wcRefine = (p, opts) => { asked.push([p, opts.modelTier]); return { findings: [{ n: 1, link: "서해 기지와 남부 함대에 숨어든 한 조직의 작전이며, 일부는 국가 소속으로 오인됐다.", undecided: [], alts: ["2차 대안"] }] }; };
  await c.runWorldCheck();
  assert.equal(asked.length, 1); assert.equal(asked[0][1], "check");
  const p = asked[0][0];
  assert(p.includes("「해저 결투」\n  > 2015년 11월이었다. 잠항체는 서해 기지에서 출격했다. 그 뒤 북해로 향했다.") && p.includes("「한서진」\n  > 한서진이 쫓은 잠항체는 남부 함대 소속이었다."), "관련 문서의 본문 서술이 들어간다");
  assert(p.includes("출처, 소속, 원인과 충돌하지 않게 하라") && p.includes("기존 서술을 살리는 방향") && p.includes("지금 link: 국제 암시장 무장 조직의 작전이다."));
  let [x] = w.worldCheck.items;
  assert(x.link.includes("국가 소속으로 오인됐다")); assert.deepEqual(x.alts, ["2차 대안"]); assert.equal(x.linkBad, false);
  w.worldCheck = null; wcEnv(w, [{ findings: [finding({ docs: ["해저 결투", "한서진"], keywords: ["잠항체"], link: "국제 암시장 무장 조직의 작전이다.", alts: ["1차 대안"] })] }]);
  c.wcRefine = new Error("연결 끊김");
  await c.runWorldCheck();
  [x] = w.worldCheck.items;
  assert.equal(x.link, "국제 암시장 무장 조직의 작전이다."); assert.deepEqual(x.alts, ["1차 대안"]); assert.equal(x.linkBad, false);
  c.wcRefine = { findings: [{ n: 1, link: "", alts: [] }] };
  w.worldCheck = null; wcEnv(w, [{ findings: [finding({ docs: ["해저 결투"], keywords: ["잠항체"] })] }]); c.wcRefine = { findings: [{ n: 1, link: "" }] };
  await c.runWorldCheck(); assert.equal(w.worldCheck.items[0].link, "모든 침투는 한 조직의 작전이다.", "빈 link는 받지 않는다");
});
test("link에 정하지 않은 표현이 오면 그 결과만 다시 받고, 성공하면 정상 결과로 바꾼다", async () => {
  const { w, K } = duelWorld(); const prompts = [];
  c.S.pages[K("남부 해전")].sections[0].body = "남부에서도 잠항 병기가 목격되었다.";
  wcEnv(w, [{ findings: [finding({ link: "국제 테러 세력 또는 군벌 연합의 작전이다.", undecided: ["국제 테러 세력 또는 군벌 연합"], keywords: ["잠항 병기"] }), finding({ title: "멀쩡한 것", docs: ["한서진"], link: "정해진 설정이다." })] },
    p => { prompts.push(p); return { link: "북해 연합 함대의 비밀 작전이다.", undecided: [], alts: ["각국의 실험이 새어 나왔다."] }; }]);
  c.wcJudge = { judgments: [{ id: "1-1", verdict: "yes" }] };
  await c.runWorldCheck();
  assert.equal(prompts.length, 1, "정하지 않은 결과 하나만 다시 받는다");
  assert(prompts[0].includes("## 연결 설정 다시 쓰기") && prompts[0].includes("국제 테러 세력 또는 군벌 연합"));
  const [x, y] = w.worldCheck.items;
  assert.equal(x.link, "북해 연합 함대의 비밀 작전이다."); assert.equal(x.linkBad, false); assert.deepEqual(x.alts, ["각국의 실험이 새어 나왔다."]);
  assert.equal(x.undecided, undefined); assert(x.docs.includes(K("남부 해전")), "다시 받기 전에 판단을 거쳐 문서를 보강한다");
  assert.equal(y.link, "정해진 설정이다."); assert.equal(y.linkBad, false);
  const html = c.worldCheckHtml(w);
  assert(/data-wc-link="[^"]+" >연결하기/.test(html), "[연결하기]가 살아 있다");
});
test("다시 받아도 정하지 않으면 [연결하기]를 막고 [고쳐서 연결]만 열어 둔다", async () => {
  const { w } = duelWorld();
  wcEnv(w, [{ findings: [finding({ link: "A 또는 B의 작전이다.", undecided: ["A 또는 B"] })] }, { link: "C 혹은 D다.", undecided: ["C 혹은 D"] }]);
  await c.runWorldCheck();
  const x = w.worldCheck.items[0];
  assert.equal(x.linkBad, true); assert.equal(x.link, "A 또는 B의 작전이다.");
  let html = c.worldCheckHtml(w);
  assert(new RegExp(`data-wc-link="${x.id}" disabled>연결하기`).test(html)); assert(html.includes(`data-wc-edit="${x.id}"`)); assert(html.includes("정하지 않은 표현이 남아"));
  await c.worldCheckAction(x.id, "link"); assert.equal(x.status, "open", "막힌 [연결하기]는 아무것도 하지 않는다"); assert.equal(w.userCanon, undefined);
  c.S.wcEdit = x.id; html = c.worldCheckHtml(w);
  assert(html.includes(`<textarea id="wcEd-${x.id}"`) && html.includes(">A 또는 B의 작전이다.</textarea>"), "수정 칸에 link를 띄운다");
  const env = wcEnv(w); c.S.world = w;
  await c.worldCheckAction(x.id, "edit", "  A의 작전이다.  ");
  assert.equal(w.userCanon, "- A의 작전이다."); assert.equal(x.status, "linked"); assert.equal(x.linked, "A의 작전이다.");
  assert.equal(env.fixed.length, 1);
  wcEnv(w, [new Error("연결 끊김")]); x.status = "open";
  await c.runWorldCheck(); assert.equal(w.worldCheck.items.length, 1, "점검이 실패하면 기존 결과를 그대로 둔다");
});
test("alts가 비어 있어도 화면이 깨지지 않고, 대안을 고르면 그 안으로 연결한다", async () => {
  const { w } = duelWorld();
  wcEnv(w, [{ findings: [finding({ alts: [] }), finding({ title: "둘째", docs: ["한서진"], alts: ["다른 조직의 짓이다.", "자연 현상이다."] })] }]);
  await c.runWorldCheck();
  const [a, b] = w.worldCheck.items;
  delete a.alts; c.S.wcAlts = a.id;   // 옛 결과처럼 alts가 아예 없어도
  let html = c.worldCheckHtml(w);
  assert(!html.includes(`data-wc-alts="${a.id}"`), "대안이 없으면 [다른 안 보기]를 그리지 않는다"); assert(html.includes(`data-wc-alts="${b.id}"`) && html.includes("다른 안 보기 (2)"));
  c.S.wcAlts = b.id; html = c.worldCheckHtml(w);
  assert(html.includes(`data-wc-alt="${b.id}" data-wc-i="1"`) && html.includes("자연 현상이다."));
  await c.worldCheckAction(b.id, "alt", 1);
  assert.equal(b.status, "linked"); assert.equal(b.linked, "자연 현상이다."); assert(w.userCanon.includes("- 자연 현상이다."));
  await c.worldCheckAction(a.id, "link"); assert.equal(a.linked, "모든 침투는 한 조직의 작전이다."); assert.equal(w.userCanon.split("\n").length, 2);
  await c.worldCheckAction(a.id, "link"); assert.equal(w.userCanon.split("한 조직의 작전").length, 2, "두 번 넣지 않는다");
});
test("중요도 low인 결과는 '사소한 제안 N개'로 접어서 high 아래에 보여 준다", async () => {
  const { w } = duelWorld();
  wcEnv(w, [{ findings: [finding({ severity: "low", title: "표현 차이" }), finding({ title: "큰 흐름", docs: ["한서진"] }), finding({ severity: "low", title: "작은 충돌", docs: ["남부 해전"] })] }]);
  await c.runWorldCheck();
  const html = c.worldCheckHtml(w), at = html.indexOf('<details class="wc-low"');
  assert(at > 0 && html.includes("사소한 제안 2개</summary>"));
  assert(html.indexOf("큰 흐름") < at && html.indexOf("표현 차이") > at && html.indexOf("작은 충돌") > at);
  assert(!/<details class="wc-low"[^>]*open/.test(html), "처음에는 접혀 있다");
  delete w.worldCheck.items[0].severity;   // 옛 결과(중요도 없음)는 high로 본다
  assert(c.worldCheckHtml(w).includes("사소한 제안 1개"));
});
test("연결을 확정하면 관련 문서마다 일괄로 고치고, 사용자가 직접 고친 문서는 건너뛰어 '직접 확인 필요'로 둔다", async () => {
  const { w, K } = duelWorld();
  c.S.pages[K("한서진")].editedAt = 5;
  const env = wcEnv(w, [{ findings: [finding({ docs: ["해저 결투", "한서진", "남부 해전"] }), finding({ title: "[그대로 두기]용", docs: ["카이 마루"], link: "따로 둔 설정이다." })] }]);
  await c.runWorldCheck();
  const [x, y] = w.worldCheck.items;
  c.wcFixResult = { [K("남부 해전")]: "failed" };
  await c.worldCheckAction(x.id, "link");
  assert.deepEqual(env.fixed, [K("해저 결투"), K("남부 해전")], "직접 고친 문서는 고치기를 부르지 않는다");
  assert.deepEqual(x.batch, { done: [K("해저 결투")], none: [], failed: [K("남부 해전")], manual: [K("한서진")] });
  let html = c.worldCheckHtml(w);
  assert(html.includes("직접 확인 필요: 「한서진」") && html.includes("실패한 문서: 「남부 해전」") && html.includes(`data-wc-retry="${x.id}"`));
  assert(html.includes("문서별로 고치기"), "문서별 [고치기]는 펼치기 안에 남긴다");
  c.wcFixResult = null; env.fixed.length = 0;
  await c.worldCheckAction(x.id, "retry");
  assert.deepEqual(env.fixed, [K("남부 해전")], "실패한 문서만 다시 시도한다");
  assert.deepEqual(x.batch.done, [K("해저 결투"), K("남부 해전")]); assert.deepEqual(x.batch.failed, []);
  await c.worldCheckAction(y.id, "keep"); assert.equal(y.status, "kept"); assert.equal(w.userCanon.includes("[그대로 두기]용"), false);
  html = c.worldCheckHtml(w); assert(!html.includes("실패한 문서"));
});
test("일괄 반영은 기존 고치기 흐름을 쓰고, 고치기 흐름은 직접 고친 문서를 거절한다", () => {
  const fix = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "fix.js"), "utf8");
  const body = fix.slice(fix.indexOf("async function wcFixDoc("), fix.indexOf("async function applyFix("));
  for (const s of ["p.editedAt) return \"failed\"", "fixBatchPrompt(w, p, f, [issue])", "parseFixEdits(r, f, 1).slice(0, WC_FIX_EDITS)", "commitFix(w, k, edits)", "await bgSync(k)"]) assert(body.includes(s), "없음: " + s);
  assert(fix.includes("res = commitFix(w, k, v.edits,"), "교정 페이지도 같은 적용 함수를 쓴다");
});
test("다시 점검해도 open 제안은 남고, 같은 문제(kind 같고 관련 문서 절반 이상 겹침)는 하나로 합쳐 '다시 발견됨'으로, 다시 안 나온 것은 '이전 점검'으로 둔다", async () => {
  const { w, K } = duelWorld();
  wcEnv(w, [{ findings: [finding({ title: "여러 해역의 연쇄 침투", docs: ["해저 결투", "한서진"] }), finding({ title: "남부만의 일", docs: ["남부 해전"], link: "남부의 일이다." })] }]);
  await c.runWorldCheck();
  const [a, b] = w.worldCheck.items, firstAt = a.at;
  wcEnv(w, [{ findings: [finding({ title: "다르게 붙인 제목", docs: ["한서진", "남부 해전"], keywords: ["새 핵심어"] }), finding({ kind: "unaware", title: "종류가 다름", docs: ["해저 결투", "한서진"], link: "영향을 받았다." })] }]);
  await c.runWorldCheck();
  const items = w.worldCheck.items;
  assert.equal(items.length, 3, "버리지 않고, 같은 문제는 합쳐 셋");
  assert(items.includes(a) && items.includes(b), "처음 찾은 제안이 그대로 남는다");
  assert.equal(a.seen, "again"); assert.equal(a.title, "여러 해역의 연쇄 침투", "먼저 본 글을 살린다"); assert.equal(a.at, firstAt);
  assert.deepEqual(a.docs, [K("해저 결투"), K("한서진"), K("남부 해전")], "관련 문서는 합집합"); assert(a.keywords.includes("새 핵심어"));
  assert.equal(b.seen, "prev", "이번에 다시 나오지 않은 open은 '이전 점검'");
  const u = items.find(x => x.kind === "unaware"); assert(u && !u.seen, "kind가 다르면 합치지 않는다");
  const html = c.worldCheckHtml(w);
  assert(html.includes("여러 해역의 연쇄 침투</b> <span class=\"src wc-seen\">· 다시 발견됨") && html.includes("남부만의 일</b> <span class=\"src wc-seen\">· 이전 점검"));
  assert(html.includes(`data-wc-close="${b.id}"`) && html.includes(`data-wc-keep="${b.id}"`));
  await c.worldCheckAction(b.id, "close"); assert(!w.worldCheck.items.includes(b), "[닫기]를 눌러야 지운다");
  await c.worldCheckAction(a.id, "keep");
  wcEnv(w, [{ findings: [finding({ title: "또 찾음", docs: ["해저 결투"] })] }]);
  await c.runWorldCheck();
  assert.equal(w.worldCheck.items.filter(x => x.kind === "repeat").length, 1, "그대로 두기로 한 것과 같은 문제는 다시 올리지 않는다");
  assert.equal(c.wcSame({ kind: "repeat", docs: ["a", "b", "c", "d"] }, { kind: "repeat", docs: ["a", "x", "y"] }), false, "절반이 안 겹치면 다른 문제");
  assert.equal(c.wcSame({ kind: "repeat", docs: ["a", "b", "c", "d"] }, { kind: "repeat", docs: ["a", "b", "y"] }), true);
});
test("30개 상한을 넘으면 오래된 low부터 접고, 지우지 않는다", () => {
  const old = Array.from({ length: 30 }, (_, i) => ({ id: "o" + i, kind: "repeat", severity: i < 3 ? "low" : "high", docs: ["d" + i], status: "open", at: 100 + i, title: "t" + i, detail: "x" }));
  old[5].severity = "low"; old[5].at = 1;   // 가장 오래된 low
  const items = c.wcAccumulate(old, [{ id: "n1", kind: "repeat", severity: "high", docs: ["새"], status: "open", at: 999, title: "새것", detail: "x" }, { id: "n2", kind: "repeat", severity: "high", docs: ["새2"], status: "open", at: 999, title: "새것2", detail: "x" }]);
  assert.equal(items.length, 32, "지우지 않는다");
  assert.deepEqual(items.filter(x => x.folded).map(x => x.id).sort(), ["o0", "o5"], "오래된 low 둘을 접는다");
  const w = { title: "t", entities: {}, worldCheck: { at: 1, items } };
  c.S.pages = {}; c.S.wcFocus = null;
  const html = c.worldCheckHtml(w);
  assert(html.includes("접어 둔 오래된 제안 2개</summary>") && html.includes('id="wc-o5"'));
});
test("점검 색인에 문서마다 날짜가 든 본문 문장을 둘까지 넣고, 사건 장부·연표에 이미 있는 것은 뺀다", () => {
  const { w, K } = duelWorld();
  c.S.pages[K("남부 해전")].sections[0].body = "2016년 3월 2일 남부 기지가 경보를 울렸다. 2015년 11월 4일 해저 결투가 멀리서 들렸다. 2017년 1월 9일 잠항체가 남부 해역에 나타났다. 2018년 5월 5일 잠항체가 다시 왔다. 2019년 6월 6일 셋째 침투가 있었다. 날짜 없는 문장이다.";
  w.timeline.push({ year: "2016", month: 3, day: 2, event: "남부 기지 경보", src: K("남부 해전") });
  const pr = c.worldCheckPrompt(w);
  assert(pr.includes("## 문서 속 날짜가 적힌 서술"));
  assert(pr.includes("- 「남부 해전」: 2017년 1월 9일 잠항체가 남부 해역에 나타났다.") && pr.includes("- 「남부 해전」: 2018년 5월 5일 잠항체가 다시 왔다."));
  assert(!pr.includes("2019년 6월 6일"), "문서마다 둘까지");
  assert(!pr.includes("2016년 3월 2일 남부 기지"), "연표에 같은 날짜로 있는 것은 뺀다");
  assert(!pr.includes("2015년 11월 4일 해저 결투가 멀리서"), "사건 장부에 있는 것은 뺀다");
});
test("색인이 너무 크면 문서를 유형별로 나눠 여러 번 부르고, 결과는 같은 규칙으로 합친다", async () => {
  const { w, K } = duelWorld(); const prompts = [];
  c.S.pages[K("한서진")].type = "인물"; c.S.pages[K("해저 결투")].type = "사건"; c.S.pages[K("남부 해전")].type = "사건";
  const size = k => { const ix = c.wcDocIndex(w, k, c.S.pages[k]); return ix.doc.length + ix.facts.length + ix.claims.join("\n").length + ix.dated.join("\n").length + 4; };
  const save = c.WC_LIMIT.index; c.WC_LIMIT.index = size(K("해저 결투")) + size(K("남부 해전"));   // 사건 둘은 한 번에, 인물은 따로
  try {
    const chunks = c.wcChunks(w);
    assert.deepEqual(chunks, [[K("해저 결투"), K("남부 해전")], [K("한서진")]], "유형별로 나눈다");
    assert.deepEqual(c.wcChunks(w, 1e6), [[K("해저 결투"), K("한서진"), K("남부 해전")]], "작으면 한 번에");
    const call = p => { prompts.push(p); return { findings: [finding({ docs: ["해저 결투", "한서진"] })] }; };
    wcEnv(w, chunks.map(() => call));
    await c.runWorldCheck();
  } finally { c.WC_LIMIT.index = save; }
  assert(prompts.length >= 2 && prompts.every(p => p.includes("일부(아래 '문서')만 보낸다")));
  assert(prompts.some(p => p.includes("- 한서진 (인물)") && !p.includes("- 해저 결투 (사건)")), "부를 때마다 그 유형의 문서만");
  assert.equal(w.worldCheck.items.length, 1, "같은 문제는 하나로 합친다");
});
test("kind가 first면 연결 버튼 없이 [그 주장 고치기]만 두고, 주장한 문서 하나만 고치며, 같은 주장은 하나로 합친다", async () => {
  const { w, K } = duelWorld();
  c.S.pages[K("남부 해전")].sections[0].body = "이 전투는 맨손으로 이긴 최초의 실전이었다. 다른 문장이다.";
  const first = (o = {}) => finding({ kind: "first", title: "맨손 최초 주장", docs: ["남부 해전", "해저 결투", "한서진"], link: "법조문처럼 한정된 설정이다.", alts: ["대안"], detail: "1990년에 이미 맨손 승리가 있었다.", fix: "'최초'를 뺀다.", ...o });
  wcEnv(w, [{ findings: [first({ claimDoc: "남부 해전", claim: "이 전투는 맨손으로 이긴 최초의 실전이었다." }), first({ title: "같은 주장 다른 제목" }), first({ title: "다른 문서 주장", claimDoc: "한서진", claim: "한서진이 처음이었다." })] }]);
  await c.runWorldCheck();
  const firsts = w.worldCheck.items;
  assert.equal(firsts.length, 2, "같은 문서의 같은 주장은 하나로");
  const [x] = firsts;
  assert.equal(x.claimDoc, K("남부 해전")); assert.equal(x.link, "", "연결 설정을 만들지 않는다"); assert.deepEqual(x.alts, []);
  assert.equal(c.wcClaimDoc(w, { kind: "first", docs: [K("해저 결투"), K("남부 해전")] }), K("남부 해전"), "응답에 없으면 '최초' 문장이 든 문서를 찾는다");
  const html = c.worldCheckHtml(w), part = html.slice(html.indexOf(`id="wc-${x.id}"`), html.indexOf(`id="wc-${firsts[1].id}"`));
  for (const s of ["data-wc-link=", "data-wc-alts=", "data-wc-edit=", "문서별로 고치기"]) assert(!part.includes(s), "first에 있으면 안 됨: " + s);
  assert(part.includes(`data-wc-claim="${x.id}"`) && part.includes("그 주장 고치기") && part.includes("주장한 문서"));
  const env = wcEnv(w); let ran = 0;
  Object.assign(c, { runFixBatch: () => { ran++; }, window: { scrollTo() {} } });
  await c.worldCheckAction(x.id, "link"); await c.worldCheckAction(x.id, "edit", "아무 문장");
  assert.equal(w.userCanon, undefined, "연결하기는 막힌다"); assert.equal(x.status, "open");
  x.linked = "억지"; x.status = "linked"; await c.worldCheckBatch(w, x); assert.deepEqual(env.fixed, [], "일괄 반영하지 않는다");
  delete x.linked; x.status = "open";
  await c.worldCheckAction(x.id, "claim");
  assert.equal(ran, 1); assert.equal(c.S.fixv.key, K("남부 해전"), "주장한 문서 하나만 고친다"); assert.equal(c.S.fixv.items.length, 1);
  assert(c.S.fixv.items[0].claim.includes("맨손으로 이긴 최초의 실전") && c.S.fixv.items[0].conflict.includes("범위를 좁히거나"));
  assert.deepEqual(env.fixed, []); assert.equal(w.userCanon, undefined, "사용자 확정 설정에 넣지 않는다"); assert.equal(x.status, "fix");
  c.S.fixv = null; c.S.view = { name: "canon" };
});
test("일괄 반영 중 [멈추기]를 누르면 남은 문서는 고치지 않고, 이미 고친 문서 목록을 보여 준다", async () => {
  const { w, K } = duelWorld();
  const env = wcEnv(w, [{ findings: [finding({ docs: ["해저 결투", "한서진", "남부 해전"] })] }]);
  await c.runWorldCheck();
  const [x] = w.worldCheck.items;
  c.wcFixDoc = async (ww, k) => { env.fixed.push(k); if (env.fixed.length === 1) { assert(c.worldCheckHtml(w).includes(`data-wc-stop="${x.id}"`), "반영 중에는 [멈추기]가 보인다"); c.wcStopBatch(x.id); } return "done"; };
  await c.worldCheckAction(x.id, "link");
  assert.deepEqual(env.fixed, [K("해저 결투")], "멈춘 뒤 남은 문서는 건드리지 않는다");
  assert.deepEqual(x.batch.done, [K("해저 결투")]); assert.deepEqual(x.batch.left, [K("한서진"), K("남부 해전")]); assert.equal(x.batch.stopped, true);
  assert(env.toasts.at(-1).includes("고친 문서: 「해저 결투」"));
  const html = c.worldCheckHtml(w);
  assert(html.includes("반영을 멈췄습니다. 고친 문서: 「해저 결투」") && html.includes(`data-wc-resume="${x.id}"`) && !html.includes("data-wc-stop="));
  env.fixed.length = 0; c.wcFixDoc = async (ww, k) => { env.fixed.push(k); return "done"; };
  await c.worldCheckAction(x.id, "resume");
  assert.deepEqual(env.fixed, [K("한서진"), K("남부 해전")]); assert.equal(x.batch.stopped, undefined); assert.equal(x.batch.done.length, 3);
});
test("세계 전체 점검은 버튼으로만 돈다", () => {
  assert(html.includes('case "world-check": runWorldCheck(); break;'));
  assert.equal((html.match(/runWorldCheck\(/g) || []).length, 2, "정의 하나와 버튼 처리 하나뿐");
});

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log(`  ✓ ${++n}. ${name}`); }
  console.log(`\n모두 통과 (${n}개). AI 호출 0회.`);
})().catch(e => { console.error(e); process.exit(1); });
