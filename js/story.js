"use strict";
/* 스토리 모드: 장 전환과 지연 갱신 */
/* ---------- 스토리 모드: 장 전환 ---------- */
function openAdvance() {
  const w = S.world; if (!storyOn(w)) return;
  if (!S.adv) S.adv = { pick: -1, custom: "", err: "" };
  S.view = { name: "advance" }; renderAll(); window.scrollTo({ top: 0 });
}
/* 장 계획을 world와 주인공 문서에 적용한다. 동기식으로 한 번에 끝내고, 새 주인공 문서를 돌려준다 */
function applyChapter(w, n, out, choice) {
  const st = w.story, pk = st.protagonistKey, src = chSrc(n), pb = out.protagonistBlock;
  const progress = prepareStoryMemory(w, n, out, choice, true);
  const before = new Set(Object.keys(w.entities));
  const prevEra = curCh(w).era || w.era;
  let era = norm(out.era || "").slice(0, 40) || prevEra;
  const A = yearNum(era), B = yearNum(prevEra);
  if (!isNaN(A) && !isNaN(B) && A < B) { console.warn(`[스토리] ${n}장 시점(${era})이 이전 장(${prevEra})보다 앞서 이전 장 시점을 씁니다.`); era = prevEra; }
  const hints = {}; for (const x of (Array.isArray(out.newEntities) ? out.newEntities : [])) if (x && x.title) { x.title = canonTitle(w, x.title); hints[keyOf(x.title)] = x; }
  const auto = [];
  const ensure = title => {
    const t = canonTitle(w, title).slice(0, 60); if (!t) return null; const k = keyOf(t);
    if (!w.entities[k]) { const h = hints[k]; w.entities[k] = newEntity(t, h && TYPES.includes(h.type) ? h.type : "", h ? stripMarks(h.summary).slice(0, 200) : ""); w.entities[k].origin = pk; auto.push(k); }
    return k;
  };
  for (const x of Object.values(hints)) ensure(x.title);
  const affected = [];
  for (const a of (Array.isArray(out.affected) ? out.affected : []).slice(0, 10)) {
    if (!a || !a.title || !a.change) continue;
    const k = ensure(a.title); if (!k || k === pk || affected.some(x => x.key === k)) continue;
    const change = stripMarks(a.change).slice(0, 240);
    affected.push({ key: k, change, kind: S.pages[k] ? "update" : "new" });
    addFact(w.entities[k], change, src);   // 열기 전에도 다른 문서 작성에 바로 반영되게 사실로 넣어 둔다
  }
  const wove = [];
  for (const x of (Array.isArray(out.wove) ? out.wove : [])) { const k = x && x.title ? kOf(w, x.title) : ""; if (!w.entities[k] || !x.how || wove.some(y => y.key === k)) continue; wove.push({ key: k, how: stripMarks(x.how).slice(0, 240) }); }
  for (const f of (Array.isArray(out.facts) ? out.facts : [])) { if (!f || !f.fact || !f.about) continue; const fk = kOf(w, f.about); if (w.entities[fk]) addFact(w.entities[fk], String(f.fact), src); }
  for (const r of (Array.isArray(out.relations) ? out.relations : []).slice(0, 12)) addRelation(w, src, r);
  for (const t of (Array.isArray(out.timeline) ? out.timeline : []).slice(0, 4)) addTimeline(w, t, src, n);
  const narrativeBody = storyQuote(pb.sections.map(s => s.body).join("\n")), sources = new Map(storySources(w).map(row => [row.source, storyQuote(row.text)])); sources.set("current", narrativeBody);
  const warn = text => progress.record.warnings.push(text);
  const secretFor = value => {
    const id = typeof value === "string" ? value : value?.id || value?.secretId;
    return secretsOf(w).find(x => x.id === id || (typeof id === "string" && storyComparable(x.truth) === storyComparable(id)));
  };
  for (const r of (Array.isArray(out.secretRevise) ? out.secretRevise : [])) {
    const secret = secretFor(r), quote = storyMatchedQuote(sources.get(r?.source) || "", r?.quote);
    if (!secret || secret.revealed || !storyText(r?.truth, 300) || !storyText(r?.cover, 300) || !storyText(r?.reason) || !quote) { warn("미공개 진실의 계획 수정 근거가 확인되지 않아 이전 계획을 유지했습니다."); continue; }
    (secret.revisions ||= []).push({ chapter: n, truth: secret.truth, cover: secret.cover, reason: storyText(r.reason), source: r.source, quote });
    secret.truth = storyText(r.truth, 300); secret.cover = storyText(r.cover, 300);
  }
  for (const r of (Array.isArray(out.revealNow) ? out.revealNow : [])) {
    const secret = secretFor(r);
    if (!secret) { warn("공개 표시의 비밀 ID를 확인하지 못해 상태를 바꾸지 않았습니다."); continue; }
    if (secret.revealed) continue;
    const source = typeof r === "object" && r.source ? sources.get(r.source) : narrativeBody;
    const quote = storyMatchedQuote(source || "", typeof r === "object" ? r.evidence || r.quote : r) || storyMatchedQuote(narrativeBody, secret.truth);
    if (!quote) { secret.pendingDisclosure = { chapter: n }; warn(`비밀 ${secret.id}의 공개 근거 확인이 필요합니다. 본문은 보존하고 공개 확정은 보류했습니다.`); continue; }
    secret.revealed = true; secret.revealedAt = n; secret.evidence = quote; delete secret.pendingDisclosure;
  }
  for (const r of (Array.isArray(out.spineRevise) ? out.spineRevise : [])) {
    const s = st.spine[(+r?.n || 0) - 1]; if (!s || s.n < n || !r.intent) continue;
    if (!s.revised) s.orig = s.intent;
    s.intent = stripMarks(r.intent).slice(0, 300); s.revised = true;
  }
  st.chapters.push({ n, title: chTitle(out.title).slice(0, 60), era, summary: stripMarks(out.summary).slice(0, 800), startedAt: Date.now(), explore: emptyExplore(), choice,
    wove, affected, auto, continuity: progress.record, nextChoices: n >= totalOf(w) ? [] : (Array.isArray(out.nextChoices) ? out.nextChoices : []).map(x => stripMarks(asText(x)).slice(0, 200)).filter(Boolean).slice(0, 3) });
  st.continuity = progress.memory;
  st.chapter = n; w.era = era;
  if (n >= totalOf(w)) { st.status = "ended"; st.endedAt = Date.now(); st.epilogue = stripMarks(out.ending?.epilogue || "").slice(0, 1200) || stripMarks(out.summary).slice(0, 800); }
  const secs = blockToSections(n, pb.heading || out.title, pb.sections);
  const np = rebuildPage(w, pk, S.pages[pk], secs, { infoboxPatch: pb.infoboxPatch, summaryPatch: pb.summaryPatch });
  np.syncedTo = n; np.storyNotice = st.status !== "ended"; np.check = null;
  st.chapters[st.chapters.length - 1].fresh = Object.keys(w.entities).filter(k => !before.has(k) && k !== pk);   // 이번 장에 새로 등장한 항목
  return np;
}
async function advanceChapter(skip) {
  const w = S.world; if (!storyOn(w)) return;
  if (!S.sample) { toast(ERR.no_sample); return; }
  if (S.gen || S.storyGen || S.syncing) { toast("다른 문서를 작성하는 중입니다. 끝난 뒤 진행해 주세요."); return; }
  if (S.edit) { toast("편집 중인 문서를 먼저 저장하거나 취소해 주세요."); return; }
  const st = w.story, pk = st.protagonistKey, oldP = S.pages[pk];
  if (!oldP) { toast("주인공 문서가 완성된 뒤 다음 장으로 넘어갈 수 있습니다."); return; }
  const a = S.adv || (S.adv = { pick: -1, custom: "", err: "" }), cur = curCh(w);
  const picked = !skip && a.pick >= 0 ? (cur.nextChoices || []).filter(x => typeof x === "string" && x.trim() && !isBroken(x))[a.pick] || "" : "", custom = skip ? "" : norm(a.custom || "").slice(0, 300);
  const choice = picked || custom ? { picked, custom } : null;
  const n = st.chapter + 1;
  const backup = JSON.stringify({ entities: w.entities, timeline: w.timeline, navboxes: w.navboxes || {}, relations: w.relations || [], story: st, era: w.era });
  const ctl = new AbortController();
  S.storyGen = { phase: "plan", ctl, t0: performance.now(), raw: "", n }; a.err = "";
  S.view = { name: "advance" }; renderAll(); window.scrollTo({ top: 0 });
  let np;
  try {
    const out = await callJson("chapterPlan", chapterPlanPrompt(w, n, choice), { signal: ctl.signal, modelTier: "default", ...PAGE_MODEL,
      onRetry: r => { if (S.storyGen) { S.storyGen.retry = r; updateStoryLive(); } }, onText: ({ text }) => { if (S.storyGen) { S.storyGen.raw = text; updateStoryLive(); } } }, { title: w.entities[pk].title, ch: n });
    const pb = out?.protagonistBlock;
    if (!out || !out.title || !out.summary || !pb || !Array.isArray(pb.sections) || !pb.sections.some(s => s && String(s.body || "").trim())) throw { code: "invalid_json" };
    if (ctl.signal.aborted || S.world !== w) throw { code: "cancelled" };
    S.storyGen.phase = "protagonist";
    np = applyChapter(w, n, out, choice);
  } catch (err) {
    const b = JSON.parse(backup);
    w.entities = b.entities; w.timeline = b.timeline; w.navboxes = b.navboxes; w.relations = b.relations; w.story = b.story; w.era = b.era;
    S.pages[pk] = oldP; S.storyGen = null;
    a.err = err?.code === "cancelled" ? "" : errMsg(err);
    toast(err?.code === "cancelled" ? "장 전환을 취소했습니다. 이전 상태 그대로입니다." : "다음 장을 쓰지 못했습니다. 이전 상태 그대로입니다.");
    if (S.view.name === "advance") renderAll(); else renderSide();
    drainSync(); return;
  }
  S.pages[pk] = np;
  S.storyGen = null; S.adv = null;
  try { await Store.savePage(w.id, np); await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
  {   // 마지막 장도 다른 장처럼 주인공 문서의 새 장 섹션부터 보여 주고, 에필로그는 안내 카드의 버튼으로 연다
    S.storyCard = { wid: w.id, n };
    S.view = { name: "article", key: pk }; S.recent = [pk, ...S.recent.filter(x => x !== pk)].slice(0, 8); renderAll();
    const i = np.sections.findIndex(s => s.ch === n); const el = i >= 0 && document.getElementById("s-" + i);
    window.scrollTo({ top: 0 }); if (el) setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 400);
  }
  drainSync();
}
/* 다음 행동 후보가 없거나 깨졌을 때 다시 만든다 */
function choicesPrompt(w) {
  const st = w.story, c = curCh(w), pk = st.protagonistKey, pr = st.protagonist || {}, n = st.chapter + 1;
  return `## 다음 행동 후보 만들기
가상 세계관 위키 「${w.title}」에서 주인공 「${w.entities[pk].title}」의 이야기가 ${totalOf(w)}장 중 ${st.chapter}장까지 진행되었다. ${n}장으로 넘어가기 전에 독자가 고를 주인공의 다음 행동 후보 3개를 만든다.

주인공: ${w.entities[pk].summary || ""}${pr.want ? `\n바라는 것: ${pr.want}` : ""}${pr.wound ? `\n결핍이나 상처: ${pr.wound}` : ""}${pr.desc ? `\n사용자가 정한 특징: ${pr.desc}` : ""}

지금까지의 장:
${st.chapters.map(x => `- ${x.n}장 「${x.title}」 (${x.era}): ${x.summary}`).join("\n")}

${storyMemoryBlock(w, false)}
규칙:
${STORY_RESPONSIBILITY_RULES}
- 각 후보는 ${c.n}장이 끝난 지금 주인공이 할 수 있는 구체적인 행동 한 문장이다. 서로 방향이 달라야 한다(예: 맞선다 / 피한다 / 다른 길을 찾는다).
- 결과를 미리 쓰지 않는다. 지금까지의 사건과 인물을 이름으로 짚는다. 같은 결말에 가는 조사 방법만 세 가지로 나누지 말고, 관계·기회·위험·사건의 향방이 달라질 수 있는 구체적인 행동을 제안한다. 앞서 시작한 내용과 다른 방향도 실제 동기가 있을 때 가능하지만, 앞의 사실과 선택 결과를 지우지 않는다.

JSON 객체 하나만 출력: {"nextChoices":["행동 한 문장","행동 한 문장","행동 한 문장"]}`;
}
async function regenChoices() {
  const w = S.world; if (!storyOn(w) || S.adv?.regen) return;
  if (!S.sample) { toast(ERR.no_sample); return; }
  const a = S.adv || (S.adv = { pick: -1, custom: "", err: "" }); a.regen = true; a.err = ""; renderMain();
  try {
    const r = await callJson("choices", choicesPrompt(w), { modelTier: "default" }, { title: w.entities[w.story.protagonistKey].title, ch: w.story.chapter });
    const list = (Array.isArray(r?.nextChoices) ? r.nextChoices : []).map(x => stripMarks(asText(x)).slice(0, 200)).filter(x => x && !isBroken(x)).slice(0, 3);
    if (!list.length) throw { code: "invalid_json" };
    curCh(w).nextChoices = list; a.pick = -1;
    try { await Store.saveWorld(w); } catch {}
  } catch (err) { a.err = "선택지를 만들지 못했습니다. " + errMsg(err); }
  a.regen = false; if (S.view.name === "advance") renderMain();
}
function updateStoryLive() {
  const g = S.storyGen, c = $("#stCount"); if (!g || !c) return;
  const el = Math.floor((performance.now() - g.t0) / 1000);
  const rt = g.retry ? ` · 연결이 끊겨 ${g.retry.mode === "continue" ? "이어 받는 중" : "다시 받는 중"}(${g.retry.n}/${G_RETRY})` : "";
  c.textContent = g.phase === "check" ? `${g.n}장 · 주인공 문서를 설정과 맞춰 보는 중 · ${el}초` : g.phase === "fix" ? `${g.n}장 · 설정과 어긋난 ${g.nFix}곳을 고치는 중 · ${el}초`
    : (g.raw ? `${g.n}장을 쓰는 중 · ${g.raw.length.toLocaleString()}자 · ${el}초` : `${g.n}장 줄거리를 구상하는 중 · ${el}초`) + rt;
}

