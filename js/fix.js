"use strict";
/* 교정: 코드 교정, 충돌 부분 고치기, 교정 페이지 */
/* ---------- 코드로 하는 교정 ---------- */
function documentNameOwners(w) {
  const names = new Map();
  const add = (name, k) => {
    const id = identityName(name);
    if (!id) return;
    if (!names.has(id)) names.set(id, new Map());
    names.get(id).set(k, name);
  };
  for (const [k, p] of Object.entries(S.pages)) {
    if (!w.entities[k]) continue;
    for (const n of [...namesOf(p.title), ...infoboxNames(p)]) add(n, k);
    for (const text of [...(p.infobox || []).map(r => r.value), ...(p.sections || []).map(s => s.body)]) {
      for (const m of String(text).matchAll(LINK_RE)) {
        const label = m[2] || m[1], owner = w.aliases?.[keyOf(label)];
        if (owner && S.pages[owner]) add(label, owner);
      }
    }
  }
  return names;
}
/* 생성 직후, 본문과 인포박스에서 이름이 나올 때마다 빠진 링크를 붙인다. */
function autoLink(w, key, out) {
  if (!Array.isArray(out?.sections)) return 0;
  const fields = [...out.sections.filter(s => typeof s?.body === "string").map(s => [s, "body"]),
    ...(Array.isArray(out.infobox) ? out.infobox : []).filter(r => typeof r?.value === "string").map(r => [r, "value"])];
  const owners = documentNameOwners(w);
  const cands = [];
  for (const [k, o] of Object.entries(w.entities)) {
    if (k === key) continue;
    for (const n of namesOf(o.title)) if (n === o.title || !/^[㐀-鿿]+$/.test(n)) {
      if ((owners.get(identityName(n))?.size || 0) <= 1 || n === o.title) cands.push({ n, title: o.title });
    }
  }
  for (const group of owners.values()) if (group.size === 1) {
    const [[k, n]] = group;
    if (k !== key) cands.push({ n, title: w.entities[k].title });
  }
  /* 이 초안이 링크나 구조화한 항목으로 명시한 새 이름도 링크한다. */
  const self = w.entities[key]?.title, named = new Set();
  const nameOf = t => { t = norm(stripMarks(String(t ?? ""))); if (t.length >= 2 && t.length <= 40 && t !== self && !/[\[\]|]/.test(t)) named.add(t); };
  for (const r of Array.isArray(out.relations) ? out.relations : []) { nameOf(r?.a); nameOf(r?.b); }
  for (const f of Array.isArray(out.facts) ? out.facts : []) nameOf(f?.about);
  for (const e of Array.isArray(out.events) ? out.events : []) for (const x of Array.isArray(e?.participants) ? e.participants : []) nameOf(x);
  for (const x of Array.isArray(out.newEntities) ? out.newEntities : []) nameOf(x?.title);
  for (const [row, field] of fields) for (const m of row[field].matchAll(LINK_RE)) nameOf(m[1]);
  for (const t of named) {
    const k = kOf(w, t);
    if (k !== key && !w.entities[k]) cands.push({ n: t, title: t });
  }
  cands.sort((a, b) => b.n.length - a.n.length || (b.n === b.title) - (a.n === a.title));
  const inLink = (t, i) => t.lastIndexOf("[[", i) > t.lastIndexOf("]]", i);
  const insideWord = /[\p{L}\p{N}_]/u;
  const particles = /^(?:(?:으로|에서|에게|한테|께서|까지|부터|보다|처럼|마저|조차|하고|이며|이라고|라는|이란|이나|라도|로|에|의|은|는|이|가|을|를|과|와|도|만|께|랑|라고)(?:는|도|만)?)(?![\p{L}\p{N}_])/u;
  let added = 0;
  for (const c of cands) {
    const tag = c.n === c.title ? `[[${c.title}]]` : `[[${c.title}|${c.n}]]`;
    for (const [row, field] of fields) {
      const value = row[field];
      const parts = [];
      let offset = 0;
      for (let i = value.indexOf(c.n); i >= 0; i = value.indexOf(c.n, i + 1)) {
        if (i < offset || inLink(value, i) || insideWord.test(value[i - 1] || "")) continue;
        const end = i + c.n.length;
        if (insideWord.test(value[end] || "") && !particles.test(value.slice(end))) continue;
        parts.push(value.slice(offset, i), tag);
        offset = end;
        added++;
      }
      if (parts.length) row[field] = parts.join("") + value.slice(offset);
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
- 고치면서 링크를 넣을 때: ${linkNameRule()}
- old에는 원문에서 고칠 부분을 글자 하나 다르지 않게 복사한다. 문장 하나나 인포박스 한 줄 단위로 잡는다.
- 이 충돌과 상관없는 부분은 건드리지 않는다.

JSON 객체 하나만 출력:
{"edits":[{"field":"summary, cats, infobox, body 중 하나","old":"원문 그대로의 일부","new":"고친 내용"}],"note":"무엇을 어떻게 고쳤는지 한 문장"}`;
}
/* 이미 원문에서 해결된 메모인지 판단한다. AI가 해결됐다고 답했거나, 수정안의 new가 이미 원문에 있고 old는 없거나,
   지적된 서술이 원문에서 사라졌으면 해결된 것으로 본다. 적용할 수정안이 하나도 없을 때만 쓴다. */
function memoResolved(p, f, issue, saidResolved, edits) {
  if (saidResolved) return true;
  const has = (fld, t) => typeof f[fld] === "string" && t && f[fld].includes(t);
  if (edits.some(ed => { const fld = ed?.field, o = String(ed?.old || "").trim(), n = String(ed?.new ?? "").trim(); return n && has(fld, n) && !has(fld, o); })) return true;
  const claim = String(issue?.claim || "").trim(); if (!claim) return false;
  const raw = docForCheck(p, t => t), plain = docForCheck(p);
  return !raw.includes(claim) && !plain.includes(stripMarks(claim));
}
/* 해결된 메모를 문서의 검사 결과(또는 충돌 표시)에서 지우고 저장한다 */
async function closeMemos(k, items, field) {
  const p = S.pages[k]; if (!p || !items.length) return;
  if (field) p[field] = (p[field] || []).filter((_, i) => !items.includes(i));
  else if (p.check) p.check.issues = (p.check.issues || []).filter(x => !items.includes(x));
  renderSide();   // 수정 요청 목록의 곳 수가 바뀐다
  try { await Store.savePage(S.world.id, p); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
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
- 고치면서 링크를 넣을 때: ${linkNameRule()}
- old에는 원문에서 고칠 부분을 글자 하나 다르지 않게 복사한다. 문장 하나나 인포박스 한 줄 단위로 잡고, 서로 다른 수정이 같은 문장을 겹쳐 잡지 않게 한다.
- 메모와 상관없는 부분은 건드리지 않는다. 고칠 필요가 없다고 판단한 메모는 건너뛴다.
- 고친 문장이 같은 섹션의 다른 문장과 같은 내용을 되풀이하게 되면 고친 문장 쪽을 줄이거나 지운다.
- 이유에 '재서술(줄임):'이나 '재서술(지움):'이 있는 메모는 위의 '메모 하나에 많아야 3곳'과 '디테일로 풀어 낸다'를 따르지 않는다. '재서술(줄임):' 메모는 지적된 문단 전체를 old로 잡아, new에는 이 항목이 그 사건에서 한 일 한두 문장(이 문서가 사건 문서이면 그 사건이 이 사건의 흐름에서 어떤 의미였는지 두세 문장)과 '자세한 내용은 [[사건 이름]] 참고.'를 한 번만 쓴다. 근거가 '사건 항목 없음:'이면 메모에 적힌 사건 이름으로 [[사건 이름]] 링크를 걸어 쓴다. 날짜는 연도까지만 남기고, 수치·경과·다른 인물의 결정과 직위는 지운다. 메모에 '참고 문구 없이'가 있거나 이 항목이 그 사건에 참여하지 않고 다른 항목의 일이나 배경으로만 나오는 문단이면, 짧게 줄이되 참고 문장을 붙이지 않고 사건 이름에 링크만 건다. 이 항목이 참여한 사건이면, 같은 사건의 줄임 메모가 여러 개여도 참고 문장은 문서 전체에서 한 번만 쓰되 반드시 하나는 남긴다. 그 사건의 줄임 메모 가운데 개요가 아닌 첫 섹션의 수정 하나에 붙이고, 나머지 수정에는 붙이지 않는다. 원문 중 수정하지 않는 곳에 그 사건의 참고 문장이 이미 있으면 새로 붙이지 않는다. 줄여 쓴 문장은 앞 문장과 섹션 제목에 이어지게 쓴다. 같은 섹션 안에서 이 항목의 이름을 문장마다 주어로 되풀이하지 않고, 앞에서 이미 나왔으면 주어를 빼거나 대명사로 쓴다(예: '1965년 [[베트남 전쟁]]에 투입되어 다낭 일대에서 작전을 수행했다.'). '재서술(지움):' 메모는 지적된 문단이나 인용문 전체를 old로 잡아 new를 빈 문자열로 둔다. 지운 문단이나 인용문을 가리키거나 그 내용을 전제로 하는 앞뒤 문장(인용을 여는 '…답했다.', 지운 사건의 결과로 시작하는 다음 문단의 첫 문장 등)도 같은 메모 번호로 함께 고쳐, 지운 뒤에도 앞뒤가 이어지게 한다. 지우면 섹션의 내용이 모두 사라지는 경우에는 지우지 말고 그 섹션의 목적에 맞는 한 문장으로 줄인다. '재서술(참고 중복):' 메모는 지적된 참고 문장 하나만 old로 잡아 new를 빈 문자열로 둔다. 그 섹션의 다른 문장은 건드리지 않는다. 재서술 메모를 고칠 때도 개요의 첫 문장(이 항목이 무엇인지 밝히는 정의)은 남기고, 인물 관계 항목은 그 인물과 이 항목이 어떤 사이였는지 한 문장을 남긴다. 인물 관계 항목을 사건 요약이나 참고 문구로 바꾸지 않는다.
- 확정 설정에 맞춘다며, 이 문서의 대상이 아직 태어나지 않았거나 그 일을 할 수 없는 나이였던 시점의 일을 이 대상의 일로 바꾸지 않는다. 그렇게 고칠 수밖에 없는 메모는 건너뛴다.

JSON 객체 하나만 출력:
{"edits":[{"memo":1,"field":"summary, cats, infobox, body 중 하나","old":"원문 그대로의 일부","new":"고친 내용"}],"resolved":[],"note":"전체적으로 무엇을 고쳤는지 한 문장"}
지적된 서술이 원문에 더 이상 없거나 이미 고쳐져 있는 메모는 edits를 만들지 않고 그 메모 번호를 resolved에 넣는다.`;
}
/* 교정 작업 목록: 문서마다 하나씩, 서로 독립적으로 진행한다. 화면에서 보는 교정은 지금 열린 문서의 것이다 */
const curFix = () => S.view.name === "fix" ? S.fixJobs.get(S.view.key) || null : null;
const fixActive = k => { const v = S.fixJobs.get(k); return !!v && (v.phase === "busy" || v.phase === "review"); };
/* 새 교정을 등록한다. 같은 문서의 교정이 진행 중이거나 검토를 기다리면 그것을 연다.
   open이면 교정 화면으로 가고, 아니면 지금 화면에 머문 채 뒤에서 수정안을 만든다(사이드바 '진행 중인 작업'에 보인다) */
function startFix(v, { open = true, run = true } = {}) {
  const k = v.key, old = S.fixJobs.get(k);
  if (old && fixActive(k)) {
    if (open || old.phase === "review") { S.view = { name: "fix", key: k }; renderAll(); window.scrollTo({ top: 0 }); }
    else toast(`「${S.pages[k]?.title || ""}」은(는) 이미 고치는 중입니다.`);
    return old;
  }
  v.wid = S.world.id; S.fixJobs.set(k, v);
  if (open) { S.view = { name: "fix", key: k }; renderAll(); window.scrollTo({ top: 0 }); }
  if (run && v.sel.size) runFixBatch(v); else if (!open) renderAll();
  return v;
}
function dropFix(k) { S.fixJobs.delete(k); }
/* 다른 문서와 어긋난 서술을 AI로 고친다. field가 "conflicts"면 다른 문서의 직접 수정(그쪽이 기준),
   "autoConflicts"면 자동 대조가 이 문서를 고칠 대상으로 정한 지적이다 */
function openConflictFix(k, field = "conflicts") {
  const p = S.pages[k], list = p?.[field]; if (!list?.length) return;
  if (S.gen && S.gen.key === k) { toast("이 문서를 작성하는 중입니다."); return; }
  const items = list.map(c => ({ claim: c.old, conflict: field === "autoConflicts" ? `「${c.byTitle}」 문서의 설정과 맞추려면 이 문서의 이 서술을 고쳐야 한다: ${c.claim}` : `「${c.byTitle}」 문서를 사용자가 직접 수정해 이렇게 확정했다: ${c.claim}. 이 확정 내용에 맞게 이 문서의 해당 서술과 그와 얽힌 서술을 고친다.`, severity: "high" }));
  startFix({ key: k, items, sel: new Set(items.map((_, i) => i)), phase: "pick", edits: [], note: "", err: "", skipped: 0, fromConflicts: field }, { open: false });
}
function openFixView(k, sel, autoRun) {
  const p = S.pages[k]; if (!p || !S.memo || S.memo.k !== k || !S.memo.items.length) return;
  startFix({ key: k, items: S.memo.items.slice(), sel: new Set(sel), phase: "pick", edits: [], note: "", err: "", skipped: 0 }, { open: !autoRun, run: !!autoRun });
}
/* 고치기 응답의 edits 중 원문에서 찾을 수 있는 것만. mi는 메모 번호(1부터) */
function parseFixEdits(r, f, nMemo) {
  const edits = [], seen = new Set();
  for (const ed of (Array.isArray(r?.edits) ? r.edits : []).slice(0, 16)) {
    const fld = ["summary", "cats", "infobox", "body"].includes(ed?.field) ? ed.field : null;
    let old = String(ed?.old || ""); const nw = String(ed?.new ?? "");
    if (!fld || !old.trim() || old === nw) continue;
    if (!f[fld].includes(old)) { old = old.trim(); if (!f[fld].includes(old)) continue; }
    if (seen.has(fld + "\u0000" + old)) continue; seen.add(fld + "\u0000" + old);
    edits.push({ mi: Math.max(1, Math.min(nMemo, parseInt(ed.memo, 10) || 1)), field: fld, old, new: nw, on: true });
  }
  return edits;
}
async function runFixBatch(v = curFix()) {
  const w = S.world, p = v && S.pages[v.key]; if (!v || !p || v.phase === "busy") return;
  const gone = () => S.fixJobs.get(v.key) !== v || S.world !== w;
  if (!S.sample) { v.err = ERR.no_sample; renderMain(); return; }
  const picked = [...v.sel].sort((a, b) => a - b); if (!picked.length) return;
  v.phase = "busy"; v.err = ""; v.t0 = performance.now(); renderMain(); renderSide();
  const f = pageToSource(w, p);
  try {
    const r = await callJson("fix", fixBatchPrompt(w, p, f, picked.map(n => v.items[n])), { modelTier: "default", ...PAGE_MODEL, effort: "low" }, { title: p.title + ` · ${picked.length}곳` });
    if (gone()) return;
    const edits = parseFixEdits(r, f, picked.length).map(e => ({ n: picked[e.mi - 1], field: e.field, old: e.old, new: e.new, on: true }));
    // 수정안이 없는 메모 가운데 이미 원문에 반영된 것은 닫는다.
    const said = new Set((Array.isArray(r?.resolved) ? r.resolved : []).map(x => parseInt(x, 10)).filter(x => x >= 1 && x <= picked.length).map(x => picked[x - 1]));
    const raw = Array.isArray(r?.edits) ? r.edits : [];
    const done = S.pages[v.key] === p ? picked.filter(n => !edits.some(e => e.n === n) && memoResolved(p, f, v.items[n], said.has(n), raw.filter(ed => picked[(parseInt(ed?.memo, 10) || (picked.length === 1 ? 1 : 0)) - 1] === n))) : [];
    if (done.length) {
      const field = v.fromConflicts ? (v.fromConflicts === true ? "conflicts" : v.fromConflicts) : null;
      await closeMemos(v.key, field ? done : done.map(n => v.items[n]), field);
      if (gone()) return;
      const keep = v.items.map((_, i) => i).filter(i => !done.includes(i)), at = new Map(keep.map((i, x) => [i, x]));
      v.items = keep.map(i => v.items[i]); v.sel = new Set([...v.sel].filter(i => at.has(i)).map(i => at.get(i)));
      for (const e of edits) e.n = at.get(e.n);
    }
    v.edits = edits; v.note = stripMarks(r?.note || "").slice(0, 240);
    v.skipped = picked.filter(n => !edits.some(e => e.n === n) && !done.includes(n)).length;
    v.closed = done.length;
    v.phase = edits.length ? "review" : "pick";
    if (!edits.length) v.err = done.length ? `이미 원문에 반영된 메모 ${done.length}개를 닫았습니다.${v.items.length ? "" : " 남은 메모가 없습니다."}` : "고칠 곳을 원문에서 찾지 못했습니다. 다시 시도하거나 편집에서 직접 고쳐 주세요.";
  } catch (err) { if (gone()) return; v.phase = "pick"; v.err = errMsg(err); }
  if (S.view.name === "fix" && S.view.key === v.key) { renderMain(); renderSide(); return; }
  renderAll();
  if (v.phase === "review") toast(`「${p.title}」의 교정안이 준비되었습니다.`, { label: "검토하기", fn: () => { S.view = { name: "fix", key: v.key }; renderAll(); } });
  else { if (!v.items.length || !v.err) dropFix(v.key); toast(`「${p.title}」 ${v.err || "교정을 마쳤습니다."}`, v.items.length && v.err ? { label: "열기", fn: () => { S.view = { name: "fix", key: v.key }; renderAll(); } } : undefined); }
}
/* 수정을 적용한 뒤: 글자까지 같은 '자세한 내용은 [[X]] 참고.' 문장이 문서에 두 번 이상 있으면 첫 번째만 남긴다(한 줄 정의 → 본문 순).
   새 문장을 만들지 않고 완전히 같은 문장의 중복만 지운다. 문장을 지워 빈 문단이 되면 그 빈 줄도 정리한다. 지운 수를 돌려준다 */
const REF_SENTENCE_RE = /\s*자세한 내용은\s*\[\[[^\]]+\]\]\s*참고\./g;
function dropDuplicateRefs(src) {
  const seen = new Set(); let n = 0;
  for (const f of ["summary", "body"]) {
    if (typeof src[f] !== "string") continue;
    src[f] = src[f].replace(REF_SENTENCE_RE, m => { const key = m.replace(/\s+/g, " ").trim(); if (seen.has(key)) { n++; return ""; } seen.add(key); return m; });
    if (n) src[f] = src[f].replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }
  return n;
}
/* 고치기 수정안(e.on인 것)을 문서 k에 적용해 S.pages[k]를 바꾼다. 저장은 하지 않는다.
   돌려주는 값: { page, applied, missed } 또는 { why: "none" | "empty" }. integrate가 실패하면 되돌리고 던진다 */
function commitFix(w, k, edits, beforeAssign) {
  const old = S.pages[k];
  const nf = pageToSource(w, old); let applied = 0, missed = 0;
  for (const e of edits) {
    if (!e.on) continue;
    const at = nf[e.field].indexOf(e.old); if (at < 0) { missed++; continue; }
    nf[e.field] = nf[e.field].slice(0, at) + e.new + nf[e.field].slice(at + e.old.length); applied++;
  }
  if (!applied) return { why: "none" };
  dropDuplicateRefs(nf);
  const out = sourceToOut(nf);
  if (!out.sections.some(x => x.body.trim())) return { why: "empty" };
  const backup = JSON.stringify({ entities: w.entities, timeline: w.timeline, navboxes: w.navboxes || {}, relations: w.relations || [], events: w.events || [], glossary: w.glossary || [] });
  let page;
  try {
    for (const o of Object.values(w.entities)) o.mentions = o.mentions.filter(m => m.from !== k);   // 링크와 언급은 고친 본문 기준으로 다시 계산
    for (const [id, nb] of Object.entries(w.navboxes || {})) if (nb.src === k) delete w.navboxes[id];
    page = integrate(w, k, out);
  } catch (err) { restoreRewrite(w, backup); throw err; }
  if (beforeAssign) beforeAssign(old);
  Object.assign(page, { createdAt: old.createdAt, rewrittenAt: old.rewrittenAt, direction: old.direction, editedAt: old.editedAt, fixedAt: Date.now(), stale: old.stale === "new" ? "new" : false, conflicts: old.conflicts, autoConflicts: old.autoConflicts, autoDismissed: old.autoDismissed, pending: old.pending, preWrite: old.preWrite, check: null, checkLog: [...(old.checkLog || []), { at: Date.now(), event: "고치기", cleared: !!old.check, issues: old.check?.issues?.length ?? 0 }].slice(-8),   // 고치면 검사 결과를 지우고 다시 검사하지 않으므로 그 사실을 진단 기록에 남긴다
    baseAsOf: old.baseAsOf, syncedTo: old.syncedTo, storyNotice: old.storyNotice });
  cleanupOrphans(w, k);
  S.pages[k] = page;
  return { page, applied, missed };
}
/* 세계 전체 점검에서 연결을 확정한 뒤 문서 하나에 반영한다. 고치기 흐름(fixBatchPrompt → commitFix → bgSync)을 그대로 쓰되,
   확정 설정을 반영하는 한두 문장만 고치고 검토 없이 적용한다. 돌려주는 값: "done" · "none"(고칠 곳 없음) · "failed" */
const WC_FIX_EDITS = 2;
async function wcFixDoc(w, k, x) {
  const p = S.pages[k]; if (!p || !S.sample || p.editedAt) return "failed";
  if ((S.gen && S.gen.key === k) || S.syncing === k || S.storyGen || fixActive(k)) return "failed";
  const others = x.docs.filter(d => d !== k).slice(0, 12).map(d => `「${S.pages[d]?.title || w.entities[d]?.title || "?"}」`).join(", ");
  const issue = { claim: `세계 전체 점검으로 확정한 설정: ${x.linked}`, severity: "high",
    conflict: `${x.detail} 이 문서가 이 확정 설정을 모르거나 어긋나게 읽히지 않도록, 관련된 서술 한두 문장만 고치거나 기존 문장에 이어 한 문장을 더한다. 많아야 ${WC_FIX_EDITS}곳.${others ? ` 같은 설정을 반영할 다른 문서: ${others}.` : ""}` };
  const f = pageToSource(w, p);
  const r = await callJson("fix", fixBatchPrompt(w, p, f, [issue]), { modelTier: "default", ...PAGE_MODEL, effort: "low" }, { title: p.title + " · 세계 점검 반영" });
  if (S.world !== w || S.pages[k] !== p || p.editedAt) return "failed";
  const edits = parseFixEdits(r, f, 1).slice(0, WC_FIX_EDITS);
  if (!edits.length) return "none";
  const res = commitFix(w, k, edits);
  if (res.why) return "none";
  await Store.savePage(w.id, res.page);
  await Store.saveWorld(w);
  await bgSync(k);
  return "done";
}
async function applyFix() {
  const v = curFix(), w = S.world, k = v?.key, old = k && S.pages[k]; if (!v || !old || v.phase !== "review") return;
  if (S.gen && S.gen.key === k) { toast("이 문서를 작성하는 중이라 저장할 수 없습니다."); return; }
  if (S.storyGen || S.syncing === k) { toast("이야기를 반영하는 중이라 저장할 수 없습니다. 잠시 뒤 다시 적용해 주세요."); return; }
  let res;
  try { res = commitFix(w, k, v.edits, () => { if (v.fromConflicts) { const fld = v.fromConflicts === true ? "conflicts" : v.fromConflicts, done = new Set(v.edits.filter(e => e.on).map(e => e.n)); old[fld] = (old[fld] || []).filter((_, i) => !done.has(i)); } }); }   // 고친 충돌 표시는 지운다
  catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); return; }
  if (res.why === "none") { toast("적용할 수정이 없습니다."); return; }
  if (res.why === "empty") { toast("본문이 비게 되어 저장하지 않았습니다."); return; }
  const { page, applied, missed } = res;
  dropFix(k); S.memo = null;
  S.view = { name: "article", key: k }; renderAll(); window.scrollTo({ top: 0 });
  try { await Store.savePage(w.id, page); await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); return; }
  toast(`${applied}곳을 고쳤습니다.${missed ? ` 겹쳐서 적용하지 못한 수정 ${missed}곳은 건너뛰었습니다.` : ""}`);
  bgSync(k);
  recheckAfterFix(k);
}
/* 고치기는 검사 결과를 지운다. 고친 문서가 다른 문서와 다시 어긋나는지 설정 검사만 다시 돌려 메모로 보여 준다(자동 수정은 하지 않는다).
   작성 직후 검사를 끈 사용자에게는 돌리지 않는다 */
