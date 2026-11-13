"use strict";
/* 교정: 코드 교정, 충돌 부분 고치기, 교정 페이지 */
/* ---------- 코드로 하는 교정 ---------- */
/* 본문에 이름만 나오고 링크가 빠진 기존 항목을 첫 등장 위치에서 링크한다 (생성 직후, 조용히) */
function autoLink(w, key, out) {
  if (!Array.isArray(out?.sections)) return 0;
  const linked = new Set();
  for (const t of [...out.sections.map(s => String(s?.body || "")), ...(Array.isArray(out.infobox) ? out.infobox : []).map(r => String(r?.value || ""))])
    for (const m of t.matchAll(LINK_RE)) linked.add(kOf(w, m[1]));
  const cands = [];
  for (const [k, o] of Object.entries(w.entities)) {
    if (k === key || linked.has(k)) continue;
    for (const n of namesOf(o.title)) if (!/^[㐀-鿿]+$/.test(n)) cands.push({ k, n, title: o.title });
  }
  cands.sort((a, b) => b.n.length - a.n.length || (b.n === b.title) - (a.n === a.title));
  const inLink = (t, i) => t.lastIndexOf("[[", i) > t.lastIndexOf("]]", i);
  let added = 0;
  for (const c of cands) {
    if (linked.has(c.k) || added >= 12) continue;
    for (const sec of out.sections) {
      if (!sec || typeof sec.body !== "string") continue;
      let i = sec.body.indexOf(c.n);
      while (i >= 0 && (inLink(sec.body, i) || /[가-힣A-Za-z0-9]/.test(sec.body[i - 1] || ""))) i = sec.body.indexOf(c.n, i + 1);
      if (i < 0) continue;
      const tag = c.n === c.title ? `[[${c.title}]]` : `[[${c.title}|${c.n}]]`;
      sec.body = sec.body.slice(0, i) + tag + sec.body.slice(i + c.n.length);
      linked.add(c.k); added++; break;
    }
  }
  return added;
}

/* ---------- 충돌 부분 고치기 ---------- */
function fixPrompt(w, p, f, issue) {
  return `다음은 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 문서 「${p.title}」의 원문이다. 설정 검사에서 아래 충돌 하나가 지적되었다. 이 충돌만 해결하도록 원문의 해당 부분을 최소한으로 고친다.

## 지적된 충돌
- 문서의 서술: ${issue.claim}
- 충돌하는 확정 설정: ${issue.conflict || "(없음)"}

${canonBlock({ ...w, timeline: (w.timeline || []).filter(t => t.src !== p.key) })}

## 원문
[summary]
${f.summary}

[cats] (분류, | 로 구분)
${f.cats}

[infobox]
${f.infobox}

[body]
${f.body}

## 규칙
- 확정 설정에 맞추어 문서 쪽을 고친다. 확정 설정을 바꾸자고 하지 않는다.
- 충돌한 서술과, 그것을 고치면 함께 어긋나게 되는 서술만 고친다. 많아야 4곳이다.
- 고친 부분은 원래 문체('~이다'체), 링크 표기([[...]]), 말투를 그대로 유지한다. 가능하면 모순을 지우기보다 세계의 디테일로 풀어 낸다.
- old에는 원문에서 고칠 부분을 글자 하나 다르지 않게 복사한다. 문장 하나나 인포박스 한 줄 단위로 잡는다.
- 이 충돌과 상관없는 부분은 건드리지 않는다.

JSON 객체 하나만 출력:
{"edits":[{"field":"summary, cats, infobox, body 중 하나","old":"원문 그대로의 일부","new":"고친 내용"}],"note":"무엇을 어떻게 고쳤는지 한 문장"}`;
}
async function fixIssue(k, idx) {
  const w = S.world, p = S.pages[k], issue = S.memo && S.memo.k === k ? S.memo.items[idx] : null;
  if (!w || !p || !issue || S.fixing) return;
  if (!S.sample) { toast(ERR.no_sample); return; }
  if (S.gen && S.gen.key === k) { toast("이 문서를 작성하는 중이라 고칠 수 없습니다."); return; }
  S.fixing = { key: k, i: idx }; renderMain();
  const f = pageToSource(w, p);
  try {
    const r = await callJson("fix", fixPrompt(w, p, f, issue), { modelTier: "default", ...PAGE_MODEL, effort: "low" }, { title: p.title });
    const nf = { ...f }, applied = [];
    for (const ed of (Array.isArray(r?.edits) ? r.edits : []).slice(0, 6)) {
      const fld = ["summary", "cats", "infobox", "body"].includes(ed?.field) ? ed.field : null;
      let old = String(ed?.old || ""); const nw = String(ed?.new ?? "");
      if (!fld || !old.trim() || old === nw) continue;
      let at = nf[fld].indexOf(old);
      if (at < 0) { old = old.trim(); at = nf[fld].indexOf(old); }
      if (at < 0) continue;
      nf[fld] = nf[fld].slice(0, at) + nw + nf[fld].slice(at + old.length);
      applied.push({ old, new: nw });
    }
    S.fixing = null;
    if (!applied.length) { toast("고칠 곳을 원문에서 찾지 못했습니다. 다시 시도하거나 편집에서 직접 고쳐 주세요."); renderMain(); return; }
    if (S.world !== w || !S.pages[k]) return;
    S.edit = { key: k, f: nf, fix: { note: stripMarks(r?.note || "").slice(0, 240), applied } };
    S.confirmRewrite = null; S.confirmDelPage = null;
    if (S.view.name === "article" && S.view.key === k) { renderMain(true); window.scrollTo({ top: 0 }); }
    else toast(`「${p.title}」의 고치기 제안이 준비되었습니다.`, { label: "열기", fn: () => { S.view = { name: "article", key: k }; renderAll(); } });
  } catch (err) { S.fixing = null; toast(errMsg(err)); renderMain(); }
}

