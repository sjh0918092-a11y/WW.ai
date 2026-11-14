"use strict";
/* 문단 편집, 직접 편집 화면과 저장, 문서·세계관 삭제 */
/* 문단 편집은 제목 하나와 그 아래 하위 문단에만 적용한다. */
const sectionBaseStamp = (w, p) => JSON.stringify([imageDocStamp(p), p.categories, p.notices, pageToSource(w, p).navbox]);
function openSectionEditor(k, index) {
  const w = S.world, p = S.pages[k]; if (!w || !p || !Number.isInteger(index) || !p.sections[index]) return;
  if (portraitBusy(k) || S.portraitJob) { toast("문서 작업이 끝난 뒤 문단을 편집해 주세요."); return; }
  if (S.edit?.aiBusy || S.edit?.saving) { toast("진행 중인 문단 수정을 마치거나 중단해 주세요."); return; }
  let end = index + 1; const root = p.sections[index];
  if ((root.level || 1) === 1) while (end < p.sections.length && (p.sections[end].level || 1) === 2) end++;
  const f = pageToSource(w, p); f.body = pageToSource(w, { ...p, sections: p.sections.slice(index, end) }).body;
  S.edit = { key: k, f, section: { index, end, root: { ...root }, stamp: sectionBaseStamp(w, p) }, aiDirection: "" };
  S.confirmRewrite = null; S.confirmDelPage = null; renderMain(true); window.scrollTo({ top: 0 }); $("#edBody")?.focus();
}
function sectionDraft(ed) {
  const parsed = parseHeadings(ed.f.body), root = ed.section.root;
  if (parsed.pre && parsed.parts.length) throw new Error("문단 제목 앞에는 본문을 두지 마세요.");
  const parts = parsed.parts.length ? parsed.parts.map(x => ({ heading: x.heading.replace(/^\[\d+장\]\s*/, ""), level: x.level, body: x.text })) : [{ heading: root.heading, level: root.level || 1, body: parsed.pre }];
  if (parts[0].level !== (root.level || 1) || parts.slice(1).some(x => (root.level || 1) === 2 || x.level !== 2)) throw new Error("선택한 문단의 제목 수준을 유지해 주세요. 상위 문단에는 하위 문단만 추가할 수 있습니다.");
  return parts.map(x => { if (!x.heading.trim()) throw new Error("문단 제목을 입력해 주세요."); return { ...x, ...(root.ch ? { ch: root.ch } : {}) }; });
}
function sectionEditOut(w, p, ed) {
  const out = sourceToOut(pageToSource(w, p));
  for (const field of ["type", "summary", "categories", "notices", "infobox"]) if (p[field] !== undefined) out[field] = p[field];
  out.sections = [...p.sections.slice(0, ed.section.index), ...sectionDraft(ed), ...p.sections.slice(ed.section.end)];
  return out;
}
/* 선택한 문단 다시 쓰기 프롬프트 */
function sectionRewritePrompt(w, p, key, root, draft, direction) {
  return `## 선택한 문단 다시 쓰기
가상 세계관 위키의 선택된 문단만 수정한다. 나머지 문서·인포박스·분류는 수정하지 않는다.
${canonBlock(w)}
${isStory(w) ? storyBlock(w, key, true) : ""}
${toneBlock(w)}
## 다른 문서가 확정한 사실
${entityBrief(w, key, key)}
${promptFacts(w, key, w.entities[key].facts.filter(f => live(f) && f.src !== key)).map(f => factLine(f)).join("\n")}
${promptMentions(w, key, w.entities[key].mentions.filter(m => live(m) && m.from !== key)).map(m => m.text).join("\n")}
${relationsOf(w, key).filter(live).map(r => relLine(w, r)).join("\n")}
${related(w, key).map(k => entityBrief(w, k, key)).join("\n\n")}
## 전체 문서 (앞뒤 흐름을 위한 참고)
${docForCheck(p)}
## 수정할 문단과 하위 문단 (현재 초안)
${draft}
## 사용자가 요청한 수정 방향
${direction?.trim() || "확정 내용과 결말은 유지하면서 선택한 문단만 처음부터 다시 써라."}
## 출력 규칙
선택한 문단만 출력한다. 기존 확정 설정·연표·신원·나이·관계를 지킨다. 링크는 [[제목]] 또는 [[제목|보일 말]]로 건다. ${linkNameRule()} 다른 문단의 내용을 덮어쓰거나 같은 설명을 불필요하게 반복하지 않는다. 요청에 따라 문장 수정·보강·전면 다시 쓰기를 한다. 설명문이나 '작성 방향:'을 붙이지 않는다.
첫 문단의 level은 ${root.level || 1}이다. ${(root.level || 1) === 2 ? "문단 하나만 출력한다." : "첫 상위 문단 하나와 필요한 하위 문단(level 2)만 출력한다. 다른 상위 문단은 출력하지 않는다."} 이야기 장 번호는 앱이 유지하므로 heading에 붙이지 않는다.
JSON 객체 하나: {"sections":[{"heading":"제목","level":${root.level || 1},"body":"위키 문법의 본문"}]}`;
}
async function rewriteSection() {
  const ed = S.edit, w = S.world, p = ed && S.pages[ed.key];
  if (!ed?.section || ed.aiBusy || ed.saving || !w || !p || !S.sample) return;
  if (portraitBusy(ed.key) || S.portraitJob) { edStatus("문서 작업이 끝난 뒤 문단을 다시 써 주세요."); return; }
  if (sectionBaseStamp(w, p) !== ed.section.stamp) { edStatus("원본 문서가 바뀌었습니다. 초안을 복사한 뒤 문서를 다시 열어 주세요."); return; }
  const draft = ed.f.body; ed.aiBusy = true; ed.ctl = new AbortController(); ed.aiError = ""; renderMain(true);
  const prompt = sectionRewritePrompt(w, p, ed.key, ed.section.root, draft, ed.aiDirection);
  try {
    const out = await callJson("section", prompt, { modelTier: "default", signal: ed.ctl.signal }, { title: p.title + " · " + ed.section.root.heading });
    if (S.edit !== ed || S.world !== w || ed.ctl.signal.aborted) return;
    if (!Array.isArray(out?.sections) || !out.sections.length || out.sections.length > 20 || out.sections.some(x => !x || typeof x.heading !== "string" || !x.heading.trim() || ![1, 2].includes(x.level) || typeof x.body !== "string" || x.body.length > 60000)) throw new Error("문단 응답 형식을 확인할 수 없습니다.");
    const candidate = pageToSource(w, { ...p, sections: out.sections.map(x => ({ heading: x.heading, level: x.level, body: x.body })) }).body;
    sectionDraft({ ...ed, f: { ...ed.f, body: candidate } });
    if (ed.f.body !== draft) throw new Error("생성 중 초안이 바뀌었습니다. 다시 요청해 주세요.");
    ed.aiBefore = draft; ed.f.body = candidate; ed.aiError = "AI 초안을 편집 칸에 반영했습니다. 확인한 뒤 저장해 주세요.";
  } catch (e) { if (S.edit === ed) ed.aiError = e.code === "cancelled" ? "AI 수정을 중단했습니다. 기존 초안은 유지했습니다." : (e.message || errMsg(e)); }
  finally { ed.aiBusy = false; if (S.edit === ed && S.world === w) renderMain(true); }
}
function sectionEditHtml(k) {
  const ed = S.edit, title = S.pages[k]?.title || "", busy = ed.aiBusy || ed.saving, disabled = busy ? "disabled" : "";
  return `<div class="sheet ed"><div class="crumb"><span>${esc(S.world.title)}</span><span>문단 편집</span></div><h1 class="t">${esc(ed.section.root.heading)} <span class="note">편집</span></h1>
    <p class="note">「${esc(title)}」의 이 문단${ed.section.end - ed.section.index > 1 ? "과 하위 문단" : ""}만 수정합니다. 나머지 본문·인포박스·이미지·단편은 유지합니다.${ed.section.root.ch ? ` ${ed.section.root.ch}장 소속도 유지합니다.` : ""}</p>
    <label class="lb" for="edBody">문단 내용</label><textarea id="edBody" data-ef="body" rows="20" ${disabled}>${esc(ed.f.body)}</textarea>
    <p class="note">제목은 = 제목 =, 하위 제목은 == 제목 == 형식입니다. 선택한 문단의 제목 수준은 유지해 주세요.</p>
    <section class="section-ai"><label class="lb" for="sectionDirection">AI 수정·다시 쓰기 방향 (선택)</label><textarea id="sectionDirection" rows="3" maxlength="2000" placeholder="예: 이 전투의 경과만 더 구체적으로. 결말은 유지하고 긴장감을 높여 줘." ${disabled}>${esc(ed.aiDirection || "")}</textarea>
      ${ed.aiError ? `<p class="note" role="status">${esc(ed.aiError)}</p>` : ""}
      <div class="row"><button type="button" class="btn" data-act="section-rewrite" ${disabled || !S.sample ? "disabled" : ""}>${ed.aiBusy ? "문단을 고치는 중…" : "AI로 이 문단 고치기"}</button>${ed.aiBusy ? `<button type="button" class="btn" data-act="section-stop">AI 중단</button>` : ""}${ed.aiBefore !== undefined ? `<button type="button" class="btn" data-act="section-undo" ${disabled}>AI 수정 전으로</button>` : ""}</div>
    </section><p class="note">AI 수정은 저장 전 초안입니다. 저장할 때 기존 설정과 대조하고 충돌이 있으면 확인합니다.</p>
    <div id="edConflicts"></div><div class="banner warn" id="edErr" hidden></div><div class="row"><button type="button" class="btn pri" id="edSave" data-act="ed-save" ${disabled}>저장</button><button type="button" class="btn" data-act="ed-cancel" ${ed.saving ? "disabled" : ""}>취소</button></div></div>`;
}