function recheckAfterFix(k) {
  if (GS.preCheck === false || !S.sample) return;
  const p = S.pages[k];
  if (S.checking) { noteEvent(p, "고치기 뒤 재검사 건너뜀(다른 검사 중)"); return; }
  noteEvent(p, "고치기 뒤 재검사");
  checkPage(k);
}
/* 정리 호출이 붙인 분류를 문서에, linkedCats를 문서가 없는 링크 항목에 넣는다. 국가 문서는 자기 제목, 인물은 소속·유형 하나씩과 사건만(기타 없음) */
function applySyncCats(w, k, p, r) {
  const type = p.type || w.entities[k]?.type || "";
  const raw = r?.categories && typeof r.categories === "object" && !Array.isArray(r.categories) ? { ...r.categories } : {};
  if (type === "인물") { delete raw.기타; if (Array.isArray(raw.유형)) raw.유형 = raw.유형.slice(0, 1); }
  const cats = parseCats(widenAffil(w, raw, type, p.title));
  p.categories = cats.map(c => c.name);
  if (cats.length) p.catAxes = cats; else delete p.catAxes;
  for (const h of (Array.isArray(r?.linkedCats) ? r.linkedCats : [])) {
    if (!h || typeof h.title !== "string") continue;
    const hk = kOf(w, h.title), o = w.entities[hk]; if (!o || o.page || hk === k) continue;
    const hc = parseCats({ 소속: widenAffil(w, { 소속: h.소속 }, o.type || "", o.title).소속, 유형: h.유형 }); if (!hc.length) continue;
    o.cats = [...(o.cats || []), ...hc.filter(x => !(o.cats || []).some(y => y.name === x.name))].slice(0, 4);
  }
}
/* 문서의 확정 기록(사실·관계·용어·소속 이력·존속 기간)을 정리한다. 모순 검사나 검사 결과 갱신은 하지 않는다.
   opts.ledger(기본 true): 연표·사건 장부도 다시 뽑는다. 새 문서를 고치지 않았으면 작성 호출이 뽑은 것을 그대로 둔다.
   opts.cats: 분류와 문서가 없는 링크 항목의 소속·유형도 붙인다(새 문서·다시 쓰기만. 고치기·직접 편집 뒤에는 이전 분류를 둔다) */