/* ---------- 교정 페이지: 편집자 메모를 한 번에 고치고, 대조는 뒤에서 ---------- */
function fixBatchPrompt(w, p, f, issues) {
  return `다음은 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 문서 「${p.title}」의 원문과, 편집자가 남긴 메모 ${issues.length}개다. 메모마다 지적된 부분만 최소한으로 고친다.

## 메모
${issues.map((i, n) => `${n + 1}. 문서의 서술: ${i.claim}\n   이유: ${i.conflict || "(없음)"}`).join("\n")}

${canonBlock({ ...w, timeline: (w.timeline || []).filter(t => t.src !== p.key) })}

## 원문
[summary]
${f.summary}

[cats] (분류, | 로 구분)
${f.cats}

[infobox]
${f.infobox}

[body]
${f.body}

## 규칙
- 확정 설정과 문체 규칙에 맞추어 문서 쪽을 고친다. 확정 설정을 바꾸자고 하지 않는다.
- 메모 하나당 지적된 서술과, 그것을 고치면 함께 어긋나게 되는 서술만 고친다. 메모 하나에 많아야 3곳이다.
- 고친 부분은 원래 문체('~이다'체), 링크 표기([[...]]), 말투를 그대로 유지한다. 가능하면 모순을 지우기보다 세계의 디테일로 풀어 낸다. 'A가 아니라 B' 꼴의 반전 대구는 쓰지 않는다.
- old에는 원문에서 고칠 부분을 글자 하나 다르지 않게 복사한다. 문장 하나나 인포박스 한 줄 단위로 잡고, 서로 다른 수정이 같은 문장을 겹쳐 잡지 않게 한다.
- 메모와 상관없는 부분은 건드리지 않는다. 고칠 필요가 없다고 판단한 메모는 건너뛴다.

JSON 객체 하나만 출력:
{"edits":[{"memo":1,"field":"summary, cats, infobox, body 중 하나","old":"원문 그대로의 일부","new":"고친 내용"}],"note":"전체적으로 무엇을 고쳤는지 한 문장"}`;
}
/* 다른 문서와 어긋난 서술을 AI로 고친다. field가 "conflicts"면 다른 문서의 직접 수정(그쪽이 기준),
   "autoConflicts"면 자동 대조가 이 문서를 고칠 대상으로 정한 지적이다 */
