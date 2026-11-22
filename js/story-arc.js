"use strict";
/* 기존 세계에서 이야기 이어 가기: 이야기 시작(진입), 되돌리기 스냅샷, 이야기 끝의 봉인·보관, 다음 이야기.
   세계는 하나이고 이야기는 그 위에 차례로 쌓인다. 장 진행은 기존 스토리 엔진을 그대로 쓴다. */

/* ---------- 되돌리기 스냅샷 (이 기기의 IndexedDB에만 둔다. 서버 동기화 대상이 아니다) ----------
   이야기를 시작하기 직전의 세계를 "snap:<세계 id>:w"에, 그 뒤 처음 저장·삭제되는 문서의 원래 상태를
   "snap:<세계 id>:p:<항목 키>"에 둔다. 저장 단계에서 잡으므로 장 반영·고치기·직접 편집을 경로별로 챙기지 않는다. */
const StorySnap = {
  open: new Set(),
  ok() { return Store.mode === "idb"; },
  async begin(w) {
    if (!this.ok()) return false;
    const copy = JSON.parse(JSON.stringify(w)); delete copy.storySnap;
    await Store.run(async () => { await IDB.delPrefix("snap:" + w.id + ":"); await IDB.put("snap:" + w.id + ":w", copy); });
    this.open.add(w.id); w.storySnap = { at: Date.now() };
    return true;
  },
  async has(wid) { return this.ok() && !!(await IDB.get("snap:" + wid + ":w")); },
  async sync(w) { if (w?.storySnap && await this.has(w.id)) this.open.add(w.id); else if (w) this.open.delete(w.id); },
  /* Store.run 안(문서를 쓰기 직전)에서 부른다. 처음 바뀌는 문서만 원래 상태를 남긴다(없던 문서는 null) */
  async keep(wid, key) {
    if (!this.open.has(wid)) return;
    const sk = "snap:" + wid + ":p:" + key;
    if ((await IDB.get(sk)) !== undefined) return;
    await IDB.put(sk, { v: (await IDB.get("p:" + wid + ":" + key)) || null });
  },
  async revert(wid) {
    const base = await IDB.get("snap:" + wid + ":w"); if (!base) throw { code: "no_snap", message: "이 기기에 이야기 시작 전 기록이 없습니다." };
    const pages = await IDB.getPrefix("snap:" + wid + ":p:");
    this.open.delete(wid);
    for (const [key, rec] of pages) { if (rec?.v) await Store.savePage(wid, rec.v); else await Store.deletePage(wid, key); }
    delete base.storySnap;
    await Store.saveWorld(base);
    await Store.run(() => IDB.delPrefix("snap:" + wid + ":"));
    return { world: base, pages: pages.length };
  },
  async discard(w) {
    this.open.delete(w.id);
    if (this.ok()) await Store.run(() => IDB.delPrefix("snap:" + w.id + ":"));
    delete w.storySnap; await Store.saveWorld(w);
  }
};

/* ---------- 판정 도우미 ---------- */
/* 존속 기간이 끝났고 그 시점이 현재 기준 시점 이전이면 이야기를 시작할 수 없는 인물이다(정형화된 값만 본다).
   끝 연도나 기준 시점을 숫자로 읽을 수 없으면 기록이 있는 쪽을 따라 끝난 것으로 본다. 기록이 없으면 막지 않는다 */