function openEditor(k) {
  if (S.edit?.aiBusy || S.edit?.saving) { toast("진행 중인 문단 수정을 마치거나 중단해 주세요."); return; }
  const p = S.pages[k]; if (!p) return;
  if (isHeld(k)) { toast("이 문서에 반영한 장을 설정과 맞춰 보는 중입니다. 끝난 뒤 편집해 주세요."); return; }
  if (!S.edit || S.edit.key !== k || S.edit.section) S.edit = { key: k, f: pageToSource(S.world, p) };
  S.confirmRewrite = null; S.confirmDelPage = null; renderMain(true); window.scrollTo({ top: 0 });
}
function edStatus(msg, busy) {
  const btn = $("#edSave"), err = $("#edErr");
  if (btn) { btn.disabled = !!busy; btn.textContent = busy ? "설정과 대조하는 중…" : "저장"; }
  if (err) { err.hidden = !msg; err.innerHTML = msg || ""; }
  if (S.edit?.section) {
    document.querySelectorAll(".ed textarea, .ed [data-act='section-rewrite'], .ed [data-act='section-undo']").forEach(el => el.disabled = !!busy || !!S.edit.aiBusy);
    const cancel = document.querySelector(".ed [data-act='ed-cancel']"); if (cancel) cancel.disabled = !!S.edit.saving;
  }
}
async function saveEdit(skipCheck) {
  const ed = S.edit, w = S.world; if (!ed || !w) return;
  const k = ed.key, e = w.entities[k];
  $("#edConflicts") && ($("#edConflicts").innerHTML = "");
  if (!S.pages[k]) { edStatus("원본 문서를 찾을 수 없습니다."); return; }
  if (S.gen && S.gen.key === k) { edStatus("이 문서를 작성하는 중이라 저장할 수 없습니다."); return; }
  if (S.syncing === k) { edStatus("이 문서에 장의 변화를 반영하는 중이라 저장할 수 없습니다. 잠시 뒤 다시 저장해 주세요."); return; }
  if (S.storyGen) { edStatus("다음 장을 쓰는 중이라 저장할 수 없습니다. 끝난 뒤 다시 저장해 주세요."); return; }
  if (ed.aiBusy || ed.saving) return;
  let out;
  try {
    if (ed.section && sectionBaseStamp(w, S.pages[k]) !== ed.section.stamp) throw new Error("원본 문서가 바뀌었습니다. 초안을 복사한 뒤 문서를 다시 열어 주세요.");
    out = ed.section ? sectionEditOut(w, S.pages[k], ed) : sourceToOut(ed.f);
  } catch (err) { edStatus(esc(err.message || errMsg(err))); return; }
  if (!out.sections.some(s => s.body.trim())) { edStatus("본문이 비어 있습니다. 섹션 아래에 내용을 적어 주세요."); return; }
  if (skipCheck || !S.sample) { commitEdit(ed, out, null, [], {}); return; }
  const snap = JSON.stringify(ed.f);
  const linkKeys = linksOfOut(w, out, k);
  const ctx = conflictContext(w, k, linkKeys);
  const temp = { key: k, title: e.title, summary: out.summary, infobox: out.infobox, sections: out.sections, navboxes: out.navboxes };
  edStatus("", true);
  let r;
  try { r = await callJson("analyze", analyzePrompt(w, temp, linkKeys, ctx), { modelTier: "check" }, { title: w.entities[k]?.title || "" }); }
  catch (err) {
    if (S.edit !== ed) return;
    edStatus(`설정과 대조하지 못했습니다. ${esc(errMsg(err))} <button type="button" class="btn" data-act="ed-save-raw" style="margin-left:6px;padding:2px 10px">대조 없이 저장</button>`);
    return;
  }
  if (S.edit !== ed || S.world !== w) return;
  if (JSON.stringify(ed.f) !== snap) { edStatus("대조하는 동안 내용이 바뀌었습니다. 다시 저장해 주세요."); return; }
  edStatus("");
  const conflicts = readConflicts(w, r?.conflicts, ctx.refs);
  const ask = conflicts.filter(c => c.ask);
  if (!ask.length) { commitEdit(ed, out, r, conflicts, {}); return; }
  ed.pending = { out, r, conflicts, draftStamp: JSON.stringify(ed.f) };
  const box = $("#edConflicts"); if (box) { box.innerHTML = conflictPanelHtml(w, ask); box.scrollIntoView({ block: "start", behavior: "smooth" }); }
}
function conflictPanelHtml(w, ask) {
  return `<div class="cfpanel"><b>수정한 내용이 직접 정한 설정과 충돌합니다</b>
    <p class="note">AI가 쓴 문서와의 충돌은 저장할 때 자동으로 정리됩니다. 아래는 직접 정하신 설정이라 어느 쪽을 따를지 골라 주세요.</p>
    ${ask.map(c => `<div class="cf">
      <div class="cf-h">${esc(conflictLabel(w, c))}</div>
      <div class="cf-old"><span>기존</span>${esc(c.old)}</div>
      <div class="cf-new"><span>수정본</span>${esc(c.claim)}</div>
      ${c.kind === "rule" ? `<label class="cf-ch"><input type="checkbox" id="cf-${c.id}" checked> 이 규칙을 아래처럼 고치기</label><input class="txt" id="cs-${c.id}" value="${esc(c.suggest)}">`
        : c.kind === "canon" ? `<p class="note" style="margin:6px 0 0">사용자 확정 설정은 설정 노트에서 직접 고쳐 주세요. 이대로 저장하면 이 문서에 충돌 표시가 남습니다.</p>`
        : `<label class="cf-ch"><input type="checkbox" id="cf-${c.id}" checked> 이 수정을 기준으로 삼고 「${esc(w.entities[c.src]?.title || "?")}」에 충돌 표시하기</label>`}
    </div>`).join("")}
    <div class="row"><button type="button" class="btn pri" data-act="cf-apply">선택한 대로 저장</button><button type="button" class="btn" data-act="cf-back">편집으로 돌아가기</button></div></div>`;
}
function applyConflictChoices() {
  const ed = S.edit; if (!ed?.pending) return;
  if (ed.section && ed.pending.draftStamp !== JSON.stringify(ed.f)) { ed.pending = null; if ($("#edConflicts")) $("#edConflicts").innerHTML = ""; edStatus("충돌 확인 중 초안이 바뀌었습니다. 다시 저장해 주세요."); return; }
  const ch = { rules: {}, keep: {} };
  for (const c of ed.pending.conflicts.filter(c => c.ask)) {
    const box = document.getElementById("cf-" + c.id);
    if (c.kind === "rule") { if (box?.checked) { const v = norm(document.getElementById("cs-" + c.id)?.value || ""); if (v) ch.rules[c.id] = v; } }
    else if (c.kind !== "canon" && box?.checked) ch.keep[c.id] = true;
  }
  const { out, r, conflicts } = ed.pending; ed.pending = null;
  commitEdit(ed, out, r, conflicts, ch);
}
function badge(w, src, k, c, touched) {
  const P = S.pages[src]; if (!P || src === k) return;
  (P.conflicts ||= []).push({ by: k, byTitle: w.entities[k].title, old: c.old, claim: c.claim });
  touched.add(src);
}
function clearBadges(k) {
  const touched = new Set();
  for (const [x, P] of Object.entries(S.pages)) if (P.conflicts?.some(c => c.by === k)) { P.conflicts = P.conflicts.filter(c => c.by !== k); touched.add(x); }
  return touched;
}
async function commitEdit(ed, out, r, conflicts, ch) {
  const w = S.world, k = ed.key, e = w.entities[k]; let old = S.pages[k];
  if (S.edit !== ed || !old || ed.saving) return;
  if (ed.section) {
    ed.saving = true; edStatus("", true);
    try {
      const latest = await Store.getPage(w.id, k);
      if (S.edit !== ed || S.world !== w) { ed.saving = false; return; }
      if (!latest || sectionBaseStamp(w, latest) !== ed.section.stamp || sectionBaseStamp(w, old) !== ed.section.stamp) throw new Error("원본 문서가 바뀌었습니다. 초안을 복사한 뒤 문서를 다시 열어 주세요.");
      old = latest;
    } catch (err) { ed.saving = false; edStatus(esc(err.message || errMsg(err))); return; }
  }
  const pagesBackup = ed.section ? Object.fromEntries(Object.entries(S.pages).map(([key, p]) => [key, { ...p, ...(p.conflicts ? { conflicts: p.conflicts.slice() } : {}) }])) : null;
  const ownNavboxes = ed.section ? Object.fromEntries(Object.entries(w.navboxes || {}).filter(([, nb]) => nb.src === k)) : null;
  const backup = JSON.stringify({ entities: w.entities, timeline: w.timeline, navboxes: w.navboxes || {}, relations: w.relations || [], events: w.events || [], glossary: w.glossary || [], rules: w.rules });
  const touched = clearBadges(k);
  let page;
  try {
    for (const o of Object.values(w.entities)) {
      o.mentions = o.mentions.filter(m => m.from !== k);              // 링크와 언급은 수정본 기준으로 다시 계산
      for (const x of [...o.facts, ...o.mentions]) if (x.sup?.by === k) delete x.sup;   // 이전 수정이 대체했던 사실은 이번 대조 결과로 다시 정한다
    }
    w.timeline.forEach(t => { if (t.sup?.by === k) delete t.sup; });
    (w.relations || []).forEach(x => { if (x.sup?.by === k) delete x.sup; });
    for (const [id, nb] of Object.entries(w.navboxes || {})) if (nb.src === k) delete w.navboxes[id];
    page = integrate(w, k, out);
  } catch (err) { const b = JSON.parse(backup); restoreRewrite(w, backup); w.rules = b.rules; ed.saving = false; edStatus("저장하지 못했습니다. " + esc(errMsg(err))); return; }
  if (ed.section) {
    for (const field of ["title", "type", "summary", "categories", "notices", "infobox", "style", "portrait", "shortStories"]) { if (old[field] !== undefined) page[field] = old[field]; else delete page[field]; }
    page.sections = out.sections;
    for (const [id, nb] of Object.entries(w.navboxes || {})) if (nb.src === k) delete w.navboxes[id];
    Object.assign(w.navboxes, ownNavboxes);
  }
  Object.assign(page, { createdAt: old.createdAt, rewrittenAt: old.rewrittenAt, direction: old.direction, editedAt: Date.now(), stale: !r, baseAsOf: old.baseAsOf, syncedTo: old.syncedTo, storyNotice: old.storyNotice });
  if (r) {
    for (const o of Object.values(w.entities)) o.facts = o.facts.filter(f => f.src !== k);
    w.timeline = w.timeline.filter(x => x.src !== k);
    for (const f of (Array.isArray(r.facts) ? r.facts : [])) { if (!f || !f.fact || !f.about) continue; const fk = kOf(w, f.about); if (w.entities[fk]) addFact(w.entities[fk], String(f.fact), k); }
    for (const t of (Array.isArray(r.timeline) ? r.timeline : [])) addTimeline(w, t, k);
    afterTimeline(w);
    if (Array.isArray(r.events)) ingestEvents(w, k, r.events);   // 직접 고친 문서의 사건 기록은 기준이 된다
    w.relations = (w.relations || []).filter(x => x.src !== k);
    for (const x of (Array.isArray(r.relations) ? r.relations : []).slice(0, 16)) addRelation(w, k, x);
    for (const n of (Array.isArray(r.newEntities) ? r.newEntities : [])) {
      if (!n || !n.title) continue; const o = w.entities[kOf(w, n.title)];
      if (o && !o.page && !o.summary && n.summary) { o.summary = stripMarks(n.summary).slice(0, 200); if (!o.type && TYPES.includes(n.type)) o.type = n.type; }
    }
  }
  // 충돌 처리: AI 문서는 자동으로 대체, 직접 정한 설정은 사용자 선택에 따른다
  const pending = []; let auto = 0, ruled = 0;
  for (const c of conflicts) {
    if (c.kind === "rule") { if (ch.rules?.[c.id] && w.rules[c.i] !== undefined) { w.rules[c.i] = ch.rules[c.id]; ruled++; } else pending.push(c); continue; }
    if (c.kind === "canon") { pending.push(c); continue; }
    if (c.ask && !ch.keep?.[c.id]) { pending.push(c); continue; }
    const target = c.f || c.m || c.t || c.l;
    if (!target) continue;
    target.sup = { by: k };
    if (c.src && c.src !== "seed") badge(w, c.src, k, c, touched);
    if (!c.ask) auto++;
  }
  page.pending = pending.map(c => ({ label: conflictLabel(w, c), old: c.old, claim: c.claim }));
  cleanupOrphans(w, k);
  if (ed.section) {
    const changed = [...touched].filter(x => x !== k && S.pages[x]).map(x => S.pages[x]);
    try {
      await Store.savePage(w.id, page);
      for (const q of changed) await Store.savePage(w.id, q);
      await Store.saveWorld(w);
    } catch (err) {
      restoreRewrite(w, backup); w.rules = JSON.parse(backup).rules;
      if (S.world === w) { S.pages = pagesBackup; S.pages[k] = old; }
      try { await Store.putPageRaw(w.id, old); for (const q of changed) if (pagesBackup[q.key]) await Store.putPageRaw(w.id, pagesBackup[q.key]); await Store.saveWorld(w); } catch {}
      ed.saving = false; edStatus("저장하지 못했습니다. 초안은 유지했습니다. " + esc(errMsg(err))); return;
    }
    if (S.world === w) S.pages[k] = page;
    if (S.edit === ed) S.edit = null;
    if (S.world === w) { noteExplore(k, "edited"); renderAll(); if (S.view.key === k) document.getElementById("s-" + ed.section.index)?.scrollIntoView({ block: "start" }); }
    toast("문단을 저장했습니다."); return;
  }
  S.pages[k] = page; S.edit = null; noteExplore(k, "edited"); renderAll(); window.scrollTo({ top: 0 });
  try {
    await Store.savePage(w.id, page);
    for (const x of touched) if (S.pages[x]) await Store.savePage(w.id, S.pages[x]);
    await Store.saveWorld(w);
  } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); return; }
  const parts = [];
  if (!r) parts.push("설정과 대조하지 않았습니다");
  if (auto) parts.push(`다른 문서의 서술 ${auto}곳을 이 수정으로 대체하고 표시했습니다`);
  if (ruled) parts.push(`핵심 규칙 ${ruled}개를 고쳤습니다`);
  if (pending.length) parts.push(`해결하지 않은 충돌 ${pending.length}건이 남아 있습니다`);
  toast("저장했습니다." + (parts.length ? " " + parts.join(". ") + "." : ""));
}
async function deletePage(k) {
  const w = S.world, e = w.entities[k], p = S.pages[k]; if (!e || !p) return;
  if (S.gen && S.gen.key === k) { toast("작업 중인 문서는 삭제할 수 없습니다."); return; }
  if (isStory(w) && k === w.story.protagonistKey) { toast("주인공 문서는 삭제할 수 없습니다."); return; }
  if (S.storyGen) { toast("다음 장을 쓰는 중이라 삭제할 수 없습니다."); return; }
  if (S.syncing === k) { toast("장의 변화를 반영하는 중이라 삭제할 수 없습니다."); return; }
  purge(w, k);                                       // 이 문서가 대체했던 다른 문서의 사실도 되살아난다
  const touched = clearBadges(k);
  for (const [id, nb] of Object.entries(w.navboxes || {})) if (nb.src === k) delete w.navboxes[id];
  e.page = false; e.summary = e.stub?.summary || ""; e.type = e.stub?.type || ""; e.box = "";
  delete S.pages[k]; touched.delete(k); if (S.edit && S.edit.key === k) S.edit = null;
  cleanupOrphans(w, k);
  const keep = k === w.mainKey || e.facts.length || e.mentions.length;
  if (!keep) { delete w.entities[k]; S.recent = S.recent.filter(x => x !== k); }
  S.confirmDelPage = null; S.genErr = null;
  S.view = { name: "article", key: keep ? k : w.mainKey }; renderAll(); window.scrollTo({ top: 0 });
  try {
    await Store.deletePage(w.id, k);
    for (const x of touched) if (S.pages[x]) await Store.savePage(w.id, S.pages[x]);
    await Store.saveWorld(w); toast(`「${e.title}」 문서를 삭제했습니다.`);
  } catch (err) { toast("삭제를 저장하지 못했습니다. " + errMsg(err)); }
}
/* 편집자 메모 하나를 지운다. 번호는 화면에 그린 순서(S.memo.items)를 따른다 */
async function deleteMemo(k, idx) {
  const p = S.pages[k], it = S.memo && S.memo.k === k ? S.memo.items[idx] : null;
  if (!p || !it || !p.check || (S.fixing && S.fixing.key === k)) return;
  p.check.issues = (p.check.issues || []).filter(x => x !== it); renderMain();
  try { await Store.savePage(S.world.id, p); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}
async function dismissNotes(k, field) {
  const p = S.pages[k]; if (!p) return;
  if (field === "autoConflicts") p.autoDismissed = [...(p.autoDismissed || []), ...(p.autoConflicts || []).map(c => ({ by: c.by, old: c.old }))].slice(-50);   // 다시 검사해도 같은 표시를 달지 않게
  p[field] = []; renderMain();
  try { await Store.savePage(S.world.id, p); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}

async function saveCanon() {
  const w = S.world;
  w.rules = $("#rulesTa").value.split("\n").map(s => s.replace(/^[-•\s]+/, "").trim()).filter(Boolean).slice(0, 20);
  w.userCanon = $("#userTa").value.trim().slice(0, 4000);
  if (!isStory(w) && $("#stageNow")) {
    w.stage = normStage({ units: Array.from({ length: 6 }, (_, i) => ({ name: $(`#stageName${i}`)?.value, kind: $(`#stageKind${i}`)?.value, desc: $(`#stageDesc${i}`)?.value, rel: $(`#stageRel${i}`)?.value })), now: $("#stageNow").value });
    registerStageUnits(w);
  }
  const nt = norm($("#wTitle")?.value || "").slice(0, 40); if (nt) w.title = nt;
  if ($("#wTag")) w.tagline = norm($("#wTag").value).slice(0, 160);
  if ($("#wHist")) w.historical = $("#wHist").checked;
  if ($("#wImageGuide")) w.imageGuide = $("#wImageGuide").value.trim().slice(0, 2000);
  if ($("#wGuide")) w.guide = $("#wGuide").value.replace(/\r/g, "").trim().slice(0, 1000);
  renderTop();
  const tl = norm($("#toneLabel")?.value || "").slice(0, 60);
  const tg = ($("#toneGuide")?.value || "").split("\n").map(x => x.replace(/^[-•\s]+/, "").trim()).filter(Boolean).slice(0, 12);
  w.tone = tl && tg.length ? { label: tl, guide: tg } : (tl || tg.length ? { label: tl || "지정한 분위기", guide: tg } : null);
  if (!w.tone) w.toneTried = true;
  readGlossaryForm(w);
  try { await Store.saveWorld(w); toast("설정 노트를 저장했습니다. 이후 작성되는 문서부터 반영됩니다."); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}

/* 설정 노트의 용어 정의 칸을 읽는다. 사용자가 고친 정의는 사용자 정의가 되고, 엇갈리던 후보는 정리된다 */
function readGlossaryForm(w) {
  if (document.querySelector("[data-gl-def]")) {
    const next = [];
    (w.glossary || []).forEach((g, i) => {
      const ta = document.querySelector(`[data-gl-def="${i}"]`); if (!ta) { next.push(g); return; }
      const def = ta.value.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!def) return;   // 비우고 저장하면 지운다(사용자가 한 일)
      if (def !== g.definition) { g.definition = def; g.src = "user"; delete g.alts; }
      g.confirmed = !!document.querySelector(`[data-gl-ok="${i}"]`)?.checked;
      next.push(g);
    });
    w.glossary = next;
  }
  const nt = norm($("#glNewTerm")?.value || "").slice(0, 40), nd = ($("#glNewDef")?.value || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (nt && nd) {
    w.glossary ||= [];
    const g = findTerm(w, nt);
    if (g) { Object.assign(g, { definition: nd, src: "user", confirmed: true }); delete g.alts; }
    else w.glossary.push({ term: nt, definition: nd, src: "user", confirmed: true, at: Date.now() });
  }
}
async function chooseTerm(i, alt) {
  const w = S.world; if (!w || !pickTerm(w, i, alt)) return;
  renderMain(); document.getElementById("glossary")?.scrollIntoView({ block: "start" });
  try { await Store.saveWorld(w); toast(`「${w.glossary[i].term}」의 정의를 확정했습니다. 이후 작성하는 문서부터 반영됩니다.`); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}
async function deleteWorld(wid) {
  try { await Store.deleteWorld(wid); S.worlds = S.worlds.filter(w => w.id !== wid); S.confirmDel = null; renderMain(); toast("세계관을 삭제했습니다."); }
  catch (err) { toast("삭제하지 못했습니다. " + errMsg(err)); }
}
