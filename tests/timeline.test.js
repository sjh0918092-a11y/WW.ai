/* 연표 날짜 확정·정렬: 월·일 받기, 다시 묻기, 사건 장부와 날짜 대조, 기년법을 아는 정렬. AI 호출은 가짜 응답으로 */
const vm = require("vm"), assert = require("assert");
const { appSource } = require("./helpers/app");
const html = appSource();
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert(i >= 0 && j > i, "구간을 찾지 못함: " + a); return html.slice(i, j); };
const c = { S: { pages: {}, world: null, sample: true, view: { name: "x" } }, console };
c.kOf = (w, t) => { t = c.norm(t); return Object.keys(w.entities).find(k => w.entities[k].title === t) || c.keyOf(t); };
vm.createContext(c);
vm.runInContext([
  cut("function cyrb53(", "const isBroken"), cut("const stripMarks =", "const withTimeout"),
  cut("const CAL_NOT =", "const sameYear ="),
  cut("const yearNum =", "/* 사실과 언급의 상태"), "const live = x => !x.sup;",
  cut("const TIMELINE_PROMPT_N =", "/* 검사의 기준:"), cut("const refOK =", "/* 검사할 문서(focus)"), "const chOf = () => 0; function pickRelevant(w, s, items, f, n) { return items.slice(-n); }",
  cut("const sentencesOf =", "/* 인포박스에서"), cut("function pageTexts(p)", "/* 이름이 목적어"),
  cut("const namesOf =", "function checkBrief"),
  require("fs").readFileSync(require("path").join(__dirname, "..", "js", "ledger.js"), "utf8").replace('"use strict";', ""),
  "Object.assign(globalThis,{norm,keyOf,addTimeline,normTimelineYear,dedupeTimeline,sameTimelineOccurrence,acceptTimeline,timelineOrder,sortTimeline,tlWhen,tlMD,tlYear,promptTimeline,canonBlock,askTimelineDates,afterTimeline,timelineIssues,ingestEvents,acceptPageTimeline,worldCheckPrompt,TL_DATE_SPEC});"
].join("\n"), c);
let n = 0; const tests = []; const test = (name, fn) => tests.push([name, fn]);
const world = (extra = {}) => { const w = { title: "시험 세계", era: "2016년", seed: "원안", rules: [], entities: {}, timeline: [], ...extra }; c.S.world = w; c.S.pages = {}; return w; };
const order = w => w.timeline.map(t => c.tlWhen(t) + " " + t.event);