function openConflictFix(k, field = "conflicts") {
  const p = S.pages[k], list = p?.[field]; if (!list?.length) return;
  if (S.gen && S.gen.key === k) { toast("이 문서를 작성하는 중입니다."); return; }
  const items = list.map(c => ({ claim: c.old, conflict: field === "autoConflicts" ? `「${c.byTitle}」 문서의 설정과 맞추려면 이 문서의 이 서술을 고쳐야 한다: ${c.claim}` : `「${c.byTitle}」 문서를 사용자가 직접 수정해 이렇게 확정했다: ${c.claim}. 이 확정 내용에 맞게 이 문서의 해당 서술과 그와 얽힌 서술을 고친다.`, severity: "high" }));
  S.fixv = { key: k, items, sel: new Set(items.map((_, i) => i)), phase: "pick", edits: [], note: "", err: "", skipped: 0, fromConflicts: field };
  S.view = { name: "fix", key: k }; renderAll(); window.scrollTo({ top: 0 });
  runFixBatch();
}
function openFixView(k, sel, autoRun) {
  const p = S.pages[k]; if (!p || !S.memo || S.memo.k !== k || !S.memo.items.length) return;
  S.fixv = { key: k, items: S.memo.items.slice(), sel: new Set(sel), phase: "pick", edits: [], note: "", err: "", skipped: 0 };
  S.view = { name: "fix", key: k }; renderAll(); window.scrollTo({ top: 0 });
  if (autoRun && S.fixv.sel.size) runFixBatch();
}
async function runFixBatch() {
  const v = S.fixv, w = S.world, p = v && S.pages[v.key]; if (!v || !p || v.phase === "busy") return;
  if (!S.sample) { v.err = ERR.no_sample; renderMain(); return; }
  const picked = [...v.sel].sort((a, b) => a - b); if (!picked.length) return;
  v.phase = "busy"; v.err = ""; v.t0 = performance.now(); renderMain();
  const f = pageToSource(w, p);
  try {
    const r = await callJson("fix", fixBatchPrompt(w, p, f, picked.map(n => v.items[n])), { modelTier: "default", ...PAGE_MODEL, effort: "low" }, { title: p.title + ` · ${picked.length}곳` });
    if (S.fixv !== v) return;
    const edits = [], seen = new Set();
    for (const ed of (Array.isArray(r?.edits) ? r.edits : []).slice(0, 16)) {
      const fld = ["summary", "cats", "infobox", "body"].includes(ed?.field) ? ed.field : null;
      let old = String(ed?.old || ""); const nw = String(ed?.new ?? "");
      if (!fld || !old.trim() || old === nw) continue;
      if (!f[fld].includes(old)) { old = old.trim(); if (!f[fld].includes(old)) continue; }
      if (seen.has(fld + "\u0000" + old)) continue; seen.add(fld + "\u0000" + old);
      const mi = Math.max(1, Math.min(picked.length, parseInt(ed.memo, 10) || 1));
      edits.push({ n: picked[mi - 1], field: fld, old, new: nw, on: true });
    }
    v.edits = edits; v.note = stripMarks(r?.note || "").slice(0, 240);
    v.skipped = picked.filter(n => !edits.some(e => e.n === n)).length;
    v.phase = edits.length ? "review" : "pick";
    if (!edits.length) v.err = "고칠 곳을 원문에서 찾지 못했습니다. 다시 시도하거나 편집에서 직접 고쳐 주세요.";
  } catch (err) { if (S.fixv !== v) return; v.phase = "pick"; v.err = errMsg(err); }
  if (S.view.name === "fix" && S.view.key === v.key) renderMain();
  else if (v.phase === "review") toast(`「${p.title}」의 교정안이 준비되었습니다.`, { label: "열기", fn: () => { S.view = { name: "fix", key: v.key }; renderAll(); } });
}
async function applyFix() {
  const v = S.fixv, w = S.world, k = v?.key, old = k && S.pages[k]; if (!v || !old || v.phase !== "review") return;
  if (S.gen && S.gen.key === k) { toast("이 문서를 작성하는 중이라 저장할 수 없습니다."); return; }
  if (S.storyGen || S.syncing === k) { toast("이야기를 반영하는 중이라 저장할 수 없습니다. 잠시 뒤 다시 적용해 주세요."); return; }
  const nf = pageToSource(w, old); let applied = 0, missed = 0;
  for (const e of v.edits) {
    if (!e.on) continue;
    const at = nf[e.field].indexOf(e.old); if (at < 0) { missed++; continue; }
    nf[e.field] = nf[e.field].slice(0, at) + e.new + nf[e.field].slice(at + e.old.length); applied++;
  }
  if (!applied) { toast("적용할 수정이 없습니다."); return; }
  const out = sourceToOut(nf);
  if (!out.sections.some(x => x.body.trim())) { toast("본문이 비게 되어 저장하지 않았습니다."); return; }
  const backup = JSON.stringify({ entities: w.entities, timeline: w.timeline, navboxes: w.navboxes || {}, relations: w.relations || [], events: w.events || [] });
  let page;
  try {
    for (const o of Object.values(w.entities)) o.mentions = o.mentions.filter(m => m.from !== k);   // 링크와 언급은 고친 본문 기준으로 다시 계산
    for (const [id, nb] of Object.entries(w.navboxes || {})) if (nb.src === k) delete w.navboxes[id];
    page = integrate(w, k, out);
  } catch (err) { restoreRewrite(w, backup); toast("저장하지 못했습니다. " + errMsg(err)); return; }
  if (v.fromConflicts) { const fld = v.fromConflicts === true ? "conflicts" : v.fromConflicts, done = new Set(v.edits.filter(e => e.on).map(e => e.n)); old[fld] = (old[fld] || []).filter((_, i) => !done.has(i)); }   // 고친 충돌 표시는 지운다
  Object.assign(page, { createdAt: old.createdAt, rewrittenAt: old.rewrittenAt, direction: old.direction, editedAt: old.editedAt, fixedAt: Date.now(), stale: false, conflicts: old.conflicts, autoConflicts: old.autoConflicts, autoDismissed: old.autoDismissed, pending: old.pending, check: null, baseAsOf: old.baseAsOf, syncedTo: old.syncedTo, storyNotice: old.storyNotice });
  cleanupOrphans(w, k);
  S.pages[k] = page; S.fixv = null; S.memo = null;
  S.view = { name: "article", key: k }; renderAll(); window.scrollTo({ top: 0 });
  try { await Store.savePage(w.id, page); await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); return; }
  toast(`${applied}곳을 고쳤습니다.${missed ? ` 겹쳐서 적용하지 못한 수정 ${missed}곳은 건너뛰었습니다.` : ""}`);
  bgSync(k);
}
/* 고친 본문의 확정 사실·연표·관계만 정리한다. 모순 검사나 검사 결과 갱신은 하지 않는다. */
async function bgSync(k) {
  const w = S.world, p = S.pages[k]; if (!w || !p || !S.sample) return;
  S.bgSync = k; if (S.view.name === "article" && S.view.key === k) renderMain();
  try {
    const out = sourceToOut(pageToSource(w, p));
    const linkKeys = linksOfOut(w, out, k);
    const temp = { key: k, title: p.title, summary: out.summary, infobox: out.infobox, sections: out.sections, navboxes: out.navboxes };
    const r = await callJson("analyze", factSyncPrompt(w, temp, linkKeys), { modelTier: "check" }, { title: p.title + " · 확정 사실 정리" });
    if (S.world !== w || S.pages[k] !== p) { S.bgSync = null; return; }
    // AI가 고친 본문은 다른 문서를 대체하는 기준이 되지 않는다. 사용자가 직접 수정한 문서라면 그 수정이 세운 대체 표시는 그대로 두고,
    // 직접 수정한 적 없는 문서라면 (예전 버전이 AI 수정으로 붙였던) 대체 표시와 다른 문서의 경고를 걷어낸다.
    const touched = p.editedAt ? new Set() : clearBadges(k);
    for (const o of Object.values(w.entities)) { o.facts = o.facts.filter(f => f.src !== k); if (!p.editedAt) for (const x of [...o.facts, ...o.mentions]) if (x.sup?.by === k) delete x.sup; }
    if (!p.editedAt) { w.timeline.forEach(t => { if (t.sup?.by === k) delete t.sup; }); (w.relations || []).forEach(x => { if (x.sup?.by === k) delete x.sup; }); }
    w.timeline = w.timeline.filter(x => x.src !== k);
    w.relations = (w.relations || []).filter(x => x.src !== k);
    for (const f of (Array.isArray(r?.facts) ? r.facts : [])) { if (!f || !f.fact || !f.about) continue; const fk = kOf(w, f.about); if (w.entities[fk]) addFact(w.entities[fk], String(f.fact), k); }
    acceptPageTimeline(w, r?.timeline, k);
    if (Array.isArray(r?.events)) ingestEvents(w, k, r.events);
    for (const x of (Array.isArray(r?.relations) ? r.relations : []).slice(0, 16)) addRelation(w, k, x);
    for (const n of (Array.isArray(r?.newEntities) ? r.newEntities : [])) {
      if (!n || !n.title) continue; const o = w.entities[kOf(w, n.title)];
      if (o && !o.page && !o.summary && n.summary) { o.summary = stripMarks(n.summary).slice(0, 200); if (!o.type && TYPES.includes(n.type)) o.type = n.type; }
    }
    p.stale = false;
    await Store.savePage(w.id, p);
    for (const x of touched) if (S.pages[x]) await Store.savePage(w.id, S.pages[x]);
    await Store.saveWorld(w);
  } catch (err) { p.stale = true; try { await Store.savePage(w.id, p); } catch {} }
  S.bgSync = null;
  if (S.view.name === "article" && S.view.key === k) renderMain(); else renderSide();
}
function fixvHtml(k) {
  const v = S.fixv, p = S.pages[k], w = S.world;
  if (!v || v.key !== k || !p) return `<div class="sheet"><p class="note">교정할 문서를 찾을 수 없습니다.</p><div class="tools"><button type="button" class="btn" data-act="fixv-back">돌아가기</button></div></div>`;
  const head = `<div class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>교정</span></div><h1 class="t">${esc(p.title)} <span class="note" style="font-family:var(--f-body);font-size:14px;font-weight:400">교정</span></h1>`;
  if (v.phase === "review") {
    const on = v.edits.filter(e => e.on).length;
    return head + `<p class="note">${v.note ? esc(v.note) + " " : ""}고친 문장은 바로 손볼 수 있습니다. 적용하면 즉시 저장되고, 확정 사실과 연표를 정리합니다. 다시 검사하려면 문서의 설정 검사 버튼을 눌러 주세요.</p>
      <div class="fx-list">${v.edits.map((e, i) => `<div class="fx-ed${e.on ? "" : " off"}">
        <label class="fx-on"><input type="checkbox" id="fon-${i}" data-fon="${i}" ${e.on ? "checked" : ""}> 적용 <span class="src">메모: ${esc(v.items[e.n].claim.slice(0, 60))}${v.items[e.n].claim.length > 60 ? "…" : ""}</span></label>
        <del>${esc(e.old)}</del>
        <textarea id="fnew-${i}" data-fnew="${i}" rows="${Math.min(6, Math.max(2, Math.ceil(e.new.length / 60)))}">${esc(e.new)}</textarea></div>`).join("")}</div>
      ${v.skipped ? `<p class="note">수정안이 나오지 않은 메모 ${v.skipped}개는 그대로 남습니다.</p>` : ""}
      <div class="row"><button type="button" class="btn pri" data-act="fixv-apply" ${on ? "" : "disabled"}>${on}곳 적용하고 저장</button><button type="button" class="btn" data-act="fixv-redo">메모 다시 고르기</button><button type="button" class="btn" data-act="fixv-back">취소</button></div></div>`;
  }
  const busy = v.phase === "busy", n = v.sel.size;
  return head + `<p class="note">고칠 메모를 고르면 한 번에 수정안을 만듭니다. 수정안을 확인한 뒤 적용합니다.</p>
    <div class="fx-list">${v.items.map((i, x) => `<label class="fx-pick"><input type="checkbox" id="fsel-${x}" data-fsel="${x}" ${v.sel.has(x) ? "checked" : ""} ${busy ? "disabled" : ""}><span><span class="sev">${i.lint ? "문체" : i.severity === "high" ? "다듬을 곳" : "참고"}</span>${esc(i.claim)}${i.conflict ? `<span class="memo-why">${esc(i.conflict)}</span>` : ""}</span></label>`).join("")}</div>
    ${v.err ? `<div class="banner warn">${esc(v.err)}</div>` : ""}
    <div class="row"><button type="button" class="btn pri" data-act="fixv-run" ${busy || !n || !S.sample ? "disabled" : ""}>${busy ? `수정안을 만드는 중… <span id="fxTick"></span>` : `선택한 ${n}곳 고치기`}</button><button type="button" class="btn" data-act="fixv-back">돌아가기</button></div></div>`;
}