/* ---------- 스토리 모드: 지연 갱신 (영향받은 문서는 열 때 그 장 섹션을 쓴다) ---------- */
function maybeSync(k) {
  const w = S.world, p = S.pages[k]; if (!isStory(w) || !p || k === w.story.protagonistKey) return;
  if (!missingChs(w, k).length) {   // 반영할 장이 없으면 AI를 부르지 않고 표시만 올린다
    if ((p.syncedTo ?? 0) < w.story.chapter) { p.syncedTo = w.story.chapter; Store.savePage(w.id, p).catch(() => {}); }
    return;
  }
  if (S.syncErr?.key === k || S.syncing === k || S.syncQ.includes(k)) return;
  S.syncQ.push(k); drainSync();
}
function drainSync() {
  const w = S.world; if (!isStory(w) || S.syncing || S.gen || S.storyGen || !S.sample) return;
  while (S.syncQ.length) {
    const k = S.syncQ.shift();
    if (S.pages[k] && missingChs(w, k).length && !(S.edit && S.edit.key === k)) { runSync(k); return; }
  }
}
async function runSync(k) {
  const w = S.world, p = S.pages[k], chs = missingChs(w, k); if (!p || !chs.length) return;
  S.syncing = k; S.syncErr = null;
  if (S.view.name === "article" && S.view.key === k) renderMain(); renderSide();
  let np = null;
  try {
    const out = await callJson("chapterBlock", chapterBlockPrompt(w, k, chs), { modelTier: "default", ...PAGE_MODEL }, { title: p.title, ch: chs.join(",") });
    if (S.world !== w || S.pages[k] !== p) throw { code: "cancelled" };
    const bl = Array.isArray(out?.blocks) ? out.blocks.filter(Boolean) : [], secs = [];
    chs.forEach((n, i) => { const b = bl.find(x => +x.ch === n) || (bl.length === chs.length ? bl[i] : null); if (b) secs.push(...blockToSections(n, b.heading || w.story.chapters[n - 1].title, b.sections)); });
    if (!secs.length) throw { code: "invalid_json" };
    np = rebuildPage(w, k, p, secs, { infoboxPatch: out.infoboxPatch, summaryPatch: out.summaryPatch, facts: out.facts, relations: out.relations, timeline: out.timeline, newEntities: out.newEntities });
    np.syncedTo = w.story.chapter; np.storyNotice = storyOn(w); np.check = null;
    S.pages[k] = np;
  } catch (err) {
    S.syncing = null; S.syncPhase = null;
    if (err?.code !== "cancelled" && S.world === w) S.syncErr = { key: k, msg: errMsg(err) };
    if (S.view.name === "article" && S.view.key === k) renderMain(); renderSide();
    drainSync(); return;
  }
  S.syncing = null; S.syncPhase = null;
  try { await Store.savePage(w.id, np); await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
  if (S.view.name === "article" && S.view.key === k) renderMain();
  else toast(`「${np.title}」에 ${chs.join(", ")}장의 변화를 반영했습니다.`, { label: "열기", fn: () => openEntity(k) });
  renderSide();
  drainSync();
}
