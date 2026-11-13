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
  cut("const refOK =", "/* 검사할 문서(focus)"), "const chOf = () => 0;",
  cut("const sentencesOf =", "/* 인포박스에서"), cut("function pageTexts(p)", "/* 이름이 목적어"),
  cut("const namesOf =", "function checkBrief"),
  require("fs").readFileSync(require("path").join(__dirname, "..", "js", "ledger.js"), "utf8").replace('"use strict";', ""),
  "Object.assign(globalThis,{normEvent,ingestEvents,eventIssues,eventCandidates,eventBlock,eventCheckBlock,addFact,addMention,compactFacts,promptFacts,promptMentions,FACT_CAP,MENTION_CAP,addTimeline,acceptTimeline,acceptPageTimeline,timelineSubject,keyOf,norm,stripMarks});"
].join("\n"), c);
let n = 0; const test = (name, fn) => { fn(); console.log(`  ✓ ${++n}. ${name}`); };
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
  assert(html.includes('["사건 장부", (w, k) => eventIssues(w, k)]'));
  assert(html.includes("나이 규칙|사건 장부"));
  assert((html.match(/\$\{EVENTS_JSON\}/g) || []).length >= 3, "문서 작성, 확정 사실 정리, 수정본 분석");
  assert(html.includes("ingestEvents(w, key, out.events)")); assert(html.includes("${eventBlock(w, key, rel)}")); assert(html.includes("${eventCheckBlock(w, key, ok)}"));
  assert(html.includes("if (w.events) w.events = w.events.filter(x => x.src !== key);"), "문서를 지우거나 다시 쓰면 그 문서의 기록을 걷어 낸다");
});

console.log(`\n모두 통과 (${n}개). AI 호출 0회.`);
