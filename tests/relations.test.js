/* 인물 관계 중복 정리: type·since, same/next 응답, 같은 type 합치기, 카드의 국면 표시, 옛 관계 옮기기. AI 호출은 가짜 응답으로 */
const vm = require("vm"), assert = require("assert");
const { appSource } = require("./helpers/app");
const html = appSource();
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert(i >= 0 && j > i, "구간을 찾지 못함: " + a); return html.slice(i, j); };
const c = { S: { pages: {}, world: null, sample: true }, console };
vm.createContext(c);
vm.runInContext([
  cut("const esc =", "function cyrb53("), cut("function cyrb53(", "const isBroken"), cut("const stripMarks =", "const withTimeout"),
  cut("const yearNum =", "function addTimeline"), "const live = x => !x.sup;",
  "const kOf = (w, t) => { t = norm(t); return Object.keys(w.entities).find(k => w.entities[k].title === t) || keyOf(t); };",
  "const srcTitle = (w, src, d) => src === 'user' ? '사용자 설정' : (w.entities[src]?.title || d);",
  "function linkHtml(t) { return `<a>${esc(t)}</a>`; }",
  cut("/* 인물 관계: {id, a, b", "function purge(w, key)"),
  cut("/* 인물 관계 카드에 그릴 칩", "function editHtml(k)"),
  "Object.assign(globalThis,{keyOf,addRelation,dedupeRelations,ensureRelIds,relChips,relCardsHtml,relRefLines,migrateRelations,relMigrateGroups,REL_SPEC,REL_JSON});"
].join("\n"), c);

let n = 0; const tests = []; const test = (name, fn) => tests.push([name, fn]);
const K = t => c.keyOf(t);
const world = () => {
  const w = { title: "시험 세계", entities: {}, relations: [] };
  for (const t of ["한서진", "카이 마루", "류도윤", "문서A", "문서B", "문서C"]) w.entities[K(t)] = { title: t, facts: [], mentions: [] };
  c.S.pages = { [K("문서A")]: { title: "문서A", createdAt: 1 }, [K("문서B")]: { title: "문서B", createdAt: 2 }, [K("문서C")]: { title: "문서C", createdAt: 3, editedAt: 9 } };
  c.S.world = w; return w;
};
const pair = w => w.relations.filter(x => [x.a, x.b].sort().join() === [K("한서진"), K("카이 마루")].sort().join());
const chipText = html => [...html.matchAll(/<span class="(rel-t src|rel-k|src)">([^<]*)<\/span>/g)].filter(m => m[1] !== "src" || /^[→·]$/.test(m[2])).map(m => m[2]).join(" ");