function storyDeadAt(w, k) {
  const e = w.entities[k], end = e?.span?.end; if (!end) return "";
  const A = yearNum(end), B = yearNum(w.era);
  return isNaN(A) || isNaN(B) || A <= B ? `${e.span.endWhat || "사망"} ${end}` : "";
}
/* 새 주인공 이름이 이미 문서가 있거나 인물이 아닌 항목과 겹치는지 */
const nameTaken = (w, k) => !!(S.pages[k] || (w.entities[k] && w.entities[k].type && w.entities[k].type !== "인물"));
const storyArcPeople = w => Object.keys(w.entities).filter(k => w.entities[k].type === "인물" && S.pages[k]);
/* 이전 이야기들의 짧은 기록(진입·장 계획 프롬프트용) */
function storyLogBlock(w, max = 3) {
  const logs = (w.storyLog || []).slice(-max); if (!logs.length) return "";
  return `## 이 세계에서 앞서 끝난 이야기 (이미 일어난 일이다. 지금 세계는 그 결과 위에 있다)
${logs.map(l => {
    const r = l.record || {}, pt = w.entities[l.protagonistKey]?.title || l.protagonistTitle || "주인공";
    return `### ${l.arc}부 · 주인공 「${pt}」
${(l.chapters || []).map(c => `- ${c.n}장 「${c.title}」 (${c.era}): ${c.summary}`).join("\n")}${l.epilogue ? `\n- 결말 이후: ${l.epilogue}` : ""}${r.protagonist?.tendency ? `\n- 주인공의 선택 경향: ${r.protagonist.tendency}` : ""}${r.protagonist?.change ? `\n- 주인공의 변화: ${r.protagonist.change}` : ""}${(r.people || []).length ? `\n- 주인공과 함께 겪은 사람들: ${r.people.map(p => `${p.title}(${p.with})`).join("; ")}` : ""}${(r.open || []).length ? `\n- 풀리지 않은 갈래: ${r.open.join("; ")}` : ""}${(l.secrets || []).some(s => !s.revealed) ? `\n- 아직 드러나지 않은 진실(작중 사람들은 모른다): ${l.secrets.filter(s => !s.revealed).map(s => s.truth).join("; ")}` : ""}${(l.noticed || []).length ? `\n- 주변이 알아챈 주인공의 이상함: ${l.noticed.map(x => `${x.who}: ${x.what}`).join("; ")}` : ""}`;
  }).join("\n\n")}
`;
}

/* ---------- 장 계획에 붙는 블록 (story-model.js의 chapterPlanPrompt가 부른다) ---------- */
function storyArcBlock(w) {
  const st = w.story; if (!st?.entry) return storyLogBlock(w);
  const o = st.original, noticed = (st.noticed || []).slice(-8);
  return `## 원작 위키와 주인공의 지식
이 이야기는 이미 자란 위키 세계에서 시작했다. 플레이어는 그 위키를 읽은 독자이고, 주인공 「${w.entities[st.protagonistKey]?.title}」을(를) 맡는다. 서술은 기본적으로 주인공이 원래 이 세계 사람인 이야기로 쓴다.
- 독자의 선택이 주인공이 알 수 없는 지식(주인공 문서·관계·지금까지 겪은 일로 설명되지 않는 위키의 사실)에 기댈 때에만 그 이상함을 이야기에 다룬다. 주변 인물은 놀라거나, 출처를 캐묻거나, 경계한다.
- 위키에 없던 진실(숨겨진 진실)이나 이야기 중 달라진 사건에서는 독자가 아는 내용이 틀릴 수 있다.
- 주변이 실제로 이상함을 알아챘으면 noticed에 적는다. 이미 알아챈 의심은 근거 없이 사라지지 않는다.
${noticed.length ? `\n주변이 이미 알아챈 것:\n${noticed.map(x => `- ${x.ch}장 · ${x.who}: ${x.what}`).join("\n")}\n` : ""}${o ? `\n## 이야기가 시작되기 전의 「${w.entities[st.protagonistKey]?.title}」
${o.summary ? `- 원래 한 줄 정의: ${o.summary}\n` : ""}- 독자가 맡은 뒤의 선택이 원래 성격·습관과 크게 다르면, 가까운 인물이 그 변화를 알아챈다.
` : ""}
${storyLogBlock(w)}`;
}
/* 장 계획 출력의 장면 정보: 장이 끝날 때 주인공의 위치와 만날 수 있는 인물 */
function storyArcScene(w, ch, out) {
  if (!ch || !out) return;
  const pk = w.story.protagonistKey, place = norm(asText(out.place || "")).slice(0, 80);
  if (place) ch.place = place;
  if (Array.isArray(out.nearby)) {
    const seen = new Set();
    ch.nearby = out.nearby.map(x => { const k = x?.title ? kOf(w, String(x.title)) : ""; return w.entities[k] && k !== pk && w.entities[k].type === "인물" && !storyDeadAt(w, k) && !seen.has(k) && seen.add(k) ? { key: k, why: stripMarks(asText(x.why || "")).slice(0, 120) } : null; }).filter(Boolean).slice(0, 12);
  }
}
function storyArcNoticed(w, n, list) {
  const st = w.story; if (!st?.entry || !Array.isArray(list)) return;
  for (const x of list) {
    const who = norm(asText(x?.who || "")).slice(0, 60), what = stripMarks(asText(x?.what || "")).slice(0, 200);
    if (who && what && !(st.noticed ||= []).some(y => y.who === who && y.what === what)) st.noticed.push({ ch: n, who, what });
  }
  if (st.noticed?.length > 20) st.noticed = st.noticed.slice(-20);
}