test("같은 해의 항목은 월 → 일 순서로 정렬된다", () => {
  const w = world();
  c.addTimeline(w, { year: "2016", month: 9, day: 22, event: "가을 침투" }, "seed");
  c.addTimeline(w, { year: "2016", month: "4", day: "17", event: "봄 침투" }, "seed");
  c.addTimeline(w, { year: "2016", month: 3, day: 14, event: "첫 침투" }, "seed");
  c.addTimeline(w, { year: "2015", month: 12, day: 1, event: "전해" }, "seed");
  assert.deepEqual(order(w), ["2015년 12월 1일 전해", "2016년 3월 14일 첫 침투", "2016년 4월 17일 봄 침투", "2016년 9월 22일 가을 침투"]);
  assert.deepEqual([w.timeline[1].month, w.timeline[1].day], [3, 14], "월·일은 숫자로 저장한다");
  assert(w.timeline.every(t => !t.dateAsk));
});
test("날짜가 없는 기존 항목은 그 해의 끝에 넣은 순서대로 온다", () => {
  const w = world();
  w.timeline = [{ year: "2016", event: "옛 항목 가", src: "seed" }, { year: "2016", event: "옛 항목 나", src: "seed" }, { year: "2017", event: "다음 해", src: "seed" }];
  c.addTimeline(w, { year: "2016", month: 5, day: 1, event: "새 항목" }, "p1");
  assert.deepEqual(w.timeline.map(t => t.event), ["새 항목", "옛 항목 가", "옛 항목 나", "다음 해"]);
  assert.equal(w.timeline[1].dateAsk, undefined, "옛 항목에는 날짜를 묻지 않는다");
  assert.equal(c.tlWhen(w.timeline[1]), "2016", "날짜가 없으면 지금처럼 보인다");
});
test("기원전은 서기보다 앞에 오고, 연호와 서기는 서로 비교하지 않는다", () => {
  const w = world({ calendars: ["건안"] });
  w.timeline = [{ year: "건안 13", event: "적벽", src: "seed" }, { year: "208", event: "서기 208년의 일", src: "seed" }, { year: "건안 5", event: "관도", src: "seed" },
    { year: "기원전 202", event: "해하", src: "seed" }, { year: "1990", event: "현대", src: "seed" }, { year: "연도 모름", event: "모름", src: "seed" }];
  assert.equal(c.sortTimeline(w), true);
  assert.deepEqual(w.timeline.map(t => t.event), ["관도", "적벽", "해하", "서기 208년의 일", "현대", "모름"], "연호 묶음이 먼저 들어왔으니 먼저, 묶음 안에서만 비교");
  assert.deepEqual(c.tlYear(w, "건안 13"), { y: 13, cal: "건안" }); assert.deepEqual(c.tlYear(w, "기원전 202"), { y: -202, cal: "" });
  assert.equal(c.sortTimeline(w), false, "다시 정렬해도 그대로");
});
test("정렬 뒤에도 항목 수와 내용은 그대로다", () => {
  const w = world();
  const items = [{ year: "2016", month: 9, day: 22, event: "가", src: "a", k: "x" }, { year: "2010", event: "나", src: "b", sup: { by: "c" } }, { year: "2016", month: 3, day: 14, event: "다", src: "seed" }, { year: "2016", event: "라", src: "d", ch: 2 }];
  w.timeline = JSON.parse(JSON.stringify(items));
  c.sortTimeline(w);
  assert.equal(w.timeline.length, items.length);
  const key = t => JSON.stringify(t);
  assert.deepEqual(w.timeline.map(key).sort(), items.map(key).sort());
  assert.deepEqual(w.timeline.map(t => t.event), ["나", "다", "가", "라"]);
});
test("month나 day가 비거나 범위를 벗어나면 그 항목만 다시 묻고, 받으면 날짜를 넣는다", async () => {
  const w = world(); const prompts = [];
  w.events = [{ k: "e1", name: "해저 결투", date: "2016년 4월 17일", place: "북해", nums: [], parts: [], result: "", src: "p0" }];
  c.addTimeline(w, { year: "2016", month: "", day: "", event: "해저 결투가 벌어졌다" }, "p1");
  c.addTimeline(w, { year: "2016", month: 2, day: 30, event: "없는 날" }, "p1");
  c.addTimeline(w, { year: "2016", month: 1, day: 2, event: "멀쩡한 날" }, "p1");
  assert.deepEqual(w.timeline.map(t => !!t.dateAsk), [false, true, true], "날짜가 없는 새 항목은 그 해 끝에서 다시 묻기를 기다린다");
  c.callJson = async (kind, prompt, opts) => { prompts.push([kind, prompt, opts.modelTier]); return { dates: [{ i: 1, month: 4, day: 17 }, { i: 2, month: 13, day: 1 }] }; };
  assert.equal(await c.askTimelineDates(w), 1);
  assert.equal(prompts.length, 1); assert.equal(prompts[0][0], "timelineDate"); assert.equal(prompts[0][2], "quick");
  assert(prompts[0][1].includes("1. 2016: 해저 결투가 벌어졌다") && prompts[0][1].includes("사건 장부: 「해저 결투」 2016년 4월 17일"), "사건 장부의 날짜를 함께 보낸다");
  assert(!prompts[0][1].includes("멀쩡한 날"), "날짜가 있는 항목은 묻지 않는다");
  assert.deepEqual(order(w), ["2016년 1월 2일 멀쩡한 날", "2016년 4월 17일 해저 결투가 벌어졌다", "2016 없는 날"], "다시 받아도 틀린 항목은 날짜 없이 둔다");
  assert(w.timeline.every(t => !t.dateAsk), "한 번만 다시 묻는다");
  assert.equal(await c.askTimelineDates(w), 0); assert.equal(prompts.length, 1);
});
test("다시 묻기가 실패해도 항목은 날짜 없이 남는다", async () => {
  const w = world();
  c.addTimeline(w, { year: "2016", event: "날짜 없는 사건" }, "p1");
  c.callJson = async () => { throw new Error("연결 끊김"); };
  assert.equal(await c.askTimelineDates(w), -1);
  assert.equal(w.timeline.length, 1); assert.equal(w.timeline[0].month, undefined); assert.equal(w.timeline[0].dateAsk, undefined);
  const w2 = world(); c.addTimeline(w2, { year: "2016", event: "연결 없음" }, "p1"); c.S.sample = null;
  assert.equal(await c.askTimelineDates(w2), 0); assert.equal(w2.timeline[0].dateAsk, 1, "AI 연결이 없으면 나중에 묻도록 남긴다"); c.S.sample = true;
});
test("월·일이 없는 기년법의 연도는 날짜를 묻지 않는다", () => {
  const w = world({ calendars: ["성력"], undatedCalendars: ["성력"] });
  c.addTimeline(w, { year: "성력 312", event: "달 없는 세계의 일" }, "seed");
  c.addTimeline(w, { year: "서기 2016", event: "서기의 일" }, "seed");
  assert.equal(w.timeline.find(t => t.event === "달 없는 세계의 일").dateAsk, undefined);
  assert.equal(w.timeline.find(t => t.event === "서기의 일").dateAsk, 1);
});
test("단일 기년법은 기존 접두어를 보충하고 년 접미어를 맞추며 다른 기년법은 보존한다", () => {
  const w = world({ calendars: ['서임력'] });
  assert.equal(c.normTimelineYear(w, '940'), '940', '기존 접두어가 없으면 추정하지 않는다');
  c.addTimeline(w, { year: '서임력 755년', month: 11, day: 14, event: '기준 사건' }, 'seed');
  assert.equal(w.timeline[0].year, '서임력 755');
  for (const year of ['940', '940년', '서임력 940', '서임력 940년']) assert.equal(c.normTimelineYear(w, year), '서임력 940');
  for (const year of ['서기 2016년', '기원전 202', '건안 13년', '서임력 940~941', '940년 무렵']) assert.equal(c.normTimelineYear(w, year), year);
  for (const calendars of [[], ['서임력','건안']]) {
    const other = world({ calendars, timeline: [{ year: '서임력 755년' }] });
    for (const year of ['755', '755년', '서임력 755년', '2016']) assert.equal(c.normTimelineYear(other, year), year);
    c.dedupeTimeline(other); assert.equal(other.timeline[0].year, '서임력 755년');
  }
  const legacy = world(); assert.equal(c.normTimelineYear(legacy, '2016년'), '2016년');
});
test("새 문서 연표도 정규화한 연도로 등록하고 주어 기록을 유지한다", () => {
  const w = world({ calendars: ['서임력'], timeline: [{ year:'서임력 755', event:'기준 사건', src:'seed' }] });
  assert(c.acceptTimeline(w, {year:'940년', month:12, day:3, about:'지크프리트 바이스', event:'지크프리트 바이스가 암살되다.'}, 'p1'));
  const t = w.timeline.find(t => t.src === 'p1');
  assert.equal(t.year,'서임력 940'); assert.equal(t.about,'지크프리트 바이스');
  assert(!c.acceptTimeline(w, {...t,year:'940'},'p2'));
});
test("제공된 사건 쌍 가·나는 연도가 같아져도 기존 발생 판정으로는 각각 두 건이 남는다", () => {
  const fixtures = require('./fixtures/timeline-succession.json');
  for (const pair of fixtures) {
    const w = world({calendars:['서임력'],timelineDedupeV:2});
    for (const t of pair) c.addTimeline(w, t, t.src);
    assert.equal(w.timeline.length,2); assert.equal(w.timeline[0].year,w.timeline[1].year);
    assert.equal(c.sameTimelineOccurrence(w,...w.timeline),false);
    assert(c.dedupeTimeline(w)); assert.equal(w.timeline.length,2); assert.equal(w.timelineDedupeV,3);
    assert.equal(c.dedupeTimeline(w),false);
    const old = world({calendars:['서임력'],timeline:JSON.parse(JSON.stringify(pair)),timelineDedupeV:2});
    c.dedupeTimeline(old); assert.equal(old.timeline[0].year,old.timeline[1].year); assert.equal(old.timeline.length,2);
    console.log(`    진단: ${pair[0].year} 사건 쌍은 동일 날짜이나 기존 발생 판정에 해당하지 않아 2건 유지`);
  }
});
test("연표 날짜가 사건 장부의 같은 사건 날짜와 다르면 지적한다", () => {
  const w = world();
  w.entities = { [c.keyOf("해저 결투")]: { title: "해저 결투", facts: [], mentions: [] } };
  c.S.pages = { p0: { title: "먼저 쓴 문서", createdAt: 1, sections: [] }, p1: { title: "나중 문서", createdAt: 2, sections: [{ body: "본문" }] } };
  w.events = [{ k: c.keyOf("해저 결투"), name: "해저 결투", date: "2016년 4월 17일", place: "북해", nums: [], parts: [], result: "", src: "p0" }];
  c.addTimeline(w, { year: "2016", month: 9, day: 22, event: "해저 결투가 벌어졌다" }, "p1");
  c.addTimeline(w, { year: "2016", month: 4, day: 17, event: "해저 결투의 여파" }, "p1");
  const got = c.timelineIssues(w, "p1");
  assert.equal(got.length, 1);
  assert(got[0].claim.includes("2016년 9월 22일 해저 결투가 벌어졌다")); assert(got[0].conflict.includes("· 사건 장부:") && got[0].conflict.includes("4월 17일"));
  c.S.pages.p1.editedAt = 5; assert.deepEqual(c.timelineIssues(w, "p1"), [], "직접 고친 문서는 기준이다");
});
test("프롬프트와 점검에도 날짜를 보여 주고, 같은 정렬 기준을 쓴다", () => {
  const w = world();
  w.timeline = [{ year: "2016", month: 9, day: 22, event: "가을", src: "seed" }, { year: "2016", month: 3, day: 14, event: "봄", src: "seed" }];
  const cb = c.canonBlock(w);
  assert(cb.indexOf("- 2016년 3월 14일: 봄") >= 0 && cb.indexOf("- 2016년 3월 14일: 봄") < cb.indexOf("- 2016년 9월 22일: 가을"), "고른 결과도 날짜순으로 낸다");
  const wc = c.worldCheckPrompt(w); assert(wc.indexOf("- 2016년 3월 14일: 봄") < wc.indexOf("- 2016년 9월 22일: 가을"));
  assert(c.TL_DATE_SPEC.includes("월과 일까지 정한다") && c.TL_DATE_SPEC.includes("'무렵'"));
  const fs = require("fs"), path = require("path"), src = f => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
  assert(src("story-view.js").includes("${timelineOrder(w.timeline, w).map(t => `<tr><td>${esc(tlWhen(t))}</td>"), "설정 노트 연표 표");
  for (const f of ["prompts.js", "edit-source.js", "story-model.js"]) {
    const s = src(f); assert(!/"timeline":\[\{"year":"[^"]*","(?!month)/.test(s), f + "에 월·일 없는 연표 형식이 남았다");
  }
  assert(src("prompts.js").includes('"undatedCalendars"') && src("actions.js").includes("if (sortTimeline(w))"));
  assert(!/w\.timeline = w\.timeline\.map\(\(x, i\) => \[x, i\]\)\.sort/.test(src("state.js")), "옛 정렬 코드가 남았다");
});

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log(`  ✓ ${++n}. ${name}`); }
  console.log(`\n모두 통과 (${n}개). AI 호출 0회.`);
})().catch(e => { console.error(e); process.exit(1); });