test("같은 쌍에서 type이 같은 관계는 rel 말이 달라도 하나로 합치고, 비어 있는 story와 since를 채운다", () => {
  const w = world();
  c.addRelation(w, K("문서A"), { a: "한서진", b: "카이 마루", type: "적대", rel: "대치 상대", story: "" });
  c.addRelation(w, K("문서B"), { a: "카이 마루", b: "한서진", type: "적대", since: "1962년", rel: "적성 대치 상대", story: "북해에서 처음 맞붙었다." });
  c.addRelation(w, K("문서B"), { a: "한서진", b: "카이 마루", type: "동료", rel: "전우회 교류", story: "" });
  const xs = pair(w);
  assert.equal(xs.length, 2, "적대 둘은 하나로, 동료는 따로");
  assert.equal(xs[0].rel, "대치 상대"); assert.equal(xs[0].story, "북해에서 처음 맞붙었다."); assert.equal(xs[0].since, "1962년");
  assert(xs.every(x => Number.isInteger(x.id)) && xs[0].id !== xs[1].id);
  c.addRelation(w, K("문서A"), { a: "한서진", b: "카이 마루", type: "이상한 값", rel: "x" });
  assert.equal(pair(w).length, 3, "type을 알 수 없으면 옛 방식(rel 글자)으로만 거른다");
});
test("이미 쌓인 같은 type 중복은 사용자가 직접 고친 문서의 것, 먼저 생긴 것 순으로 남긴다", () => {
  const w = world();
  w.relations = [
    { a: K("한서진"), b: K("카이 마루"), type: "사제", rel: "선대 및 후대 전략체", story: "", src: K("문서A") },
    { a: K("카이 마루"), b: K("한서진"), type: "사제", since: "1990", rel: "선후배", story: "같은 부대에서 만났다.", src: K("문서B") },
    { a: K("한서진"), b: K("카이 마루"), type: "사제", rel: "전략체 선후배", story: "", src: K("문서C") },
    { a: K("한서진"), b: K("류도윤"), rel: "동료", story: "", src: K("문서A") },
    { a: K("한서진"), b: K("류도윤"), rel: "동 료", story: "같은 함대", src: K("문서B") }];
  assert.equal(c.dedupeRelations(w), 3);
  const [x] = pair(w);
  assert.equal(x.src, K("문서C"), "직접 고친 문서의 기록을 남긴다"); assert.equal(x.rel, "전략체 선후배");
  assert.equal(x.since, "1990"); assert.equal(x.story, "같은 부대에서 만났다.", "비어 있는 칸은 합쳐지는 기록에서 채운다");
  const old = w.relations.find(y => y.b === K("류도윤")); assert.equal(old.rel, "동료"); assert.equal(old.story, "같은 함대", "type 없는 옛 기록은 예전 규칙(글자 비교)대로");
  assert.equal(c.dedupeRelations(w), 0);
});
test('"same" 응답은 새 기록을 만들지 않고, 기존 story가 비어 있을 때만 채운다', () => {
  const w = world();
  c.addRelation(w, K("문서A"), { a: "한서진", b: "카이 마루", type: "맞수", rel: "맞수", story: "" });
  c.addRelation(w, K("문서A"), { a: "한서진", b: "류도윤", type: "동료", rel: "동료", story: "원래 설명" });
  const [m, d] = w.relations;
  c.addRelation(w, K("문서B"), { same: m.id, story: "훈련소 시절부터 겨뤘다." });
  c.addRelation(w, K("문서B"), { same: String(d.id), story: "다른 설명" });
  c.addRelation(w, K("문서B"), { same: 999 });
  assert.equal(w.relations.length, 2);
  assert.equal(m.story, "훈련소 시절부터 겨뤘다."); assert.equal(d.story, "원래 설명", "있는 설명은 바꾸지 않는다");
});
test('"next" 응답은 국면으로 이어지고, 카드는 type이 바뀐 곳에만 →를 그린다', () => {
  const w = world();
  c.addRelation(w, K("문서A"), { a: "한서진", b: "카이 마루", type: "적대", since: "1962", rel: "적대적 대치", story: "" });
  const first = w.relations[0];
  c.addRelation(w, K("문서B"), { next: first.id, type: "적대", rel: "적성 대치 상대", story: "더 격해졌다." });
  assert.equal(pair(w).length, 1, "type이 같은 next는 새 국면이 아니다"); assert.equal(first.story, "더 격해졌다.");
  c.addRelation(w, K("문서B"), { next: first.id, type: "동료", since: "1990", rel: "전우회 교류", story: "퇴역 후 함께 일했다." });
  const second = pair(w)[1];
  assert.equal(second.prev, first.id); assert.equal(second.a, first.a); assert.equal(second.type, "동료");
  c.addRelation(w, K("문서A"), { a: "카이 마루", b: "한서진", type: "적대", rel: "적대 관계" });   // 같은 관계를 다른 말로 새로 넣으려 해도
  c.addRelation(w, K("문서A"), { a: "한서진", b: "카이 마루", type: "동료", rel: "동료" });
  assert.equal(pair(w).length, 2);
  c.addRelation(w, K("문서C"), { next: second.id, type: "적대", since: "2001", rel: "다시 적", story: "" });
  assert.equal(pair(w).length, 3, "다시 적대가 된 국면은 처음 적대와 따로 둔다");
  assert.equal(c.dedupeRelations(w), 0, "국면은 중복으로 합치지 않는다");
  const card = c.relCardsHtml(w, K("한서진"));
  assert.equal(chipText(card.slice(card.indexOf("카이 마루"))), "적대 1962 적대적 대치 → 동료 1990 전우회 교류 → 적대 2001 다시 적");
  assert.equal((card.match(/<li/g) || []).length, 1, "쌍마다 카드 한 장");
  c.addRelation(w, K("문서A"), { a: "한서진", b: "카이 마루", type: "연인", rel: "연인" });
  assert(chipText(c.relCardsHtml(w, K("한서진"))).endsWith("→ 적대 2001 다시 적 · 연인 연인"), "이어지지 않은 관계 사이에는 →를 그리지 않는다");
  c.addRelation(w, K("문서B"), { next: 12345, type: "동료", rel: "x" }); c.addRelation(w, K("문서B"), { a: "한서진", b: "한서진", type: "동료", rel: "x" });
  assert.equal(pair(w).length, 4, "없는 번호, 같은 사람끼리는 받지 않는다");
});
test("같은 type의 기록이 화면에 여럿 있으면 가장 최근 rel 하나만 칩으로 보인다", () => {
  const w = world();
  w.relations = [
    { id: 1, a: K("한서진"), b: K("카이 마루"), type: "사제", rel: "선대 및 후대 전략체", src: K("문서A") },
    { id: 2, a: K("한서진"), b: K("카이 마루"), type: "사제", rel: "전략체 선후배", src: K("문서B") }];
  assert.deepEqual(c.relChips(w.relations).map(x => [x.type, x.rel, x.arrow]), [["사제", "전략체 선후배", false]]);
});
test("type이 없는 옛 관계도 깨지지 않고, 같은 쌍의 rel은 최신 하나로 줄여 보인다", () => {
  const w = world();
  w.relations = [
    { a: K("한서진"), b: K("카이 마루"), rel: "대치 상대 및 퇴역 후 교류 관계", story: "오래된 설명", src: K("문서A") },
    { a: K("카이 마루"), b: K("한서진"), rel: "적대적 대치 및 전우회 교류", story: "", src: K("문서B") },
    { a: K("한서진"), b: K("류도윤"), rel: "동료", story: "", src: K("문서A") }];
  c.dedupeRelations(w);
  assert(w.relations.every(x => Number.isInteger(x.id)), "옛 관계에 번호를 붙인다"); assert.equal(w.relSeq, 3);
  const card = c.relCardsHtml(w, K("한서진"));
  assert(!card.includes("→")); assert(card.includes(">적대적 대치 및 전우회 교류<") && !card.includes(">대치 상대 및 퇴역 후 교류 관계<"));
  assert(card.includes(">동료<") && card.includes("오래된 설명"));
  const lines = c.relRefLines(w, [K("한서진"), K("카이 마루")], K("문서B"), K("한서진"));
  assert.deepEqual(lines.map(l => l.slice(0, 3)), ["#1 "], "이 문서가 낸 관계는 빼고 번호와 함께 보여 준다");
  assert(c.REL_SPEC.includes('{"same": n}') && c.REL_SPEC.includes('{"next": n') && c.REL_SPEC.includes("같은 관계를 다른 말로 바꿔 새 관계로 넣지 않는다"));
});
test("번호가 겹친 기록(복사된 관계)도 새 번호를 받아 멈추지 않고 합쳐진다", () => {
  const w = world();
  const r0 = { id: 7, a: K("한서진"), b: K("카이 마루"), type: "사제", rel: "스승과 제자", story: "처음", src: K("문서A") };
  w.relations = [r0, { ...r0, src: K("문서B"), story: "" }, { ...r0, a: r0.b, b: r0.a, src: K("문서C"), story: "" }];
  assert.equal(c.dedupeRelations(w), 2); assert.equal(w.relations.length, 1); assert.equal(w.relations[0].src, K("문서C"), "직접 고친 문서의 것을 남긴다");
  assert.equal(w.relations[0].story, "처음");
});
test("옛 관계 옮기기는 같은 쌍에 둘 이상인 것만 한 번 돌고, 사용자가 직접 고친 문서의 관계는 바꾸지 않는다", async () => {
  const w = world(), prompts = [];
  w.relations = [
    { a: K("한서진"), b: K("카이 마루"), rel: "대치 상대 및 퇴역 후 교류 관계", story: "", src: K("문서A") },
    { a: K("카이 마루"), b: K("한서진"), rel: "적성 대치 상대", story: "1962년부터 맞섰다.", src: K("문서B") },
    { a: K("한서진"), b: K("카이 마루"), rel: "적대적 대치", story: "", src: K("문서C") },
    { a: K("한서진"), b: K("카이 마루"), rel: "적대적 대치 및 전우회 교류", story: "1990년 전우회에서 화해했다.", src: K("문서A") },
    { a: K("한서진"), b: K("류도윤"), rel: "동료", story: "", src: K("문서A") }];
  c.ensureRelIds(w);
  const fixedBefore = JSON.stringify(w.relations[2]);
  c.callJson = async (kind, prompt) => { prompts.push([kind, prompt]); return { relations: [
    { id: 1, type: "적대", since: "1962", order: 1 }, { id: 2, type: "적대", since: "1962", order: 1 }, { id: 3, type: "동료", order: 2 }, { id: 4, type: "동료", since: "1990", order: 2 }] }; };
  assert.equal(await c.migrateRelations(w), true);
  assert.equal(prompts.length, 1); assert.equal(prompts[0][0], "relMigrate");
  assert(prompts[0][1].includes("#4 적대적 대치 및 전우회 교류") && !prompts[0][1].includes("「류도윤」"), "관계가 하나뿐인 쌍은 보내지 않는다");
  assert.equal(w.relMigrated, 1);
  const xs = pair(w);
  assert.equal(JSON.stringify(xs.find(x => x.id === 3)), fixedBefore, "직접 고친 문서의 관계는 그대로");
  assert.deepEqual(xs.filter(x => x.type).map(x => [x.id, x.type, x.since || "", x.prev || 0]), [[1, "적대", "1962", 0], [4, "동료", "1990", 1]], "같은 type은 합치고, 바뀐 type은 앞 국면을 잇는다");
  assert.equal(xs.find(x => x.id === 1).story, "1962년부터 맞섰다.");
  assert.equal(w.relations.find(x => x.b === K("류도윤")).type, undefined, "하나뿐인 관계는 그대로");
  assert.equal(chipText(c.relCardsHtml(w, K("한서진")).split("<li")[1]), "적대적 대치 · 적대 1962 대치 상대 및 퇴역 후 교류 관계 → 동료 1990 적대적 대치 및 전우회 교류");
  assert.equal(await c.migrateRelations(w), false); assert.equal(prompts.length, 1, "한 번 처리한 세계관은 다시 돌지 않는다");
});
test("AI 연결이 없거나 옮기기에 실패하면 데이터를 그대로 두고 표시도 남기지 않는다", async () => {
  const w = world();
  w.relations = [{ a: K("한서진"), b: K("카이 마루"), rel: "선후배", story: "", src: K("문서A") }, { a: K("한서진"), b: K("카이 마루"), rel: "선대 및 후대", story: "", src: K("문서B") }];
  c.ensureRelIds(w); const before = JSON.stringify(w.relations);
  c.S.sample = null; let calls = 0; c.callJson = async () => { calls++; throw new Error("끊김"); };
  assert.equal(await c.migrateRelations(w), false); assert.equal(calls, 0);
  c.S.sample = true;
  assert.equal(await c.migrateRelations(w), false); assert.equal(calls, 1);
  c.callJson = async () => ({ relations: [{ id: 1, type: "없는 종류" }] });
  assert.equal(await c.migrateRelations(w), false);
  assert.equal(JSON.stringify(w.relations), before); assert.equal(w.relMigrated, undefined);
  const card = c.relCardsHtml(w, K("한서진")); assert(card.includes(">선대 및 후대<") && !card.includes(">선후배<"));
  const w2 = world(); w2.relations = [{ a: K("한서진"), b: K("류도윤"), rel: "동료", src: K("문서A") }];
  c.callJson = async () => { throw new Error("부르면 안 된다"); };
  assert.equal(await c.migrateRelations(w2), true); assert.equal(w2.relMigrated, 1, "옮길 것이 없으면 부르지 않고 표시만 남긴다");
});
test("관계를 받는 모든 생성 경로가 같은 형식(번호 목록 + same/next)을 쓰고, 세계관을 열 때 옮기기를 한 번 부른다", () => {
  const fs = require("fs"), path = require("path"), src = f => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
  const pr = src("prompts.js"), es = src("edit-source.js"), sm = src("story-model.js"), ac = src("actions.js");
  assert(pr.includes("${relRefBlock(w, [key, ...rel], key, key, 24)}") && pr.includes("${REL_JSON}") && pr.includes("${REL_SPEC}"));
  assert.equal((es.match(/\$\{REL_JSON\}/g) || []).length, 2); assert.equal((es.match(/\$\{REL_SPEC\}/g) || []).length, 2); assert.equal((es.match(/relRefBlock\(/g) || []).length, 2);
  assert.equal((sm.match(/\$\{REL_JSON\}/g) || []).length, 2); assert.equal((sm.match(/relRefBlock\(/g) || []).length, 2); assert(sm.includes("${REL_SPEC}"));
  for (const s of [pr, es, sm]) assert(!/"relations":\[\{"a":"인물 제목","b":"인물 제목","rel"/.test(s), "옛 출력 형식이 남아 있다");
  assert(ac.includes("if (!w.relMigrated && S.sample) migrateRelations(w)"));
});

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log(`  ✓ ${++n}. ${name}`); }
  console.log(`\n모두 통과 (${n}개). AI 호출 0회.`);
})().catch(e => { console.error(e); process.exit(1); });