async function bgSync(k, opts = {}) {
  const ledger = opts.ledger !== false;
  const w = S.world, p = S.pages[k]; if (!w || !p || !S.sample) return;
  S.bgSync = k; if (S.view.name === "article" && S.view.key === k) renderMain();
  try {
    const out = sourceToOut(pageToSource(w, p));
    const linkKeys = linksOfOut(w, out, k);
    const temp = { key: k, title: p.title, summary: out.summary, infobox: out.infobox, sections: out.sections, navboxes: out.navboxes };
    temp.type = p.type || w.entities[k]?.type || "";
    const r = await callJson("factSync", factSyncPrompt(w, temp, linkKeys, { ledger, cats: !!opts.cats }), { modelTier: "check" }, { title: p.title + " · 확정 사실 정리" });
    if (S.world !== w || S.pages[k] !== p) { S.bgSync = null; return; }
    // AI가 고친 본문은 다른 문서를 대체하는 기준이 되지 않는다. 사용자가 직접 수정한 문서라면 그 수정이 세운 대체 표시는 그대로 두고,
    // 직접 수정한 적 없는 문서라면 (예전 버전이 AI 수정으로 붙였던) 대체 표시와 다른 문서의 경고를 걷어낸다.
    const touched = p.editedAt ? new Set() : clearBadges(k);
    for (const o of Object.values(w.entities)) { o.facts = o.facts.filter(f => f.src !== k); if (!p.editedAt) for (const x of [...o.facts, ...o.mentions]) if (x.sup?.by === k) delete x.sup; }
    if (!p.editedAt) { if (ledger) w.timeline.forEach(t => { if (t.sup?.by === k) delete t.sup; }); (w.relations || []).forEach(x => { if (x.sup?.by === k) delete x.sup; }); }
    if (ledger) w.timeline = w.timeline.filter(x => x.src !== k);
    w.relations = (w.relations || []).filter(x => x.src !== k);
    for (const f of (Array.isArray(r?.facts) ? r.facts : [])) { if (!f || !f.fact || !f.about) continue; const fk = kOf(w, f.about); if (w.entities[fk]) addFact(w.entities[fk], String(f.fact), k); }
    if (ledger) { acceptPageTimeline(w, r?.timeline, k); afterTimeline(w); if (Array.isArray(r?.events)) ingestEvents(w, k, r.events); }
    for (const x of (Array.isArray(r?.relations) ? r.relations : []).slice(0, 16)) addRelation(w, k, x);
    if (Array.isArray(r?.terms)) ingestTerms(w, k, r.terms);
    if (Array.isArray(r?.affiliations)) ingestAffil(w, k, r.affiliations);
    if (r?.existence && typeof r.existence === "object") ingestSpan(w, k, r.existence);
    if (opts.cats) applySyncCats(w, k, p, r);
    if (wantLooks(temp)) { const l = cleanLooks(r?.looks); if (l) p.looks = l; }
    for (const n of (Array.isArray(r?.newEntities) ? r.newEntities : [])) {
      if (!n || !n.title) continue; const o = w.entities[kOf(w, n.title)];
      if (o && !o.page && !o.summary && n.summary) { o.summary = stripMarks(n.summary).slice(0, 200); if (!o.type && TYPES.includes(n.type)) o.type = n.type; }
    }
    if (opts.cats || p.stale !== "new") delete p.stale;   // 분류를 아직 못 붙인 새 문서는 분류를 붙일 때까지 표시를 둔다
    await Store.savePage(w.id, p);
    for (const x of touched) if (S.pages[x]) await Store.savePage(w.id, S.pages[x]);
    await Store.saveWorld(w);
  } catch (err) { p.stale = opts.cats || p.stale === "new" ? "new" : true; try { await Store.savePage(w.id, p); } catch {} }
  S.bgSync = null;
  if (S.view.name === "article" && S.view.key === k) renderMain(); else renderSide();
}
function fixvHtml(k) {
  const v = S.fixJobs.get(k), p = S.pages[k], w = S.world;
  if (!v || !p) return `<div class="sheet"><p class="note">교정할 문서를 찾을 수 없습니다.</p><div class="tools"><button type="button" class="btn" data-act="fixv-back">돌아가기</button></div></div>`;
  const head = `<div class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>교정</span></div><h1 class="t">${esc(p.title)} <span class="note" style="font-family:var(--f-body);font-size:14px;font-weight:400">교정</span></h1>`;
  if (v.phase === "review") {
    const on = v.edits.filter(e => e.on).length;
    return head + `<p class="note">${v.note ? esc(v.note) + " " : ""}고친 문장은 바로 손볼 수 있습니다. 적용하면 즉시 저장되고, 확정 사실과 연표를 정리합니다. 다시 검사하려면 문서의 설정 검사 버튼을 눌러 주세요.</p>
      <div class="fx-list">${v.edits.map((e, i) => `<div class="fx-ed${e.on ? "" : " off"}">
        <label class="fx-on"><input type="checkbox" id="fon-${i}" data-fon="${i}" ${e.on ? "checked" : ""}> 적용 <span class="src">메모: ${esc(v.items[e.n].claim.slice(0, 60))}${v.items[e.n].claim.length > 60 ? "…" : ""}</span></label>
        <del>${esc(e.old)}</del>
        <textarea id="fnew-${i}" data-fnew="${i}" rows="${Math.min(6, Math.max(2, Math.ceil(e.new.length / 60)))}">${esc(e.new)}</textarea></div>`).join("")}</div>
      ${v.closed ? `<p class="note">이미 원문에 반영된 메모 ${v.closed}개는 닫았습니다.</p>` : ""}${v.skipped ? `<p class="note">수정안이 나오지 않은 메모 ${v.skipped}개는 그대로 남습니다.</p>` : ""}
      <div class="row"><button type="button" class="btn pri" data-act="fixv-apply" ${on ? "" : "disabled"}>${on}곳 적용하고 저장</button><button type="button" class="btn" data-act="fixv-redo">메모 다시 고르기</button><button type="button" class="btn" data-act="fixv-drop">교정안 버리기</button><button type="button" class="btn" data-act="fixv-back">나중에 보기</button></div></div>`;
  }
  const busy = v.phase === "busy", n = v.sel.size;
  return head + `<p class="note">고칠 메모를 고르면 한 번에 수정안을 만듭니다. 수정안을 확인한 뒤 적용합니다.</p>
    <div class="fx-list">${v.items.map((i, x) => `<label class="fx-pick"><input type="checkbox" id="fsel-${x}" data-fsel="${x}" ${v.sel.has(x) ? "checked" : ""} ${busy ? "disabled" : ""}><span><span class="sev">${i.lint ? "문체" : i.severity === "high" ? "다듬을 곳" : "참고"}</span>${esc(i.claim)}${i.conflict ? `<span class="memo-why">${esc(i.conflict)}</span>` : ""}</span></label>`).join("")}</div>
    ${v.err ? `<div class="banner warn">${esc(v.err)}</div>` : ""}
    <div class="row"><button type="button" class="btn pri" data-act="fixv-run" ${busy || !n || !S.sample ? "disabled" : ""}>${busy ? `수정안을 만드는 중… <span id="fxTick"></span>` : `선택한 ${n}곳 고치기`}</button><button type="button" class="btn" data-act="fixv-back">${busy ? "문서로 돌아가기 (계속 진행)" : "돌아가기"}</button></div></div>`;
}