/* ---------- 진입: 기본 모드 세계에서 이야기 시작 ---------- */
function storyEntryPrompt(w, o) {
  const N = o.total, pk = o.pk, e = w.entities[pk], p = S.pages[pk];
  const who = o.possess
    ? `기존 인물 「${e.title}」로 시작한다. 이 인물의 과거·관계·성격·말투는 아래 문서와 확정 사실 그대로이며 새로 지어내지 않는다.

### 「${e.title}」 문서
${docText(p, w)}`
    : `${o.name ? `새 인물 「${o.name}」로 시작한다.` : "새 인물로 시작한다. 이름은 정해지지 않았으니 protagonist.name에 정한다. 이 세계의 작명 방식에 맞는 본명 풀 네임이며, 이미 존재하는 항목 제목과 겹치지 않는다."} 이 세계에 원래 사는 사람이다.${o.desc ? `\n- 사용자가 정한 특징 (최우선 제약): ${o.desc}` : ""}
- 과거는 특징과 세계에 맞게 짧게 정하되, 기존 인물의 가족·연인을 새로 지어내지 않는다.`;
  return `너는 가상 세계관 위키 「${w.title}」의 이야기 편집장이다. 이 위키는 이미 여러 문서로 자란 세계다. 지금 이 세계에서 주인공 한 명을 중심으로 ${N}장짜리 이야기를 시작한다. 이야기는 위키의 현재 기준 시점(${w.era})에서 출발하며, 진행되면서 이 세계를 실제로 바꾼다.

## 이야기 시작 계획

${canonBlock(w)}

${toneBlock(w)}${w.guide ? `## 작가 지침 (사용자 지정)\n${w.guide}\n\n` : ""}## 주인공
${who}
${o.wish ? `\n## 사용자가 바라는 이야기\n${o.wish}\n` : ""}
${storyLogBlock(w)}
## 이미 존재하는 항목 (제목을 글자 그대로 쓴다. 각 줄의 "—" 앞까지가 제목이다)
${entityIndex(w, o.possess ? [pk] : [])}

## 규칙
- protagonist: summary는 주인공의 한 문장 정의${o.possess ? "(지금 정의를 그대로 둔다)" : ""}, want는 이 이야기에서 바라는 것, wound는 결핍이나 상처(필요 없으면 빈 문자열).
- storyPromise: focus는 이 이야기가 약속하는 경험, central은 이어 갈 중심 내용(kind는 goal, relationship, promise, conflict, consequence, ongoing, mystery 중 하나).
- spine: ${N}장 각각의 잠정 의도(${beatsFor(N).map((b, i) => `${i + 1}장 ${b}`).join(", ")}). 확정된 사건과 독자의 선택에 따라 나중에 바뀔 수 있다.
- secrets: 위키 어디에도 적혀 있지 않은, 이야기가 나중에 밝힐 진실 0~3개. cover는 지금 위키에 알려진 서술이다. 기존 문서와 모순되지 않으면서 기존 서술을 다르게 읽게 만드는 진실이어야 한다. 장르 이름만 보고 거대 음모를 만들지 않는다. 필요 없으면 빈 배열.
- chapter1: era는 현재 기준 시점(${w.era})이거나 그 직후다. title은 작중 사건명(장 번호를 넣지 않는다), summary는 공개 줄거리 3~5문장, incident는 발단 사건 한 문장, nextChoices는 주인공의 다음 행동 후보 3개.
- place는 1장이 끝날 때 주인공이 있는 곳이다. nearby는 2장까지 주인공이 직접 만나거나 이 세계의 연락 수단으로 닿을 수 있는 기존 인물 3~10명이다(위 목록의 제목 그대로). 멀리 있거나 만날 길이 없는 인물은 넣지 않는다. why는 한 줄 이유.
- 확정 사실, 사용자 확정 설정, 핵심 규칙, 연표와 모순되지 않는다.

## 출력
JSON 객체 하나만 출력:
{"protagonist":{${!o.possess && !o.name ? '"name":"주인공 이름",' : ""}"summary":"한 문장 정의","want":"바라는 것","wound":""},"storyPromise":{"focus":"약속한 이야기 경험","central":{"kind":"ongoing","subject":"이어갈 중심 내용"}},"spine":[{"n":1,"intent":"이 장의 의도 한두 문장"}],"secrets":[{"truth":"감춰진 진실","cover":"알려진 겉모습","reveal":3}],"chapter1":{"title":"작중 사건명","era":"${w.era}","summary":"공개 줄거리","incident":"발단 사건 한 문장","nextChoices":["행동 후보","행동 후보","행동 후보"]},"place":"주인공이 있는 곳","nearby":[{"title":"인물 제목","why":"닿을 수 있는 이유"}]}`;
}
/* 앞 이야기의 대화 프로필과 주인공 기록을 새 이야기의 대화 상대 프로필로 넘긴다 */
function storyArcCarryProfiles(w) {
  const st = w.story, logs = w.storyLog || [], profiles = {};
  for (const l of logs) {
    Object.assign(profiles, l.dialogueProfiles || {});
    const r = l.record?.protagonist, pk = l.protagonistKey;
    if (r && w.entities[pk]) profiles[pk] = { personality: [r.tendency, r.change].filter(Boolean).join(" "), voice: r.voice || "플레이어가 실제로 쓴 대사의 말투를 따른다.", examples: (r.samples || []).slice(0, 4), fromPlayer: true };
  }
  delete profiles[st.protagonistKey];
  st.dialogueProfiles = { ...profiles, ...(st.dialogueProfiles || {}) };
  const same = [...logs].reverse().find(l => l.protagonistKey === st.protagonistKey);   // 같은 주인공으로 이어 가면 인물들의 마음의 거리도 잇는다
  if (same?.bonds) st.bonds = { ...same.bonds, ...(st.bonds || {}) };
}
function storyEntryState() { return S.storyEntry ||= { mode: "possess", pick: "", q: "", name: "", desc: "", total: STORY_DEF, wish: "", err: "", busy: false, phase: "" }; }
function openStoryEntry() {
  const w = S.world; if (!w || isStory(w)) return;
  S.storyEntry = null; storyEntryState();
  S.view = { name: "storyEntry" }; renderAll(); window.scrollTo({ top: 0 });
}
async function startStoryEntry() {
  const w = S.world, f = storyEntryState(); if (!w || isStory(w) || f.busy) return;
  if (S.gen || S.storyGen || S.syncing || S.creating) { f.err = "작성 중인 문서가 끝난 뒤 시작할 수 있습니다."; renderMain(); return; }
  if (!S.sample) { f.err = ERR.no_sample; renderMain(); return; }
  const possess = f.mode !== "new", desc = norm(f.desc || "").slice(0, 300), wish = norm(f.wish || "").slice(0, 300), total = Math.min(STORY_MAX, Math.max(STORY_MIN, +f.total || STORY_DEF));
  let pk = "", name = "";
  if (possess) {
    pk = f.pick;
    if (!pk || !w.entities[pk] || !S.pages[pk]) { f.err = "이야기를 시작할 인물을 골라 주세요."; renderMain(); return; }
    if (storyDeadAt(w, pk)) { f.err = `「${w.entities[pk].title}」은(는) 현재 시점에 살아 있지 않아 고를 수 없습니다.`; renderMain(); return; }
  } else {
    name = norm(f.name || "").slice(0, 60); pk = name ? keyOf(name) : "";   // 이름을 비우면 이야기 뼈대를 만들면서 정한다
    if (name && nameTaken(w, pk)) { f.err = "같은 이름의 항목이 이미 있습니다. 기존 인물로 고르거나 다른 이름을 써 주세요."; renderMain(); return; }
  }
  f.busy = true; f.err = ""; f.phase = "이야기 뼈대를 만드는 중"; renderMain();
  let snapped = false;
  try {
    const out = await callJson("storyBible", storyEntryPrompt(w, { possess, pk, name, desc, total, wish }), { modelTier: "default", ...PAGE_MODEL }, { title: possess ? w.entities[pk].title : name });
    if (S.world !== w) throw { code: "cancelled" };
    if (!out?.chapter1?.summary || !out.protagonist || typeof out.protagonist !== "object") throw { code: "invalid_json" };
    if (!possess && !name) {
      name = norm(asText(out.protagonist.name || "")).slice(0, 60); pk = name ? keyOf(name) : "";
      if (!name || nameTaken(w, pk)) throw { code: "no_name", message: "주인공 이름을 정하지 못했습니다. 이름을 적거나 다시 시도해 주세요." };
    }
    snapped = await StorySnap.begin(w);   // 세계를 바꾸기 직전의 상태를 남긴다
    if (!possess) { if (!w.entities[pk]) w.entities[pk] = newEntity(name, "인물", ""); w.entities[pk].type = "인물"; }
    const e = w.entities[pk], original = possess ? { summary: e.summary || S.pages[pk]?.summary || "" } : null;
    setupStory(w, out, { total, desc: possess ? "" : desc, cast: [] }, pk, { keepSummary: possess });
    Object.assign(w.story, { entry: possess ? "possess" : "new", arc: (w.storyLog?.length || 0) + 1, noticed: [], ...(original ? { original } : {}), ...(wish ? { wish } : {}) });
    storyArcScene(w, w.story.chapters[0], out);
    storyArcCarryProfiles(w);
    await Store.saveWorld(w);
    if (possess) {   // 주인공 문서는 그대로 두고 1장 섹션만 덧붙인다
      f.phase = "1장 섹션을 쓰는 중"; renderMain();
      const r = await callJson("chapterBlock", chapterBlockPrompt(w, pk, [1]), { modelTier: "default", ...PAGE_MODEL }, { title: e.title, ch: "1" });
      if (S.world !== w) throw { code: "cancelled" };
      const b = (Array.isArray(r?.blocks) ? r.blocks : []).find(Boolean);
      const secs = b ? blockToSections(1, b.heading || w.story.chapters[0].title, b.sections) : [];
      if (!secs.length) throw { code: "invalid_json" };
      const np = rebuildPage(w, pk, S.pages[pk], secs, { infoboxPatch: r.infoboxPatch, summaryPatch: "", facts: r.facts, relations: r.relations, timeline: r.timeline, newEntities: r.newEntities });
      np.syncedTo = 1; np.storyNotice = true; np.check = null;
      S.pages[pk] = np;
      await Store.savePage(w.id, np); await Store.saveWorld(w);
    }
    f.busy = false; S.storyEntry = null;
    openEntity(pk);   // 새 주인공은 여기서 1장을 담은 첫 문서를 쓴다
    toast(`「${w.entities[pk].title}」의 이야기가 시작되었습니다.${snapped ? " 설정 노트에서 이야기 시작 전으로 되돌릴 수 있습니다." : ""}`);
  } catch (err) {
    f.busy = false; f.phase = "";
    if (snapped) { try { const r = await StorySnap.revert(w.id); restoreWorldObject(w, r.world); S.pages = await Store.listPages(w.id); } catch {} }
    f.err = err?.code === "cancelled" ? "" : "이야기를 시작하지 못했습니다. 세계는 그대로입니다. " + errMsg(err);
    if (S.world === w) { S.view = { name: "storyEntry" }; renderAll(); }
  }
}
/* 저장된 세계로 메모리의 세계 객체를 바꾼다(다른 화면이 같은 객체를 가리키므로 속성을 갈아 끼운다) */
function restoreWorldObject(w, base) {
  for (const k of Object.keys(w)) delete w[k];
  Object.assign(w, JSON.parse(JSON.stringify(base)));
}
async function revertStory() {
  const w = S.world; if (!w || S.gen || S.storyGen || S.syncing || S.storyTalkJob) { toast("작성 중인 일이 끝난 뒤 되돌릴 수 있습니다."); return; }
  try {
    const r = await StorySnap.revert(w.id);
    restoreWorldObject(w, r.world); S.confirmRevert = false;
    await openWorld(w.id);
    toast(`이야기를 시작하기 전으로 되돌렸습니다. 문서 ${r.pages}개를 원래 상태로 돌렸습니다.`);
  } catch (err) { toast("되돌리지 못했습니다. " + errMsg(err)); }
}
async function discardStorySnap() {
  const w = S.world; if (!w) return;
  await StorySnap.discard(w); S.confirmRevert = false; renderMain();
  toast("이야기 시작 전 기록을 지웠습니다.");
}

/* ---------- 이야기 끝: 봉인과 보관 ---------- */
/* 장 번호는 이야기마다 1장부터 다시 시작하므로, 끝난 이야기의 장 표시와 출처를 이야기 번호가 붙은 일반 기록으로 바꾼다 */
function sealSources(w, arc) {
  const re = /^ch(\d+)$/, conv = s => { const m = re.exec(String(s || "")); return m ? `a${arc}ch${m[1]}` : s; };
  for (const e of Object.values(w.entities)) for (const f of e.facts || []) if (re.test(String(f.src || ""))) f.src = conv(f.src);
  for (const r of w.relations || []) if (re.test(String(r.src || ""))) r.src = conv(r.src);
  for (const t of w.timeline || []) { if (re.test(String(t.src || ""))) t.src = conv(t.src); if (t.ch) { t.arc = arc; t.arcCh = t.ch; delete t.ch; } }
  for (const ev of w.events || []) if (re.test(String(ev?.src || ""))) ev.src = conv(ev.src);
}
function storyPlayerLines(w) {
  return w.story.chapters.flatMap(c => Object.entries(c.dialogues || {}).filter(([k]) => !isSceneKey(k)).flatMap(([, s]) => (s.turns || []).filter(t => !t.act).map(t => String(t.user || "").trim()))).filter(t => t.length >= 6);   // 말투 견본은 인물에게 한 말만
}
function storyRecordPrompt(w) {
  const st = w.story, pk = st.protagonistKey, lines = storyPlayerLines(w).slice(-30);
  return `너는 가상 세계관 위키 「${w.title}」의 이야기 편집장이다. 주인공 「${w.entities[pk].title}」의 이야기가 끝났다. 이 세계에서 다음 이야기가 이어질 수 있도록, 이번 이야기에서 주인공과 사람들이 실제로 겪은 것을 기록한다.

## 이번 이야기의 장
${st.chapters.map(c => `- ${c.n}장 「${c.title}」 (${c.era}): ${c.summary}${c.choice ? `\n  독자의 선택: ${c.choice.custom || c.choice.picked}` : ""}`).join("\n")}
${st.epilogue ? `- 결말 이후: ${st.epilogue}` : ""}

${typeof storyDialogueBlock === "function" ? storyDialogueBlock(w) : ""}
## 플레이어가 주인공으로서 직접 쓴 대사 (원문)
${lines.length ? lines.map(t => `- ${t}`).join("\n") : "(없음)"}

## 규칙
- protagonist.tendency: 위기에서 무엇을 골랐고 무엇을 지키고 무엇을 포기했는지, 실제 선택과 대사에서 드러난 경향 2~3문장.
- protagonist.change: 이야기 처음과 끝에 주인공이 무엇이 달라졌는지 1~2문장.
- protagonist.voice: 플레이어 대사에서 드러난 말투 규칙(존대 여부, 호칭, 문장 길이, 감정 표현) 한두 문장. 대사가 없으면 장 본문에서 드러난 말투.
- people: 주인공과 함께 중요한 일을 겪은 인물마다 무엇을 함께 겪었고 지금 관계가 어떤지 한두 문장. 이미 존재하는 인물 제목 그대로.
- open: 이번 이야기에서 풀리지 않고 남은 갈래 0~5개.
- 실제 장 줄거리와 대화에 있는 것만 쓴다. 지어내지 않는다.

JSON 객체 하나만 출력:
{"protagonist":{"tendency":"...","change":"...","voice":"..."},"people":[{"title":"인물 제목","with":"..."}],"open":["..."]}`;
}
async function sealStory() {
  const w = S.world, st = w?.story; if (!isStory(w) || st.status !== "ended" || S.storySeal) return;
  if (S.gen || S.storyGen || S.syncing || S.storyTalkJob) { toast("작성 중인 일이 끝난 뒤 마무리할 수 있습니다."); return; }
  S.storySeal = { phase: "이번 이야기를 기록하는 중" }; renderMain();
  try {
    const r = await callJson("chapterPlan", storyRecordPrompt(w), { modelTier: "default" }, { title: w.entities[st.protagonistKey].title, ch: "기록" });
    if (S.world !== w) throw { code: "cancelled" };
    const pr = r?.protagonist && typeof r.protagonist === "object" ? r.protagonist : {};
    const lines = storyPlayerLines(w), samples = lines.slice(-12).sort((a, b) => b.length - a.length).slice(0, 4);
    const record = { protagonist: { tendency: stripMarks(asText(pr.tendency || "")).slice(0, 400), change: stripMarks(asText(pr.change || "")).slice(0, 300), voice: stripMarks(asText(pr.voice || "")).slice(0, 300), samples: samples.map(t => t.slice(0, 200)) },
      people: (Array.isArray(r?.people) ? r.people : []).map(p => ({ title: norm(asText(p?.title || "")).slice(0, 60), with: stripMarks(asText(p?.with || "")).slice(0, 240) })).filter(p => p.title && p.with).slice(0, 12),
      open: (Array.isArray(r?.open) ? r.open : []).map(x => stripMarks(asText(x)).slice(0, 200)).filter(Boolean).slice(0, 5) };
    const arc = st.arc || (w.storyLog?.length || 0) + 1;
    S.storySeal.phase = "문서의 장 표시를 정리하는 중"; renderMain();
    for (const [k, p] of Object.entries(S.pages)) {
      if (!p || !(p.sections || []).some(s => s.ch) && p.baseAsOf == null && p.syncedTo == null) continue;
      const np = { ...p, sections: (p.sections || []).map(s => { if (!s.ch) return s; const { ch, ...x } = s; return { ...x, arc, arcCh: ch }; }) };
      delete np.baseAsOf; delete np.syncedTo; delete np.storyNotice;
      S.pages[k] = np; await Store.savePage(w.id, np);
    }
    sealSources(w, arc);
    (w.storyLog ||= []).push({ arc, protagonistKey: st.protagonistKey, protagonistTitle: w.entities[st.protagonistKey]?.title, entry: st.entry || "created", total: st.total, endedAt: st.endedAt, sealedAt: Date.now(),
      chapters: st.chapters, spine: st.spine, secrets: st.secrets || [], continuity: st.continuity, epilogue: st.epilogue, noticed: st.noticed || [], cast: st.cast || [], dialogueProfiles: st.dialogueProfiles || {}, bonds: st.bonds || {}, protagonist: st.protagonist, record });
    delete w.story; delete w.mode;
    await Store.saveWorld(w);
    S.storySeal = null;
    S.view = { name: "storyEntry" }; S.storyEntry = null; storyEntryState(); renderAll(); window.scrollTo({ top: 0 });
    toast(`${arc}부 이야기를 기록하고 마무리했습니다. 이 세계에서 다음 이야기를 시작하거나 위키를 계속 키울 수 있습니다.`);
  } catch (err) {
    S.storySeal = null;
    toast(err?.code === "cancelled" ? "마무리를 중단했습니다." : "이야기를 마무리하지 못했습니다. 이전 상태 그대로입니다. " + errMsg(err));
    renderMain();
  }
}

/* ---------- 화면 ---------- */
function storyArcPanelHtml(w) {
  const busy = S.gen || S.storyGen || S.syncing || S.storySeal;
  const logs = w.storyLog || [], snap = !!w.storySnap && StorySnap.open.has(w.id), snapElsewhere = !!w.storySnap && !StorySnap.open.has(w.id);
  const start = !isStory(w) ? `<div class="row" style="margin-top:8px"><button type="button" class="btn pri" data-act="story-entry-open" ${busy ? "disabled" : ""}>이 세계에서 이야기 시작</button><span class="note">기존 인물이 되거나 새 인물로 ${logs.length ? `${logs.length + 1}부` : ""} 이야기를 시작합니다. 이야기가 진행되면 위키도 함께 바뀝니다.</span></div>` : "";
  const seal = isStory(w) && w.story.status === "ended" ? `<div class="row" style="margin-top:8px"><button type="button" class="btn pri" data-act="story-seal" ${busy ? "disabled" : ""}>${S.storySeal ? esc(S.storySeal.phase) : "이야기 마무리하고 다음으로"}</button><span class="note">이번 이야기를 기록하고 장 표시를 정리합니다. 그 뒤 다음 이야기를 시작하거나 위키를 계속 키울 수 있습니다.</span></div>` : "";
  const rev = snap ? (S.confirmRevert ? `<div class="row" style="margin-top:8px"><button type="button" class="btn danger" data-act="story-revert-go">되돌리기 확인</button><button type="button" class="btn" data-act="story-revert-cancel">취소</button><span class="note">이야기 시작 뒤에 바뀐 문서와 설정, 이야기 중 위키에 한 작업까지 모두 시작 전 상태로 돌아갑니다.</span></div>`
    : `<div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="story-revert" ${busy ? "disabled" : ""}>이야기 시작 전으로 되돌리기</button><button type="button" class="btn" data-act="story-snap-discard" ${busy ? "disabled" : ""}>되돌리기 기록 지우기</button><span class="note">시작 전 기록은 이 기기에만 있습니다.</span></div>`)
    : snapElsewhere ? `<p class="note">이야기 시작 전 기록은 다른 기기에 있어 여기서는 되돌릴 수 없습니다.</p>` : "";
  const past = logs.length ? `<dl class="kv" style="margin-top:10px">${logs.map(l => `<dt>${l.arc}부</dt><dd>${w.entities[l.protagonistKey] ? linkHtml(w.entities[l.protagonistKey].title) : esc(l.protagonistTitle || "")} · ${l.chapters?.length || 0}장${l.chapters?.length ? ` · 「${esc(l.chapters[l.chapters.length - 1].title)}」` : ""}</dd>`).join("")}</dl>` : "";
  if (!start && !seal && !rev && !past) return "";
  return `<h2>이야기 이어 가기</h2>${past}${start}${seal}${rev}`;
}
function storyEntryHtml() {
  const w = S.world, f = storyEntryState(); if (!w) return "";
  const dis = f.busy ? "disabled" : "", q = norm(f.q || "").toLowerCase();
  const people = storyArcPeople(w).filter(k => !q || w.entities[k].title.toLowerCase().includes(q)).slice(0, 40);
  const pick = k => { const dead = storyDeadAt(w, k), e = w.entities[k]; return `<button type="button" class="stab" data-entry-pick="${esc(k)}" aria-pressed="${f.pick === k}" ${dead || f.busy ? "disabled" : ""} title="${esc(dead ? `현재 시점에 살아 있지 않음 (${dead})` : e.summary || "")}">${esc(e.title)}${dead ? ` <small>${esc(dead)}</small>` : ""}</button>`; };
  return `<div class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>이야기 시작</span></div>
    <h1 class="t">이 세계에서 이야기 시작</h1>
    <p class="note">작중 ${esc(w.era)}의 이 세계에서 이야기를 시작합니다. 이야기가 진행되면 위키도 함께 바뀝니다.${StorySnap.ok() ? " 시작 전 상태는 이 기기에 남겨 두어 되돌릴 수 있습니다." : " 이 브라우저 저장 방식에서는 시작 전으로 되돌리기를 지원하지 않습니다."}</p>
    ${(w.storyLog || []).length ? `<p class="note">앞서 끝난 이야기 ${w.storyLog.length}개의 결과 위에서 ${w.storyLog.length + 1}부가 시작됩니다.</p>` : ""}
    <h2>주인공</h2>
    <div class="row" role="group" aria-label="주인공 정하기"><button type="button" class="stab" data-entry-mode="possess" aria-pressed="${f.mode !== "new"}" ${dis}>기존 인물</button><button type="button" class="stab" data-entry-mode="new" aria-pressed="${f.mode === "new"}" ${dis}>새 인물</button></div>
    ${f.mode !== "new" ? `<input id="entryQ" class="txt" type="search" maxlength="40" value="${esc(f.q || "")}" placeholder="인물 이름으로 찾기" aria-label="인물 찾기" ${dis}>
    <div class="row entry-people" style="flex-wrap:wrap;gap:6px;margin-top:8px">${people.map(pick).join("") || '<span class="note">문서가 있는 인물이 없습니다.</span>'}</div>`
    : `<label class="lb" for="entryName">이름 (선택)</label><input id="entryName" class="txt" maxlength="60" value="${esc(f.name || "")}" placeholder="비워 두면 세계에 맞게 정합니다" ${dis}>
    <label class="lb" for="entryDesc">특징 (선택)</label><textarea id="entryDesc" rows="2" maxlength="300" ${dis}>${esc(f.desc || "")}</textarea>`}
    <h2>이야기</h2>
    <label class="lb" for="entryTotal">장 수</label><select id="entryTotal" ${dis}>${[5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${+f.total === n ? "selected" : ""}>${n}장</option>`).join("")}</select>
    <label class="lb" for="entryWish">바라는 이야기 (선택)</label><textarea id="entryWish" rows="2" maxlength="300" placeholder="예: 잃어버린 동료를 찾아 나서는 이야기" ${dis}>${esc(f.wish || "")}</textarea>
    ${f.err ? `<p class="talk-error" role="alert">${esc(f.err)}</p>` : ""}
    <div class="row" style="margin-top:12px">${f.busy ? `<div class="gen-live"><span class="dot"></span><span>${esc(f.phase)}</span></div>` : `<button type="button" class="btn pri" data-act="story-entry-start">이야기 시작</button><button type="button" class="btn" data-act="story-entry-cancel">취소</button>`}</div>
  </div>`;
}
